/**
 * offers/api/OfferService.ts
 * Business logic for offers. Thin wrapper over OfferRepository.
 */

import { log } from '../../shared/logger';
import { GrandSlamOffer, OfferInput, OfferUpdate } from '../models/Offer';
import {
  OfferRepository,
  OfferQuery,
  OfferQueryResult,
} from '../storage/OfferRepository';
import { JsonOfferRepository } from '../storage/JsonOfferRepository';

export class OfferService {
  private repo: OfferRepository;
  private initialised = false;

  constructor(repo?: OfferRepository) {
    this.repo = repo ?? new JsonOfferRepository('');
  }

  setRepository(repo: OfferRepository): void {
    this.repo = repo;
    this.initialised = false;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.repo.init();
    this.initialised = true;
    log.info('offers.service.ready', { count: (await this.repo.query({})).total });
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialised) await this.init();
  }

  async create(input: OfferInput): Promise<GrandSlamOffer> {
    await this.ensureInit();
    const o = await this.repo.create(input);
    log.info('offers.created', {
      id: o.id,
      valueScore: o.offerValueAssessment.equation.normalizedScore,
    });
    return o;
  }

  async getById(id: string): Promise<GrandSlamOffer | null> {
    await this.ensureInit();
    return this.repo.getById(id);
  }

  async query(q: OfferQuery): Promise<OfferQueryResult> {
    await this.ensureInit();
    return this.repo.query(q);
  }

  async update(id: string, patch: OfferUpdate): Promise<GrandSlamOffer | null> {
    await this.ensureInit();
    const o = await this.repo.update(id, patch);
    if (o) log.info('offers.updated', { id, fields: Object.keys(patch) });
    return o;
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureInit();
    const ok = await this.repo.remove(id);
    if (ok) log.info('offers.removed', { id });
    return ok;
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.repo.close();
    this.initialised = false;
  }
}
