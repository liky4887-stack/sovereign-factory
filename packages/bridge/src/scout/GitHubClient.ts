/**
 * GitHubClient — thin REST wrapper for repo search and metadata.
 *
 * Auth: reads GITHUB_TOKEN from config (env). Unauthenticated calls are
 * allowed but rate-limited to 60/hour. Authenticated: 5000/hour.
 *
 * No octokit dependency — uses global fetch (Node 18+) and a small
 * exponential-backoff helper. Termux-friendly: zero native deps.
 */

import { config } from '../config';
import { log } from '../core/logger';
import { UpstreamError, TimeoutError } from '../shared/types/errors';
import type {
  RepoProfile,
  ScoutSearchQuery,
  ScoutSearchResult,
} from './types';

const API = 'https://api.github.com';

interface GitHubRepoRaw {
  id: number;
  full_name: string;
  owner: { login: string };
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
  license: { spdx_id: string } | null;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
  html_url: string;
  size: number;
}

function normalizeRepo(raw: GitHubRepoRaw): RepoProfile {
  return {
    id: String(raw.id),
    fullName: raw.full_name,
    owner: raw.owner.login,
    name: raw.name,
    description: raw.description ?? '',
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    watchers: raw.watchers_count,
    openIssues: raw.open_issues_count,
    language: raw.language,
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    license: raw.license?.spdx_id ?? null,
    defaultBranch: raw.default_branch,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    pushedAt: raw.pushed_at,
    archived: raw.archived,
    isFork: raw.fork,
    htmlUrl: raw.html_url,
    sizeKb: raw.size,
    fetchedAt: new Date().toISOString(),
  };
}

function buildSearchQuery(q: ScoutSearchQuery): string {
  const parts: string[] = [];
  if (q.text) parts.push(q.text);
  if (q.language) parts.push('language:' + q.language);
  if (q.minStars !== undefined) parts.push('stars:>=' + q.minStars);
  if (q.maxStars !== undefined) parts.push('stars:<=' + q.maxStars);
  if (q.license) parts.push('license:' + q.license);
  if (q.pushedAfter) parts.push('pushed:>=' + q.pushedAfter);
  if (q.topics && q.topics.length > 0) {
    for (const t of q.topics) parts.push('topic:' + t);
  }
  return parts.join(' ');
}

export class GitHubClient {
  private readonly token: string | null;
  private readonly timeoutMs: number;

  constructor(opts?: { token?: string | null; timeoutMs?: number }) {
    this.token = opts?.token ?? (config as { GITHUB_TOKEN?: string }).GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? null;
    this.timeoutMs = opts?.timeoutMs ?? 20000;
  }

  isAuthenticated(): boolean {
    return Boolean(this.token && this.token.length > 0);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sovereign-bridge-github-scout',
    };
    if (this.token) h.Authorization = 'Bearer ' + this.token;
    return h;
  }

  private async fetchWithBackoff(url: string, attempts = 3): Promise<Response> {
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
        clearTimeout(timer);

        if (res.status === 403 || res.status === 429) {
          const retryAfter = res.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, i) * 1000;
          log.warn('scout.github.ratelimit', { status: res.status, waitMs, attempt: i + 1 });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        return res;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (err instanceof Error && err.name === 'AbortError') {
          log.warn('scout.github.timeout', { attempt: i + 1 });
          continue;
        }
        throw err;
      }
    }
    if (lastErr instanceof Error && lastErr.name === 'AbortError') {
      throw new TimeoutError('github request timed out after ' + attempts + ' attempts');
    }
    throw new UpstreamError('github request failed after ' + attempts + ' attempts', {
      lastError: lastErr instanceof Error ? lastErr.message : String(lastErr),
    });
  }

  async searchRepos(q: ScoutSearchQuery): Promise<ScoutSearchResult> {
    const ghQuery = buildSearchQuery(q);
    if (!ghQuery) throw new UpstreamError('search query cannot be empty');

    const sortMap: Record<string, string> = {
      stars: 'stars',
      forks: 'forks',
      updated: 'updated',
      'best-match': 'best-match',
    };
    const sort = sortMap[q.sort ?? 'stars'] ?? 'stars';
    const perPage = Math.min(q.limit ?? 20, 100);
    const url = API + '/search/repositories?q=' + encodeURIComponent(ghQuery)
      + '&sort=' + sort + '&order=desc&per_page=' + perPage;

    log.info('scout.github.search', { query: ghQuery, sort, perPage });
    const res = await this.fetchWithBackoff(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new UpstreamError('github search ' + res.status + ': ' + text.slice(0, 300));
    }
    const json = (await res.json()) as { items?: GitHubRepoRaw[] };
    const repos = (json.items ?? []).map(normalizeRepo);
    return {
      query: q,
      totalReturned: repos.length,
      repos,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getRepo(fullName: string): Promise<RepoProfile> {
    const url = API + '/repos/' + fullName;
    log.info('scout.github.getRepo', { fullName });
    const res = await this.fetchWithBackoff(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new UpstreamError('github repo ' + res.status + ': ' + text.slice(0, 300));
    }
    const json = (await res.json()) as GitHubRepoRaw;
    return normalizeRepo(json);
  }

  async getReadme(fullName: string): Promise<string | null> {
    const url = API + '/repos/' + fullName + '/readme';
    log.debug('scout.github.getReadme', { fullName });
    const res = await this.fetchWithBackoff(url, 2);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: string; encoding?: string };
    if (!json.content) return null;
    try {
      return Buffer.from(json.content, json.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    } catch {
      return null;
    }
  }

  async getFile(fullName: string, path: string): Promise<string | null> {
    const url = API + '/repos/' + fullName + '/contents/' + path;
    log.debug('scout.github.getFile', { fullName, path });
    const res = await this.fetchWithBackoff(url, 2);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: string; encoding?: string };
    if (!json.content) return null;
    try {
      return Buffer.from(json.content, json.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    } catch {
      return null;
    }
  }

  async getTree(fullName: string, branch: string): Promise<string[]> {
    const url = API + '/repos/' + fullName + '/git/trees/' + branch + '?recursive=1';
    const res = await this.fetchWithBackoff(url, 2);
    if (!res.ok) return [];
    const json = (await res.json()) as { tree?: Array<{ path: string; type: string }> };
    return (json.tree ?? []).filter((e) => e.type === 'blob').map((e) => e.path);
  }
}

export const githubClient = new GitHubClient();
