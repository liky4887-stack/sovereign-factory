/**
 * Sales Extension — canonical types (v2, Hormozi-native).
 *
 * Every framework from the three books has a type contract here:
 *   - Value Equation ($100M Offers, ch. 6)
 *   - Grand Slam Offer components (ch. 9-10, 12-16)
 *   - Guarantees / Risk Reversal (ch. 15)
 *   - Money Models 4-stage (Money Models)
 *   - Lead Magnets + Core Four ($100M Leads, ch. 2-3)
 *
 * Executable logic lives in src/sales/frameworks/*.ts. This file only
 * defines the shapes. Change a shape here, everything else follows.
 */

// ── Value Equation ($100M Offers, ch. 6) ───────────────────────────────
//
//   Value = (Dream Outcome × Perceived Likelihood) / (Time Delay × Effort & Sacrifice)
//
// Positive levers (0-10, higher is better for the buyer):
//   dreamOutcome, perceivedLikelihood
// Inverse levers (0-10, higher is worse for the buyer):
//   timeDelay, effortSacrifice
//
// The "bottom to zero" principle: if you can drive both inverse levers to
// zero, value goes to infinity (mathematically undefined, conceptually max).

export interface ValueEquationScore {
  dreamOutcome: number;          // 0-10
  perceivedLikelihood: number;   // 0-10
  timeDelay: number;             // 0-10 (lower is better)
  effortSacrifice: number;       // 0-10 (lower is better)

  numerator: number;             // dreamOutcome × perceivedLikelihood
  denominator: number;           // max(timeDelay × effortSacrifice, 0.01)
  valueScore: number;            // numerator / denominator
  normalizedScore: number;       // 0-100, capped for display
}

export interface InverseRiskProfile {
  nightmareOutcome: number;   // 0-10 severity of the status-quo downside
  perceivedRisk: number;      // 0-10 buyer's fear the solution fails for them
  currentSlowness: number;    // 0-10 how slow the status-quo path is
  currentEffort: number;      // 0-10 how much the buyer suffers today
  stuckScore: number;         // nightmare × perceivedRisk × (slowness + effort)/2
}

export type ValueLever = 'dream' | 'likelihood' | 'speed' | 'ease';

export interface OfferValueAssessment {
  equation: ValueEquationScore;
  inverse: InverseRiskProfile;
  netScore: number;                        // positive = offer worth taking
  strongestLever: ValueLever;
  weakestLever: ValueLever;
  recommendations: string[];               // what to add/change to boost value
}

// ── Grand Slam Offer ($100M Offers, ch. 9-10, 12-16) ──────────────────

export interface BonusItem {
  name: string;
  description: string;
  statedValueUsd: number;
  boostsLever: ValueLever;   // which of the 4 value levers this bonus targets
}

export interface Guarantee {
  type: 'unconditional' | 'conditional' | 'anti' | 'implied' | 'win_money_back' | 'trial_with_penalty';
  description: string;
  conditions: string[];
  expectedReversalRate: number;   // 0-1, expected refund/reversal fraction
}

export interface ScarcityUrgency {
  scarcityBy?: 'quantity' | 'time' | 'both' | 'none';
  urgencyBy?: 'deadline' | 'bonus_expiry' | 'price_increase' | 'none';
  isHonest: boolean;   // auditor flag: real vs manufactured constraint
  details: string;
}

export interface GrandSlamOffer {
  id: string;
  name: string;
  namingFormula: { magnet: string; avatar: string; goal: string; interval: string; container: string };
  icpId: string;
  coreDeliverable: string;
  priceUsd: number;
  bonuses: BonusItem[];
  guarantee: Guarantee;
  scarcityUrgency: ScarcityUrgency;
  statedStackValueUsd: number;   // sum of bonuses + core = anchor for pricing
  offerValueAssessment: OfferValueAssessment;
  createdAt: string;
}

// ── Risk Reversal ($100M Offers, ch. 15) ──────────────────────────────

export interface RiskReversalPlan {
  recommendedGuaranteeType: Guarantee['type'];
  rationale: string;
  alternatives: Array<{ type: Guarantee['type']; tradeoff: string }>;
  frictionRemoved: string[];   // specific buyer fears this reverses
}

// ── Money Model ($100M Money Models) ──────────────────────────────────
//
// Four-stage sequence: Attraction → Upsell → Downsell → Continuity.
// Offers inside each stage are typed by their specific play.

export type MoneyModelStage = 'attraction' | 'upsell' | 'downsell' | 'continuity';

export type MoneyModelOfferType =
  // Attraction
  | 'win_money_back'
  | 'giveaway'
  | 'decoy'
  | 'buy_x_get_y'
  | 'pay_less_now_pay_more_later'
  // Upsell
  | 'classic_upsell'
  | 'menu_upsell'
  | 'anchor_upsell'
  | 'rollover_upsell'
  // Downsell
  | 'payment_plan'
  | 'trial_with_penalty'
  | 'feature_downsell'
  // Continuity
  | 'continuity_bonus'
  | 'continuity_discount'
  | 'waived_fee';

export interface MoneyModelOffer {
  id: string;
  stage: MoneyModelStage;
  type: MoneyModelOfferType;
  name: string;
  priceUsd: number;
  expectedTakeRate: number;   // 0-1, fraction of customers who accept
  valueEquationScore: ValueEquationScore;
  notes: string[];
}

export interface MoneyModel {
  id: string;
  icpId: string;
  name: string;
  offers: MoneyModelOffer[];
  projectedThirtyDayProfitUsd: number;
  projectedNinetyDayGrossProfitUsd: number;
  missingStages: MoneyModelStage[];
  sequenceWarnings: string[];
}

// ── Lead Magnets ($100M Leads, ch. 2) ─────────────────────────────────
//
// Seven-step creation, three types, four delivery vehicles = 12 combos.

export type LeadMagnetType = 'reveal_problem' | 'sample_or_trial' | 'one_step_of_multi';
export type LeadMagnetDelivery = 'software' | 'information' | 'services' | 'physical_product';

export interface LeadMagnet {
  id: string;
  name: string;
  narrowProblemSolved: string;
  nextProblemRevealed: string;   // what the core offer then solves
  type: LeadMagnetType;
  delivery: LeadMagnetDelivery;
  statedValueUsd: number;
  actualCostToDeliverUsd: number;
  timeToConsumeMinutes: number;
  qualificationRate: number;     // 0-1, % who become core-offer-ready
}

// ── Core Four ($100M Leads, ch. 3) ────────────────────────────────────

export type AudienceTemperature = 'warm' | 'cold';
export type CommunicationMode = 'one_to_one' | 'one_to_many';
export type CoreFourChannel =
  | 'warm_outreach'
  | 'post_free_content'
  | 'cold_outreach'
  | 'run_paid_ads';

export interface ChannelRecommendation {
  channel: CoreFourChannel;
  audience: AudienceTemperature;
  mode: CommunicationMode;
  rationale: string;
  estimatedCostPerLeadUsd: number;
  estimatedHoursPer100Leads: number;
}

// ── ICP + Buyer roles ─────────────────────────────────────────────────

export interface ICPSegment {
  id: string;
  name: string;
  industry: string;
  revenueBand: 'under_1m' | '1m_10m' | '10m_50m' | '50m_250m' | 'over_250m';
  headcountBand: 'solo' | '2_10' | '11_50' | '51_200' | 'over_200';
  buyingTriggers: string[];
  painPoints: string[];
  disqualifiers: string[];
  decisionCycleDays: [number, number];
}

export type AuthorityLevel = 'icp_individual' | 'team_lead' | 'department_head' | 'c_suite' | 'board';

export type BuyerRoleType =
  | 'economic_buyer'
  | 'champion'
  | 'influencer'
  | 'blocker'
  | 'user'
  | 'gatekeeper';

export interface BuyerRole {
  id: string;
  name: string;
  type: BuyerRoleType;
  typicalTitles: string[];
  caresAbout: string[];
  objections: string[];
  messagingAngle: string;
  proofType: 'roi_math' | 'case_study' | 'peer_reference' | 'risk_reversal' | 'time_savings' | 'status';
}

// ── Gap Discovery + Closing Playbook ──────────────────────────────────

export type ClosingStage = 'intake' | 'gap_discovery' | 'invisible_cost' | 'professional_close';

export interface GapQuestion {
  id: string;
  forStage: ClosingStage;
  text: string;
  answerType: 'text' | 'number' | 'currency' | 'percentage' | 'boolean';
  usedFor: 'quantify_gap' | 'qualify_budget' | 'surface_objection' | 'establish_authority';
}

export interface GapAnswer {
  questionId: string;
  value: string | number | boolean;
}

export interface GapAnalysis {
  icpId: string;
  answers: GapAnswer[];
  currentState: string;
  desiredState: string;
  gaps: Array<{ dimension: string; current: string; desired: string; severity: 'low' | 'medium' | 'high' }>;
  priorityGap: string;
  valueEquationGap: {
    dreamOutcomeGap: number;
    perceivedLikelihoodGap: number;
    timeDelayGap: number;
    effortSacrificeGap: number;
  };
  notes: string[];
}

// ── Invisible Cost (rewired through Value Equation) ───────────────────

export interface InvisibleCostInput {
  monthlyMissedInquiries: number;
  currentConversionRate: number;
  targetConversionRate: number;
  averageDealValue: number;
  currentMonthlySpend: number;
  hoursLostPerWeek: number;
  hourlyValue: number;
}

export interface InvisibleCostBreakdown {
  missedRevenueMonthly: number;
  missedRevenueAnnual: number;
  wastedSpendMonthly: number;
  wastedSpendAnnual: number;
  timeCostMonthly: number;
  timeCostAnnual: number;
  totalAnnual: number;
  costOfDelayPerWeek: number;
  nightmareAnnual: number;
  currentSlownessScore: number;
  currentEffortScore: number;
  ourOfferDelta: {
    dreamOutcome: number;
    perceivedLikelihood: number;
    timeDelay: number;
    effortSacrifice: number;
  };
  notes: string[];
}

// ── Closing Playbook run ──────────────────────────────────────────────

export interface ClosingPlaybookRun {
  runId: string;
  icpId: string;
  offerId: string;
  authority: AuthorityLevel;
  currentStage: ClosingStage;
  completedStages: ClosingStage[];
  questionsToAsk: GapQuestion[];
  gapAnalysis?: GapAnalysis;
  invisibleCost?: InvisibleCostBreakdown;
  strikePlanId: string;
  recommendedAngle: string;
  objectionHandlers: Array<{ objection: string; response: string }>;
  closeRecommendation: string;
  proofToLeadWith: string[];
  nextStep: string;
  startedAt: string;
  updatedAt: string;
}
