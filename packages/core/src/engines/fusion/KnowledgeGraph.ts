/**
 * KnowledgeGraph — curated cross-domain mechanism corpus.
 *
 * 30 mechanisms across 8 domains. Each entry has explicit "appliesWhen" and
 * "contraindications" rules so matching is fully explainable.
 *
 * Phase 2.5 could extend this by ingesting patterns from the GitHub Scout
 * (Phase 1) — mechanism IDs would be prefixed with the source repo.
 */

import type { Domain, Mechanism } from './types';

export class KnowledgeGraph {
  private readonly mechanisms: Mechanism[];

  constructor(seed?: Mechanism[]) {
    this.mechanisms = seed ?? DEFAULT_MECHANISMS;
  }

  all(): Mechanism[] {
    return this.mechanisms;
  }

  byDomain(domain: Domain): Mechanism[] {
    return this.mechanisms.filter((m) => m.domain === domain);
  }

  byId(id: string): Mechanism | null {
    return this.mechanisms.find((m) => m.id === id) ?? null;
  }

  domains(): Domain[] {
    return Array.from(new Set(this.mechanisms.map((m) => m.domain)));
  }

  count(): number {
    return this.mechanisms.length;
  }
}

const DEFAULT_MECHANISMS: Mechanism[] = [
  // ── Biology ────────────────────────────────────────────────────────────
  {
    id: 'bio.immune-response',
    domain: 'biology',
    name: 'Immune Response',
    summary: 'Distributed detection-and-response cells that classify anomalies and react locally without a central controller.',
    tactic: 'Deploy lightweight anomaly detectors at every boundary. Each detector classifies and responds locally before escalating to a coordinator.',
    appliesWhen: ['distributed', 'high_uncertainty', 'adversarial', 'safety_critical'],
    contraindications: ['centralized', 'single_actor'],
    intensity: 'moderate',
    exampleUses: ['Intrusion detection in mesh networks', 'Fraud detection at edge nodes', 'Fault isolation in microservices'],
    sourceReference: 'Janeway, Immunobiology; also applied in AIS (Artificial Immune Systems) literature',
  },
  {
    id: 'bio.homeostasis',
    domain: 'biology',
    name: 'Homeostasis',
    summary: 'Negative feedback loops that hold a system near a target set-point despite external perturbations.',
    tactic: 'Define a target metric with an acceptable band. Add a control loop that nudges inputs whenever the metric drifts outside the band.',
    appliesWhen: ['high_reliability', 'resource_constrained', 'real_time', 'long_horizon'],
    contraindications: ['experimental', 'short_horizon'],
    intensity: 'light',
    exampleUses: ['Auto-scaling on CPU target', 'Adaptive rate limiting', 'Thermostat-style caching'],
    sourceReference: 'Cannon, The Wisdom of the Body (1932); control theory derivative',
  },
  {
    id: 'bio.redundancy',
    domain: 'biology',
    name: 'Genetic Redundancy',
    summary: 'Multiple mechanisms that can perform the same function; loss of one does not break the system.',
    tactic: 'For any critical capability, deploy at least two independent implementations. Failover between them without operator intervention.',
    appliesWhen: ['high_reliability', 'safety_critical', 'distributed'],
    contraindications: ['cost_sensitive', 'resource_constrained'],
    intensity: 'moderate',
    exampleUses: ['Multi-region failover', 'Redundant DNS providers', 'Secondary auth paths'],
    sourceReference: 'Genetic redundancy in developmental biology; N-version programming in software',
  },
  {
    id: 'bio.ecosystem-niches',
    domain: 'biology',
    name: 'Ecosystem Niche Differentiation',
    summary: 'Coexisting agents specialize on different resources to avoid direct competition.',
    tactic: 'When multiple agents or services would compete, define non-overlapping niches: different inputs, different SLAs, different scopes.',
    appliesWhen: ['multi_actor', 'high_volume', 'long_horizon'],
    contraindications: ['single_actor', 'centralized'],
    intensity: 'moderate',
    exampleUses: ['Microservice boundaries by domain', 'Product line segmentation'],
    sourceReference: 'Gause competitive exclusion principle; Kim & Mauborgne Blue Ocean Strategy',
  },

  // ── Game Theory ────────────────────────────────────────────────────────
  {
    id: 'gt.nash-equilibrium',
    domain: 'game_theory',
    name: 'Nash Equilibrium',
    summary: 'A stable state where no player benefits by unilaterally changing their strategy.',
    tactic: 'Design incentive structures where each participant\'s best move when others are rational produces the outcome you want.',
    appliesWhen: ['multi_actor', 'cooperative', 'long_horizon'],
    contraindications: ['single_actor'],
    intensity: 'aggressive',
    exampleUses: ['Protocol design', 'Marketplace pricing', 'Rate-limit fairness'],
    sourceReference: 'Nash 1950, Equilibrium Points in n-Person Games',
  },
  {
    id: 'gt.auction-design',
    domain: 'game_theory',
    name: 'Auction Design (VCG / Second-Price)',
    summary: 'Mechanisms that allocate scarce resources to the highest-value user while revealing true preferences.',
    tactic: 'When allocating a scarce resource (bandwidth, priority, ad slot), use a second-price auction so bidders reveal true valuations.',
    appliesWhen: ['resource_constrained', 'multi_actor', 'high_volume'],
    contraindications: ['single_actor', 'cooperative'],
    intensity: 'aggressive',
    exampleUses: ['Compute spot markets', 'Cloud priority tiers', 'Ad bidding'],
    sourceReference: 'Vickrey 1961; Myerson optimal auction theory',
  },
  {
    id: 'gt.signaling',
    domain: 'game_theory',
    name: 'Costly Signaling',
    summary: 'Credible signals are expensive to fake. Cheap signals are ignored.',
    tactic: 'When trust is required between parties, prefer signals that carry real cost to the sender (stake, capital, commitment).',
    appliesWhen: ['adversarial', 'high_uncertainty', 'multi_actor'],
    contraindications: ['cooperative', 'single_actor'],
    intensity: 'moderate',
    exampleUses: ['Proof of stake', 'Domain-verified email', 'Bonded escrow'],
    sourceReference: 'Spence 1973, Job Market Signaling',
  },

  // ── HFT ────────────────────────────────────────────────────────────────
  {
    id: 'hft.event-driven',
    domain: 'hft',
    name: 'Event-Driven Architecture',
    summary: 'React to discrete events instead of polling state on a schedule.',
    tactic: 'Replace polling loops with an event bus or pub/sub channel. Handlers react within microseconds of the trigger.',
    appliesWhen: ['real_time', 'low_latency', 'high_volume'],
    contraindications: ['batch', 'long_horizon'],
    intensity: 'moderate',
    exampleUses: ['Order matching engines', 'Real-time alerts', 'Streaming ingestion'],
    sourceReference: 'HFT architecture patterns; LMAX Disruptor',
  },
  {
    id: 'hft.latency-arbitrage',
    domain: 'hft',
    name: 'Latency Arbitrage',
    summary: 'Consistently being microseconds faster than competitors captures value from transient price differences.',
    tactic: 'Identify the single slowest hop in the critical path. Optimize it (colocate, cache, precompute) before touching anything else.',
    appliesWhen: ['real_time', 'low_latency', 'adversarial'],
    contraindications: ['batch', 'cost_sensitive'],
    intensity: 'aggressive',
    exampleUses: ['Edge caching', 'Read replica routing', 'CDN origin selection'],
    sourceReference: 'Aldridge, High-Frequency Trading (2013)',
  },
  {
    id: 'hft.risk-limits',
    domain: 'hft',
    name: 'Hard Risk Limits',
    summary: 'Pre-trade checks that hard-stop orders beyond a defined size, notional, or exposure.',
    tactic: 'For any high-volume operation, add a pre-execution check that rejects work exceeding a defined budget before it starts.',
    appliesWhen: ['high_volume', 'cost_sensitive', 'safety_critical'],
    contraindications: ['experimental'],
    intensity: 'light',
    exampleUses: ['API spend caps', 'Queue depth limits', 'Rate limits'],
    sourceReference: 'MiFID II risk controls; common trading desk practice',
  },

  // ── Military ───────────────────────────────────────────────────────────
  {
    id: 'mil.ooda-loop',
    domain: 'military',
    name: 'OODA Loop',
    summary: 'Observe → Orient → Decide → Act, faster than the adversary. Speed of the loop dominates raw strength.',
    tactic: 'Compress each phase. Instrument observability (Observe), summarize state (Orient), use pre-committed playbooks (Decide), and ship small changes (Act).',
    appliesWhen: ['adversarial', 'real_time', 'high_uncertainty'],
    contraindications: ['batch', 'long_horizon'],
    intensity: 'aggressive',
    exampleUses: ['Incident response', 'Competitive product moves', 'Threat hunting'],
    sourceReference: 'Boyd, Patterns of Conflict',
  },
  {
    id: 'mil.maneuver-warfare',
    domain: 'military',
    name: 'Maneuver Warfare',
    summary: 'Attack the weakest point, bypass strength, and disrupt the enemy\'s cohesion rather than meeting force on force.',
    tactic: 'When competing for a market or audience, don\'t attack incumbent strengths. Attack underserved segments and force them to respond on your terms.',
    appliesWhen: ['adversarial', 'multi_actor', 'resource_constrained'],
    contraindications: ['cooperative', 'single_actor'],
    intensity: 'aggressive',
    exampleUses: ['Startup vs incumbent', 'Niche-first product strategy'],
    sourceReference: 'Liddell Hart, Strategy; Boyd',
  },
  {
    id: 'mil.defense-in-depth',
    domain: 'military',
    name: 'Defense in Depth',
    summary: 'Multiple independent layers of defense, so failure of any single layer is not catastrophic.',
    tactic: 'Layer security controls so a breach in one layer still encounters others. Assume each layer will eventually fail.',
    appliesWhen: ['safety_critical', 'adversarial', 'high_reliability'],
    contraindications: ['cost_sensitive', 'experimental'],
    intensity: 'moderate',
    exampleUses: ['WAF + authz + per-row policy', 'Multi-factor auth', 'Network segmentation'],
    sourceReference: 'NSA Defense in Depth; Saltzer & Schroeder',
  },

  // ── Supply Chain ───────────────────────────────────────────────────────
  {
    id: 'sc.bottleneck',
    domain: 'supply_chain',
    name: 'Theory of Constraints / Bottleneck',
    summary: 'The throughput of a system is determined by its single slowest step.',
    tactic: 'Measure every stage. Fix the slowest. Do NOT optimize non-bottlenecks — it does not improve throughput.',
    appliesWhen: ['resource_constrained', 'high_volume', 'long_horizon'],
    contraindications: ['experimental', 'short_horizon'],
    intensity: 'light',
    exampleUses: ['CI/CD pipelines', 'Database write throughput', 'Onboarding funnels'],
    sourceReference: 'Goldratt, The Goal',
  },
  {
    id: 'sc.just-in-time',
    domain: 'supply_chain',
    name: 'Just-in-Time',
    summary: 'Minimize inventory by pulling work only when the next stage is ready.',
    tactic: 'Replace push-based scheduling with pull-based. Downstream stages signal upstream when they can accept more work.',
    appliesWhen: ['resource_constrained', 'high_reliability', 'long_horizon'],
    contraindications: ['high_uncertainty', 'adversarial'],
    intensity: 'moderate',
    exampleUses: ['Kanban', 'Kubernetes HPA', 'Batch job scheduling'],
    sourceReference: 'Toyota Production System',
  },
  {
    id: 'sc.safety-stock',
    domain: 'supply_chain',
    name: 'Safety Stock',
    summary: 'Buffers of inventory absorb demand or supply shocks. Costly but reliable.',
    tactic: 'When volatility is high, keep deliberate slack (extra replicas, reserved capacity, cached results) even though it looks wasteful.',
    appliesWhen: ['high_uncertainty', 'high_reliability', 'safety_critical'],
    contraindications: ['cost_sensitive', 'resource_constrained'],
    intensity: 'light',
    exampleUses: ['Overprovisioned capacity', 'Warm standby', 'Pre-fetched caches'],
    sourceReference: 'Silver, Pyke, Thomas, Inventory and Production Management',
  },

  // ── Cognitive Science ──────────────────────────────────────────────────
  {
    id: 'cog.spaced-repetition',
    domain: 'cognitive',
    name: 'Spaced Repetition',
    summary: 'Review at increasing intervals to maximize long-term retention per unit effort.',
    tactic: 'For any learning or training system, schedule reinforcement right before forgetting, not on a fixed cadence.',
    appliesWhen: ['long_horizon', 'human_in_loop'],
    contraindications: ['real_time', 'fully_automated'],
    intensity: 'light',
    exampleUses: ['Onboarding training', 'Anki-style internal documentation', 'Security awareness drills'],
    sourceReference: 'Ebbinghaus (1885); SuperMemo algorithm',
  },
  {
    id: 'cog.working-memory',
    domain: 'cognitive',
    name: 'Working Memory Limits',
    summary: 'Humans hold ~4±1 items in working memory. Interfaces that exceed this overload the user.',
    tactic: 'Chunk information. Show one primary decision per screen. Defer complexity behind progressive disclosure.',
    appliesWhen: ['human_in_loop', 'safety_critical'],
    contraindications: ['fully_automated'],
    intensity: 'light',
    exampleUses: ['Dashboards', 'Alert design', 'Form layout'],
    sourceReference: 'Miller 1956; Cowan 2001 revision',
  },
  {
    id: 'cog.attention-scheduling',
    domain: 'cognitive',
    name: 'Attention Scheduling',
    summary: 'Attention is finite and non-renewable within a window. Batch similar work to reduce context-switch cost.',
    tactic: 'Group notifications, batch reviews, and protect deep-work blocks. Fewer high-signal interruptions beat many low-signal ones.',
    appliesWhen: ['human_in_loop', 'long_horizon'],
    contraindications: ['real_time', 'fully_automated'],
    intensity: 'light',
    exampleUses: ['Digest emails', 'On-call rotations', 'Batched review queues'],
    sourceReference: 'Pashler attention bottleneck; Newport, Deep Work',
  },

  // ── Control Theory ─────────────────────────────────────────────────────
  {
    id: 'ctrl.pid',
    domain: 'control_theory',
    name: 'PID Control',
    summary: 'Proportional + Integral + Derivative feedback converges systems to a target without oscillation.',
    tactic: 'When tuning a feedback loop, add P for speed, I for steady-state accuracy, D for damping. Tune in that order.',
    appliesWhen: ['real_time', 'high_reliability', 'long_horizon'],
    contraindications: ['batch', 'experimental'],
    intensity: 'moderate',
    exampleUses: ['Auto-scaling', 'Latency budgets', 'Battery throttling'],
    sourceReference: 'Åström & Murray, Feedback Systems',
  },
  {
    id: 'ctrl.mpc',
    domain: 'control_theory',
    name: 'Model Predictive Control',
    summary: 'Predict the next N steps and optimize inputs against a cost function over that horizon.',
    tactic: 'For planning tasks with constraints, simulate the next several steps at each decision point and pick the input that minimizes cost.',
    appliesWhen: ['resource_constrained', 'long_horizon', 'safety_critical'],
    contraindications: ['low_latency'],
    intensity: 'aggressive',
    exampleUses: ['Route planning', 'Job scheduling', 'Battery-aware execution'],
    sourceReference: 'Camacho & Bordons, Model Predictive Control',
  },
  {
    id: 'ctrl.stability-margin',
    domain: 'control_theory',
    name: 'Stability Margin',
    summary: 'Systems need slack before the edge of instability. Operating at the limit fails unpredictably.',
    tactic: 'Size capacity at 60-70% of theoretical max. Never run at 100% — the first perturbation will cascade.',
    appliesWhen: ['high_reliability', 'safety_critical', 'high_volume'],
    contraindications: ['cost_sensitive', 'experimental'],
    intensity: 'light',
    exampleUses: ['Load balancer headroom', 'Disk space policy', 'Connection pool sizing'],
    sourceReference: 'Classical control theory',
  },

  // ── Economics ──────────────────────────────────────────────────────────
  {
    id: 'eco.option-value',
    domain: 'economics',
    name: 'Real Options',
    summary: 'The ability to defer, expand, or abandon has value that should be priced into decisions.',
    tactic: 'Prefer reversible moves. When irreversibility is unavoidable, buy the option to defer.',
    appliesWhen: ['high_uncertainty', 'long_horizon', 'resource_constrained'],
    contraindications: ['real_time', 'short_horizon'],
    intensity: 'moderate',
    exampleUses: ['Incremental rollout', 'Feature flags', 'Phased architecture migration'],
    sourceReference: 'Dixit & Pindyck, Investment under Uncertainty',
  },
  {
    id: 'eco.diminishing-returns',
    domain: 'economics',
    name: 'Diminishing Returns',
    summary: 'Each additional unit of input produces less incremental output. Optimal effort is where marginal cost equals marginal benefit.',
    tactic: 'Define a stopping criterion before you start. When measured marginal benefit drops below marginal cost, stop and switch tasks.',
    appliesWhen: ['resource_constrained', 'long_horizon'],
    contraindications: ['safety_critical'],
    intensity: 'light',
    exampleUses: ['Optimization work', 'Bug-hunting timeboxes', 'Content production'],
    sourceReference: 'Marshall, Principles of Economics',
  },
  {
    id: 'eco.nash-bargaining',
    domain: 'economics',
    name: 'Nash Bargaining Solution',
    summary: 'When two parties split a surplus, the fair split depends on each side\'s disagreement payoff.',
    tactic: 'Before negotiating, estimate the other side\'s walk-away alternative. That determines the real floor.',
    appliesWhen: ['multi_actor', 'cooperative', 'resource_constrained'],
    contraindications: ['single_actor', 'adversarial'],
    intensity: 'moderate',
    exampleUses: ['Vendor negotiations', 'SLA terms', 'Partner revenue splits'],
    sourceReference: 'Nash 1950, The Bargaining Problem',
  },
];

export const knowledgeGraph = new KnowledgeGraph();
