/**
 * offers/storage/OfferRepository.ts
 * Storage contract for offers. Mutable state, not an append-only log.
 */

import { GrandSlamOffer, OfferInput, OfferUpdate } from '../models/Offer';

export interface OfferQuery {
  icpId?: string;
  limit?: number;
  offset?: number;
}

export interface OfferQueryResult {
  offers: GrandSlamOffer[];
  total: number;
  limit: number;
  offset: number;
}

export interface OfferRepository {
  init(): Promise<void>;
  create(input: OfferInput): Promise<GrandSlamOffer>;
  getById(id: string): Promise<GrandSlamOffer | null>;
  query(q: OfferQuery): Promise<OfferQueryResult>;
  update(id: string, patch: OfferUpdate): Promise<GrandSlamOffer | null>;
  remove(id: string): Promise<boolean>;
  close(): Promise<void>;
}
