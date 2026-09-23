// shared/sales.ts
// Canonical Offer + Value Equation types (Hormozi-native).
// Mirrors a subset of sovereign-bridge/src/sales/types.ts for the Console.
// Money Models, Lead Magnets, ICP, Closing Playbook are separate future slices.

export type ValueLever = 'dream' | 'likelihood' | 'speed' | 'ease';

export interface ValueEquationScore {
  dreamOutcome: number;          // 0-10
  perceivedLikelihood: number;   // 0-10
  timeDelay: number;             // 0-10 (lower is better)
  effortSacrifice: number;       // 0-10 (lower is better)
  numerator: number;
  denominator: number;
  valueScore: number;
  normalizedScore: number;       // 0-100
}

export interface InverseRiskProfile {
  nightmareOutcome: number;
  perceivedRisk: number;
  currentSlowness: number;
  currentEffort: number;
  stuckScore: number;
}

export interface OfferValueAssessment {
  equation: ValueEquationScore;
  inverse: InverseRiskProfile;
  netScore: number;
  strongestLever: ValueLever;
  weakestLever: ValueLever;
  recommendations: string[];
}

export interface BonusItem {
  name: string;
  description: string;
  statedValueUsd: number;
  boostsLever: ValueLever;
}

export type GuaranteeType =
  | 'unconditional'
  | 'conditional'
  | 'anti'
  | 'implied'
  | 'win_money_back'
  | 'trial_with_penalty';

export interface Guarantee {
  type: GuaranteeType;
  description: string;
  conditions: string[];
  expectedReversalRate: number;   // 0-1
}

export interface ScarcityUrgency {
  scarcityBy?: 'quantity' | 'time' | 'both' | 'none';
  urgencyBy?: 'deadline' | 'bonus_expiry' | 'price_increase' | 'none';
  isHonest: boolean;
  details: string;
}

export interface OfferNamingFormula {
  magnet: string;
  avatar: string;
  goal: string;
  interval: string;
  container: string;
}

export interface GrandSlamOffer {
  id: string;
  name: string;
  namingFormula: OfferNamingFormula;
  icpId: string;
  coreDeliverable: string;
  priceUsd: number;
  bonuses: BonusItem[];
  guarantee: Guarantee;
  scarcityUrgency: ScarcityUrgency;
  statedStackValueUsd: number;
  offerValueAssessment: OfferValueAssessment;
  createdAt: string;
}

// ── Input shapes (match sovereign-core OfferInput / OfferUpdate) ───────

export interface OfferInput {
  name: string;
  namingFormula?: Partial<OfferNamingFormula>;
  icpId?: string;
  coreDeliverable: string;
  priceUsd: number;
  coreStatedValueUsd?: number;
  bonuses?: BonusItem[];
  guarantee?: Partial<Guarantee>;
  scarcityUrgency?: Partial<ScarcityUrgency>;

  // Value Equation inputs (0-10)
  dreamOutcome: number;
  perceivedLikelihood: number;
  timeDelay: number;
  effortSacrifice: number;
}

export interface OfferUpdate {
  name?: string;
  namingFormula?: Partial<OfferNamingFormula>;
  icpId?: string;
  coreDeliverable?: string;
  priceUsd?: number;
  coreStatedValueUsd?: number;
  bonuses?: BonusItem[];
  guarantee?: Partial<Guarantee>;
  scarcityUrgency?: Partial<ScarcityUrgency>;
  dreamOutcome?: number;
  perceivedLikelihood?: number;
  timeDelay?: number;
  effortSacrifice?: number;
}
