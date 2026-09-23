'use strict';

const express = require('express');
const { createSession, getSession, listSessions } = require('./sessions');
const { logEvent } = require('./truthLedger');
const { loadCookie, syncCookieTo, toCookieHeader } = require('./cookieManager');
const config = require('./config');

const router = express.Router();

router.post('/request', async (req, res) => {
  const { prompt, model, stream = true, options = {} } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ ok: false, error: 'prompt_required' });
  }
  if (config.AUTH_MODE !== 'cookie') {
    return res.status(500).json({ ok: false, error: 'auth_mode_misconfigured', expected: 'cookie' });
  }

  const session = createSession({
    prompt: prompt.slice(0, 80),
    model: model || config.AI.defaultModel,
  });

  logEvent('REQUEST', 'new bridge request', {
    sessionId: session.id,
    model: session.meta.model,
    auth: 'cookie',
    stream,
  });

  res.status(202).json({ ok: true, sessionId: session.id });

  runUpstream(session, { prompt, model: session.meta.model, stream, options }).catch((err) => {
    logEvent('REQUEST', 'unhandled upstream error', { sessionId: session.id, error: err.message });
    session.end(err);
  });
});

router.get('/stream/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'session_not_found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  res.write(`event: hello\ndata: ${JSON.stringify({ sessionId: session.id, at: Date.now() })}\n\n`);
  logEvent('SSE_OPEN', 'client subscribed to session', { sessionId: session.id });

  const write = (msg) => {
    if (msg.event === '_close') {
      res.write(`event: close\ndata: {}\n\n`);
      res.end();
      return;
    }
    res.write(`event: ${msg.event}\n`);
    res.write(`data: ${JSON.stringify(msg.data)}\n\n`);
  };

  const unsubscribe = session.subscribe(write);
  const keepalive = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); } catch (_) {}
  }, 15000);

  req.on('close', () => {
    clearInterval(keepalive);
    unsubscribe();
    logEvent('SSE_CLOSE', 'client disconnected from session', { sessionId: session.id });
  });
});

router.get('/sessions', (req, res) => {
  res.json({ ok: true, sessions: listSessions() });
});

// ─────────────────────────────────────────────────────────────────────────────
// Upstream — cookie-authenticated call to the DeepSeek web UI endpoint.
// No Authorization header. Cookie header only.
// ─────────────────────────────────────────────────────────────────────────────
async function runUpstream(session, { prompt, model, stream, options }) {
  // 1. Sync the source cookie file to the working path
  try { syncCookieTo(); } catch (_) {}

  // 2. Load cookies and validate
  const cookies = loadCookie();
  const cookieKeys = Object.keys(cookies);

  if (cookieKeys.length === 0) {
    const err = new Error('cookie_vault_empty — paste a valid session into COOKIE_FILE_PATH first');
    logEvent('AUTH', 'refused: cookie vault empty', { path: config.COOKIE.sourcePath });
    throw err;
  }

  if (config.COOKIE.requiredKeys.length > 0) {
    const missing = config.COOKIE.requiredKeys.filter((k) => !(k in cookies));
    if (missing.length > 0) {
      const err = new Error(`cookie_missing_required: ${missing.join(', ')}`);
      logEvent('AUTH', 'refused: required cookies missing', { missing });
      throw err;
    }
  }

  const cookieHeader = toCookieHeader(cookies);
  logEvent('AUTH', 'authenticated as cookie session', {
    sessionId: session.id,
    cookieCount: cookieKeys.length,
  });

  // 3. Build the request — DeepSeek web UI body shape, no bearer token
  const headers = {
    'Content-Type': 'application/json',
    'Accept': stream ? 'text/event-stream' : 'application/json',
    'Cookie': cookieHeader,
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': config.AI.baseUrl,
    'Referer': `${config.AI.baseUrl}/`,
  };

  // The exact body shape has changed across DeepSeek web releases. These
  // fields match the current shape observed as of the pivot date. If the
  // upstream rejects them, inspect the raw response in the ledger and adjust
  // the two fields marked CONFIGURABLE.
  const body = {
    chat_session_id: options.chatSessionId || null,       // CONFIGURABLE
    parent_message_id: options.parentMessageId || null,   // CONFIGURABLE
    model: model || config.AI.defaultModel,
    prompt,
    ref_file_ids: [],
    thinking_enabled: !!options.thinkingEnabled,
    search_enabled: !!options.searchEnabled,
  };

  const url = `${config.AI.baseUrl}${config.AI.chatPath}`;
  session.push('status', { phase: 'upstream_call', url, model, auth: 'cookie' });
  logEvent('UPSTREAM', 'dispatching cookie-authenticated call', { sessionId: session.id, url, model });

  const upstreamRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => '');
    // Log the raw body — invaluable when the endpoint shape shifts
    logEvent('UPSTREAM', 'upstream returned non-2xx', {
      sessionId: session.id,
      status: upstreamRes.status,
      body: text.slice(0, 500),
    });
    throw new Error(`upstream ${upstreamRes.status}: ${text.slice(0, 300)}`);
  }

  if (!stream) {
    const json = await upstreamRes.json();
    session.push('message', json);
    session.end();
    return;
  }

  // 4. Parse the SSE stream — DeepSeek web format, not OpenAI format.
  const reader = upstreamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!frame.startsWith('data:')) continue;
      const payload = frame.slice(5).trim();
      if (payload === '[DONE]') { session.end(); return; }

      try {
        const parsed = JSON.parse(payload);
        const text = extractText(parsed);
        if (text) {
          session.push('token', { text });
        } else {
          // Shape unknown — emit raw so we can see it and adapt the parser.
          session.push('chunk', parsed);
          logEvent('PARSER', 'unrecognized frame shape', {
            sessionId: session.id,
            keys: Object.keys(parsed).slice(0, 8),
            preview: JSON.stringify(parsed).slice(0, 300),
          });
        }
      } catch (_) {
        session.push('raw', { text: payload });
      }
    }
  }

  session.end();
}

// Try several known shapes. Returns '' if none match.
function extractText(obj) {
  // Shape v0: {"v":{"response":{"fragments":[{"content":"..."}]}}}
  if (obj.v && obj.v.response && Array.isArray(obj.v.response.fragments)) {
    return obj.v.response.fragments.map((f) => f.content || '').join('');
  }
  // Shape v1: {"choices":[{"delta":{"content":"..."}}]} (OpenAI-compat)
  if (Array.isArray(obj.choices) && obj.choices[0] && obj.choices[0].delta && typeof obj.choices[0].delta.content === 'string') {
    return obj.choices[0].delta.content;
  }
  // Shape v2: {"response":"..."} plain text
  if (typeof obj.response === 'string') {
    return obj.response;
  }
  // Shape v3: {"content":"..."}
  if (typeof obj.content === 'string') {
    return obj.content;
  }
  return '';
}

module.exports = router;
