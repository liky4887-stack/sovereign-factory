/**
 * Scout — the top-level orchestrator for the GitHub Knowledge Scout.
 *
 * Flow:
 *   searchRepos(query)           → GitHub search → RepoProfile[]
 *   ingestRepo(fullName)         → fetch README + tree → extract patterns → store
 *   scanAndIngest(query, limit)  → search + ingest top N in one call
 *   queryPatterns(patternQuery)  → ranked lookup against the local store
 *
 * Other Sovereign Bridge modules call:
 *   scout.scanAndIngest(...)   during goal intake
 *   scout.queryPatterns(...)   during blueprint / plan synthesis
 */

import { GitHubClient, githubClient } from './GitHubClient';
import { PatternExtractor, patternExtractor } from './PatternExtractor';
import { PatternStore, patternStore } from './PatternStore';
import { log } from '../core/logger';
import type {
  Pattern,
  PatternQuery,
  PatternQueryResult,
  RepoProfile,
  ScoutIngestResult,
  ScoutSearchQuery,
  ScoutSearchResult,
} from './types';

export interface ScanOptions {
  search: ScoutSearchQuery;
  maxIngest?: number;
  skipAlreadyIngested?: boolean;
}

export interface ScanSummary {
  search: ScoutSearchResult;
  ingests: ScoutIngestResult[];
  totalPatternsExtracted: number;
  durationMs: number;
}

export class Scout {
  private readonly client: GitHubClient;
  private readonly extractor: PatternExtractor;
  private readonly store: PatternStore;

  constructor(opts?: {
    client?: GitHubClient;
    extractor?: PatternExtractor;
    store?: PatternStore;
  }) {
    this.client = opts?.client ?? githubClient;
    this.extractor = opts?.extractor ?? patternExtractor;
    this.store = opts?.store ?? patternStore;
  }

  isAuthenticated(): boolean {
    return this.client.isAuthenticated();
  }

  async searchRepos(q: ScoutSearchQuery): Promise<ScoutSearchResult> {
    return this.client.searchRepos(q);
  }

  async ingestRepo(fullName: string, opts?: { skipIfSeen?: boolean }): Promise<ScoutIngestResult> {
    const startedAt = Date.now();

    const profile = await this.client.getRepo(fullName);

    if (opts?.skipIfSeen && this.store.hasRepo(profile.id)) {
      log.info('scout.ingest.skip', { fullName, reason: 'already_seen' });
      return {
        repo: profile,
        patternsExtracted: 0,
        patternIds: [],
        durationMs: Date.now() - startedAt,
        skipped: true,
        skipReason: 'already_seen',
      };
    }

    const [readme, tree] = await Promise.all([
      this.client.getReadme(fullName),
      this.client.getTree(fullName, profile.defaultBranch),
    ]);

    const patterns = this.extractor.extract(profile, readme, tree);

    await this.store.saveRepo(profile);
    await this.store.savePatterns(patterns);

    log.info('scout.ingest.done', {
      fullName,
      patterns: patterns.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      repo: profile,
      patternsExtracted: patterns.length,
      patternIds: patterns.map((p) => p.id),
      durationMs: Date.now() - startedAt,
    };
  }

  async scanAndIngest(opts: ScanOptions): Promise<ScanSummary> {
    const startedAt = Date.now();
    const search = await this.searchRepos(opts.search);

    const maxIngest = opts.maxIngest ?? 10;
    const targets = search.repos.slice(0, maxIngest);

    const ingests: ScoutIngestResult[] = [];
    for (const repo of targets) {
      try {
        const result = await this.ingestRepo(repo.fullName, {
          skipIfSeen: opts.skipAlreadyIngested ?? true,
        });
        ingests.push(result);
      } catch (err) {
        log.error('scout.ingest.error', {
          fullName: repo.fullName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const totalPatternsExtracted = ingests.reduce((s, i) => s + i.patternsExtracted, 0);

    log.info('scout.scan.complete', {
      searchMatches: search.totalReturned,
      ingested: ingests.length,
      totalPatternsExtracted,
      durationMs: Date.now() - startedAt,
    });

    return {
      search,
      ingests,
      totalPatternsExtracted,
      durationMs: Date.now() - startedAt,
    };
  }

  queryPatterns(q: PatternQuery): PatternQueryResult {
    return this.store.query(q);
  }

  listRepos(limit?: number): RepoProfile[] {
    return this.store.listRepos(limit ?? 100);
  }

  stats(): { repos: number; patterns: number; authenticated: boolean } {
    const counts = this.store.count();
    return { ...counts, authenticated: this.isAuthenticated() };
  }

  clearStore(): void {
    this.store.clear();
  }
}

export const scout = new Scout();
