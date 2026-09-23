/**
 * PatternStore — JSONL persistence + in-memory tag index.
 *
 * Storage layout under data/scout/:
 *   patterns.jsonl   — one Pattern per line, append-only
 *   repos.jsonl      — one RepoProfile per line, one per fetched repo
 *
 * Query model: keyword match on (name + summary + evidence + tags) with
 * optional structured filters. Ranked by a weighted score that favours
 * high-star, high-confidence patterns and keyword overlap.
 *
 * Phase 2 can replace the index with embeddings — the public API does not
 * change.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { log } from '../core/logger';
import type { Pattern, PatternQuery, PatternQueryResult, RepoProfile } from './types';

const DATA_DIR = path.resolve(config.ROOT ?? process.cwd(), 'data', 'scout');
const PATTERNS_FILE = path.join(DATA_DIR, 'patterns.jsonl');
const REPOS_FILE = path.join(DATA_DIR, 'repos.jsonl');

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T);
}

function appendJsonl(file: string, obj: unknown): void {
  ensureDir();
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}

export class PatternStore {
  private patternsCache: Pattern[] | null = null;
  private reposCache: RepoProfile[] | null = null;

  private loadPatterns(): Pattern[] {
    if (this.patternsCache === null) this.patternsCache = readJsonl<Pattern>(PATTERNS_FILE);
    return this.patternsCache;
  }

  private loadRepos(): RepoProfile[] {
    if (this.reposCache === null) this.reposCache = readJsonl<RepoProfile>(REPOS_FILE);
    return this.reposCache;
  }

  invalidate(): void {
    this.patternsCache = null;
    this.reposCache = null;
  }

  async saveRepo(repo: RepoProfile): Promise<void> {
    appendJsonl(REPOS_FILE, repo);
    if (this.reposCache !== null) this.reposCache.push(repo);
  }

  async savePattern(pattern: Pattern): Promise<void> {
    appendJsonl(PATTERNS_FILE, pattern);
    if (this.patternsCache !== null) this.patternsCache.push(pattern);
  }

  async savePatterns(patterns: Pattern[]): Promise<void> {
    for (const p of patterns) await this.savePattern(p);
  }

  hasRepo(repoId: string): boolean {
    return this.loadRepos().some((r) => r.id === repoId);
  }

  getRepo(repoId: string): RepoProfile | null {
    return this.loadRepos().find((r) => r.id === repoId) ?? null;
  }

  listRepos(limit = 100): RepoProfile[] {
    return this.loadRepos().slice(0, limit);
  }

  count(): { repos: number; patterns: number } {
    return { repos: this.loadRepos().length, patterns: this.loadPatterns().length };
  }

  query(q: PatternQuery): PatternQueryResult {
    const all = this.loadPatterns();
    const keywords = (q.keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
    const wantTags = (q.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);

    const filtered = all.filter((p) => {
      if (q.kind && p.kind !== q.kind) return false;
      if (q.domain && p.domain !== q.domain) return false;
      if (q.minStars !== undefined && p.repoStars < q.minStars) return false;
      if (q.minConfidence !== undefined && p.confidence < q.minConfidence) return false;
      if (q.licenseAllowlist && q.licenseAllowlist.length > 0) {
        if (!p.repoLicense || !q.licenseAllowlist.includes(p.repoLicense)) return false;
      }
      if (wantTags.length > 0) {
        const pTags = p.tags.map((t) => t.toLowerCase());
        for (const t of wantTags) {
          if (!pTags.includes(t)) return false;
        }
      }
      return true;
    });

    const scored = filtered.map((p) => {
      let score = p.confidence * 0.4;
      score += Math.log10(Math.max(p.repoStars, 1)) * 0.15;
      if (keywords.length > 0) {
        const haystack = (p.name + ' ' + p.summary + ' ' + p.evidence + ' ' + p.tags.join(' ')).toLowerCase();
        let hits = 0;
        for (const k of keywords) if (haystack.includes(k)) hits += 1;
        score += (hits / keywords.length) * 0.5;
      }
      return { pattern: p, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const limit = q.limit ?? 20;
    const patterns = scored.slice(0, limit).map((s) => s.pattern);

    log.info('scout.store.query', {
      total: all.length,
      filtered: filtered.length,
      returned: patterns.length,
    });

    return {
      query: q,
      total: filtered.length,
      patterns,
      indexedAt: new Date().toISOString(),
    };
  }

  clear(): void {
    if (fs.existsSync(PATTERNS_FILE)) fs.unlinkSync(PATTERNS_FILE);
    if (fs.existsSync(REPOS_FILE)) fs.unlinkSync(REPOS_FILE);
    this.invalidate();
    log.warn('scout.store.cleared');
  }
}

export const patternStore = new PatternStore();
