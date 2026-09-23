/**
 * PersonaRegistry — seed corpus of synthetic expert personas.
 *
 * Each persona is deterministic: it runs its `checks` against the goal
 * and abstraction features. No LLM. Every check has an explicit trigger
 * condition, severity, risk, and recommendation.
 *
 * Callers may register custom personas at runtime.
 */

import type { Persona } from './types';

export class PersonaRegistry {
  private readonly personas: Map<string, Persona>;

  constructor(seed?: Persona[]) {
    this.personas = new Map();
    for (const p of seed ?? DEFAULT_PERSONAS) this.personas.set(p.id, p);
  }

  list(): Persona[] {
    return Array.from(this.personas.values());
  }

  get(idOrName: string): Persona | null {
    const lower = idOrName.toLowerCase();
    for (const p of this.personas.values()) {
      if (p.id.toLowerCase() === lower || p.name.toLowerCase() === lower) return p;
    }
    return null;
  }

  register(persona: Persona): void {
    this.personas.set(persona.id, persona);
  }

  remove(id: string): boolean {
    return this.personas.delete(id);
  }

  count(): number {
    return this.personas.size;
  }
}

const DEFAULT_PERSONAS: Persona[] = [
  // ── The Skeptic ────────────────────────────────────────────────────────
  {
    id: 'persona.skeptic',
    name: 'The Skeptic',
    description: 'Attacks assumptions, surfaces worst-case scenarios, and demands specificity before commitment.',
    domain: 'product',
    objectives: ['Minimize hidden risk', 'Force specificity', 'Prevent premature commitment'],
    kpis: ['Number of unstated assumptions surfaced', 'Number of vague plan steps flagged'],
    riskProfile: 'conservative',
    opposes: ['aggressive experimentation', 'rapid rollout'],
    checks: [
      {
        id: 'skeptic.vagueness',
        triggersOn: { keywords: ['fast', 'quick', 'mvp', 'prototype', 'poc'] },
        severity: 'medium',
        risk: 'Plan commits to speed over specification. Undefined requirements will surface as rework.',
        recommendation: 'Define acceptance criteria for each step before execution. Reject any step that cannot be tested.',
        blocking: false,
      },
      {
        id: 'skeptic.unknowns',
        triggersOn: { keywords: ['uncertain', 'unknown', 'experimental', 'research', 'speculative'], features: ['high_uncertainty', 'experimental'] },
        severity: 'high',
        risk: 'High-uncertainty inputs make the plan a bet, not an execution.',
        recommendation: 'Cap downside exposure per step. Add explicit rollback. Do not chain multiple high-uncertainty steps.',
        blocking: true,
      },
      {
        id: 'skeptic.single-point',
        triggersOn: { features: ['single_actor', 'centralized'] },
        severity: 'medium',
        risk: 'Single actor or central coordinator is a single point of failure.',
        recommendation: 'Identify the single point. Ask: what happens when this fails? Add monitoring before touching anything else.',
        blocking: false,
      },
      {
        id: 'skeptic.timeline-pressure',
        triggersOn: { keywords: ['sprint', 'deadline', 'asap', 'ship', 'launch'] },
        severity: 'medium',
        risk: 'Timeline pressure will erode quality gates.',
        recommendation: 'Explicitly list which quality gates are being waived. If none, remove the deadline language.',
        blocking: false,
      },
    ],
  },

  // ── The Growth Hacker ──────────────────────────────────────────────────
  {
    id: 'persona.growth',
    name: 'The Growth Hacker',
    description: 'Optimizes for reach, virality, conversion, and compounding user acquisition.',
    domain: 'marketing',
    objectives: ['Maximize reach', 'Maximize conversion', 'Compound distribution'],
    kpis: ['CAC', 'Viral coefficient', 'Activation rate', 'Retention day 30'],
    riskProfile: 'aggressive',
    opposes: ['conservative gating', 'slow rollout'],
    checks: [
      {
        id: 'growth.share-loop',
        triggersOn: { keywords: ['multiplayer', 'social', 'community', 'marketplace', 'network'], features: ['multi_actor'] },
        severity: 'low',
        risk: 'Social/marketplace goals without an explicit share loop will not compound.',
        opportunity: 'Add a built-in referral or share loop. Each user action should have a chance to expose the product to new users.',
        recommendation: 'Design the share loop first, not last. Instrument referral traffic on day one.',
        blocking: false,
      },
      {
        id: 'growth.activation',
        triggersOn: { keywords: ['onboarding', 'signup', 'dashboard', 'tutorial', 'first-run'] },
        severity: 'medium',
        risk: 'First-run experience is not instrumented, so activation is unmeasurable.',
        recommendation: 'Define the activation event explicitly. Track funnel from landing to activation.',
        blocking: false,
      },
      {
        id: 'growth.experiment-cadence',
        triggersOn: { keywords: ['iterate', 'experiment', 'a/b', 'test'], features: ['experimental'] },
        severity: 'low',
        risk: 'Experiments without a cadence drift. One-off tests do not compound.',
        opportunity: 'Establish a weekly experiment cadence with a rolling backlog.',
        recommendation: 'Ship at least one experiment per week. Kill or scale within two weeks.',
        blocking: false,
      },
      {
        id: 'growth.pricing',
        triggersOn: { keywords: ['paid', 'subscription', 'billing', 'revenue', 'monetize'] },
        severity: 'medium',
        risk: 'Pricing not validated against willingness-to-pay will underperform.',
        recommendation: 'Run a van Westendorp or similar pricing study before locking a price.',
        blocking: false,
      },
    ],
  },

  // ── The Security Expert ────────────────────────────────────────────────
  {
    id: 'persona.security',
    name: 'The Security Expert',
    description: 'Surfaces attack surface, threat models, credential handling, and hardening requirements.',
    domain: 'security',
    objectives: ['Minimize attack surface', 'Prevent credential exposure', 'Protect user data'],
    kpis: ['Critical CVEs', 'Exposed secrets', 'MFA coverage', 'Auth bypass paths'],
    riskProfile: 'conservative',
    opposes: ['rapid experimentation', 'permissive access'],
    checks: [
      {
        id: 'security.auth',
        triggersOn: { keywords: ['auth', 'login', 'session', 'token', 'password', 'oauth', 'sso'] },
        severity: 'high',
        risk: 'Auth implementation is a top attack vector. Rolled-your-own auth is a red flag.',
        recommendation: 'Use an established auth provider (Auth0, Clerk, Supabase Auth, OAuth2). Never roll your own password hashing.',
        blocking: true,
      },
      {
        id: 'security.secrets',
        triggersOn: { keywords: ['api', 'token', 'key', 'credential', 'secret', 'webhook'] },
        severity: 'high',
        risk: 'Secrets in code or logs will leak.',
        recommendation: 'All secrets in env vars or a vault. Rotate any key that has ever touched a repo. Audit git history before public release.',
        blocking: true,
      },
      {
        id: 'security.user-data',
        triggersOn: { keywords: ['user data', 'pii', 'gdpr', 'privacy', 'personal'], features: ['safety_critical'] },
        severity: 'high',
        risk: 'User data handling without explicit policy risks regulatory and reputation damage.',
        recommendation: 'Document data flows. Encrypt at rest and in transit. Add a deletion path. Log access for audit.',
        blocking: true,
      },
      {
        id: 'security.surface-area',
        triggersOn: { features: ['distributed', 'adversarial'] },
        severity: 'medium',
        risk: 'Distributed systems have wider attack surfaces.',
        recommendation: 'Mutual TLS between services. Network segmentation. Least-privilege IAM for every component.',
        blocking: false,
      },
      {
        id: 'security.dependency',
        triggersOn: { keywords: ['npm', 'package', 'library', 'dependency', 'third-party'] },
        severity: 'medium',
        risk: 'Supply chain attacks via dependencies are increasingly common.',
        recommendation: 'Pin dependency versions. Enable Dependabot or equivalent. Audit transitive deps before production.',
        blocking: false,
      },
    ],
  },

  // ── The Reliability Engineer (SRE) ─────────────────────────────────────
  {
    id: 'persona.sre',
    name: 'The Reliability Engineer',
    description: 'Focuses on uptime, observability, incident response, and capacity headroom.',
    domain: 'ops',
    objectives: ['Maximize uptime', 'Instrument everything', 'Reduce MTTR'],
    kpis: ['Uptime', 'MTTR', 'Error budget burn rate', 'Alert precision'],
    riskProfile: 'moderate',
    opposes: ['rapid rollout without observability', 'silent failure'],
    checks: [
      {
        id: 'sre.observability',
        triggersOn: { keywords: ['deploy', 'service', 'api', 'backend', 'pipeline'], features: ['high_reliability', 'real_time'] },
        severity: 'high',
        risk: 'Deploying without observability means you will learn about failures from users.',
        recommendation: 'Instrument logs, metrics, and traces before first production deploy. Define the SLI and SLO explicitly.',
        blocking: true,
      },
      {
        id: 'sre.headroom',
        triggersOn: { features: ['high_volume', 'resource_constrained'] },
        severity: 'medium',
        risk: 'Running at capacity leaves no room for the first perturbation.',
        recommendation: 'Size at 60-70% of theoretical max. Add load shedding and backpressure before launch.',
        blocking: false,
      },
      {
        id: 'sre.incident-response',
        triggersOn: { keywords: ['critical', 'production', 'sla', 'uptime'], features: ['safety_critical'] },
        severity: 'high',
        risk: 'No incident response plan means chaos during outages.',
        recommendation: 'Define severity levels, on-call rotation, escalation paths, and postmortem cadence before launch.',
        blocking: true,
      },
      {
        id: 'sre.rollback',
        triggersOn: { keywords: ['deploy', 'release', 'migration', 'schema'] },
        severity: 'medium',
        risk: 'Irreversible changes have no recovery path.',
        recommendation: 'Every deploy must have a tested rollback. Schema migrations must be backward-compatible for at least one release.',
        blocking: false,
      },
    ],
  },

  // ── The CFO ────────────────────────────────────────────────────────────
  {
    id: 'persona.cfo',
    name: 'The CFO',
    description: 'Optimizes ROI, unit economics, and resource allocation. Flags cost without corresponding value.',
    domain: 'finance',
    objectives: ['Optimize ROI', 'Control burn rate', 'Defend unit economics'],
    kpis: ['Gross margin', 'CAC payback', 'Burn multiple', 'Runway'],
    riskProfile: 'conservative',
    opposes: ['unbounded experimentation', 'premium costs without premium value'],
    checks: [
      {
        id: 'cfo.cost-tracking',
        triggersOn: { keywords: ['cloud', 'api', 'compute', 'storage', 'bandwidth', 'gpu', 'llm'] },
        severity: 'high',
        risk: 'Cloud/API costs scale linearly with usage and can bankrupt a project.',
        recommendation: 'Instrument cost per request. Set budget caps before launch. Add rate limits per tenant.',
        blocking: true,
      },
      {
        id: 'cfo.unit-economics',
        triggersOn: { keywords: ['subscription', 'pricing', 'billing', 'revenue', 'monetize'] },
        severity: 'high',
        risk: 'Unit economics unvalidated means growth accelerates losses.',
        recommendation: 'Model CAC, LTV, payback period before pricing. Target payback under 12 months.',
        blocking: true,
      },
      {
        id: 'cfo.build-vs-buy',
        triggersOn: { keywords: ['build', 'custom', 'in-house', 'from-scratch'] },
        severity: 'medium',
        risk: 'Build-vs-buy decisions not evaluated lead to wasted engineering.',
        recommendation: 'For each component, list a viable managed alternative and the 3-year TCO comparison.',
        blocking: false,
      },
      {
        id: 'cfo.runway',
        triggersOn: { features: ['long_horizon', 'resource_constrained'] },
        severity: 'medium',
        risk: 'Long-horizon goals without runway analysis risk stalling mid-execution.',
        recommendation: 'State the total budget envelope. Break the plan into fundable phases with stop-loss triggers.',
        blocking: false,
      },
    ],
  },

  // ── The UX Lead ────────────────────────────────────────────────────────
  {
    id: 'persona.ux',
    name: 'The UX Lead',
    description: 'Focuses on user friction, clarity, trust, accessibility, and onboarding experience.',
    domain: 'design',
    objectives: ['Reduce friction', 'Increase clarity', 'Build trust'],
    kpis: ['Task completion rate', 'Time to first value', 'Support ticket rate', 'Accessibility score'],
    riskProfile: 'moderate',
    opposes: ['cognitive overload', 'dark patterns'],
    checks: [
      {
        id: 'ux.first-value',
        triggersOn: { keywords: ['onboarding', 'signup', 'tutorial', 'dashboard'], features: ['human_in_loop'] },
        severity: 'high',
        risk: 'Users abandon if they do not reach first value quickly.',
        recommendation: 'Define "first value moment". Design the shortest path to it. Remove every step that is not on that path.',
        blocking: false,
      },
      {
        id: 'ux.trust-signals',
        triggersOn: { keywords: ['payment', 'auth', 'personal', 'share', 'publish'], features: ['safety_critical'] },
        severity: 'high',
        risk: 'Trust-critical interactions without trust signals will suppress conversion.',
        recommendation: 'Add security badges, clear copy on what data is used for, and a visible privacy policy in the critical flow.',
        blocking: false,
      },
      {
        id: 'ux.accessibility',
        triggersOn: { keywords: ['web', 'app', 'ui', 'interface', 'dashboard'], features: ['human_in_loop'] },
        severity: 'medium',
        risk: 'Accessibility failures exclude users and expose legal risk.',
        recommendation: 'Target WCAG 2.1 AA minimum. Test with screen reader. Ensure keyboard navigation and sufficient color contrast.',
        blocking: false,
      },
      {
        id: 'ux.complexity',
        triggersOn: { keywords: ['config', 'settings', 'options', 'advanced'], features: ['human_in_loop'] },
        severity: 'medium',
        risk: 'Exposing too much configuration overwhelms users.',
        recommendation: 'Default to opinionated settings. Progressive disclosure for advanced options. Never show more than 4 primary decisions at once.',
        blocking: false,
      },
    ],
  },
];

export const personaRegistry = new PersonaRegistry();
