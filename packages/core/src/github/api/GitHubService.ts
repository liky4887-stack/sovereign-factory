// GitHub REST client for publishing generated projects.
// Stores a user's PAT + username on disk so the app can push files
// to GitHub without shell access. No MCP layer — direct REST.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../../shared/logger';

export interface GitHubCredentials {
  token: string;
  username: string;
}

export interface GitHubCredentialsRedacted {
  configured: boolean;
  username: string | null;
  tokenLength: number;
  acquiredAt: number | null;
}

export interface PublishInput {
  projectName: string;
  projectId: string;
  files: Array<{ path: string; content: Buffer }>;
}

export interface PublishResult {
  repoName: string;
  repoUrl: string;
  branch: string;
  filesUploaded: number;
  created: boolean;
}

const GH = 'https://api.github.com';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
}

function encPath(p: string): string {
  return p
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export class GitHubService {
  private creds: GitHubCredentials | null = null;
  private acquiredAt: number | null = null;

  constructor(private readonly credentialsFile: string) {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.credentialsFile)) return;
      const raw = JSON.parse(fs.readFileSync(this.credentialsFile, 'utf8'));
      if (raw && typeof raw.token === 'string' && typeof raw.username === 'string') {
        this.creds = { token: raw.token, username: raw.username };
        this.acquiredAt = typeof raw.acquiredAt === 'number' ? raw.acquiredAt : Date.now();
        log.info('github.credentials.loaded_from_file', { username: raw.username });
      }
    } catch (e) {
      log.warn('github.credentials.load_failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.credentialsFile), { recursive: true });
      const payload = {
        token: this.creds?.token ?? '',
        username: this.creds?.username ?? '',
        acquiredAt: this.acquiredAt ?? Date.now(),
      };
      fs.writeFileSync(this.credentialsFile, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (e) {
      log.error('github.credentials.persist_failed', {
        path: this.credentialsFile,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  hasCredentials(): boolean { return this.creds !== null; }

  getRedacted(): GitHubCredentialsRedacted {
    if (!this.creds) {
      return { configured: false, username: null, tokenLength: 0, acquiredAt: null };
    }
    return {
      configured: true,
      username: this.creds.username,
      tokenLength: this.creds.token.length,
      acquiredAt: this.acquiredAt,
    };
  }

  async setCredentials(input: { token: string; username?: string }): Promise<{ username: string }> {
    const token = input.token.trim();
    if (!token) throw new Error('token is required');

    // Verify the token and get the real username from GitHub.
    const res = await fetch(GH + '/user', {
      headers: {
        'authorization': 'Bearer ' + token,
        'accept': 'application/vnd.github+json',
        'user-agent': 'sovereign-factory',
      },
    });
    if (res.status === 401) throw new Error('GitHub rejected the token (401)');
    if (!res.ok) throw new Error('GitHub /user failed: HTTP ' + res.status);
    const user: any = await res.json();
    const username = typeof user.login === 'string' ? user.login : (input.username || '').trim();
    if (!username) throw new Error('could not determine GitHub username');

    this.creds = { token, username };
    this.acquiredAt = Date.now();
    this.persist();
    log.info('github.credentials.set', { username });
    return { username };
  }

  clearCredentials(): void {
    this.creds = null;
    this.acquiredAt = null;
    try { fs.unlinkSync(this.credentialsFile); } catch {}
    log.info('github.credentials.cleared');
  }

  // ── low-level API helper ────────────────────────────────────────
  private async api(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    urlPath: string,
    body?: unknown,
  ): Promise<{ status: number; json: any }> {
    if (!this.creds) throw new Error('GitHub credentials not configured');
    const res = await fetch(GH + urlPath, {
      method,
      headers: {
        'authorization': 'Bearer ' + this.creds.token,
        'accept': 'application/vnd.github+json',
        'user-agent': 'sovereign-factory',
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json: any = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }

  // ── ensure repo exists, return info ─────────────────────────────
  private async ensureRepo(repoName: string): Promise<{
    html_url: string; default_branch: string; created: boolean;
  }> {
    if (!this.creds) throw new Error('GitHub credentials not configured');
    const { username } = this.creds;

    // Try to fetch first.
    const existing = await this.api('GET', '/repos/' + username + '/' + repoName);
    if (existing.status === 200 && existing.json) {
      return {
        html_url: existing.json.html_url,
        default_branch: existing.json.default_branch || 'main',
        created: false,
      };
    }
    if (existing.status !== 404) {
      throw new Error('GitHub repo lookup failed: HTTP ' + existing.status);
    }

    // Create new with auto_init so a default branch exists.
    const created = await this.api('POST', '/user/repos', {
      name: repoName,
      private: false,
      auto_init: true,
    });
    if (created.status !== 201) {
      const msg = created.json && created.json.message ? created.json.message : 'unknown';
      throw new Error('GitHub repo create failed: HTTP ' + created.status + ' - ' + msg);
    }
    return {
      html_url: created.json.html_url,
      default_branch: created.json.default_branch || 'main',
      created: true,
    };
  }

  // ── PUT one file via Contents API ───────────────────────────────
  private async putFile(
    owner: string,
    repo: string,
    branch: string,
    filePath: string,
    content: Buffer,
  ): Promise<void> {
    // Look up existing sha (needed to update).
    let sha: string | undefined;
    const lookup = await this.api(
      'GET',
      '/repos/' + owner + '/' + repo + '/contents/' + encPath(filePath) + '?ref=' + encodeURIComponent(branch),
    );
    if (lookup.status === 200 && lookup.json && typeof lookup.json.sha === 'string') {
      sha = lookup.json.sha;
    }

    const body: Record<string, unknown> = {
      message: (sha ? 'Update ' : 'Add ') + filePath,
      content: content.toString('base64'),
      branch,
    };
    if (sha) body.sha = sha;

    const put = await this.api(
      'PUT',
      '/repos/' + owner + '/' + repo + '/contents/' + encPath(filePath),
      body,
    );
    if (put.status !== 200 && put.status !== 201) {
      const msg = put.json && put.json.message ? put.json.message : 'unknown';
      throw new Error('push failed for ' + filePath + ': HTTP ' + put.status + ' - ' + msg);
    }
  }

  // ── public entrypoint ───────────────────────────────────────────
  async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.creds) throw new Error('GitHub credentials not configured');
    const { username } = this.creds;
    const repoName = slugify(input.projectName || input.projectId);

    const repo = await this.ensureRepo(repoName);

    let uploaded = 0;
    for (const f of input.files) {
      if (f.path.startsWith('.') || f.path.includes('..')) continue;
      await this.putFile(username, repoName, repo.default_branch, f.path, f.content);
      uploaded += 1;
    }

    log.info('github.publish.done', {
      repo: username + '/' + repoName,
      files: uploaded,
      created: repo.created,
    });

    return {
      repoName,
      repoUrl: repo.html_url,
      branch: repo.default_branch,
      filesUploaded: uploaded,
      created: repo.created,
    };
  }
}
