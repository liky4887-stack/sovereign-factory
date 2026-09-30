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

  // ── Push project files to a new GitHub branch ────────────
  // Body: { branch: string, message?: string, baseBranch?: string }
  // Never touches the base branch. Creates a new branch or fast-forwards
  // the named branch. Requires repoUrl to be set on the project.
  router.post('/projects/:id/push', async (req: Request, res: Response) => {
    if (!opts.github.hasCredentials()) {
      throw new ValidationError('GitHub credentials not configured');
    }
    const projectId = req.params.id;
    const body = req.body ?? {};
    const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const baseBranch = typeof body.baseBranch === 'string' ? body.baseBranch.trim() : 'main';

    if (!branch) throw new ValidationError('branch is required');
    if (branch === baseBranch) throw new ValidationError('branch must differ from baseBranch');

    const project = await opts.projects.getById(projectId);
    if (!project) throw new NotFoundError('project not found: ' + projectId);
    if (!project.repoUrl) throw new ValidationError('project has no repoUrl — clone one first');

    const m = project.repoUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (!m) throw new ValidationError('cannot parse repoUrl: ' + project.repoUrl);
    const owner = m[1];
    const repo = m[2];

    if (!opts.storage.exists(projectId)) {
      throw new NotFoundError('project has no files to push');
    }

    const listed = opts.storage.listFiles(projectId);
    const files: Array<{ path: string; content: Buffer }> = [];
    for (const f of listed) {
      if (f.path.startsWith('.git/') || f.path === '.git') continue;
      try {
        const raw = opts.storage.readFile(projectId, f.path);
        files.push({ path: f.path, content: Buffer.from(raw, 'utf8') });
      } catch {
        log.warn('github.push.read_failed', { path: f.path });
      }
    }
    if (files.length === 0) throw new ValidationError('no files to push');

    try {
      const result = await opts.github.commitToBranch({
        owner, repo, branch, baseBranch, files,
        message: message || 'Update from Sovereign Factory',
      });
      res.json({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('github.push.failed', { projectId, error: msg });
      res.status(422).json({ ok: false, error: msg });
    }
  });

  // ── Clone a GitHub repo into a project's storage ─────────
  // Body: { repoUrl: string, projectId: string }
  router.post('/github/clone', async (req: Request, res: Response) => {
    const repoUrl = (req.body && req.body.repoUrl) || '';
    const projectId = (req.body && req.body.projectId) || '';

    if (typeof repoUrl !== 'string' || repoUrl.trim().length === 0) {
      throw new ValidationError('repoUrl is required');
    }
    if (typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ValidationError('projectId is required');
    }

    const project = await opts.projects.getById(projectId);
    if (!project) throw new NotFoundError('project not found: ' + projectId);

    const targetDir = opts.storage.projectDir(projectId);

    try {
      const result = await opts.github.cloneRepo({ repoUrl: repoUrl.trim(), targetDir });

      await opts.projects.update(projectId, {
        repoUrl: result.repoUrl,
        localPath: result.targetDir,
      });

      res.json({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('github.clone.failed', { projectId, repoUrl, error: msg });
      res.status(422).json({ ok: false, error: msg });
    }
  });

  return router;
}
