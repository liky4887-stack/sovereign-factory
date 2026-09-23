'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

function req(key) {
  const v = process.env[key];
  if (!v) {
    throw new Error(`[config] Missing value for ${key}. Edit ~/bridge/.env`);
  }
  if (v.includes('REPLACE_ME')) {
    throw new Error(`[config] ${key} still has placeholder '${v}'. Edit ~/bridge/.env.`);
  }
  return v;
}
function opt(key, fallback) {
  return process.env[key] && process.env[key].length > 0 ? process.env[key] : fallback;
}

const ROOT = path.resolve(__dirname, '..');

module.exports = Object.freeze({
  ROOT,
  BRIDGE_PORT: parseInt(opt('BRIDGE_PORT', '8787'), 10),
  BRIDGE_HOST: opt('BRIDGE_HOST', '127.0.0.1'),

  // Auth mode — 'cookie' is the only supported mode now.
  AUTH_MODE: opt('AUTH_MODE', 'cookie'),

  AI: {
    // Upstream is now the DeepSeek web UI, not the public API.
    baseUrl:  opt('AI_BASE_URL',  'https://chat.deepseek.com').replace(/\/+$/, ''),
    chatPath: opt('AI_CHAT_PATH', '/api/v0/chat/completion'),
    defaultModel: opt('AI_DEFAULT_MODEL', 'deepseek-chat'),

    // Response parser variant. DeepSeek has shipped several shapes over time.
    // We keep this configurable so the parser can be swapped without a redeploy.
    responseParser: opt('AI_RESPONSE_PARSER', 'v0'),
  },

  COOKIE: {
    sourcePath:  req('COOKIE_FILE_PATH'),
    workingPath: req('COOKIE_WORKING_PATH'),
    // Fail fast if the cookie vault is empty when a request arrives.
    requiredKeys: opt('COOKIE_REQUIRED_KEYS', '')
      .split(',').map((s) => s.trim()).filter(Boolean),
  },

  LEDGER: {
    archPath:  path.resolve(ROOT, opt('LEDGER_ARCH_PATH',  './logs/truth-ledger-architecture.log')),
    eventPath: path.resolve(ROOT, opt('LEDGER_EVENT_PATH', './logs/truth-ledger-events.log')),
  },

  GITHUB: {
    username:   opt('GITHUB_USERNAME', ''),
    token:      opt('GITHUB_TOKEN', ''),
    repoName:   opt('DESIRED_REPO_NAME', ''),
    visibility: opt('GITHUB_REPO_VISIBILITY', 'private'),
  },
});
