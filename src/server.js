import express from 'express';
import { loadCredentials, credsHealth } from './credentials.js';
import { createSession, callCompletion, parseSse } from './deepseek.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'sovereign-factory' }));

app.get('/deepseek/health', async (_req, res) => {
  const out = { ...credsHealth(), bearerValid: false, lastChatError: null, lastChatOk: false };
  try {
    const creds = loadCredentials();
    const sessionId = await createSession(creds);
    out.sessionId = sessionId;
    out.bearerValid = true;
    try {
      const stream = await callCompletion(creds, sessionId, 'say OK');
      let acc = '';
      for await (const frame of parseSse(stream)) {
        const frags = frame?.v?.response?.fragments;
        if (Array.isArray(frags)) for (const f of frags) if (f?.content) acc += f.content;
        if (frame?.p && frame?.o === 'APPEND' && typeof frame.v === 'string') acc += frame.v;
        if (typeof frame?.v === 'string') acc += frame.v;
      }
      out.lastChatOk = true;
      out.replyPreview = acc.slice(0, 80);
    } catch (e) {
      out.lastChatError = String(e.message ?? e);
    }
  } catch (e) {
    out.lastChatError = String(e.message ?? e);
  }
  res.json(out);
});

app.post('/deepseek/chat', async (req, res) => {
  try {
    const { prompt, thinking = false, search = false } = req.body ?? {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const creds = loadCredentials();
    const sessionId = await createSession(creds);
    const stream = await callCompletion(creds, sessionId, prompt, { thinking, search });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    for await (const frame of parseSse(stream)) {
      res.write(`data: ${JSON.stringify(frame)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    res.status(500).json({ error: String(e.message ?? e) });
  }
});

const PORT = 8790;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[sovereign-factory] http://127.0.0.1:${PORT}`);
});
