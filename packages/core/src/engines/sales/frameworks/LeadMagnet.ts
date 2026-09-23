/**
 * LeadMagnet — generator from $100M Leads, ch. 2.
 *
 * The 7-step creation process:
 *   1. Pick the narrow problem to solve + for whom
 *   2. Decide how to solve it (one of 3 types)
 *   3. Decide how to deliver it (one of 4 vehicles)
 *   4. Test the name (headline / image / subheadline)
 *   5. Make it easy to consume (multiple formats)
 *   6. Make it damn good — "give away the secrets, sell the implementation"
 *   7. Make it easy to tell you they want more (clear CTA + reason why)
 *
 * Type × Delivery matrix (3 × 4 = 12 combos):
 *   Types:    reveal_problem | sample_or_trial | one_step_of_multi
 *   Vehicles: software | information | services | physical_product
 *
 * Deterministic — no LLM. The generator picks a type/vehicle combo based
 * on the caller's constraints (budget, time-to-build, audience warmth).
 */

import { randomUUID } from 'crypto';
import { valueEquation } from './ValueEquation';
import { log } from '../../core/logger';
import { ValidationError } from '../../shared/types/errors';
import type {
  LeadMagnet,
  LeadMagnetType,
  LeadMagnetDelivery,
} from '../types';

// ── Type × Delivery compatibility matrix ──────────────────────────────
//
// Not every combo works. You can't reveal a problem via a physical
// product (that would be a sample). You can't sample a service that
// requires heavy setup. Etc. This table encodes the sane combos and
// their relative fit scores.

interface ComboScore {
  type: LeadMagnetType;
  delivery: LeadMagnetDelivery;
  fit: number;              // 1-10, how well the combo works
  effortToBuild: number;    // 1-10, one-time build cost
  costPerLeadUsd: number;   // marginal cost to deliver one lead magnet
  reason: string;
}

const COMBOS: ComboScore[] = [
  // reveal_problem × software — scorecards, audits, calculators
  {
    type: 'reveal_problem', delivery: 'software', fit: 10, effortToBuild: 8,
    costPerLeadUsd: 0.01,
    reason: 'Audit tools and scorecards are the canonical reveal-problem magnet. Zero marginal cost.',
  },
  // reveal_problem × information — diagnostic guides, quizzes
  {
    type: 'reveal_problem', delivery: 'information', fit: 8, effortToBuild: 3,
    costPerLeadUsd: 0,
    reason: 'Quizzes and diagnostic PDFs reveal problems cheaply. Lower perceived authority than a tool.',
  },
  // reveal_problem × services — free audits, posture checks
  {
    type: 'reveal_problem', delivery: 'services', fit: 9, effortToBuild: 4,
    costPerLeadUsd: 25,
    reason: 'Free audit converts well because it produces a personalized finding. Real time cost per lead.',
  },
  // reveal_problem × physical — termite inspection, mold test
  {
    type: 'reveal_problem', delivery: 'physical_product', fit: 7, effortToBuild: 6,
    costPerLeadUsd: 15,
    reason: 'Physical diagnostic kits work for high-ticket services where the problem must be demonstrated.',
  },

  // sample_or_trial × software — free tier, 7-day trial
  {
    type: 'sample_or_trial', delivery: 'software', fit: 10, effortToBuild: 9,
    costPerLeadUsd: 0.05,
    reason: 'SaaS free tiers are the highest-converting sample. Marginal cost is hosting only.',
  },
  // sample_or_trial × information — first chapter, mini-course
  {
    type: 'sample_or_trial', delivery: 'information', fit: 8, effortToBuild: 2,
    costPerLeadUsd: 0,
    reason: 'First chapter or mini-course samples well, but low tangible value compared to a live trial.',
  },
  // sample_or_trial × services — free session, adjustment
  {
    type: 'sample_or_trial', delivery: 'services', fit: 9, effortToBuild: 3,
    costPerLeadUsd: 40,
    reason: 'Free first session is the strongest sample for services. High per-lead cost limits scale.',
  },
  // sample_or_trial × physical — sample product, fun-sized
  {
    type: 'sample_or_trial', delivery: 'physical_product', fit: 9, effortToBuild: 5,
    costPerLeadUsd: 4,
    reason: 'Costco-style samples. Best for consumables where repeat purchase is the business model.',
  },

  // one_step_of_multi × software — starter template, first module
  {
    type: 'one_step_of_multi', delivery: 'software', fit: 8, effortToBuild: 6,
    costPerLeadUsd: 0.02,
    reason: 'Give away step 1 as a tool, sell the remaining steps. Works well for multi-stage workflows.',
  },
  // one_step_of_multi × information — the book itself
  {
    type: 'one_step_of_multi', delivery: 'information', fit: 10, effortToBuild: 7,
    costPerLeadUsd: 0,
    reason: 'Highest-fit combo. $100M Offers itself is a one-step-of-multi information magnet.',
  },
  // one_step_of_multi × services — free consultation, first session
  {
    type: 'one_step_of_multi', delivery: 'services', fit: 7, effortToBuild: 3,
    costPerLeadUsd: 35,
    reason: 'Give the first session free. Works when the remaining steps are clearly worth paying for.',
  },
  // one_step_of_multi × physical — first coat of sealant
  {
    type: 'one_step_of_multi', delivery: 'physical_product', fit: 6, effortToBuild: 4,
    costPerLeadUsd: 12,
    reason: 'Give away one physical component. Only works if the rest of the multi-step is a natural purchase.',
  },
];

// ── Public API ────────────────────────────────────────────────────────

export type BuildBudget = 'low' | 'medium' | 'high';
export type BuildSpeed = 'fast' | 'normal' | 'thorough';
export type AudienceWarmth = 'cold' | 'lukewarm' | 'warm';

export interface GenerateInput {
  name: string;
  narrowProblemSolved: string;     // the specific problem the magnet solves
  nextProblemRevealed: string;     // what the core offer then solves
  coreOfferPriceUsd: number;       // used to calibrate stated value
  budget: BuildBudget;             // one-time build cost tolerance
  speed: BuildSpeed;               // how fast it needs to exist
  audienceWarmth: AudienceWarmth;  // how well the audience knows us
  preferredDelivery?: LeadMagnetDelivery;  // force a specific vehicle if desired
  preferredType?: LeadMagnetType;          // force a specific type if desired
}

export interface GenerationTrace {
  magnet: LeadMagnet;
  chosenCombo: ComboScore;
  scoredAlternatives: Array<{ combo: ComboScore; score: number }>;
  sevenStepChecklist: Array<{ step: number; label: string; note: string }>;
  headlineTests: Array<{ variant: string; rationale: string }>;
}

export class LeadMagnetGenerator {
  /** List all 12 combos with their fit scores. */
  listCombos(): ComboScore[] {
    return [...COMBOS];
  }

  /**
   * Generate the best-fit lead magnet for the given constraints. Returns
   * a fully-specified LeadMagnet with a stated value calibrated to the
   * core offer (typically the magnet's stated value is 10-30% of the core
   * offer price — high enough to feel real, low enough to leave room).
   */
  generate(input: GenerateInput): LeadMagnet {
    return this.generateWithTrace(input).magnet;
  }

  /**
   * Full trace — the generated magnet plus the scoring rationale, the 7-
   * step checklist outcome, and 3 headline variants to A/B test.
   */
  generateWithTrace(input: GenerateInput): GenerationTrace {
    if (!input.narrowProblemSolved || input.narrowProblemSolved.length === 0) {
      throw new ValidationError('narrowProblemSolved is required');
    }
    if (!input.nextProblemRevealed || input.nextProblemRevealed.length === 0) {
      throw new ValidationError('nextProblemRevealed is required — the magnet must open the door to the core offer');
    }
    if (!Number.isFinite(input.coreOfferPriceUsd) || input.coreOfferPriceUsd <= 0) {
      throw new ValidationError('coreOfferPriceUsd must be positive');
    }

    // ── Score every combo against the constraints ────────────────────
    const scored = COMBOS
      .filter((c) => !input.preferredType || c.type === input.preferredType)
      .filter((c) => !input.preferredDelivery || c.delivery === input.preferredDelivery)
      .map((c) => ({ combo: c, score: this.scoreCombo(c, input) }))
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      throw new ValidationError(
        'no combo matches the preferred type × delivery constraint',
      );
    }

    const chosenCombo = scored[0].combo;

    // ── Value calibration ────────────────────────────────────────────
    // The magnet's stated value: 15-30% of the core offer price.
    // Higher-ticket offers justify a higher magnet value in absolute
    // terms; low-ticket offers scale the magnet down so the value ratio
    // stays believable.
    const valueFraction = this.pickValueFraction(input.audienceWarmth);
    const statedValueUsd = Math.round(input.coreOfferPriceUsd * valueFraction);
    const actualCostToDeliverUsd = chosenCombo.costPerLeadUsd;

    // Time to consume: info → short, software → medium, services → long,
    // physical → long. Adjusted by complexity of the problem statement.
    const timeToConsumeMinutes = this.estimateTimeToConsume(chosenCombo);

    // Qualification rate: how many leads who consume the magnet then
    // become qualified for the core offer. Samples and one-step-of-multi
    // convert better than reveals (which produce curiosity, not action).
    const qualificationRate = this.estimateQualification(chosenCombo);

    const magnet: LeadMagnet = {
      id: `lm_${randomUUID().slice(0, 8)}`,
      name: input.name,
      narrowProblemSolved: input.narrowProblemSolved,
      nextProblemRevealed: input.nextProblemRevealed,
      type: chosenCombo.type,
      delivery: chosenCombo.delivery,
      statedValueUsd,
      actualCostToDeliverUsd,
      timeToConsumeMinutes,
      qualificationRate,
    };

    // ── 7-step checklist from ch. 2 ──────────────────────────────────
    const sevenStepChecklist = this.buildChecklist(input, chosenCombo, magnet);

    // ── Headline variants for step 4 testing ─────────────────────────
    const headlineTests = this.buildHeadlineTests(input, chosenCombo, magnet);

    log.info('lead_magnet.generate', {
      name: input.name,
      type: chosenCombo.type,
      delivery: chosenCombo.delivery,
      statedValue: statedValueUsd,
      costPerLead: actualCostToDeliverUsd,
      qualificationRate,
    });

    return {
      magnet,
      chosenCombo,
      scoredAlternatives: scored.map((s) => ({
        combo: s.combo,
        score: Math.round(s.score * 100) / 100,
      })),
      sevenStepChecklist,
      headlineTests,
    };
  }

  // ── Scoring ─────────────────────────────────────────────────────────

  private scoreCombo(c: ComboScore, input: GenerateInput): number {
    let score = c.fit;

    // Budget constraint: 'low' rejects high-effort builds.
    const effortCeiling =
      input.budget === 'low' ? 3 : input.budget === 'medium' ? 6 : 10;
    if (c.effortToBuild > effortCeiling) {
      score -= (c.effortToBuild - effortCeiling) * 2;
    }

    // Speed constraint: 'fast' penalizes anything slow to build.
    const speedCeiling =
      input.speed === 'fast' ? 4 : input.speed === 'normal' ? 7 : 10;
    if (c.effortToBuild > speedCeiling) {
      score -= (c.effortToBuild - speedCeiling) * 1.5;
    }

    // Audience warmth: cold audiences need reveal-problem or software
    // (self-serve), warm audiences respond to services and samples.
    if (input.audienceWarmth === 'cold') {
      if (c.delivery === 'software' || c.type === 'reveal_problem') score += 3;
      if (c.delivery === 'services') score -= 3;
    }
    if (input.audienceWarmth === 'warm') {
      if (c.delivery === 'services' || c.delivery === 'physical_product') score += 2;
      if (c.type === 'reveal_problem') score -= 1;
    }

    // Per-lead cost sensitivity: high-cost-per-lead magnets scale worse.
    // Penalize when coreOfferPrice is low because you can't afford the
    // acquisition cost.
    const costRatio = c.costPerLeadUsd / input.coreOfferPriceUsd;
    if (costRatio > 0.1) score -= 5;
    else if (costRatio > 0.05) score -= 2;
    else if (costRatio < 0.01) score += 2;

    return score;
  }

  private pickValueFraction(warmth: AudienceWarmth): number {
    // Colder audiences need a higher stated value to earn attention.
    switch (warmth) {
      case 'cold': return 0.30;
      case 'lukewarm': return 0.22;
      case 'warm': return 0.15;
    }
  }

  private estimateTimeToConsume(c: ComboScore): number {
    switch (c.delivery) {
      case 'software': return 15;
      case 'information': return 25;
      case 'services': return 60;
      case 'physical_product': return 120;
    }
  }

  private estimateQualification(c: ComboScore): number {
    // % of consumers who become core-offer-qualified. Samples convert
    // best; reveals need a follow-up step to convert curiosity to intent.
    let base: number;
    switch (c.type) {
      case 'sample_or_trial': base = 0.35;
      break;
      case 'one_step_of_multi': base = 0.30;
      break;
      case 'reveal_problem': base = 0.18;
      break;
    }
    // Delivery quality adjusts.
    if (c.delivery === 'software') base += 0.05;
    if (c.delivery === 'information') base -= 0.03;
    if (c.delivery === 'services') base += 0.08;
    if (c.delivery === 'physical_product') base += 0.02;
    return Math.round(Math.min(base, 0.60) * 100) / 100;
  }

  // ── Step-by-step checklist from ch. 2 ───────────────────────────────

  private buildChecklist(
    input: GenerateInput,
    combo: ComboScore,
    magnet: LeadMagnet,
  ): Array<{ step: number; label: string; note: string }> {
    return [
      {
        step: 1,
        label: 'Pick the narrow problem + who',
        note: `Problem: "${input.narrowProblemSolved}". The next problem it reveals is: "${input.nextProblemRevealed}". Make sure the core offer solves that next problem, or the magnet has no commercial value.`,
      },
      {
        step: 2,
        label: 'Decide the type',
        note: `Chosen type: ${combo.type}. Rationale: ${combo.reason}`,
      },
      {
        step: 3,
        label: 'Decide the delivery vehicle',
        note: `Chosen delivery: ${combo.delivery}. One-time build effort ${combo.effortToBuild}/10, marginal cost $${combo.costPerLeadUsd}/lead.`,
      },
      {
        step: 4,
        label: 'Test the name',
        note: 'Use the 3 headline variants below. Poll your audience. The winner becomes the control. Retest monthly with a new challenger.',
      },
      {
        step: 5,
        label: 'Make it easy to consume',
        note: `Target consume time: ${magnet.timeToConsumeMinutes} minutes. Publish in multiple formats (video + written + audio) to catch different learners.`,
      },
      {
        step: 6,
        label: 'Make it damn good',
        note: `Stated value: $${magnet.statedValueUsd}. It must be valuable enough to charge for. Give away the secrets, sell the implementation. ${input.coreOfferPriceUsd > 5000 ? 'High-ticket core offer means the magnet can be genuinely substantial.' : 'Lower-ticket core offer means the magnet still needs to be tight and actionable, just shorter.'}`,
      },
      {
        step: 7,
        label: 'Make it easy to ask for more',
        note: `End with a clear CTA + a reason why now. Qualification rate estimate: ${(magnet.qualificationRate * 100).toFixed(0)}% of consumers become core-offer-qualified.`,
      },
    ];
  }

  private buildHeadlineTests(
    input: GenerateInput,
    combo: ComboScore,
    magnet: LeadMagnet,
  ): Array<{ variant: string; rationale: string }> {
    const value = magnet.statedValueUsd;
    return [
      {
        variant: `Free ${input.name} (worth $${value})`,
        rationale:
          'Ch. 2 headline formula #1: leading with "Free" plus a specific value anchor maximizes click-through on cold audiences.',
      },
      {
        variant: `New: How to ${input.narrowProblemSolved.toLowerCase()} — in ${Math.ceil(magnet.timeToConsumeMinutes / 5) * 5} minutes`,
        rationale:
          'Ch. 2 headline formula #2: "How to" + a concrete time frame gives the reader a specific reason to invest attention now.',
      },
      {
        variant: `The ${input.name} that ${input.nextProblemRevealed.toLowerCase()}`,
        rationale:
          'Ch. 2 headline formula #3: framing the magnet as the solution to the next problem makes the value proposition obvious and pre-qualifies the lead.',
      },
    ];
  }
}

export const leadMagnetGenerator = new LeadMagnetGenerator();
