// GitHub REST client for publishing generated projects.
// Stores a user's PAT + username on disk so the app can push files
// to GitHub without shell access. No MCP layer — direct REST.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

export interface CloneInput {
  repoUrl: string;
  targetDir: string;
}

export interface CloneResult {
  targetDir: string;
  branch: string;
  fileCount: number;
  bytes: number;
  repoUrl: string;
}

export interface CommitFile {
  path: string;
  content: Buffer;
}

export interface CommitInput {
  owner: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  files: CommitFile[];
  message: string;
}

export interface CommitResult {
  branch: string;
  commitSha: string;
  commitUrl: string;
  filesUploaded: number;
  baseBranch: string;
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
  // Mirror of ProjectBuilder's context filter. Keeps vendor dirs out
  // of pushes so we never upload .git/, node_modules/, build artifacts.
  private shouldSkipInCommit(rel: string): boolean {
    const prefixes = [
      '.git/', 'node_modules/', 'dist/', 'build/', '.next/',
      '.expo/', '.venv/', '__pycache__/', 'coverage/', '.cache/',
    ];
    if (prefixes.some((p) => rel === p.slice(0, -1) || rel.startsWith(p))) return true;
    if (rel === '.DS_Store' || rel.endsWith('/.DS_Store')) return true;
    return false;
  }

  // ── clone an existing repo into a target directory ───────
  // Additive: does not modify or delete anything on disk. Refuses to
  // clone into a non-empty directory. Uses token only if configured.
  async cloneRepo(input: CloneInput): Promise<CloneResult> {
    const repoUrl = input.repoUrl.trim();
    const targetDir = path.resolve(input.targetDir);

    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(repoUrl)) {
      throw new Error('repoUrl must be https://github.com/owner/repo');
    }
    if (!targetDir) throw new Error('targetDir is required');

    if (fs.existsSync(targetDir)) {
      const entries = fs.readdirSync(targetDir).filter((n) => n !== '.git');
      if (entries.length > 0) {
        throw new Error('target directory already has files: ' + targetDir);
      }
    }

    let cloneUrl = repoUrl;
    if (this.creds) {
      cloneUrl = repoUrl.replace(
        /^https:\/\/github\.com\//,
        'https://x-access-token:' + encodeURIComponent(this.creds.token) + '@github.com/',
      );
    }

    const execFileAsync = promisify(execFile);
    try {
      await execFileAsync('git', ['clone', '--depth=1', cloneUrl, targetDir], {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (e: any) {
      const raw = String((e && e.message) || e);
      const safe = raw.replace(/x-access-token:[^@]+@/g, 'x-access-token:***@');
      throw new Error('git clone failed: ' + safe);
    }

    let branch = 'main';
    try {
      const br = await execFileAsync('git', ['-C', targetDir, 'rev-parse', '--abbrev-ref', 'HEAD']);
      branch = String(br.stdout).trim() || branch;
    } catch { /* keep default */ }

    let fileCount = 0;
    let bytes = 0;
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir)) {
        if (name === '.git') continue;
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full);
        else if (st.isFile()) { fileCount += 1; bytes += st.size; }
      }
    };
    try { walk(targetDir); } catch { /* ignore */ }

    log.info('github.clone.done', { repoUrl, targetDir, branch, fileCount, bytes });
    return { targetDir, branch, fileCount, bytes, repoUrl };
  }

  // ── commit files to a new branch via the Git Data API ──────
  // One atomic commit. Creates the branch if it does not exist, otherwise
  // fast-forwards it. Never touches the base branch. Uses the same
  // credential store as the rest of this service.
  async commitToBranch(input: CommitInput): Promise<CommitResult> {
    if (!this.creds) throw new Error('GitHub credentials not configured');

    const { owner, repo } = input;
    const branch = input.branch.trim();
    const baseBranch = (input.baseBranch || 'main').trim();
    const message = input.message.trim() || 'Update from Sovereign Factory';

    if (!branch) throw new Error('branch is required');
    if (branch === baseBranch) throw new Error('branch must differ from baseBranch');
    if (!input.files || input.files.length === 0) throw new Error('no files to commit');

    const keep = input.files.filter((f) => !this.shouldSkipInCommit(f.path));
    if (keep.length === 0) throw new Error('all files filtered out by skip list');

    const ownerRepo = owner + '/' + repo;

    // 1) resolve base branch ref
    const baseRef = await this.api('GET', '/repos/' + ownerRepo + '/git/ref/heads/' + encodeURIComponent(baseBranch));
    if (baseRef.status !== 200 || !baseRef.json || !baseRef.json.object) {
      throw new Error('base branch not found: ' + baseBranch);
    }
    const baseCommitSha: string = baseRef.json.object.sha;
    const baseCommit = await this.api('GET', '/repos/' + ownerRepo + '/git/commits/' + baseCommitSha);
    if (baseCommit.status !== 200 || !baseCommit.json || !baseCommit.json.tree) {
      throw new Error('could not read base commit tree');
    }
    const baseTreeSha: string = baseCommit.json.tree.sha;

    // 2) create blobs for every file
    const entries: Array<{ path: string; sha: string; mode: string; type: string }> = [];
    for (const f of keep) {
      const blob = await this.api('POST', '/repos/' + ownerRepo + '/git/blobs', {
        content: f.content.toString('base64'),
        encoding: 'base64',
      });
      if (blob.status !== 201 || !blob.json || !blob.json.sha) {
        throw new Error('blob create failed for ' + f.path + ': HTTP ' + blob.status);
      }
      entries.push({ path: f.path, sha: blob.json.sha, mode: '100644', type: 'blob' });
    }

    // 3) create tree on top of base
    const tree = await this.api('POST', '/repos/' + ownerRepo + '/git/trees', {
      base_tree: baseTreeSha,
      tree: entries,
    });
    if (tree.status !== 201 || !tree.json || !tree.json.sha) {
      throw new Error('tree create failed: HTTP ' + tree.status);
    }
    const treeSha: string = tree.json.sha;

    // 4) create commit
    const commit = await this.api('POST', '/repos/' + ownerRepo + '/git/commits', {
      message,
      tree: treeSha,
      parents: [baseCommitSha],
    });
    if (commit.status !== 201 || !commit.json || !commit.json.sha) {
      throw new Error('commit create failed: HTTP ' + commit.status);
    }
    const commitSha: string = commit.json.sha;

    // 5) create or update the branch ref
    const existing = await this.api('GET', '/repos/' + ownerRepo + '/git/ref/heads/' + encodeURIComponent(branch));
    if (existing.status === 200) {
      const upd = await this.api('PATCH', '/repos/' + ownerRepo + '/git/refs/heads/' + encodeURIComponent(branch), {
        sha: commitSha,
        force: false,
      });
      if (upd.status !== 200) {
        throw new Error('branch update failed: HTTP ' + upd.status);
      }
    } else {
      const create = await this.api('POST', '/repos/' + ownerRepo + '/git/refs', {
        ref: 'refs/heads/' + branch,
        sha: commitSha,
      });
      if (create.status !== 201) {
        throw new Error('branch create failed: HTTP ' + create.status);
      }
    }

    log.info('github.commit.done', {
      repo: ownerRepo, branch, commitSha, files: entries.length, baseBranch,
    });

    return {
      branch,
      commitSha,
      commitUrl: 'https://github.com/' + ownerRepo + '/commit/' + commitSha,
      filesUploaded: entries.length,
      baseBranch,
    };
  }

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
