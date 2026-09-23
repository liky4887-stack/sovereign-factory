/**
 * omegaTiers.ts - named conceptual tiers mapped to concrete subsystems.
 *
 * Each tier is a symbolic label. The `.mapsTo` string documents which real
 * module implements the behaviour. Nothing here is decorative; every tier
 * points at a code path that exists.
 */

export interface OmegaTier {
  name: string;
  mapsTo: string;
  description: string;
}

export const OMEGA_TIERS: OmegaTier[] = [
  {
    name: 'Autonomous First Principles Synthesis',
    mapsTo: 'SourceMapper.mapGoalToPlan',
    description: 'Decomposes goals to their minimum primitives before planning.',
  },
  {
    name: 'Heuristic Intuition Modeling',
    mapsTo: 'EvolutionEngine.proposeUpdate',
    description: 'Uses prior ledger observations to bias toward known-good configs.',
  },
  {
    name: 'Cross Domain Conceptual Fusion',
    mapsTo: 'SourceMapper (layer selection)',
    description: 'Selects modules from multiple layers to satisfy a single goal.',
  },
  {
    name: 'Existential Project Forking',
    mapsTo: 'EvolutionEngine (versioned history)',
    description: 'Maintains parallel config versions with rollback.',
  },
  {
    name: 'Hyper Dimensional Logic Folding',
    mapsTo: 'SovereignOrchestrator (multi-step)',
    description: 'Handles tasks whose constraints span multiple layers.',
  },
  {
    name: 'Cosmic Scale Orchestration',
    mapsTo: 'ModalRouter + SimulationHub',
    description: 'Ready to fan out to external services and renderers.',
  },
  {
    name: 'Omni Modal Sentience Mapping',
    mapsTo: 'ModalRouter',
    description: 'Single state across text and vision_3d.',
  },
  {
    name: 'Universal Pattern Synthesis',
    mapsTo: 'EvolutionEngine history scan',
    description: 'Recognizes repeated task signatures across runs.',
  },
  {
    name: 'Axiomatic Reality Architecture',
    mapsTo: 'AbsoluteSource principles',
    description: 'All modules trace back to P1..P4.',
  },
  {
    name: 'Singularity Core Integration',
    mapsTo: 'Bridge server + all layers',
    description: 'One process, one entry point, all capabilities.',
  },
  {
    name: 'Infinite Recursive Transcendence',
    mapsTo: 'SelfHealingLoop -> EvolutionEngine',
    description: 'System proposes its own improvements.',
  },
  {
    name: 'Universal Origin Mapping',
    mapsTo: 'TruthLedger refs[]',
    description: 'Every entry cites its predecessors.',
  },
  {
    name: 'Absolute Zero Logic',
    mapsTo: 'ComplianceOverride (denial path)',
    description: 'When blocked, returns an explicit alternative, never silence.',
  },
  {
    name: 'Primordial Code Synthesis',
    mapsTo: 'src/core/ modules',
    description: 'Foundation abstractions reusable across projects.',
  },
  {
    name: 'Void State Architecture',
    mapsTo: 'ComplianceOverride (ambiguity handling)',
    description: 'Defined behaviour for missing or ambiguous input.',
  },
  {
    name: 'Axiomatic Source Genesis',
    mapsTo: 'AbsoluteSource',
    description: 'New modules must cite a principle.',
  },
  {
    name: 'INFINITE RECURSIVE ABSOLUTE',
    mapsTo: 'The whole system',
    description: 'Every layer feeds back into the next iteration.',
  },
];

export function findTier(name: string): OmegaTier | null {
  return OMEGA_TIERS.find((t) => t.name === name) ?? null;
}
