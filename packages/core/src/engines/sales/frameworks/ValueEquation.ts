/**
 * ValueEquation — executable primitive from $100M Offers, ch. 6.
 *
 *   Value = (Dream Outcome × Perceived Likelihood)
 *           ÷ (Time Delay × Effort & Sacrifice)
 *
 * Every offer, bonus, guarantee, and lead magnet passes through this
 * scorer before it enters the pipeline. Nothing enters unscored.
 *
 * Deterministic keyword heuristics — no LLM. Two runs on the same input
 * produce identical scores, so the Truth Ledger can audit any decision.
 */

import { log } from '../../core/logger';
import type {
  ValueEquationScore,
  InverseRiskProfile,
  OfferValueAssessment,
  ValueLever,
} from '../types';

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

interface LeverRule {
  keywords: string[];
  weight: number;
}

// ── Dream Outcome rules ────────────────────────────────────────────────
// Status, income, love, beauty, respect — the "surface" drivers from ch. 6.
const DREAM_RULES: LeverRule[] = [
  { keywords: ['status', 'respect', 'admired', 'looked up to'],           weight: 3 },
  { keywords: ['money', 'income', 'revenue', 'profit', '$', 'cash'],      weight: 3 },
  { keywords: ['beautiful', 'attractive', 'fit', 'lean', 'muscle'],       weight: 2.5 },
  { keywords: ['loved', 'relationship', 'partner', 'marriage'],           weight: 2.5 },
  { keywords: ['dream', 'ideal', 'perfect', 'ultimate', 'transformation'], weight: 2 },
  { keywords: ['freedom', 'autonomy', 'control', 'independence'],         weight: 2 },
  { keywords: ['time back', 'hours back', 'years back'],                  weight: 2 },
  { keywords: ['mastery', 'expert', 'authority'],                         weight: 1.5 },
  { keywords: ['health', 'energy', 'vitality', 'pain-free'],              weight: 2 },
  { keywords: ['status', 'prestige', 'elite', 'exclusive'],               weight: 1.5 },
];

// ── Perceived Likelihood rules ─────────────────────────────────────────
const LIKELIHOOD_RULES: LeverRule[] = [
  { keywords: ['guarantee', 'guaranteed', 'or your money back'],          weight: 3 },
  { keywords: ['proof', 'proven', 'track record', 'results'],             weight: 2.5 },
  { keywords: ['case study', 'case studies', 'before and after'],         weight: 2.5 },
  { keywords: ['testimonial', 'review', '5-star', 'five star'],           weight: 2 },
  { keywords: ['certified', 'credential', 'accredited', 'award'],         weight: 2 },
  { keywords: ['1000', '10,000', 'thousands', 'millions'],                weight: 1.5 },
  { keywords: ['trusted by', 'as seen on', 'featured in'],                weight: 2 },
  { keywords: ['science', 'research', 'study', 'clinical'],               weight: 1.5 },
  { keywords: ['step-by-step', 'system', 'framework', 'blueprint'],       weight: 1.5 },
  { keywords: ['the same people', 'like you', 'other clients'],           weight: 2 },
];

// ── Time Delay rules (lower is better for buyer) ──────────────────────
// Higher score = buyer perceives the offer as FASTER.
const SPEED_RULES: LeverRule[] = [
  { keywords: ['instant', 'immediate', 'in seconds', 'in minutes'],       weight: 3 },
  { keywords: ['same day', 'next day', 'in 24 hours', 'within a day'],    weight: 3 },
  { keywords: ['in days', 'in a week', 'this week', 'by friday'],         weight: 2.5 },
  { keywords: ['in weeks', 'in a month', 'within 30 days'],               weight: 2 },
  { keywords: ['in months', 'in a year', 'within a year'],                weight: 1 },
  { keywords: ['fast', 'quick', 'rapid', 'accelerated', 'speed'],         weight: 2 },
  { keywords: ['on demand', 'same time', 'real-time', 'live'],            weight: 2.5 },
  { keywords: ['no waiting', 'skip the wait', 'zero wait'],               weight: 2 },
];

const SLOWNESS_PENALTIES: LeverRule[] = [
  { keywords: ['long term', 'years of', 'decades', 'slow burn'],          weight: -3 },
  { keywords: ['eventually', 'one day', 'someday'],                       weight: -2 },
  { keywords: ['gradual', 'slowly', 'patience required'],                 weight: -2 },
];

// ── Effort & Sacrifice rules (higher is better = LESS effort) ─────────
const EASE_RULES: LeverRule[] = [
  { keywords: ['done for you', 'dfy', 'we do it for you', 'turnkey'],     weight: 4 },
  { keywords: ['done with you', 'dwy', 'we help you', 'guided'],          weight: 2.5 },
  { keywords: ['effortless', 'no effort', 'without lifting a finger'],    weight: 3.5 },
  { keywords: ['easy', 'simple', 'plug-and-play', 'just works'],          weight: 2.5 },
  { keywords: ['template', 'checklist', 'swipe file', 'tool'],            weight: 2 },
  { keywords: ['automated', 'automatic', 'hands-off'],                    weight: 2.5 },
  { keywords: ['one click', 'one-click', 'no setup'],                     weight: 3 },
];

const EFFORT_PENALTIES: LeverRule[] = [
  { keywords: ['do it yourself', 'diy', 'you have to', 'you must'],       weight: -3 },
  { keywords: ['manual', 'by hand', 'tedious'],                           weight: -2.5 },
  { keywords: ['complex', 'complicated', 'difficult', 'hard work'],       weight: -2.5 },
  { keywords: ['learning curve', 'steep', 'training required'],           weight: -2 },
  { keywords: ['hours per day', 'every day', 'daily grind'],              weight: -1.5 },
];

function scoreRules(text: string, rules: LeverRule[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        score += rule.weight;
        break; // one hit per rule keeps it from double counting synonyms
      }
    }
  }
  return score;
}

export class ValueEquation {
  /**
   * Score an offer description. Returns a full ValueEquationScore with the
   * four levers (0-10 each), the composed ratio, and a 0-100 normalized
   * display score.
   */
  score(description: string): ValueEquationScore {
    // Each lever starts at a neutral baseline (5) then moves by hits.
    const dreamRaw = 5 + scoreRules(description, DREAM_RULES);
    const likelihoodRaw = 5 + scoreRules(description, LIKELIHOOD_RULES);
    const speedRaw =
      5 +
      scoreRules(description, SPEED_RULES) +
      scoreRules(description, SLOWNESS_PENALTIES);
    const easeRaw =
      5 +
      scoreRules(description, EASE_RULES) +
      scoreRules(description, EFFORT_PENALTIES);

    const dreamOutcome = clamp(dreamRaw, 0, 10);
    const perceivedLikelihood = clamp(likelihoodRaw, 0, 10);
    const timeDelay = clamp(speedRaw, 0, 10);
    const effortSacrifice = clamp(easeRaw, 0, 10);

    const numerator = dreamOutcome * perceivedLikelihood;
    const denominator = Math.max(timeDelay * effortSacrifice, 0.01);
    const valueScore = numerator / denominator;
    // Normalize against the theoretical max (10 × 10) / (1 × 1) = 100.
    // A perfect offer tops out at 100; a terrible one bottoms at 0.
    const normalizedScore = clamp(Math.round(valueScore), 0, 100);

    return {
      dreamOutcome,
      perceivedLikelihood,
      timeDelay,
      effortSacrifice,
      numerator,
      denominator,
      valueScore: Math.round(valueScore * 100) / 100,
      normalizedScore,
    };
  }

  /**
   * Inverse risk profile — the "nightmare" side of the equation. Used by
   * Invisible Cost to frame what staying stuck costs the prospect.
   */
  inverse(description: string): InverseRiskProfile {
    const lower = description.toLowerCase();

    const nightmareHits =
      (/(losing|lose|lost|behind|falling behind)/.test(lower) ? 2 : 0) +
      (/(stuck|trapped|plateau|stagnant)/.test(lower) ? 2 : 0) +
      (/(competitor|competitors|beaten|outpaced)/.test(lower) ? 2 : 0) +
      (/(waste|wasted|wasting|burning)/.test(lower) ? 1.5 : 0) +
      (/(failed|failing|failure)/.test(lower) ? 2 : 0);
    const nightmareOutcome = clamp(3 + nightmareHits, 0, 10);

    const riskHits =
      (/(risky|risk|uncertain|unsure)/.test(lower) ? 2 : 0) +
      (/(might not|won't work|may fail)/.test(lower) ? 2.5 : 0) +
      (/(too good|suspicious|scam)/.test(lower) ? 3 : 0) +
      (/(expensive|pricey|costly)/.test(lower) ? 1.5 : 0);
    const perceivedRisk = clamp(3 + riskHits, 0, 10);

    const slowHits =
      (/(slow|slowly|gradual)/.test(lower) ? 2 : 0) +
      (/(years|months|decades)/.test(lower) ? 2 : 0) +
      (/(eventually|one day|someday)/.test(lower) ? 2 : 0);
    const currentSlowness = clamp(3 + slowHits, 0, 10);

    const effortHits =
      (/(manual|tedious|grind)/.test(lower) ? 2.5 : 0) +
      (/(hours|all day|nonstop)/.test(lower) ? 2 : 0) +
      (/(complex|complicated|difficult)/.test(lower) ? 2 : 0) +
      (/(do it yourself|diy|by hand)/.test(lower) ? 2 : 0);
    const currentEffort = clamp(3 + effortHits, 0, 10);

    const stuckScore =
      nightmareOutcome * perceivedRisk * ((currentSlowness + currentEffort) / 2);

    return {
      nightmareOutcome,
      perceivedRisk,
      currentSlowness,
      currentEffort,
      stuckScore: Math.round(stuckScore * 100) / 100,
    };
  }

  /**
   * Compose the full assessment. Runs both scorers, finds the strongest
   * and weakest levers, and emits actionable recommendations to boost
   * the offer per ch. 6's "bottom to zero" principle.
   */
  assess(description: string): OfferValueAssessment {
    const equation = this.score(description);
    const inverse = this.inverse(description);

    // Rank levers by their contribution to value (for positive) or drag
    // (for negative). Speed and ease scores are already inverted so a
    // higher number is always "better for the buyer" here.
    const leverScores: Array<{ lever: ValueLever; score: number }> = [
      { lever: 'dream',      score: equation.dreamOutcome },
      { lever: 'likelihood', score: equation.perceivedLikelihood },
      { lever: 'speed',      score: equation.timeDelay },
      { lever: 'ease',       score: equation.effortSacrifice },
    ];
    const sorted = [...leverScores].sort((a, b) => b.score - a.score);
    const strongestLever = sorted[0].lever;
    const weakestLever = sorted[sorted.length - 1].lever;

    const recommendations: string[] = [];
    if (equation.dreamOutcome < 6) {
      recommendations.push(
        'Boost Dream Outcome: name a specific end state with status language (money, respect, beauty, freedom). Ch. 6.',
      );
    }
    if (equation.perceivedLikelihood < 6) {
      recommendations.push(
        'Boost Perceived Likelihood: add proof (case study, testimonial, guarantee, certification). Ch. 6.',
      );
    }
    if (equation.timeDelay < 6) {
      recommendations.push(
        'Decrease Time Delay: promise a first win in days, not months. Fast wins drive churn down. Ch. 6 "Fast Beats Free".',
      );
    }
    if (equation.effortSacrifice < 6) {
      recommendations.push(
        'Decrease Effort & Sacrifice: shift toward done-for-you or add templates/checklists. Ch. 6 + ch. 10 delivery cube.',
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        'All four levers above threshold. Push further on the weakest lever to separate from the field.',
      );
    }

    const netScore = equation.normalizedScore - inverse.stuckScore;

    log.info('value_equation.assess', {
      dream: equation.dreamOutcome,
      likelihood: equation.perceivedLikelihood,
      speed: equation.timeDelay,
      ease: equation.effortSacrifice,
      normalized: equation.normalizedScore,
      stuck: inverse.stuckScore,
      net: Math.round(netScore * 100) / 100,
    });

    return {
      equation,
      inverse,
      netScore: Math.round(netScore * 100) / 100,
      strongestLever,
      weakestLever,
      recommendations,
    };
  }
}

export const valueEquation = new ValueEquation();
