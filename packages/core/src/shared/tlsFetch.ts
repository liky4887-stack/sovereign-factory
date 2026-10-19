// Drop-in replacement for fetch() that routes through the TLS proxy.
// Handles JSON, form-encoded, and binary (Connect-RPC) bodies.
// Bypasses the proxy for localhost — gateways don't need TLS impersonation.

const TLS_PROXY = process.env.TLS_PROXY_URL || 'http://127.0.0.1:9790';

interface ProxyResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function isLocalhost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch {
    return false;
  }
}

export async function tlsFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  // Local gateways (Kimi :8087, DeepHat :8089, wspr :9777) — bypass proxy.
  // Their outbound requests to the real provider are patched separately.
  if (isLocalhost(url)) {
    return fetch(url, init);
  }

  const headers = (init.headers as Record<string, string>) || {};
  const contentType = (
    headers['content-type'] || headers['Content-Type'] || ''
  ).toLowerCase();

  const payload: Record<string, unknown> = {
    url,
    method: init.method || 'GET',
    headers: { ...headers },
    timeout: 120,
  };

  delete (payload.headers as any)['host'];
  delete (payload.headers as any)['Host'];
  delete (payload.headers as any)['content-length'];
  delete (payload.headers as any)['Content-Length'];

  if (init.body) {
    // Binary check FIRST — application/connect+json contains "json"
    // but the body is a Uint8Array frame, not JSON text.
    if (init.body instanceof Uint8Array || init.body instanceof ArrayBuffer) {
      const bytes = init.body instanceof Uint8Array
        ? init.body
        : new Uint8Array(init.body);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      payload.body = btoa(binary);
      payload.base64 = true;
    } else if (contentType.includes('application/json')) {
      if (typeof init.body === 'string') {
        try { payload.json = JSON.parse(init.body); }
        catch { payload.body = init.body; }
      } else {
        payload.body = String(init.body);
      }
    } else if (init.body instanceof URLSearchParams) {
      payload.body = init.body.toString();
    } else if (typeof init.body === 'string') {
      payload.body = init.body;
    } else {
      payload.body = String(init.body);
    }
  }

  const res = await fetch(`${TLS_PROXY}/proxy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TLS proxy failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as ProxyResponse;
  const bodyStr =
    typeof json.body === 'string' ? json.body : JSON.stringify(json.body);

  return new Response(bodyStr, {
    status: json.status,
    headers: json.headers,
  });
}
