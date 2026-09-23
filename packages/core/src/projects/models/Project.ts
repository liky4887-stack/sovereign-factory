/**
 * projects/models/Project.ts
 * Canonical Project shape. Source of truth for Console (via HTTP).
 * Timestamps are ISO strings, matching the ledger convention.
 */

export interface ProjectMetrics {
  goalCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  activeAgentCount: number;
  ledgerEntryCount: number;
  lastActivityAt: string; // ISO
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  repoUrl?: string;
  localPath?: string;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  archived: boolean;
  metrics: ProjectMetrics;
}

export interface ProjectInput {
  name: string;
  slug: string;
  description: string;
  repoUrl?: string;
  localPath?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  repoUrl?: string;
  localPath?: string;
  archived?: boolean;
}

export function emptyMetrics(nowIso: string): ProjectMetrics {
  return {
    goalCount: 0,
    openTaskCount: 0,
    doneTaskCount: 0,
    activeAgentCount: 0,
    ledgerEntryCount: 0,
    lastActivityAt: nowIso,
  };
}
