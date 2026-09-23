/**
 * Cross-Domain Fusion Engine — canonical types.
 *
 * The Fusion Engine sits between SourceMapper output and Orchestrator
 * execution. It reads mechanisms from a curated cross-domain knowledge
 * graph and matches them to the goal's structural features.
 *
 * Callers receive FusionResult and may either:
 *   - log it for later analysis, or
 *   - use .enrichedSteps to inject tactics into an ExecutionPlan
 */

export type Domain =
  | 'biology'
  | 'game_theory'
  | 'hft'
  | 'military'
  | 'supply_chain'
  | 'cognitive'
  | 'control_theory'
  | 'economics';

export type StructuralFeature =
  | 'distributed'
  | 'centralized'
  | 'real_time'
  | 'batch'
  | 'adversarial'
  | 'cooperative'
  | 'high_uncertainty'
  | 'high_volume'
  | 'low_latency'
  | 'high_reliability'
  | 'cost_sensitive'
  | 'human_in_loop'
  | 'fully_automated'
  | 'long_horizon'
  | 'short_horizon'
  | 'single_actor'
  | 'multi_actor'
  | 'resource_constrained'
  | 'safety_critical'
  | 'experimental';

export interface Mechanism {
  id: string;
  domain: Domain;
  name: string;
  summary: string;
  tactic: string;
  appliesWhen: StructuralFeature[];
  contraindications: StructuralFeature[];
  intensity: 'light' | 'moderate' | 'aggressive';
  exampleUses: string[];
  sourceReference: string;
}

export interface Abstraction {
  goal: string;
  coreObjective: string;
  constraints: string[];
  features: StructuralFeature[];
  featureScores: Record<StructuralFeature, number>;
  notes: string[];
}

export interface Analogy {
  mechanismId: string;
  mechanismName: string;
  domain: Domain;
  tactic: string;
  summary: string;
  fitScore: number;
  matchingFeatures: StructuralFeature[];
  conflictingFeatures: StructuralFeature[];
  rationale: string;
  intensity: Mechanism['intensity'];
}

export interface FusionQuery {
  goal: string;
  constraints?: string[];
  allowedDomains?: Domain[];
  maxResults?: number;
  minFitScore?: number;
  intensityCeiling?: Mechanism['intensity'];
}

export interface EnrichedStep {
  order: number;
  layer: string;
  action: string;
  fusionAnnotation?: {
    mechanismId: string;
    mechanismName: string;
    domain: Domain;
    tactic: string;
  };
}

export interface FusionResult {
  goal: string;
  abstraction: Abstraction;
  analogies: Analogy[];
  topAnalogies: Analogy[];
  enrichedSteps: EnrichedStep[];
  domainsConsulted: Domain[];
  totalMechanismsConsidered: number;
  notes: string[];
  fusedAt: string;
}
