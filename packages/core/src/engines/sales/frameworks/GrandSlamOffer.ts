/**
 * GrandSlamOffer — 5-step composer from $100M Offers, ch. 9-10 + ch. 16.
 *
 *   Step 1: Identify dream outcome
 *   Step 2: List problems (buyer's obstacles)
 *   Step 3: Turn problems into solutions ("How to..." statements)
 *   Step 4: Assign delivery vehicles (delivery cube from ch. 10)
 *   Step 5: Trim (drop high-cost/low-value) & Stack (bundle into offer)
 *
 * Then ch. 16 names it via the M-A-G-I-C formula.
 *
 * Deterministic — no LLM. The transform from problem → solution uses a
 * fixed dictionary of negation flips so results are reproducible.
 */

import { randomUUID } from 'crypto';
import { valueEquation } from './ValueEquation';
import { log } from '../../core/logger';
import { ValidationError } from '../../shared/types/errors';
import type {
  GrandSlamOffer,
  BonusItem,
  Guarantee,
  ScarcityUrgency,
  ValueEquationScore,
} from '../types';

// ── Delivery cube (ch. 10) ────────────────────────────────────────────

export type DeliveryEffort = 'diy' | 'dwy' | 'dfy';
export type DeliveryAttention = 'one_to_one' | 'small_group' | 'one_to_many';
export type DeliveryMedium =
  | 'live_in_person'
  | 'live_phone'
  | 'live_zoom'
  | 'live_chat'
  | 'recorded_audio'
  | 'recorded_video'
  | 'recorded_written'
  | 'software';

export interface DeliveryVehicle {
  effort: DeliveryEffort;
  attention: DeliveryAttention;
  medium: DeliveryMedium;
}

export interface SolutionCandidate {
  id: string;
  problem: string;
  solution: string;
  delivery: DeliveryVehicle;
  buyerValueScore: number;   // 0-100, from value equation
  costToDeliverUsd: number;  // derived from delivery cube
  kept: boolean;
  reason: string;
}

// ── Problem → solution transform ──────────────────────────────────────
// Dictionary of common negation flips. Longest phrases first so multi-
// word patterns match before their substrings.

const NEGATION_FLIPS: Array<[RegExp, string]> = [
  [/\bdon'?t know\b/gi, 'know'],
  [/\bwon'?t like\b/gi, 'enjoy'],
  [/\bwon'?t work\b/gi, 'works'],
  [/\bwon'?t be able\b/gi, 'can'],
  [/\bcan'?t\b/gi, 'can'],
  [/\bwill not\b/gi, 'will'],
  [/\bnot worth it\b/gi, 'worth every dollar'],
  [/\btoo expensive\b/gi, 'affordable'],
  [/\btoo much time\b/gi, 'fast'],
  [/\btoo hard\b/gi, 'easy'],
  [/\btoo difficult\b/gi, 'simple'],
  [/\btoo complicated\b/gi, 'clear'],
  [/\bhard\b/gi, 'easy'],
  [/\bconfusing\b/gi, 'clear'],
  [/\bdifficult\b/gi, 'simple'],
  [/\bcomplicated\b/gi, 'straightforward'],
  [/\bexpensive\b/gi, 'affordable'],
  [/\bslow\b/gi, 'fast'],
  [/\bcomplex\b/gi, 'simple'],
  [/\boverwhelming\b/gi, 'manageable'],
  [/\bimpossible\b/gi, 'achievable'],
  [/\bunsustainable\b/gi, 'sustainable'],
  [/\bundoable\b/gi, 'doable'],
];

function problemToSolution(problem: string): string {
  let solution = problem.trim();
  for (const [pattern, replacement] of NEGATION_FLIPS) {
    solution = solution.replace(pattern, replacement);
  }
  // Strip leading "is/will be/it's" fragments that survive flips
  solution = solution.replace(/^(is|are|will be|it'?s)\s+/i, '');
  // Now wrap as "How to..." per ch. 9 step 3
  return `How to ${solution}`;
}

// ── Delivery vehicle assignment ───────────────────────────────────────
// Chooses the cheapest delivery that still clears the value threshold for
// each solution. Prefers one-to-many + recorded + DIY when possible
// because that's the high-margin quadrant per ch. 10.

function chooseDelivery(valueScore: number, idx: number): DeliveryVehicle {
  // High-value solutions get higher-touch treatment; low-value gets the
  // scalable version. idx rotates the medium so the stack has variety.
  if (valueScore >= 75) {
    return { effort: 'dfy', attention: 'one_to_one', medium: 'live_zoom' };
  }
  if (valueScore >= 55) {
    return { effort: 'dwy', attention: 'small_group', medium: 'live_zoom' };
  }
  if (valueScore >= 35) {
    return { effort: 'diy', attention: 'small_group', medium: 'recorded_video' };
  }
  // Low value — cheapest possible delivery
  const mediums: DeliveryMedium[] = ['recorded_written', 'recorded_video', 'software'];
  return { effort: 'diy', attention: 'one_to_many', medium: mediums[idx % mediums.length] };
}

function estimateCost(v: DeliveryVehicle): number {
  const effortCost: Record<DeliveryEffort, number> = { diy: 5, dwy: 50, dfy: 250 };
  const attentionCost: Record<DeliveryAttention, number> = {
    one_to_one: 3, small_group: 1.5, one_to_many: 1,
  };
  const mediumCost: Record<DeliveryMedium, number> = {
    live_in_person: 4, live_phone: 2.5, live_zoom: 2, live_chat: 1.5,
    recorded_audio: 0.5, recorded_video: 1, recorded_written: 0.5, software: 1,
  };
  return Math.round(effortCost[v.effort] * attentionCost[v.attention] * mediumCost[v.medium]);
}

// ── Naming (ch. 16, M-A-G-I-C) ────────────────────────────────────────

const CONTAINER_WORDS = [
  'Challenge', 'Blueprint', 'Bootcamp', 'Intensive', 'Incubator',
  'Masterclass', 'Program', 'Detox', 'Experience', 'Accelerator',
  'Fast Track', 'Shortcut', 'Sprint', 'Launch', 'System', 'Transformation',
  'Game Plan', 'Deep Dive', 'Workshop', 'Reset', 'Solution', 'Hack',
];

function pickContainer(goal: string): string {
  const lower = goal.toLowerCase();
  if (/challenge|weight|fitness|body/.test(lower)) return 'Challenge';
  if (/learn|coach|train/.test(lower)) return 'Masterclass';
  if (/grow|scale|revenue|profit/.test(lower)) return 'Accelerator';
  if (/launch|ship|start/.test(lower)) return 'Bootcamp';
  if (/transform|change|become/.test(lower)) return 'Transformation';
  // Deterministic pick for unrecognized goals
  const idx = goal.length % CONTAINER_WORDS.length;
  return CONTAINER_WORDS[idx];
}

export interface NamingComponents {
  magnet: string;   // "Free" | "88% Off" | "Grand Opening" etc.
  avatar: string;   // who it's for
  goal: string;     // the dream outcome
  interval: string; // "6 Week" | "21 Day" | "30 Day"
  container: string;
}

function composeName(n: NamingComponents): string {
  const parts = [n.magnet, n.interval, n.avatar, n.goal, n.container]
    .filter((p) => p && p.trim().length > 0);
  // Aim for 5-8 words. Trim if too long.
  let name = parts.join(' ');
  if (name.split(/\s+/).length > 9) {
    name = [n.interval, n.avatar, n.goal, n.container].filter(Boolean).join(' ');
  }
  return name;
}

// ── Composer ──────────────────────────────────────────────────────────

export interface ComposeInput {
  icpId: string;
  dreamOutcome: string;
  problems: string[];
  priceUsd: number;
  intervalDays?: number;      // for naming + bonus values
  magnetPrefix?: string;      // "Free", "88% Off", etc.
  avatarLabel?: string;       // "Gym Owners", "Med Spa Owners"
  guarantee?: Guarantee;
  scarcityUrgency?: ScarcityUrgency;
}

export class GrandSlamOfferComposer {
  /**
   * Run steps 1-5. Returns a full GrandSlamOffer with:
   *   - The enumerated solution stack (trimmed per ch. 10 ch. 5)
   *   - Bonuses derived from kept solutions with stated values
   *   - A composed M-A-G-I-C name
   *   - Full ValueEquationScore for the finished offer
   */
  compose(input: ComposeInput): GrandSlamOffer {
    if (!input.dreamOutcome || input.dreamOutcome.trim().length === 0) {
      throw new ValidationError('dreamOutcome is required');
    }
    if (!Array.isArray(input.problems) || input.problems.length === 0) {
      throw new ValidationError('at least one problem is required');
    }
    if (!Number.isFinite(input.priceUsd) || input.priceUsd <= 0) {
      throw new ValidationError('priceUsd must be a positive number');
    }

    // ── Steps 2-4: problems → solutions → delivery ────────────────────
    const candidates: SolutionCandidate[] = input.problems.map((problem, idx) => {
      const solution = problemToSolution(problem);
      // Score the solution as its own mini-offer — this is what the buyer
      // perceives when they read the line item.
      const assessment = valueEquation.assess(solution);
      const valueScore = assessment.equation.normalizedScore;
      const delivery = chooseDelivery(valueScore, idx);
      const cost = estimateCost(delivery);

      // ── Step 5a: Trim rule ─────────────────────────────────────────
      // Keep if value is meaningful (>= 25) OR the value-to-cost ratio is
      // above 3:1 (cheap to deliver, real value for the buyer).
      const ratio = valueScore / Math.max(cost, 1);
      const keep = valueScore >= 25 || ratio >= 3;

      return {
        id: `sol_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        problem,
        solution,
        delivery,
        buyerValueScore: valueScore,
        costToDeliverUsd: cost,
        kept: keep,
        reason: keep
          ? valueScore >= 25
            ? 'value above floor'
            : 'value/cost ratio above 3:1'
          : 'low value, non-trivial cost — trimmed',
      };
    });

    const kept = candidates.filter((c) => c.kept);

    // ── Step 5b: Stack bonuses ────────────────────────────────────────
    // Each kept solution becomes a named bonus with a stated value. The
    // value is anchored generously but honestly — ch. 14 warns against
    // made-up numbers because they collapse buyer trust.
    const bonuses: BonusItem[] = kept.map((c, idx) => {
      // Stated value: rounded to nearest 50, scaled by buyer value.
      const statedValue = Math.max(50, Math.round((c.buyerValueScore * 5) / 50) * 50);
      const boostsLever = c.buyerValueScore >= 60 ? 'dream' :
                          c.buyerValueScore >= 40 ? 'likelihood' :
                          c.delivery.effort === 'dfy' ? 'ease' : 'speed';
      return {
        name: this.bonusName(c, idx),
        description: c.solution,
        statedValueUsd: statedValue,
        boostsLever,
      };
    });

    const statedStackValueUsd =
      input.priceUsd + bonuses.reduce((s, b) => s + b.statedValueUsd, 0);

    // ── Naming (ch. 16 M-A-G-I-C) ─────────────────────────────────────
    const intervalDays = input.intervalDays ?? this.inferInterval(input.dreamOutcome);
    const namingComponents: NamingComponents = {
      magnet: input.magnetPrefix ?? 'Free',
      avatar: input.avatarLabel ?? 'Everyone',
      goal: this.shortenGoal(input.dreamOutcome),
      interval: `${intervalDays} Day`,
      container: pickContainer(input.dreamOutcome),
    };
    const name = composeName(namingComponents);

    // ── Final value assessment on the composed offer ──────────────────
    const fullDescription = [
      input.dreamOutcome,
      ...kept.map((c) => c.solution),
      input.guarantee?.description ?? '',
      input.scarcityUrgency?.details ?? '',
    ].join(' ').trim();

    const offerValueAssessment = valueEquation.assess(fullDescription);

    const offer: GrandSlamOffer = {
      id: `gso_${randomUUID().slice(0, 8)}`,
      name,
      namingFormula: namingComponents,
      icpId: input.icpId,
      coreDeliverable: input.dreamOutcome,
      priceUsd: input.priceUsd,
      bonuses,
      guarantee: input.guarantee ?? this.defaultGuarantee(),
      scarcityUrgency: input.scarcityUrgency ?? this.defaultScarcity(),
      statedStackValueUsd,
      offerValueAssessment,
      createdAt: new Date().toISOString(),
    };

    log.info('gso.compose', {
      name,
      problemsIn: input.problems.length,
      solutionsKept: kept.length,
      solutionsTrimmed: candidates.length - kept.length,
      price: input.priceUsd,
      stackValue: statedStackValueUsd,
      valueScore: offerValueAssessment.equation.normalizedScore,
    });

    return offer;
  }

  /**
   * Expose the full candidate list (kept + trimmed) for the UI to show
   * the user what got dropped and why.
   */
  composeWithTrace(input: ComposeInput): {
    offer: GrandSlamOffer;
    candidates: SolutionCandidate[];
  } {
    const offer = this.compose(input);
    // Rebuild candidates deterministically for the trace view.
    const candidates: SolutionCandidate[] = input.problems.map((problem, idx) => {
      const solution = problemToSolution(problem);
      const assessment = valueEquation.assess(solution);
      const valueScore = assessment.equation.normalizedScore;
      const delivery = chooseDelivery(valueScore, idx);
      const cost = estimateCost(delivery);
      const ratio = valueScore / Math.max(cost, 1);
      const keep = valueScore >= 25 || ratio >= 3;
      return {
        id: `sol_${idx}`,
        problem,
        solution,
        delivery,
        buyerValueScore: valueScore,
        costToDeliverUsd: cost,
        kept: keep,
        reason: keep
          ? valueScore >= 25 ? 'value above floor' : 'value/cost ratio above 3:1'
          : 'low value, non-trivial cost — trimmed',
      };
    });
    return { offer, candidates };
  }

  private bonusName(c: SolutionCandidate, idx: number): string {
    // Extract the essence of the solution — strip "How to "
    const essence = c.solution.replace(/^How to\s+/i, '');
    const trimmed = essence.length > 55 ? essence.slice(0, 52) + '...' : essence;
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return `Bonus ${idx + 1}: ${capitalized}`;
  }

  private shortenGoal(goal: string): string {
    // Take the first 4 significant words.
    const words = goal.split(/\s+/).filter((w) => w.length > 2);
    return words.slice(0, 4).join(' ') || goal.slice(0, 30);
  }

  private inferInterval(text: string): number {
    // Look for explicit numbers first, otherwise default by category.
    const match = text.match(/(\d+)\s*(day|week|month)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit === 'day') return n;
      if (unit === 'week') return n * 7;
      if (unit === 'month') return n * 30;
    }
    if (/weight|fitness|body/i.test(text)) return 42;   // 6-week lean challenge
    if (/learn|skill|course/i.test(text)) return 30;
    if (/grow|scale|revenue/i.test(text)) return 90;
    return 30;
  }

  private defaultGuarantee(): Guarantee {
    return {
      type: 'conditional',
      description: 'If you complete the program and do not get the result, we work with you for free until you do.',
      conditions: ['Complete all assigned actions', 'Attend all check-ins', 'Report progress weekly'],
      expectedReversalRate: 0.02,
    };
  }

  private defaultScarcity(): ScarcityUrgency {
    return {
      scarcityBy: 'time',
      urgencyBy: 'deadline',
      isHonest: true,
      details: 'Next cohort starts monthly. Enrollment closes 72 hours before kickoff.',
    };
  }
}

export const grandSlamOffer = new GrandSlamOfferComposer();
