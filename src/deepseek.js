import { loadCredentials } from './credentials.js';
import { solveToHeader } from './pow.js';

const HOST = 'https://chat.deepseek.com';
const COMPLETION_PATH = '/api/v0/chat/completion';

function headers(creds, extra = {}) {
  return {
    'authorization': `Bearer ${creds.bearerToken}`,
    'cookie': creds.cookies,
    'x-device-id': creds.deviceId,
    'accept': '*/*',
    'accept-language': 'en-US',
    'content-type': 'application/json',
    'origin': HOST,
    'referer': `${HOST}/`,
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'x-client-bundle-id': 'com.deepseek.chat',
    'x-client-locale': 'en_US',
    'x-client-platform': 'web',
    'x-client-version': '2.5.0',
    ...extra,
  };
}

export async function fetchPowChallenge(creds, targetPath) {
  const res = await fetch(`${HOST}/api/v0/chat/create_pow_challenge`, {
    method: 'POST',
    headers: headers(creds),
    body: JSON.stringify({ target_path: targetPath }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`create_pow_challenge HTTP ${res.status}: ${text}`);
  const json = JSON.parse(text);
  const ch = json.biz_data?.challenge ?? json.data?.challenge ?? json.challenge;
  if (!ch) throw new Error(`create_pow_challenge no challenge: ${text}`);
  return { ...ch, target_path: ch.target_path ?? targetPath };
}

export async function createSession(creds) {
  const ch = await fetchPowChallenge(creds, COMPLETION_PATH);
  const powHeader = await solveToHeader(ch, COMPLETION_PATH);
  const res = await fetch(`${HOST}/api/v0/chat/create_session`, {
    method: 'POST',
    headers: headers(creds, { 'x-ds-pow-response': powHeader }),
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`create_session HTTP ${res.status}: ${text}`);
  const json = JSON.parse(text);
  const id = json.biz_data?.id ?? json.data?.id ?? json.id;
  if (!id) throw new Error(`create_session no id: ${text}`);
  return id;
}

export async function callCompletion(creds, sessionId, prompt, opts = {}) {
  const ch = await fetchPowChallenge(creds, COMPLETION_PATH);
  const powHeader = await solveToHeader(ch, COMPLETION_PATH);
  const res = await fetch(`${HOST}${COMPLETION_PATH}`, {
    method: 'POST',
    headers: headers(creds, {
      'x-ds-pow-response': powHeader,
      'accept': 'text/event-stream',
    }),
    body: JSON.stringify({
      chat_session_id: sessionId,
      parent_message_id: null,
      model_type: 'default',
      prompt,
      ref_file_ids: [],
      thinking_enabled: opts.thinking ?? false,
      search_enabled: opts.search ?? false,
      action: null,
      preempt: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`completion HTTP ${res.status}: ${text}`);
  }
  return res.body;
}

export async function* parseSse(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try { yield JSON.parse(payload); } catch {}
    }
  }
}
