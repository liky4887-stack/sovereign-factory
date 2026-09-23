/**
 * InvisibleCost — dollar quantification of the Value Equation's inverse.
 *
 * The classic sales technique from Hormozi's closing playbook:
 * prospects don't buy from a rational ROI calculation, they buy from the
 * emotional weight of staying stuck. This module converts that weight
 * into concrete dollar figures, then frames the offer as the exit.
 *
 * Two layers:
 *   1. Direct math — missed revenue, wasted spend, lost hours
 *   2. Value Equation reframe — nightmare framed as 4-lever deltas
 *
 * The second layer is what makes the pitch compelling: "you're losing
 * $X/year" is weak alone. "You're losing $X/year because you're stuck on
 * the two hardest levers (speed and ease)" is what moves people.
 */

import { valueEquation } from './ValueEquation';
import { log } from '../../core/logger';
import { ValidationError } from '../../shared/types/errors';
import type { InvisibleCostInput, InvisibleCostBreakdown } from '../types';

export interface InvisibleCostOptions {
  /** Offer's price so we can compute payback period. */
  offerPriceUsd: number;
  /** Estimated offer effect on each lever. */
  offerDeltas: {
    dreamOutcome: number;         // 0-10, our offer's dream score
    perceivedLikelihood: number;  // 0-10
    timeDelay: number;            // 0-10 (higher = faster)
    effortSacrifice: number;      // 0-10 (higher = easier)
  };
  /** Optional offer description for auto-scoring via ValueEquation. */
  offerDescription?: string;
}

export class InvisibleCost {
  /**
   * Compute the full breakdown. If `offerDescription` is provided we
   * auto-score the offer via ValueEquation.assess() to derive deltas.
   * Otherwise the caller supplies deltas manually.
   */
  compute(input: InvisibleCostInput, opts: InvisibleCostOptions): InvisibleCostBreakdown {
    this.validate(input, opts);

    // ── Layer 1: direct math ─────────────────────────────────────────
    const currentRate = input.currentConversionRate;
    const targetRate = input.targetConversionRate;
    const rateDelta = Math.max(0, targetRate - currentRate);
    const dealValue = input.averageDealValue;
    const monthlyInquiries = input.monthlyMissedInquiries;

    // Missed revenue from the conversion gap. We count the extra deals
    // that would land if the rate moved from current to target, holding
    // inquiry volume constant.
    const extraDeals = monthlyInquiries * rateDelta;
    const missedRevenueMonthly = extraDeals * dealValue;
    const missedRevenueAnnual = missedRevenueMonthly * 12;

    // Wasted spend. If current spend isn't converting at the target rate,
    // the delta is money spent on leads that the funnel let die.
    const wastedSpendMonthly = input.currentMonthlySpend * rateDelta;
    const wastedSpendAnnual = wastedSpendMonthly * 12;

    // Time cost. Hours per week spent on manual operations the offer
    // would automate, multiplied by the operator's hourly value.
    const hoursPerMonth = input.hoursLostPerWeek * 4.33;
    const timeCostMonthly = hoursPerMonth * input.hourlyValue;
    const timeCostAnnual = timeCostMonthly * 12;

    const totalAnnual = missedRevenueAnnual + wastedSpendAnnual + timeCostAnnual;
    const costOfDelayPerWeek = Math.round(totalAnnual / 52);

    // ── Layer 2: value equation reframe ──────────────────────────────
    // The inverse profile scores "how stuck" the prospect is today.
    const inverseDescription = [
      `losing ${Math.round(missedRevenueMonthly)} dollars per month`,
      `wasting ${Math.round(wastedSpendMonthly)} on ineffective spend`,
      `stuck at ${(currentRate * 100).toFixed(1)}% conversion`,
      `manually handling ${input.hoursLostPerWeek} hours per week`,
      `competitors outpacing`,
    ].join('. ');

    const inverse = valueEquation.inverse(inverseDescription);

    // Compute the offer's deltas against the status quo. If the caller
    // passed an offer description, use ValueEquation.assess() to get it.
    let deltas = opts.offerDeltas;
    if (opts.offerDescription) {
      const assessed = valueEquation.assess(opts.offerDescription);
      deltas = {
        dreamOutcome: assessed.equation.dreamOutcome,
        perceivedLikelihood: assessed.equation.perceivedLikelihood,
        timeDelay: assessed.equation.timeDelay,
        effortSacrifice: assessed.equation.effortSacrifice,
      };
    }

    const ourOfferDelta = {
      dreamOutcome: deltas.dreamOutcome - inverse.nightmareOutcome,
      perceivedLikelihood: deltas.perceivedLikelihood - inverse.perceivedRisk,
      timeDelay: deltas.timeDelay - inverse.currentSlowness,
      effortSacrifice: deltas.effortSacrifice - inverse.currentEffort,
    };

    // ── Notes: the closing narrative ─────────────────────────────────
    const notes: string[] = [];
    notes.push(
      `Every week of delay costs $${costOfDelayPerWeek.toLocaleString()}.`,
    );
    notes.push(
      `Annual exposure: $${totalAnnual.toLocaleString()} in missed revenue, wasted spend, and lost time.`,
    );
    if (ourOfferDelta.timeDelay > 0) {
      notes.push(
        `Your offer closes the speed gap by ${ourOfferDelta.timeDelay.toFixed(1)} points — that's what "fast wins" means in dollar terms.`,
      );
    }
    if (ourOfferDelta.effortSacrifice > 0) {
      notes.push(
        `Your offer closes the ease gap by ${ourOfferDelta.effortSacrifice.toFixed(1)} points — this is where done-for-you pricing power comes from.`,
      );
    }
    if (ourOfferDelta.dreamOutcome <= 0) {
      notes.push(
        'Warning: your offer does not increase the dream outcome relative to their current state. Buyers will resist.',
      );
    }
    if (ourOfferDelta.perceivedLikelihood <= 0) {
      notes.push(
        'Warning: your offer does not increase perceived likelihood. Add proof, case studies, or a guarantee before pitching.',
      );
    }

    // Payback framing — how fast does the offer pay for itself?
    if (opts.offerPriceUsd > 0) {
      const weeklyBenefit = costOfDelayPerWeek + (extraDeals * dealValue) / 4.33;
      const paybackWeeks =
        weeklyBenefit > 0 ? Math.ceil(opts.offerPriceUsd / weeklyBenefit) : Infinity;
      if (Number.isFinite(paybackWeeks)) {
        notes.push(
          `At $${opts.offerPriceUsd.toLocaleString()} the offer pays for itself in ${paybackWeeks} week${paybackWeeks === 1 ? '' : 's'}.`,
        );
      }
    }

    const breakdown: InvisibleCostBreakdown = {
      missedRevenueMonthly: Math.round(missedRevenueMonthly),
      missedRevenueAnnual: Math.round(missedRevenueAnnual),
      wastedSpendMonthly: Math.round(wastedSpendMonthly),
      wastedSpendAnnual: Math.round(wastedSpendAnnual),
      timeCostMonthly: Math.round(timeCostMonthly),
      timeCostAnnual: Math.round(timeCostAnnual),
      totalAnnual: Math.round(totalAnnual),
      costOfDelayPerWeek,
      nightmareAnnual: Math.round(totalAnnual),
      currentSlownessScore: inverse.currentSlowness,
      currentEffortScore: inverse.currentEffort,
      ourOfferDelta,
      notes,
    };

    log.info('invisible_cost.compute', {
      totalAnnual: breakdown.totalAnnual,
      costOfDelayPerWeek,
      slownessScore: breakdown.currentSlownessScore,
      effortScore: breakdown.currentEffortScore,
      paybackWeeks: opts.offerPriceUsd > 0
        ? Math.ceil(opts.offerPriceUsd / (costOfDelayPerWeek + (extraDeals * dealValue) / 4.33))
        : null,
    });

    return breakdown;
  }

  /**
   * Convenience: return just the pitch line, ready to drop into a sales
   * script. Uses the classic Hormozi framing — problem, cost, offer, delta.
   */
  pitchLine(input: InvisibleCostInput, opts: InvisibleCostOptions): string {
    const b = this.compute(input, opts);
    const parts = [
      `Right now you're losing about $${b.totalAnnual.toLocaleString()} per year — $${b.costOfDelayPerWeek.toLocaleString()} for every week you wait.`,
      `That's $${b.missedRevenueAnnual.toLocaleString()} in missed revenue, $${b.wastedSpendAnnual.toLocaleString()} in wasted spend, and $${b.timeCostAnnual.toLocaleString()} in your own time.`,
      `Our offer closes the speed gap and the ease gap, which is where most of that loss comes from.`,
    ];
    // Append the payback line if it exists.
    const payback = b.notes.find((n) => n.includes('pays for itself'));
    if (payback) parts.push(payback);
    return parts.join(' ');
  }

  private validate(input: InvisibleCostInput, opts: InvisibleCostOptions): void {
    if (!Number.isFinite(input.monthlyMissedInquiries) || input.monthlyMissedInquiries < 0) {
      throw new ValidationError('monthlyMissedInquiries must be >= 0');
    }
    if (input.currentConversionRate < 0 || input.currentConversionRate > 1) {
      throw new ValidationError('currentConversionRate must be 0-1');
    }
    if (input.targetConversionRate < 0 || input.targetConversionRate > 1) {
      throw new ValidationError('targetConversionRate must be 0-1');
    }
    if (input.targetConversionRate < input.currentConversionRate) {
      throw new ValidationError(
        'targetConversionRate must be >= currentConversionRate (this models upside, not loss)',
      );
    }
    if (!Number.isFinite(input.averageDealValue) || input.averageDealValue <= 0) {
      throw new ValidationError('averageDealValue must be positive');
    }
    if (!Number.isFinite(input.currentMonthlySpend) || input.currentMonthlySpend < 0) {
      throw new ValidationError('currentMonthlySpend must be >= 0');
    }
    if (!Number.isFinite(input.hoursLostPerWeek) || input.hoursLostPerWeek < 0) {
      throw new ValidationError('hoursLostPerWeek must be >= 0');
    }
    if (!Number.isFinite(input.hourlyValue) || input.hourlyValue < 0) {
      throw new ValidationError('hourlyValue must be >= 0');
    }
    if (!Number.isFinite(opts.offerPriceUsd) || opts.offerPriceUsd < 0) {
      throw new ValidationError('offerPriceUsd must be >= 0');
    }
  }
}

export const invisibleCost = new InvisibleCost();
