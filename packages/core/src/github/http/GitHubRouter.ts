// HTTP surface for GitHub publishing.
//   GET    /github/status          -> { ok, status }
//   POST   /github/credentials     -> { ok, username }
//   DELETE /github/credentials     -> { ok }
//   POST   /projects/:id/publish   -> { ok, result }
import { Router, Request, Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubService } from '../api/GitHubService';
import { ProjectFileStorage } from '../../projects/builder/ProjectFileStorage';
import { ProjectService } from '../../projects/api/ProjectService';
import { ValidationError, NotFoundError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

export interface GitHubRouterOptions {
  github: GitHubService;
  storage: ProjectFileStorage;
  projects: ProjectService;
}

export function createGitHubRouter(opts: GitHubRouterOptions): Router {
  const router = Router();

  // ── Status ───────────────────────────────────────────────────
  router.get('/github/status', (_req: Request, res: Response) => {
    res.json({ ok: true, status: opts.github.getRedacted() });
  });

  // ── Save credentials ─────────────────────────────────────────
  router.post('/github/credentials', async (req: Request, res: Response) => {
    const token = (req.body && req.body.token) || '';
    const username = (req.body && req.body.username) || undefined;
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new ValidationError('token is required');
    }
    try {
      const result = await opts.github.setCredentials({ token, username });
      res.json({ ok: true, username: result.username });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('github.credentials.set_failed', { error: msg });
      res.status(422).json({ ok: false, error: msg });
    }
  });

  // ── Clear credentials ────────────────────────────────────────
  router.delete('/github/credentials', (_req: Request, res: Response) => {
    opts.github.clearCredentials();
    res.json({ ok: true });
  });

  // ── Publish a project ────────────────────────────────────────
  router.post('/projects/:id/publish', async (req: Request, res: Response) => {
    if (!opts.github.hasCredentials()) {
      throw new ValidationError('GitHub credentials not configured');
    }
    const projectId = req.params.id;
    if (!opts.storage.exists(projectId)) {
      throw new NotFoundError('project has no built files');
    }

    // Resolve project name for the repo.
    const project = await opts.projects.getById(projectId);
    const projectName = project ? project.name : projectId;

    // Read every file from disk.
    const listed = opts.storage.listFiles(projectId);
    const files: Array<{ path: string; content: Buffer }> = [];
    for (const f of listed) {
      try {
        const raw = opts.storage.readFile(projectId, f.path);
        files.push({ path: f.path, content: Buffer.from(raw, 'utf8') });
      } catch (e) {
        log.warn('github.publish.read_failed', { path: f.path });
      }
    }
    if (files.length === 0) {
      throw new ValidationError('no files to publish');
    }

    try {
      const result = await opts.github.publish({
        projectName,
        projectId,
        files,
      });
      res.json({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error('github.publish.failed', { projectId, error: msg });
      res.status(422).json({ ok: false, error: msg });
    }
  });

  return router;
}
