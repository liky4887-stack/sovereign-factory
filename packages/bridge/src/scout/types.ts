/**
 * GitHub Knowledge Scout — canonical types.
 *
 * Other Sovereign Bridge modules (Fusion Engine, Persona Layer, Simulation
 * Hook) consume Scout.queryPatterns() and receive Pattern[].
 *
 * Pattern is deliberately JSON-serializable and self-describing so a future
 * embedding index can wrap the same struct without changing callers.
 */

export interface RepoProfile {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  description: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  language: string | null;
  topics: string[];
  license: string | null;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  archived: boolean;
  isFork: boolean;
  htmlUrl: string;
  sizeKb: number;
  fetchedAt: string;
}

export type PatternKind =
  | 'architecture'
  | 'library_stack'
  | 'folder_layout'
  | 'infra'
  | 'testing'
  | 'ci_cd'
  | 'observability'
  | 'api_style'
  | 'data_store'
  | 'auth'
  | 'realtime'
  | 'unknown';

export type PatternDomain =
  | 'web_frontend'
  | 'web_backend'
  | 'agent_ai'
  | 'data_pipeline'
  | 'infra_devops'
  | 'mobile'
  | 'library'
  | 'cli_tool'
  | 'unknown';

export interface Pattern {
  id: string;
  repoId: string;
  repoFullName: string;
  repoStars: number;
  repoLicense: string | null;
  kind: PatternKind;
  domain: PatternDomain;
  name: string;
  summary: string;
  evidence: string;
  tags: string[];
  confidence: number;
  sourceUrl: string;
  extractedAt: string;
}

export interface ScoutSearchQuery {
  text?: string;
  language?: string;
  minStars?: number;
  maxStars?: number;
  topics?: string[];
  license?: string;
  sort?: 'stars' | 'forks' | 'updated' | 'best-match';
  limit?: number;
  pushedAfter?: string;
}

export interface ScoutSearchResult {
  query: ScoutSearchQuery;
  totalReturned: number;
  repos: RepoProfile[];
  fetchedAt: string;
}

export interface PatternQuery {
  keywords?: string[];
  tags?: string[];
  kind?: PatternKind;
  domain?: PatternDomain;
  minStars?: number;
  minConfidence?: number;
  licenseAllowlist?: string[];
  limit?: number;
}

export interface PatternQueryResult {
  query: PatternQuery;
  total: number;
  patterns: Pattern[];
  indexedAt: string;
}

export interface ScoutIngestResult {
  repo: RepoProfile;
  patternsExtracted: number;
  patternIds: string[];
  durationMs: number;
  skipped?: boolean;
  skipReason?: string;
}
