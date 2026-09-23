'use strict';

class ModelClient {
  constructor(vault, config) { this.vault = vault; this.config = config; }
  _resolve(modelKey) {
    const cfg = this.config.MODELS[modelKey];
    if (!cfg) throw new Error(`unknown_model:${modelKey}`);
    return cfg;
  }
  _headers(modelKey, extra = {}) {
    const cfg = this._resolve(modelKey);
    return {
      'content-type': 'application/json',
      accept: 'text/event-stream, application/json',
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      origin: cfg.baseUrl,
      referer: `${cfg.baseUrl}/`,
      cookie: this.vault.toCookieHeader(),
      ...extra,
    };
  }
  async ping(modelKey) {
    const cfg = this._resolve(modelKey);
    const url = `${cfg.baseUrl}${cfg.pingEndpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(url, {
        method: 'GET',
        headers: this._headers(modelKey),
        signal: controller.signal,
        redirect: 'manual',
      });
    } finally { clearTimeout(timeout); }
  }
  async chat(modelKey, body) {
    const cfg = this._resolve(modelKey);
    const url = `${cfg.baseUrl}${cfg.chatEndpoint}`;
    return fetch(url, {
      method: 'POST',
      headers: this._headers(modelKey),
      body: JSON.stringify(body),
    });
  }
}
module.exports = ModelClient;
