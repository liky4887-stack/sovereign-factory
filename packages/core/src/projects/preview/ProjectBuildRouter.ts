import { Router, Request, Response } from 'express';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ProjectBuilder } from '../builder/ProjectBuilder';
import { ProjectFileStorage } from '../builder/ProjectFileStorage';
import { NotFoundError, ValidationError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

export interface ProjectBuildRouterOptions {
  builder: ProjectBuilder;
  storage: ProjectFileStorage;
  publicBaseUrl: string;
}

export function createProjectBuildRouter(opts: ProjectBuildRouterOptions): Router {
  const router = Router();

  // ─── POST /projects/:id/build ────────────────────────────────
  // Body: { prompt: string }
  // Returns: { ok, result: { projectId, files, previewUrl, summary } }
  router.post('/:id/build', async (req: Request, res: Response) => {
    const projectId = req.params.id;
    const prompt = (req.body && req.body.prompt) || '';
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new ValidationError('prompt is required');
    }
    try {
      const result = await opts.builder.build(projectId, prompt.trim(), opts.publicBaseUrl);
      res.json({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error('project.build.endpoint_error', { projectId, error: msg });
      res.status(422).json({ ok: false, error: msg });
    }
  });

  // ─── GET /projects/:id/files ─────────────────────────────────
  router.get('/:id/files', (req: Request, res: Response) => {
    const projectId = req.params.id;
    if (!opts.storage.exists(projectId)) {
      res.json({ ok: true, files: [] });
      return;
    }
    res.json({ ok: true, files: opts.storage.listFiles(projectId) });
  });

  // ─── GET /projects/:id/files/* ───────────────────────────────
  // Note: use a wildcard path so nested folders work.
  router.get('/:id/files/*', (req: Request, res: Response) => {
    const projectId = req.params.id;
    const rel = (req.params as any)[0] as string || '';
    try {
      const content = opts.storage.readFile(projectId, rel);
      res.json({ ok: true, path: rel, content });
    } catch (e) {
      throw new NotFoundError('file not found: ' + rel);
    }
  });

  // ─── GET /projects/:id/preview/*  (static serve) ─────────────
  router.get('/:id/preview', (req: Request, res: Response) => {
    // Redirect explicitly to index.html so this route does not match itself.
    res.redirect(req.baseUrl + '/' + encodeURIComponent(req.params.id) + '/preview/index.html');
  });

  router.get('/:id/preview/*', (req: Request, res: Response, next) => {
    const projectId = req.params.id;
    if (!opts.storage.exists(projectId)) {
      res.status(404).send('project has no build output');
      return;
    }
    let rel = (req.params as any)[0] as string || '';
    if (!rel || rel.endsWith('/')) rel += 'index.html';

    try {
      const content = opts.storage.readFile(projectId, rel);
      const ext = path.extname(rel).toLowerCase();
      const mime: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.htm':  'text/html; charset=utf-8',
        '.css':  'text/css; charset=utf-8',
        '.js':   'application/javascript; charset=utf-8',
        '.mjs':  'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg':  'image/svg+xml',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif':  'image/gif',
        '.webp': 'image/webp',
        '.ico':  'image/x-icon',
        '.txt':  'text/plain; charset=utf-8',
      };
      res.setHeader('content-type', mime[ext] || 'application/octet-stream');
      res.setHeader('cache-control', 'no-store');
      res.send(content);
    } catch (e) {
      res.status(404).send('not found: ' + rel);
    }
  });

  return router;
}
