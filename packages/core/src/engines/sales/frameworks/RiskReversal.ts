/**
 * RiskReversal — guarantee selector from $100M Offers, ch. 15.
 *
 * Two responsibilities:
 *   1. Library of named guarantee templates (ch. 15's taxonomy)
 *   2. recommend() picks the right type + alternatives based on offer
 *      characteristics (price band, business type, refund tolerance, and
 *      whether the buyer must do work to succeed).
 *
 * Also encodes the ch. 15 net-multiplier math: a stronger guarantee that
 * closes 30% more customers and doubles refunds still nets +23% revenue.
 * recommend() surfaces that math so the operator can sanity-check.
 */

import { log } from '../../core/logger';
import type { Guarantee, RiskReversalPlan } from '../types';

// ── Guarantee template library (ch. 15) ───────────────────────────────

export interface GuaranteeTemplate {
  id: string;
  type: Guarantee['type'];
  name: string;
  description: string;
  conditions: string[];
  /** Typical reversal rate observed when this template is used well. */
  typicalReversalRate: number;
  /** Relative sales lift vs a weak 30-day refund guarantee. */
  estimatedLiftMultiplier: number;
  /** Business scenarios where this template shines. */
  bestFor: string[];
}

const LIBRARY: GuaranteeTemplate[] = [
  // ── Unconditional ────────────────────────────────────────────────────
  {
    id: 'uncond.no_questions',
    type: 'unconditional',
    name: 'No Questions Asked Refund',
    description:
      'Full refund within a set window, no conditions. Simplest, strongest, riskiest.',
    conditions: ['Within N days of purchase'],
    typicalReversalRate: 0.10,
    estimatedLiftMultiplier: 1.35,
    bestFor: ['low-ticket B2C', 'digital products', 'consumables'],
  },
  {
    id: 'uncond.satisfaction',
    type: 'unconditional',
    name: 'Satisfaction-Based Refund',
    description:
      'Refund at any time if the buyer is not satisfied with the level of service. Highest form of guarantee.',
    conditions: ['Request refund from support'],
    typicalReversalRate: 0.05,
    estimatedLiftMultiplier: 1.45,
    bestFor: ['low-ticket B2C', 'services with high confidence in delivery'],
  },

  // ── Conditional ──────────────────────────────────────────────────────
  {
    id: 'cond.service',
    type: 'conditional',
    name: 'Service Guarantee',
    description:
      'Keep working for the client free of charge until the promised result is achieved. Time delay is eliminated; only outcomes remain.',
    conditions: [
      'Client completes all assigned actions',
      'Client attends all check-ins',
      'Client reports progress weekly',
    ],
    typicalReversalRate: 0.02,
    estimatedLiftMultiplier: 1.40,
    bestFor: ['coaching', 'consulting', 'done-with-you services'],
  },
  {
    id: 'cond.modified_service',
    type: 'conditional',
    name: 'Modified Service Guarantee',
    description:
      'Give another Y-long period of service or access free of charge if the result is not achieved in the original window.',
    conditions: [
      'Client completes the program',
      'Client attends check-ins',
    ],
    typicalReversalRate: 0.03,
    estimatedLiftMultiplier: 1.30,
    bestFor: ['cohort programs', 'training', 'education'],
  },
  {
    id: 'cond.outsized_refund',
    type: 'conditional',
    name: 'Outsized Refund (2x-3x)',
    description:
      'Double or triple the money back (or a fixed high payout) if the outcome is not achieved. Requires a condition the buyer must meet.',
    conditions: [
      'Buyer spends $X on advertising using the system',
      'Buyer documents 30 days of the process',
      'Buyer completes all assigned actions',
    ],
    typicalReversalRate: 0.01,
    estimatedLiftMultiplier: 1.55,
    bestFor: ['high-margin B2B', 'info products with documented systems'],
  },
  {
    id: 'cond.credit_based',
    type: 'conditional',
    name: 'Credit-Based Guarantee',
    description:
      'Return what they paid as credit toward any other service you offer. Best used during an upsell to seal a deal.',
    conditions: ['Applied to a purchase of equal or greater value'],
    typicalReversalRate: 0.04,
    estimatedLiftMultiplier: 1.25,
    bestFor: ['upsells', 'multi-tier service businesses'],
  },
  {
    id: 'cond.personal_service',
    type: 'conditional',
    name: 'Personal Service Guarantee',
    description:
      'Founder/principal works with the client one-on-one for free until the objective is hit. Strongest guarantee in the book; use conditions.',
    conditions: [
      'Client must respond within 24h',
      'Client must use prescribed products',
      'Client must attend every check-in',
    ],
    typicalReversalRate: 0.01,
    estimatedLiftMultiplier: 1.60,
    bestFor: ['consulting', 'high-ticket coaching', 'bespoke services'],
  },
  {
    id: 'cond.hotel_airfare',
    type: 'conditional',
    name: 'Hotel + Airfare Perks Guarantee',
    description:
      'Refund product AND ancillary costs (hotel, airfare) if value not received. Great for in-person events.',
    conditions: ['Attendance at the event', 'Post-event survey'],
    typicalReversalRate: 0.02,
    estimatedLiftMultiplier: 1.35,
    bestFor: ['workshops', 'live events', 'intensives'],
  },
  {
    id: 'cond.wage_payment',
    type: 'conditional',
    name: 'Wage-Payment Guarantee',
    description:
      'Pay the buyer their hourly rate if they did not find the call/session valuable. Rarely invoked.',
    conditions: ['Attendance at the session'],
    typicalReversalRate: 0.01,
    estimatedLiftMultiplier: 1.25,
    bestFor: ['first-call demos', 'strategy sessions', 'webinars'],
  },
  {
    id: 'cond.release_of_service',
    type: 'conditional',
    name: 'Release of Service Guarantee',
    description:
      'Let the client out of their contract free of charge. Useful when contracts are not enforced anyway.',
    conditions: ['Written cancellation request'],
    typicalReversalRate: 0.06,
    estimatedLiftMultiplier: 1.20,
    bestFor: ['continuity programs', 'contracted services'],
  },
  {
    id: 'cond.delayed_second_payment',
    type: 'conditional',
    name: 'Delayed Second Payment Guarantee',
    description:
      'Second payment deferred until the buyer hits a first outcome (first sale, first 5lbs, website live).',
    conditions: ['First outcome documented'],
    typicalReversalRate: 0.02,
    estimatedLiftMultiplier: 1.30,
    bestFor: ['education', 'done-with-you programs', 'fitness'],
  },
  {
    id: 'cond.first_outcome',
    type: 'conditional',
    name: 'First Outcome Guarantee',
    description:
      'Continue paying ancillary costs (ad spend, hosting) until the buyer reaches their first outcome.',
    conditions: ['Client does all prescribed setup', 'Client reports metrics'],
    typicalReversalRate: 0.02,
    estimatedLiftMultiplier: 1.40,
    bestFor: ['B2B services', 'marketing', 'ad agencies'],
  },

  // ── Anti-guarantee ───────────────────────────────────────────────────
  {
    id: 'anti.all_sales_final',
    type: 'anti',
    name: 'All Sales Are Final',
    description:
      'No refunds, with an explicit "reason why" the offer is too valuable to reverse. Works when the deliverable is easily stolen or once-used.',
    conditions: ['None — the position IS the guarantee'],
    typicalReversalRate: 0,
    estimatedLiftMultiplier: 1.15,
    bestFor: ['proprietary systems', 'one-time-use info', 'high-exclusivity offers'],
  },

  // ── Implied ──────────────────────────────────────────────────────────
  {
    id: 'implied.revshare',
    type: 'implied',
    name: 'Revenue Share',
    description:
      'No payment unless revenue is generated. Perfect alignment of incentives; requires tracking.',
    conditions: ['Trackable revenue line', 'Agreed attribution window'],
    typicalReversalRate: 0,
    estimatedLiftMultiplier: 1.50,
    bestFor: ['agencies', 'growth partners', 'marketing'],
  },
  {
    id: 'implied.profit_share',
    type: 'implied',
    name: 'Profit Share',
    description:
      'Payment comes only from the profit generated. Even stronger alignment than revshare.',
    conditions: ['Trackable P&L', 'Agreed attribution'],
    typicalReversalRate: 0,
    estimatedLiftMultiplier: 1.50,
    bestFor: ['ecommerce', 'products with clean COGS visibility'],
  },
  {
    id: 'implied.performance_per_sale',
    type: 'implied',
    name: 'Pay Per Sale / Per Show',
    description:
      'Fixed fee per outcome delivered (per sale, per show, per lb). Easy to track, easy to invoice.',
    conditions: ['Agreed outcome definition', 'Trackable events'],
    typicalReversalRate: 0,
    estimatedLiftMultiplier: 1.45,
    bestFor: ['sales teams', 'lead-gen', 'fitness challenges'],
  },
];

// ── Recommendation rules ──────────────────────────────────────────────

export type PriceBand = 'under_500' | '500_2k' | '2k_10k' | '10k_50k' | 'over_50k';
export type BusinessType = 'b2c_low_ticket' | 'b2c_high_ticket' | 'b2b_low_ticket' | 'b2b_high_ticket' | 'recurring';
export type RefundTolerance = 'low' | 'medium' | 'high';

export interface RecommendationInput {
  priceBand: PriceBand;
  businessType: BusinessType;
  refundTolerance: RefundTolerance;   // how much refund risk the operator can bear
  buyerMustDoWork: boolean;
  outcomeIsMeasurable: boolean;
  deliverableIsEasilyStolen: boolean;
}

// Scoring table — every template gets a base score, then adjustments
// applied per input. Highest-scoring template becomes the recommendation.

function scoreTemplate(
  t: GuaranteeTemplate,
  input: RecommendationInput,
): number {
  let score = 0;

  // Refund tolerance gates the strongest unconditional guarantees.
  if (t.type === 'unconditional') {
    if (input.refundTolerance === 'low') score -= 40;
    if (input.refundTolerance === 'medium') score += 5;
    if (input.refundTolerance === 'high') score += 20;
  }

  // Buyer-must-do-work favors conditional guarantees (they shift burden
  // to the buyer's compliance, which is how ch. 15 avoids refund abuse).
  if (input.buyerMustDoWork && t.type === 'conditional') score += 25;
  if (!input.buyerMustDoWork && t.type === 'conditional') score -= 10;

  // Measurable outcome unlocks implied guarantees.
  if (input.outcomeIsMeasurable && t.type === 'implied') score += 35;
  if (!input.outcomeIsMeasurable && t.type === 'implied') score -= 50;

  // Easily stolen deliverable favors anti-guarantee.
  if (input.deliverableIsEasilyStolen && t.type === 'anti') score += 40;
  if (!input.deliverableIsEasilyStolen && t.type === 'anti') score -= 15;

  // Price-band matching.
  const bandMatch = matchPriceBand(t, input.priceBand);
  score += bandMatch;

  // Business-type nudges (tuned to ch. 15's examples).
  if (input.businessType === 'b2c_low_ticket' && t.type === 'unconditional') score += 10;
  if (input.businessType === 'b2b_high_ticket' && t.type === 'conditional') score += 15;
  if (input.businessType === 'recurring' && t.id === 'cond.release_of_service') score += 20;
  if (input.businessType === 'b2b_high_ticket' && t.type === 'implied') score += 10;

  // Net lift multiplier tips ties.
  score += t.estimatedLiftMultiplier * 5;

  return score;
}

function matchPriceBand(t: GuaranteeTemplate, band: PriceBand): number {
  const bands = t.bestFor.join(' | ').toLowerCase();
  switch (band) {
    case 'under_500':
      if (bands.includes('low-ticket') || bands.includes('digital')) return 15;
      if (bands.includes('high-ticket')) return -20;
      return 0;
    case '500_2k':
      if (bands.includes('coaching') || bands.includes('education')) return 10;
      return 0;
    case '2k_10k':
      if (bands.includes('coaching') || bands.includes('consulting') || bands.includes('services')) return 15;
      if (bands.includes('b2c') && !bands.includes('b2b')) return -5;
      return 0;
    case '10k_50k':
      if (bands.includes('consulting') || bands.includes('b2b') || bands.includes('high-ticket')) return 20;
      if (bands.includes('low-ticket')) return -20;
      return 0;
    case 'over_50k':
      if (bands.includes('consulting') || bands.includes('b2b') || bands.includes('high-ticket') || bands.includes('bespoke')) return 25;
      if (bands.includes('low-ticket') || bands.includes('b2c')) return -30;
      return 0;
  }
}

// ── Net multiplier math (ch. 15) ──────────────────────────────────────
//
// Baseline: 100 sales, 5% refund rate = 95 net.
// With guarantee: 100 * lift sales, refund rate * refund-multiplier.
// A guarantee is worth it if netWithGuarantee > netBaseline.
//
// Ch. 15's own example: 130 sales, 10% refunds = 117 net, 1.23x baseline.

export interface NetMultiplierEstimate {
  baselineSales: number;
  baselineRefundRate: number;
  baselineNet: number;
  guaranteedSales: number;
  guaranteedRefundRate: number;
  guaranteedNet: number;
  netMultiplier: number;
}

function estimateNetMultiplier(
  liftMultiplier: number,
  baseRefundRate: number,
  newRefundRate: number,
  baselineSales = 100,
): NetMultiplierEstimate {
  const guaranteedSales = baselineSales * liftMultiplier;
  const baselineNet = baselineSales * (1 - baseRefundRate);
  const guaranteedNet = guaranteedSales * (1 - newRefundRate);
  return {
    baselineSales,
    baselineRefundRate: baseRefundRate,
    baselineNet,
    guaranteedSales: Math.round(guaranteedSales * 100) / 100,
    guaranteedRefundRate: newRefundRate,
    guaranteedNet: Math.round(guaranteedNet * 100) / 100,
    netMultiplier: Math.round((guaranteedNet / baselineNet) * 100) / 100,
  };
}

// ── Selector ──────────────────────────────────────────────────────────

export class RiskReversal {
  /** Returns the full library. */
  listTemplates(): GuaranteeTemplate[] {
    return [...LIBRARY];
  }

  /** Returns a single template by id. */
  getTemplate(id: string): GuaranteeTemplate | null {
    return LIBRARY.find((t) => t.id === id) ?? null;
  }

  /**
   * Pick the recommended guarantee type given the offer characteristics.
   * Returns the top pick, its ch. 15 rationale, the alternatives sorted
   * by score, and the concrete buyer fears this reverses.
   */
  recommend(input: RecommendationInput): RiskReversalPlan {
    const scored = LIBRARY.map((t) => ({
      template: t,
      score: scoreTemplate(t, input),
    })).sort((a, b) => b.score - a.score);

    const top = scored[0];
    if (!top) {
      throw new Error('guarantee library is empty');
    }

    const rationale = this.buildRationale(top.template, input);
    const alternatives = scored.slice(1, 4).map((s) => ({
      type: s.template.type,
      tradeoff: this.describeTradeoff(s.template, top.template),
    }));

    const frictionRemoved = this.deriveFrictions(input);

    // Ch. 15 sanity check — is the guarantee actually net-positive?
    const net = estimateNetMultiplier(
      top.template.estimatedLiftMultiplier,
      0.05,
      top.template.typicalReversalRate,
    );

    log.info('risk_reversal.recommend', {
      recommended: top.template.id,
      type: top.template.type,
      score: Math.round(top.score),
      netMultiplier: net.netMultiplier,
    });

    return {
      recommendedGuaranteeType: top.template.type,
      rationale: `${rationale} Ch. 15 sanity check: at a ${Math.round(
        (top.template.estimatedLiftMultiplier - 1) * 100,
      )}% sales lift and ${Math.round(
        top.template.typicalReversalRate * 100,
      )}% refund rate, this nets ${net.netMultiplier}x your current revenue.`,
      alternatives,
      frictionRemoved,
    };
  }

  /**
   * Full scored list — for the UI trace view so the operator can see why
   * one template beat another.
   */
  recommendWithTrace(input: RecommendationInput): {
    plan: RiskReversalPlan;
    scored: Array<{ template: GuaranteeTemplate; score: number }>;
  } {
    const plan = this.recommend(input);
    const scored = LIBRARY.map((t) => ({
      template: t,
      score: Math.round(scoreTemplate(t, input)),
    })).sort((a, b) => b.score - a.score);
    return { plan, scored };
  }

  private buildRationale(
    t: GuaranteeTemplate,
    input: RecommendationInput,
  ): string {
    const bits: string[] = [];
    bits.push(`Selected ${t.name}.`);

    if (input.refundTolerance === 'low' && t.type === 'unconditional') {
      bits.push(
        'Warning: your refund tolerance is low but you selected an unconditional guarantee — expect real refund volume.',
      );
    }
    if (input.buyerMustDoWork && t.type === 'conditional') {
      bits.push(
        'Buyer must do work, so a conditional guarantee shifts the burden of compliance to them, protecting you from refunds while giving them a clear path to qualify.',
      );
    }
    if (input.outcomeIsMeasurable && t.type === 'implied') {
      bits.push(
        'Outcome is measurable, so a performance-based implied guarantee creates perfect alignment — you only get paid when they get paid.',
      );
    }
    if (input.deliverableIsEasilyStolen && t.type === 'anti') {
      bits.push(
        'Deliverable is easily stolen once seen, so an anti-guarantee with a strong reason why is the only honest position.',
      );
    }
    if (input.businessType === 'b2b_high_ticket') {
      bits.push(
        'B2B high-ticket offers reward service guarantees over refund guarantees — outcomes matter more than money back.',
      );
    }
    if (input.businessType === 'recurring' && t.id === 'cond.release_of_service') {
      bits.push(
        'Recurring business, so letting customers out of their contract free costs you little and removes the biggest buyer fear.',
      );
    }
    return bits.join(' ');
  }

  private describeTradeoff(
    alt: GuaranteeTemplate,
    winner: GuaranteeTemplate,
  ): string {
    const bits: string[] = [alt.name];
    if (alt.type !== winner.type) {
      bits.push(`switches type to ${alt.type}`);
    }
    if (alt.typicalReversalRate > winner.typicalReversalRate) {
      bits.push(
        `higher refund rate (~${Math.round(alt.typicalReversalRate * 100)}% vs ~${Math.round(
          winner.typicalReversalRate * 100,
        )}%)`,
      );
    }
    if (alt.estimatedLiftMultiplier < winner.estimatedLiftMultiplier) {
      bits.push(
        `weaker sales lift (~${alt.estimatedLiftMultiplier}x vs ${winner.estimatedLiftMultiplier}x)`,
      );
    }
    bits.push(`best for: ${alt.bestFor.join(', ')}`);
    return bits.join(' — ');
  }

  private deriveFrictions(input: RecommendationInput): string[] {
    const out: string[] = [];
    out.push('Fear the solution won\'t work for them.');
    if (input.buyerMustDoWork) {
      out.push('Fear they can\'t or won\'t do the required work.');
    }
    if (input.priceBand === '10k_50k' || input.priceBand === 'over_50k') {
      out.push('Fear of committing large upfront capital without proven ROI.');
    }
    if (!input.outcomeIsMeasurable) {
      out.push('Fear that success cannot be verified or measured.');
    }
    if (input.deliverableIsEasilyStolen) {
      out.push('Fear that once they have the deliverable, they can\'t take it back.');
    }
    out.push('Fear the timing is wrong — that results will take too long.');
    return out;
  }

  /** Expose the net-multiplier math for tests + UI. */
  estimateNetMultiplier(
    liftMultiplier: number,
    baseRefundRate: number,
    newRefundRate: number,
  ): NetMultiplierEstimate {
    return estimateNetMultiplier(liftMultiplier, baseRefundRate, newRefundRate);
  }
}

export const riskReversal = new RiskReversal();
