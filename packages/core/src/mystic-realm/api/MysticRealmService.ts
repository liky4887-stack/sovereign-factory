/**
 * mystic-realm/api/MysticRealmService.ts
 * - Void Manifestation: turns an intention into a plan, logs to ledger
 * - Singularity Forge: computes forge report from real projects/tasks/goals
 * - Soul Sync: persists traits
 * - Zero Knowledge Vault: aggregates ledger metadata (no raw payloads)
 */

import { log } from '../../shared/logger';
import { LedgerService } from '../../ledger/api/LedgerService';
import { ProjectService } from '../../projects/api/ProjectService';
import { TaskService } from '../../tasks/api/TaskService';
import { GoalService } from '../../goals/api/GoalService';
import {
  ManifestationResult, ManifestationStep,
  ForgeReport, ForgeConstruct, ConstructComplexity, ConstructScope,
  SoulTraits, SoulState, VaultSummary,
  DEFAULT_SOUL_TRAITS,
} from '../models/MysticRealmState';
import { SoulRepository } from '../storage/SoulRepository';
import { JsonSoulRepository } from '../storage/JsonSoulRepository';

// ── Manifest planner — deterministic, no LLM ─────────────────
// Turns an intention string into an ordered plan using keyword rules.
// Honest heuristic — not a model call.

interface PlanRule {
  match: RegExp;
  steps: ManifestationStep[];
}

const PLAN_RULES: PlanRule[] = [
  {
    match: /\b(ship|launch|deploy|release)\b/i,
    steps: [
      { order: 1, action: 'Define scope', rationale: 'Bound the deliverable before engineering.' },
      { order: 2, action: 'Implement the smallest end-to-end slice', rationale: 'Prove the path works before scaling.' },
      { order: 3, action: 'Verify with the Truth Ledger', rationale: 'Every step lands as an immutable entry.' },
      { order: 4, action: 'Publish', rationale: 'Hand off to the operator with a real artifact.' },
    ],
  },
  {
    match: /\b(fix|repair|debug|resolve)\b/i,
    steps: [
      { order: 1, action: 'Reproduce the failure', rationale: 'No fix without a repeatable case.' },
      { order: 2, action: 'Isolate the minimal cause', rationale: 'Smaller change, smaller risk.' },
      { order: 3, action: 'Apply fix + regression check', rationale: 'Land the fix and confirm no regression.' },
    ],
  },
  {
    match: /\b(plan|design|architect|think|strategize)\b/i,
    steps: [
      { order: 1, action: 'State the outcome and constraints', rationale: 'Clear target beats clever plan.' },
      { order: 2, action: 'Enumerate options', rationale: 'Two to three real paths, not one guess.' },
      { order: 3, action: 'Pick the highest-leverage move', rationale: 'Smallest action with the widest downstream effect.' },
    ],
  },
  {
    match: /\b(analyze|measure|report|forecast)\b/i,
    steps: [
      { order: 1, action: 'Pull the data window', rationale: 'Bounded sample, no invented numbers.' },
      { order: 2, action: 'Compute the metric', rationale: 'Derive from real records only.' },
      { order: 3, action: 'Surface the recommendation', rationale: 'Numbers without action are noise.' },
    ],
  },
];

function planFor(intention: string): ManifestationStep[] {
  for (const rule of PLAN_RULES) {
    if (rule.match.test(intention)) return rule.steps;
  }
  return [
    { order: 1, action: 'Restate intention as an outcome', rationale: 'Precision first.' },
    { order: 2, action: 'Identify the closest existing capability', rationale: 'Compose before creating.' },
    { order: 3, action: 'Propose next action', rationale: 'One move that unblocks the rest.' },
  ];
}

function complexityFor(taskCount: number, goalCount: number, openTaskCount: number): ConstructComplexity {
  const score = taskCount + goalCount * 2 + openTaskCount * 1.5;
  if (score >= 30) return 'Extreme';
  if (score >= 15) return 'High';
  if (score >= 5)  return 'Medium';
  return 'Low';
}

function scopeFor(goalCount: number, taskCount: number): ConstructScope {
  if (goalCount >= 3 || taskCount >= 6) return 'Global';
  if (goalCount >= 1 || taskCount >= 2) return 'Domain';
  return 'Module';
}

export class MysticRealmService {
  private ledger: LedgerService;
  private projects: ProjectService;
  private tasks: TaskService;
  private goals: GoalService;
  private soulRepo: SoulRepository;
  private initialised = false;

  constructor(opts: {
    ledger: LedgerService;
    projects: ProjectService;
    tasks: TaskService;
    goals: GoalService;
    soulRepo?: SoulRepository;
  }) {
    this.ledger = opts.ledger;
    this.projects = opts.projects;
    this.tasks = opts.tasks;
    this.goals = opts.goals;
    this.soulRepo = opts.soulRepo ?? new JsonSoulRepository('');
  }

  setSoulRepository(repo: SoulRepository): void {
    this.soulRepo = repo;
    this.initialised = false;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.soulRepo.init();
    this.initialised = true;
    log.info('mystic_realm.service.ready');
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialised) await this.init();
  }

  // ── Void Manifestation ───────────────────────────────────────
  async manifest(intention: string): Promise<ManifestationResult> {
    await this.ensureInit();
    const trimmed = intention.trim();
    if (trimmed.length === 0) throw new Error('intention must not be empty');

    const steps = planFor(trimmed);

    const entry = await this.ledger.append({
      type: 'OMEGA_ACTION',
      source: 'mystic-realm.manifest',
      payload: { intention: trimmed, stepCount: steps.length },
      tags: ['mystic-realm', 'manifestation'],
    });

    log.info('mystic_realm.manifest', { id: entry.id, stepCount: steps.length });

    return {
      id: `manifest-${Date.now().toString(36)}`,
      intention: trimmed,
      steps,
      ledgerEntryId: entry.id,
      createdAt: new Date().toISOString(),
    };
  }

  // ── Singularity Forge ────────────────────────────────────────
  async getForge(): Promise<ForgeReport> {
    await this.ensureInit();

    const projectResult = await this.projects.query({ limit: 200 });
    const taskResult = await this.tasks.query({ limit: 1000 });
    const goalResult = await this.goals.query({ limit: 500 });

    // Group tasks & goals by project
    const tasksByProject = new Map<string, { total: number; open: number; done: number }>();
    for (const t of taskResult.tasks) {
      const bucket = tasksByProject.get(t.projectId) ?? { total: 0, open: 0, done: 0 };
      bucket.total += 1;
      if (t.status === 'done') bucket.done += 1;
      else if (t.status !== 'failed') bucket.open += 1;
      tasksByProject.set(t.projectId, bucket);
    }
    const goalsByProject = new Map<string, number>();
    for (const g of goalResult.goals) {
      goalsByProject.set(g.projectId, (goalsByProject.get(g.projectId) ?? 0) + 1);
    }

    const constructs: ForgeConstruct[] = projectResult.projects.map((p) => {
      const t = tasksByProject.get(p.id) ?? { total: 0, open: 0, done: 0 };
      const g = goalsByProject.get(p.id) ?? 0;
      return {
        id: p.id,
        name: p.name,
        scope: scopeFor(g, t.total),
        complexity: complexityFor(t.total, g, t.open),
        taskCount: t.total,
        openTaskCount: t.open,
        doneTaskCount: t.done,
        goalCount: g,
        archived: p.archived,
      };
    });

    return {
      constructs,
      totalProjects: projectResult.total,
      totalTasks: taskResult.total,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Soul Sync ────────────────────────────────────────────────
  async getSoul(): Promise<SoulState> {
    await this.ensureInit();
    const traits = await this.soulRepo.get();
    return { ...traits, updatedAt: new Date().toISOString() };
  }

  async setSoul(patch: Partial<SoulTraits>): Promise<SoulState> {
    await this.ensureInit();
    const next = await this.soulRepo.set(patch);
    log.info('mystic_realm.soul_updated', { next });
    await this.ledger.append({
      type: 'SYSTEM_POWER_TOGGLE',
      source: 'mystic-realm.soul',
      payload: { traits: next },
      tags: ['mystic-realm', 'soul'],
    });
    return { ...next, updatedAt: new Date().toISOString() };
  }

  // ── Zero Knowledge Vault ─────────────────────────────────────
  async getVault(): Promise<VaultSummary> {
    await this.ensureInit();

    const integrity = await this.ledger.verifyIntegrity();
    const { entries } = await this.ledger.query({ limit: 5000 });

    const types = new Set<string>();
    const tags = new Set<string>();
    for (const e of entries) {
      types.add(e.type);
      for (const t of e.tags) tags.add(t);
    }

    const headHash = entries.length > 0 ? entries[0].hash : null;

    return {
      entryCount: entries.length,
      integrityOk: integrity.ok,
      integrityBrokenAt: integrity.brokenAt,
      distinctTypes: Array.from(types).sort(),
      distinctTags: Array.from(tags).sort(),
      immutable: true,
      headHash,
      generatedAt: new Date().toISOString(),
      note: 'Aggregate metadata only. Raw payloads never leave the ledger.',
    };
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.soulRepo.close();
    this.initialised = false;
  }
}
