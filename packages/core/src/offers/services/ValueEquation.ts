/**
 * offers/services/ValueEquation.ts
 * Pure functions. Compute the OfferValueAssessment from raw levers.
 *   Value = (Dream × Likelihood) / (TimeDelay × Effort)
 */

import {
  ValueEquationScore,
  InverseRiskProfile,
  OfferValueAssessment,
  ValueLever,
} from '../models/Offer';

function clamp(n: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, n));
}

export function computeEquation(
  dreamOutcome: number,
  perceivedLikelihood: number,
  timeDelay: number,
  effortSacrifice: number,
): ValueEquationScore {
  const d = clamp(dreamOutcome);
  const l = clamp(perceivedLikelihood);
  const t = clamp(timeDelay);
  const e = clamp(effortSacrifice);

  const numerator = d * l;
  const denominator = Math.max(t * e, 0.01);
  const valueScore = numerator / denominator;
  const normalizedScore = Math.min(100, Math.round(valueScore * 5));  // 20 → 100

  return {
    dreamOutcome: d,
    perceivedLikelihood: l,
    timeDelay: t,
    effortSacrifice: e,
    numerator,
    denominator,
    valueScore,
    normalizedScore,
  };
}

export function computeInverse(equation: ValueEquationScore): InverseRiskProfile {
  const nightmareOutcome = 10 - equation.dreamOutcome;
  const perceivedRisk = 10 - equation.perceivedLikelihood;
  const currentSlowness = equation.timeDelay;
  const currentEffort = equation.effortSacrifice;
  const stuckScore = nightmareOutcome * perceivedRisk * ((currentSlowness + currentEffort) / 2);
  return { nightmareOutcome, perceivedRisk, currentSlowness, currentEffort, stuckScore };
}

export function pickStrongestWeakest(equation: ValueEquationScore): {
  strongest: ValueLever;
  weakest: ValueLever;
} {
  // For direct levers (dream, likelihood) higher is better.
  // For inverse levers (speed = low timeDelay, ease = low effort) the underlying raw value is inverted.
  const scores: Record<ValueLever, number> = {
    dream: equation.dreamOutcome,
    likelihood: equation.perceivedLikelihood,
    speed: 10 - equation.timeDelay,
    ease: 10 - equation.effortSacrifice,
  };
  const entries = Object.entries(scores) as [ValueLever, number][];
  entries.sort((a, b) => b[1] - a[1]);
  return { strongest: entries[0][0], weakest: entries[entries.length - 1][0] };
}

export function buildRecommendations(
  equation: ValueEquationScore,
  strongest: ValueLever,
  weakest: ValueLever,
): string[] {
  const recs: string[] = [];
  if (equation.dreamOutcome < 6) recs.push('Sharpen the promise — dream outcome lever is weak');
  if (equation.perceivedLikelihood < 6) recs.push('Add proof, guarantees, or case studies to raise likelihood');
  if (equation.timeDelay > 6) recs.push('Reduce time delay — add a fast win in the first week');
  if (equation.effortSacrifice > 6) recs.push('Reduce effort — add done-for-you components');
  recs.push(`Double down on ${strongest} (strongest lever)`);
  recs.push(`Fix ${weakest} (weakest lever)`);
  return recs;
}

export function computeAssessment(
  dreamOutcome: number,
  perceivedLikelihood: number,
  timeDelay: number,
  effortSacrifice: number,
): OfferValueAssessment {
  const equation = computeEquation(dreamOutcome, perceivedLikelihood, timeDelay, effortSacrifice);
  const inverse = computeInverse(equation);
  const { strongest, weakest } = pickStrongestWeakest(equation);
  const recommendations = buildRecommendations(equation, strongest, weakest);
  const netScore = equation.normalizedScore - inverse.stuckScore;
  return {
    equation,
    inverse,
    netScore,
    strongestLever: strongest,
    weakestLever: weakest,
    recommendations,
  };
}
