// HTTP proxy from the backend (8790) to the modkit-tools sidecar (8792).
// Wildcard POST /tools/<name> forwards to <sidecar>/tool/<name>. GET
// routes for /health, /tools, /loaded map to their sidecar equivalents.
import { Router, Request, Response } from 'express';
import * as http from 'http';

const router = Router();
const SIDECAR_HOST = '127.0.0.1';
const SIDECAR_PORT = 8792;
const SIDECAR_TIMEOUT_MS = 300_000;

interface ProxyResult {
  status: number;
  body: string;
}

function proxy(path: string, body: unknown): Promise<ProxyResult> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request(
      {
        hostname: SIDECAR_HOST,
        port: SIDECAR_PORT,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let acc = '';
        res.on('data', (c) => (acc += c));
        res.on('end', () => resolve({ status: res.statusCode || 200, body: acc }));
      },
    );
    req.on('error', reject);
    req.setTimeout(SIDECAR_TIMEOUT_MS, () => {
      req.destroy(new Error('sidecar timeout'));
    });
    req.write(data);
    req.end();
  });
}

router.get('/tools/health', async (_req: Request, res: Response) => {
  try {
    const r = await proxy('/health', {});
    res.status(r.status).type('application/json').send(r.body);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'sidecar: ' + (e as Error).message });
  }
});

router.get('/tools/list', async (_req: Request, res: Response) => {
  try {
    const r = await proxy('/tools', {});
    res.status(r.status).type('application/json').send(r.body);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'sidecar: ' + (e as Error).message });
  }
});

router.get('/tools/loaded', async (_req: Request, res: Response) => {
  try {
    const r = await proxy('/loaded', {});
    res.status(r.status).type('application/json').send(r.body);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'sidecar: ' + (e as Error).message });
  }
});

router.post('/tools/load', async (req: Request, res: Response) => {
  try {
    const r = await proxy('/load', req.body || {});
    res.status(r.status).type('application/json').send(r.body);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'sidecar: ' + (e as Error).message });
  }
});

router.post('/tools/:name', async (req: Request, res: Response) => {
  const name = req.params.name;
  try {
    const r = await proxy('/tool/' + name, req.body || {});
    res.status(r.status).type('application/json').send(r.body);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'sidecar: ' + (e as Error).message });
  }
});

export default router;
