import { Router, Request, Response } from 'express';
import * as http from 'http';

const UPSTREAM_HOST = '127.0.0.1';
const UPSTREAM_PORT = parseInt(process.env.BRIDGE_UPSTREAM_PORT || '8787', 10);

const router = Router();

// CORS preflight — answered locally, not forwarded.
router.options('/bridge/*', (_req: Request, res: Response) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', '*');
  res.sendStatus(204);
});

// Catch-all: forward /bridge/<suffix> to http://127.0.0.1:8787/<suffix>
router.all('/bridge/*', (req: Request, res: Response) => {
  const stripped = req.originalUrl.replace(/^\/bridge/, '') || '/';
  const targetPath = stripped === '/health' ? '/health' : ('/api/bridge' + stripped);

  const headers: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === 'host' || k === 'content-length' || k === 'connection') continue;
    headers[k] = v as any;
  }
  headers['host'] = `${UPSTREAM_HOST}:${UPSTREAM_PORT}`;

  const body = Buffer.isBuffer(req.body) ? req.body : undefined;
  if (body && body.length) headers['content-length'] = String(body.length);

  const proxyReq = http.request(
    { host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: req.method, path: targetPath, headers },
    (proxyRes) => {
      res.status(proxyRes.statusCode || 502);
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v !== undefined && k.toLowerCase() !== 'access-control-allow-origin') {
          res.setHeader(k, v as any);
        }
      }
      res.setHeader('access-control-allow-origin', '*');
      // Disable Nagle for SSE — do not buffer small chunks.
      if (res.socket) res.socket.setNoDelay(true);
      res.flushHeaders();
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ ok: false, error: 'bridge_upstream_error', detail: err.message });
    } else {
      res.end();
    }
  });

  if (body && body.length) proxyReq.write(body);
  proxyReq.end();
});

export default router;
