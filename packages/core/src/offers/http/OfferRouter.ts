/**
 * offers/http/OfferRouter.ts
 * HTTP surface for offers.
 *   GET    /offers              list (?icpId=)
 *   POST   /offers              create
 *   GET    /offers/:id          fetch one
 *   PATCH  /offers/:id          update
 *   DELETE /offers/:id          remove
 */

import { Router, Request, Response } from 'express';
import { OfferService } from '../api/OfferService';
import { ValueLever, GuaranteeType, BonusItem } from '../models/Offer';
import { ValidationError, NotFoundError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

const VALID_LEVERS: ValueLever[] = ['dream', 'likelihood', 'speed', 'ease'];
const VALID_GUARANTEES: GuaranteeType[] = [
  'unconditional',
  'conditional',
  'anti',
  'implied',
  'win_money_back',
  'trial_with_penalty',
];

function parseBonuses(input: unknown): BonusItem[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: BonusItem[] = [];
  for (const b of input) {
    if (typeof b !== 'object' || b === null) continue;
    const o = b as Record<string, unknown>;
    if (typeof o.name !== 'string') continue;
    const lever = VALID_LEVERS.includes(o.boostsLever as ValueLever)
      ? (o.boostsLever as ValueLever)
      : 'dream';
    out.push({
      name: o.name,
      description: typeof o.description === 'string' ? o.description : '',
      statedValueUsd: typeof o.statedValueUsd === 'number' ? o.statedValueUsd : 0,
      boostsLever: lever,
    });
  }
  return out;
}

function validateLevers(body: Record<string, unknown>): {
  dreamOutcome: number;
  perceivedLikelihood: number;
  timeDelay: number;
  effortSacrifice: number;
} {
  const fields = ['dreamOutcome', 'perceivedLikelihood', 'timeDelay', 'effortSacrifice'] as const;
  for (const f of fields) {
    const v = body[f];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10) {
      throw new ValidationError(`${f} is required and must be a number 0-10`);
    }
  }
  return {
    dreamOutcome: body.dreamOutcome as number,
    perceivedLikelihood: body.perceivedLikelihood as number,
    timeDelay: body.timeDelay as number,
    effortSacrifice: body.effortSacrifice as number,
  };
}

export function createOfferRouter(service: OfferService): Router {
  const router = Router();

  router.get('/offers', async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const icpId = req.query.icpId ? String(req.query.icpId) : undefined;
    const result = await service.query({ icpId, limit, offset });
    res.json({ ok: true, ...result });
  });

  router.post('/offers', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('name is required');
    }
    if (typeof body.coreDeliverable !== 'string') {
      throw new ValidationError('coreDeliverable is required');
    }
    if (typeof body.priceUsd !== 'number' || body.priceUsd < 0) {
      throw new ValidationError('priceUsd is required and must be >= 0');
    }

    const levers = validateLevers(body);

    let guarantee: Record<string, unknown> | undefined;
    if (body.guarantee !== undefined) {
      if (typeof body.guarantee !== 'object' || body.guarantee === null) {
        throw new ValidationError('guarantee must be an object');
      }
      const g = body.guarantee as Record<string, unknown>;
      if (g.type !== undefined && !VALID_GUARANTEES.includes(g.type as GuaranteeType)) {
        throw new ValidationError('invalid guarantee type');
      }
      guarantee = g;
    }

    const offer = await service.create({
      name: body.name,
      namingFormula: body.namingFormula,
      icpId: typeof body.icpId === 'string' ? body.icpId : undefined,
      coreDeliverable: body.coreDeliverable,
      priceUsd: body.priceUsd,
      coreStatedValueUsd: typeof body.coreStatedValueUsd === 'number' ? body.coreStatedValueUsd : undefined,
      bonuses: parseBonuses(body.bonuses),
      guarantee,
      scarcityUrgency: body.scarcityUrgency,
      ...levers,
    });

    log.info('offers.http.created', { id: offer.id });
    res.status(201).json({ ok: true, offer });
  });

  router.get('/offers/:id', async (req: Request, res: Response) => {
    const offer = await service.getById(req.params.id);
    if (!offer) throw new NotFoundError('offer not found');
    res.json({ ok: true, offer });
  });

  router.patch('/offers/:id', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw new ValidationError('name must be a non-empty string');
      }
      patch.name = body.name;
    }
    if (body.namingFormula !== undefined) patch.namingFormula = body.namingFormula;
    if (body.icpId !== undefined) patch.icpId = String(body.icpId);
    if (body.coreDeliverable !== undefined) {
      if (typeof body.coreDeliverable !== 'string') throw new ValidationError('coreDeliverable must be a string');
      patch.coreDeliverable = body.coreDeliverable;
    }
    if (body.priceUsd !== undefined) {
      if (typeof body.priceUsd !== 'number' || body.priceUsd < 0) throw new ValidationError('priceUsd must be >= 0');
      patch.priceUsd = body.priceUsd;
    }
    if (typeof body.coreStatedValueUsd === 'number') patch.coreStatedValueUsd = body.coreStatedValueUsd;
    if (body.bonuses !== undefined) {
      const b = parseBonuses(body.bonuses);
      if (b !== undefined) patch.bonuses = b;
    }
    if (body.guarantee !== undefined) patch.guarantee = body.guarantee;
    if (body.scarcityUrgency !== undefined) patch.scarcityUrgency = body.scarcityUrgency;

    for (const f of ['dreamOutcome', 'perceivedLikelihood', 'timeDelay', 'effortSacrifice'] as const) {
      if (body[f] !== undefined) {
        const v = body[f];
        if (typeof v !== 'number' || v < 0 || v > 10) {
          throw new ValidationError(`${f} must be a number 0-10`);
        }
        patch[f] = v;
      }
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('no valid fields to update');
    }

    const updated = await service.update(req.params.id, patch as Parameters<typeof service.update>[1]);
    if (!updated) throw new NotFoundError('offer not found');
    res.json({ ok: true, offer: updated });
  });

  router.delete('/offers/:id', async (req: Request, res: Response) => {
    const ok = await service.remove(req.params.id);
    if (!ok) throw new NotFoundError('offer not found');
    res.json({ ok: true });
  });

  return router;
}
