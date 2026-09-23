/**
 * ChannelRouter — Core Four picker from $100M Leads, ch. 3.
 *
 * The Core Four is the only four ways one person can let another person
 * know about anything:
 *
 *                  | Warm (know you)    | Cold (strangers)
 *   ---------------+--------------------+------------------
 *   1-to-1        | Warm Outreach      | Cold Outreach
 *   1-to-many     | Post Free Content  | Run Paid Ads
 *
 * Every advertising method in the book maps to one of these four cells.
 * The router picks the best channel given constraints.
 *
 * Deterministic — no LLM. Channel selection is a scoring table.
 */

import { log } from '../../core/logger';
import { ValidationError } from '../../shared/types/errors';
import type {
  CoreFourChannel,
  AudienceTemperature,
  CommunicationMode,
  ChannelRecommendation,
} from '../types';

// ── Channel definitions ───────────────────────────────────────────────

export interface ChannelProfile {
  channel: CoreFourChannel;
  audience: AudienceTemperature;
  mode: CommunicationMode;
  label: string;
  description: string;
  /** Relative cost profile: 1 = cheapest, 10 = most expensive. */
  costIntensity: number;
  /** Relative time profile: 1 = fastest to start, 10 = slowest. */
  startupLatency: number;
  /** Relative effort: 1 = least operator hours, 10 = most. */
  operatorLoad: number;
  /** How well the channel scales (1-10). */
  scalability: number;
  /** Typical cost per engaged lead in USD. */
  typicalCostPerLeadUsd: number;
  /** Typical operator hours per 100 leads. */
  typicalHoursPer100Leads: number;
  /** Best-fit scenarios. */
  bestFor: string[];
  /** Known failure modes to watch for. */
  watchOut: string[];
}

const CHANNELS: ChannelProfile[] = [
  {
    channel: 'warm_outreach',
    audience: 'warm',
    mode: 'one_to_one',
    label: 'Warm Outreach',
    description:
      'Private 1:1 contact with people who already know you. Phone, text, email, DM, voicemail.',
    costIntensity: 1,
    startupLatency: 1,
    operatorLoad: 8,
    scalability: 2,
    typicalCostPerLeadUsd: 0,
    typicalHoursPer100Leads: 4,
    bestFor: [
      'first five clients',
      'new product validation',
      'no budget',
      're-engagement campaigns',
    ],
    watchOut: [
      'Run out of warm audience quickly',
      'Not scalable past ~1000 contacts',
      'Requires personalization or it reads as spam',
    ],
  },
  {
    channel: 'post_free_content',
    audience: 'warm',
    mode: 'one_to_many',
    label: 'Post Free Content',
    description:
      'Public broadcast to your warm audience. Posts, videos, podcasts, newsletters. Compounds over time.',
    costIntensity: 2,
    startupLatency: 4,
    operatorLoad: 7,
    scalability: 9,
    typicalCostPerLeadUsd: 0.02,
    typicalHoursPer100Leads: 12,
    bestFor: [
      'building audience',
      'warming cold audiences',
      'long-term organic growth',
      'making all other channels cheaper',
    ],
    watchOut: [
      'Slow to start',
      'Algorithm risk on owned platforms',
      'Content fatigue requires rotation',
    ],
  },
  {
    channel: 'cold_outreach',
    audience: 'cold',
    mode: 'one_to_one',
    label: 'Cold Outreach',
    description:
      'Private 1:1 contact with strangers. Cold calls, cold emails, cold DMs, direct mail.',
    costIntensity: 4,
    startupLatency: 2,
    operatorLoad: 9,
    scalability: 5,
    typicalCostPerLeadUsd: 3.5,
    typicalHoursPer100Leads: 8,
    bestFor: [
      'high-ticket B2B',
      'niche targeting',
      'operating in secret (competitors cannot see)',
      'predictable lead flow',
    ],
    watchOut: [
      'Volume-dependent — requires 100/day minimum',
      'List quality decays',
      'Long ramp to profitability (3-12 months)',
    ],
  },
  {
    channel: 'run_paid_ads',
    audience: 'cold',
    mode: 'one_to_many',
    label: 'Run Paid Ads',
    description:
      'Public broadcast to strangers. Meta, Google, YouTube, TikTok, LinkedIn, podcasts, direct mail lists.',
    costIntensity: 8,
    startupLatency: 2,
    operatorLoad: 4,
    scalability: 10,
    typicalCostPerLeadUsd: 5,
    typicalHoursPer100Leads: 4,
    bestFor: [
      'fastest path to scale',
      'proven offers',
      'budget available',
      'A/B testing at volume',
    ],
    watchOut: [
      'Loses money before it makes money',
      'Platform account bans',
      'Creative fatigue requires weekly rotation',
      'Requires tracking to avoid burning spend',
    ],
  },
];


// ── Recommendation input ──────────────────────────────────────────────

export type BudgetLevel = 'zero' | 'small' | 'medium' | 'large';
export type TimeHorizon = 'days' | 'weeks' | 'months';
export type AudienceSize = 'tiny' | 'small' | 'medium' | 'large';
export type GrowthGoal = 'validate' | 'first_10_clients' | 'scale' | 'compound';

export interface RouteInput {
  budget: BudgetLevel;
  timeHorizon: TimeHorizon;
  audienceSize: AudienceSize;      // how many warm contacts you have
  growthGoal: GrowthGoal;
  /** Optional: restrict to a specific channel. */
  preferredChannel?: CoreFourChannel;
  /** Number of leads you want per month. Used to filter too-small channels. */
  targetLeadsPerMonth?: number;
}

export interface RouteTrace {
  recommended: ChannelRecommendation;
  scored: Array<{ channel: CoreFourChannel; score: number; reasons: string[] }>;
  watchOut: string[];
}

// ── Scoring ───────────────────────────────────────────────────────────

const BUDGET_CEILING: Record<BudgetLevel, number> = {
  zero: 1, small: 3, medium: 6, large: 10,
};

const TIME_CEILING: Record<TimeHorizon, number> = {
  days: 2, weeks: 5, months: 10,
};

function scoreChannel(p: ChannelProfile, input: RouteInput): {
  score: number;
  reasons: string[];
} {
  let score = 5;
  const reasons: string[] = [];

  // Budget gate: reject channels whose cost intensity exceeds the ceiling.
  const budgetCeiling = BUDGET_CEILING[input.budget];
  if (p.costIntensity > budgetCeiling) {
    score -= (p.costIntensity - budgetCeiling) * 3;
    reasons.push(`over budget (needs cost intensity ${p.costIntensity}, ceiling is ${budgetCeiling})`);
  } else if (p.costIntensity <= budgetCeiling - 2) {
    score += 2;
    reasons.push('comfortably within budget');
  }

  // Time gate: reject channels that take too long to spin up.
  const timeCeiling = TIME_CEILING[input.timeHorizon];
  if (p.startupLatency > timeCeiling) {
    score -= (p.startupLatency - timeCeiling) * 2;
    reasons.push(`too slow to start (needs ${p.startupLatency}, ceiling is ${timeCeiling})`);
  } else if (p.startupLatency <= timeCeiling - 1) {
    score += 1.5;
    reasons.push('fast to launch');
  }

  // Goal-specific boosts.
  switch (input.growthGoal) {
    case 'validate':
      // Validate a new offer quickly. Warm outreach is fastest.
      if (p.channel === 'warm_outreach') { score += 6; reasons.push('fastest validation channel'); }
      if (p.channel === 'run_paid_ads') { score -= 3; reasons.push('premature to spend on ads before validating'); }
      break;
    case 'first_10_clients':
      // First paying customers. Warm outreach + cold outreach + light ads.
      if (p.channel === 'warm_outreach') { score += 5; reasons.push('best for first clients'); }
      if (p.channel === 'cold_outreach') { score += 3; reasons.push('scales past warm audience'); }
      if (p.channel === 'post_free_content') { score += 1; reasons.push('compounds into later channels'); }
      break;
    case 'scale':
      // Scaling existing proven offer. Ads + cold outreach.
      if (p.channel === 'run_paid_ads') { score += 6; reasons.push('fastest path to scale'); }
      if (p.channel === 'cold_outreach') { score += 4; reasons.push('predictable at volume'); }
      if (p.channel === 'warm_outreach') { score -= 4; reasons.push('warm audience too small for scale'); }
      break;
    case 'compound':
      // Long-term compounding. Content + ads.
      if (p.channel === 'post_free_content') { score += 6; reasons.push('compounds forever'); }
      if (p.channel === 'run_paid_ads') { score += 3; reasons.push('accelerates with content'); }
      if (p.channel === 'warm_outreach') { score -= 3; reasons.push('does not compound'); }
      break;
  }

  // Audience size gate: warm channels need warm audience.
  if (input.audienceSize === 'tiny' && p.audience === 'warm') {
    score -= 4;
    reasons.push('warm audience too small to sustain this channel');
  }
  if (input.audienceSize === 'large' && p.audience === 'warm') {
    score += 2;
    reasons.push('warm audience large enough to matter');
  }

  // Scalability bonus for scale and compound goals.
  if (input.growthGoal === 'scale' || input.growthGoal === 'compound') {
    score += p.scalability / 2;
    if (p.scalability >= 9) reasons.push('high scalability');
  }

  // Target-leads gate: reject channels that cannot hit the volume target.
  if (input.targetLeadsPerMonth && input.targetLeadsPerMonth > 1000) {
    if (p.channel === 'warm_outreach') {
      score -= 8;
      reasons.push('cannot deliver 1000+ leads/month from warm outreach');
    }
  }

  return { score, reasons };
}

// ── Router class ──────────────────────────────────────────────────────

export class ChannelRouter {
  /** List all four channels. */
  listChannels(): ChannelProfile[] {
    return [...CHANNELS];
  }

  /** Get a single channel profile. */
  getChannel(channel: CoreFourChannel): ChannelProfile | null {
    return CHANNELS.find((c) => c.channel === channel) ?? null;
  }

  /**
   * Pick the best channel for the given constraints. Returns the top
   * recommendation with reasoning, plus the full scored list.
   */
  route(input: RouteInput): ChannelRecommendation {
    return this.routeWithTrace(input).recommended;
  }

  routeWithTrace(input: RouteInput): RouteTrace {
    const filtered = input.preferredChannel
      ? CHANNELS.filter((c) => c.channel === input.preferredChannel)
      : CHANNELS;

    if (filtered.length === 0) {
      throw new ValidationError(
        `preferredChannel "${input.preferredChannel}" not found`,
      );
    }

    const scored = filtered
      .map((p) => {
        const { score, reasons } = scoreChannel(p, input);
        return { profile: p, score, reasons };
      })
      .sort((a, b) => b.score - a.score);

    const top = scored[0];

    const recommended: ChannelRecommendation = {
      channel: top.profile.channel,
      audience: top.profile.audience,
      mode: top.profile.mode,
      rationale: this.buildRationale(top.profile, input, top.reasons),
      estimatedCostPerLeadUsd: top.profile.typicalCostPerLeadUsd,
      estimatedHoursPer100Leads: top.profile.typicalHoursPer100Leads,
    };

    log.info('channel_router.route', {
      goal: input.growthGoal,
      budget: input.budget,
      recommended: top.profile.channel,
      score: Math.round(top.score * 10) / 10,
    });

    return {
      recommended,
      scored: scored.map((s) => ({
        channel: s.profile.channel,
        score: Math.round(s.score * 10) / 10,
        reasons: s.reasons,
      })),
      watchOut: top.profile.watchOut,
    };
  }

  private buildRationale(
    p: ChannelProfile,
    input: RouteInput,
    reasons: string[],
  ): string {
    const bits: string[] = [];
    bits.push(
      `For a ${input.growthGoal.replace('_', ' ')} goal on a ${input.budget} budget over ${input.timeHorizon}, ${p.label} is the best fit.`,
    );
    if (reasons.length > 0) {
      bits.push(`Because: ${reasons.join('; ')}.`);
    }
    bits.push(`Trade-off to accept: ${p.watchOut[0]}`);
    return bits.join(' ');
  }

  /**
   * Sequenced roadmap — a multi-channel plan rather than a single pick.
   * Implements ch. 3's "exhaust more, better first, then add new" principle
   * by ordering channels from cheapest-to-start to most-scalable.
   */
  roadmap(input: RouteInput): Array<{
    step: number;
    channel: CoreFourChannel;
    action: string;
    whenToAdvance: string;
  }> {
    const ranked = this.routeWithTrace(input).scored;
    const map: Record<CoreFourChannel, { action: string; whenToAdvance: string }> = {
      warm_outreach: {
        action: '100 warm reach-outs per day to everyone you know.',
        whenToAdvance: 'Once you have 5-10 paying customers and referrals have started.',
      },
      post_free_content: {
        action: 'Post 1-3 times per day on your best audience platform.',
        whenToAdvance: 'Once you have 1,000+ audience and 10+ inbound leads per week.',
      },
      cold_outreach: {
        action: '100 cold reach-outs per day (email, DM, call) with a lead magnet.',
        whenToAdvance: 'Once 1 rep is closing consistently and you can forecast lead-to-close.',
      },
      run_paid_ads: {
        action: 'Run profitable ads to a lead magnet or core offer with tracking.',
        whenToAdvance: 'When client-financed acquisition covers ad spend in under 30 days.',
      },
    };

    return ranked.map((r, i) => ({
      step: i + 1,
      channel: r.channel,
      action: map[r.channel].action,
      whenToAdvance: map[r.channel].whenToAdvance,
    }));
  }
}

export const channelRouter = new ChannelRouter();
