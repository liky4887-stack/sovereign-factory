/**
 * offers/storage/JsonOfferRepository.ts
 * Single-file JSON storage for offers.
 * Every create/update recomputes the OfferValueAssessment via ValueEquation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../../shared/logger';
import {
  GrandSlamOffer,
  OfferInput,
  OfferUpdate,
  OfferNamingFormula,
  Guarantee,
  ScarcityUrgency,
} from '../models/Offer';
import {
  OfferRepository,
  OfferQuery,
  OfferQueryResult,
} from './OfferRepository';
import { computeAssessment } from '../services/ValueEquation';

function newId(): string {
  return 'offer_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

const EMPTY_NAMING: OfferNamingFormula = {
  magnet: '',
  avatar: '',
  goal: '',
  interval: '',
  container: '',
};

const DEFAULT_GUARANTEE: Guarantee = {
  type: 'conditional',
  description: '',
  conditions: [],
  expectedReversalRate: 0,
};

const DEFAULT_SCARCITY: ScarcityUrgency = {
  scarcityBy: 'none',
  urgencyBy: 'none',
  isHonest: true,
  details: '',
};

function sumStack(offer: Pick<GrandSlamOffer, 'priceUsd' | 'bonuses'> & { coreStatedValueUsd?: number }): number {
  const core = offer.coreStatedValueUsd ?? offer.priceUsd;
  const bonusSum = offer.bonuses.reduce((acc, b) => acc + (b.statedValueUsd || 0), 0);
  return core + bonusSum;
}

export class JsonOfferRepository implements OfferRepository {
  private readonly filePath: string;
  private offers: GrandSlamOffer[] = [];
  private initialised = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      if (raw.trim().length > 0) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) this.offers = parsed as GrandSlamOffer[];
        } catch (err) {
          log.warn('offers.repo.parse_error', {
            path: this.filePath,
            error: err instanceof Error ? err.message : String(err),
          });
          this.offers = [];
        }
      }
    } else {
      await fs.promises.writeFile(this.filePath, '[]', { mode: 0o600 });
    }
    this.initialised = true;
    log.info('offers.repo.ready', { path: this.filePath, count: this.offers.length });
  }

  private async persist(): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.offers, null, 2), { mode: 0o600 });
  }

  private ensureInit(): void {
    if (!this.initialised) throw new Error('OfferRepository not initialised');
  }

  async create(input: OfferInput): Promise<GrandSlamOffer> {
    this.ensureInit();

    const assessment = computeAssessment(
      input.dreamOutcome,
      input.perceivedLikelihood,
      input.timeDelay,
      input.effortSacrifice,
    );

    const bonuses = input.bonuses ?? [];
    const statedStackValueUsd = sumStack({
      priceUsd: input.priceUsd,
      coreStatedValueUsd: input.coreStatedValueUsd,
      bonuses,
    });

    const offer: GrandSlamOffer = {
      id: newId(),
      name: input.name.trim(),
      namingFormula: { ...EMPTY_NAMING, ...(input.namingFormula ?? {}) },
      icpId: input.icpId ?? '',
      coreDeliverable: input.coreDeliverable,
      priceUsd: input.priceUsd,
      bonuses,
      guarantee: { ...DEFAULT_GUARANTEE, ...(input.guarantee ?? {}) },
      scarcityUrgency: { ...DEFAULT_SCARCITY, ...(input.scarcityUrgency ?? {}) },
      statedStackValueUsd,
      offerValueAssessment: assessment,
      createdAt: nowIso(),
    };

    this.offers.push(offer);
    await this.persist();
    return offer;
  }

  async getById(id: string): Promise<GrandSlamOffer | null> {
    this.ensureInit();
    return this.offers.find((o) => o.id === id) ?? null;
  }

  async query(q: OfferQuery): Promise<OfferQueryResult> {
    this.ensureInit();
    let filtered = this.offers.slice();
    if (q.icpId) filtered = filtered.filter((o) => o.icpId === q.icpId);
    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const total = filtered.length;
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    const offers = filtered.slice(offset, offset + limit);
    return { offers, total, limit, offset };
  }

  async update(id: string, patch: OfferUpdate): Promise<GrandSlamOffer | null> {
    this.ensureInit();
    const idx = this.offers.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const current = this.offers[idx];

    // If levers are being changed, we need the full set. Fall back to existing assessment values.
    const d = patch.dreamOutcome ?? current.offerValueAssessment.equation.dreamOutcome;
    const l = patch.perceivedLikelihood ?? current.offerValueAssessment.equation.perceivedLikelihood;
    const t = patch.timeDelay ?? current.offerValueAssessment.equation.timeDelay;
    const e = patch.effortSacrifice ?? current.offerValueAssessment.equation.effortSacrifice;

    const nextBonuses = patch.bonuses ?? current.bonuses;
    const nextPrice = patch.priceUsd ?? current.priceUsd;

    // Preserve original coreStatedValueUsd if not patched — infer from stack minus bonuses
    const currentBonusSum = current.bonuses.reduce((acc, b) => acc + (b.statedValueUsd || 0), 0);
    const inferredCoreValue = current.statedStackValueUsd - currentBonusSum;
    const nextCoreStated = patch.coreStatedValueUsd ?? (inferredCoreValue > 0 ? inferredCoreValue : nextPrice);

    const nextAssessment = computeAssessment(d, l, t, e);
    const nextStackValue = sumStack({
      priceUsd: nextPrice,
      coreStatedValueUsd: nextCoreStated,
      bonuses: nextBonuses,
    });

    const updated: GrandSlamOffer = {
      ...current,
      name: patch.name ?? current.name,
      namingFormula: patch.namingFormula
        ? { ...current.namingFormula, ...patch.namingFormula }
        : current.namingFormula,
      icpId: patch.icpId ?? current.icpId,
      coreDeliverable: patch.coreDeliverable ?? current.coreDeliverable,
      priceUsd: nextPrice,
      bonuses: nextBonuses,
      guarantee: patch.guarantee
        ? { ...current.guarantee, ...patch.guarantee }
        : current.guarantee,
      scarcityUrgency: patch.scarcityUrgency
        ? { ...current.scarcityUrgency, ...patch.scarcityUrgency }
        : current.scarcityUrgency,
      statedStackValueUsd: nextStackValue,
      offerValueAssessment: nextAssessment,
    };

    this.offers[idx] = updated;
    await this.persist();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    this.ensureInit();
    const idx = this.offers.findIndex((o) => o.id === id);
    if (idx === -1) return false;
    this.offers.splice(idx, 1);
    await this.persist();
    return true;
  }

  async close(): Promise<void> {
    this.initialised = false;
  }
}
