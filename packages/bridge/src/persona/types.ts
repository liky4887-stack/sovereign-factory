/**
 * Persona Orchestration Layer — canonical types.
 *
 * The Persona Layer sits between SourceMapper / Fusion output and
 * Orchestrator execution. Each persona runs a list of deterministic
 * checks against the goal, its abstraction, and (optionally) its plan.
 *
 * Results are aggregated into a MultiPersonaReview that surfaces:
 *   - per-persona risks, opportunities, recommendations
 *   - conflicts between personas with opposing objectives
 *   - consensus points where multiple personas agree
 *   - blocking issues that must be resolved before execution
 *   - ranked plan variants (secure-first, growth-first, balanced)
 */

export type PersonaDomain =
  | 'engineering'
  | 'product'
  | 'marketing'
  | 'security'
  | 'legal'
  | 'finance'
  | 'ops'
  | 'design';

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive' | 'experimental';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface PersonaCheck {
  id: string;
  /** When this check fires — if any trigger keyword OR structural feature matches. */
  triggersOn: {
    keywords?: string[];
    features?: string[];
  };
  severity: Severity;
  /** Human-readable risk the check is guarding against. */
  risk: string;
  /** Human-readable opportunity the check is proposing. */
  opportunity?: string;
  /** Concrete action the persona recommends. */
  recommendation: string;
  /** Whether this issue can block execution (vs advisory). */
  blocking?: boolean;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  domain: PersonaDomain;
  objectives: string[];
  kpis: string[];
  riskProfile: RiskTolerance;
  /** Objectives this persona trades off against (used in conflict detection). */
  opposes: string[];
  checks: PersonaCheck[];
}

export interface PersonaReview {
  personaId: string;
  personaName: string;
  domain: PersonaDomain;
  riskProfile: RiskTolerance;
  summary: string;
  risks: Array<{ text: string; severity: Severity; blocking: boolean }>;
  opportunities: string[];
  recommendations: string[];
  severities: Record<Severity, number>;
  confidence: number;
  checksRun: number;
  checksFired: number;
}

export interface PersonaConflict {
  personaA: string;
  personaB: string;
  topic: string;
  personaAStance: string;
  personaBStance: string;
  resolution: string;
}

export interface PlanVariant {
  id: string;
  label: string;
  strategy: 'secure_first' | 'growth_first' | 'balanced' | 'skeptic_first';
  weightByPersona: Record<string, number>;
  prioritizedRecommendations: string[];
  annotatedSteps: Array<{
    order: number;
    layer: string;
    action: string;
    rationale?: string;
  }>;
  expectedTradeoffs: string[];
  notes: string[];
}

export interface PanelQuery {
  goal: string;
  personaIds?: string[];
  abstraction?: {
    features: string[];
    constraints: string[];
    coreObjective: string;
  };
  planSteps?: Array<{ order: number; layer: string; action: string }>;
  minSeverityForBlocking?: Severity;
}

export interface MultiPersonaReview {
  goal: string;
  personasInvoked: string[];
  reviews: PersonaReview[];
  conflicts: PersonaConflict[];
  consensusPoints: string[];
  blockingIssues: Array<{ personaId: string; text: string; severity: Severity }>;
  variants: PlanVariant[];
  recommendedVariantId: string;
  summary: string;
  panelCompletedAt: string;
}
