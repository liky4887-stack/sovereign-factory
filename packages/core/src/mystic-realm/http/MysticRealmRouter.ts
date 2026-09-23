/**
 * mystic-realm/http/MysticRealmRouter.ts
 *   POST  /mystic-realm/manifest          { intention }
 *   GET   /mystic-realm/forge
 *   GET   /mystic-realm/soul
 *   PATCH /mystic-realm/soul              { risk?, speed?, taste? }
 *   GET   /mystic-realm/vault
 */

import { Router, Request, Response } from 'express';
import { MysticRealmService } from '../api/MysticRealmService';
import { ValidationError } from '../../shared/types/errors';

function num01to100(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return undefined;
  return v;
}

export function createMysticRealmRouter(service: MysticRealmService): Router {
  const router = Router();

  router.post('/mystic-realm/manifest', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.intention !== 'string' || body.intention.trim().length === 0) {
      throw new ValidationError('intention is required');
    }
    const result = await service.manifest(body.intention);
    res.status(201).json({ ok: true, result });
  });

  router.get('/mystic-realm/forge', async (_req: Request, res: Response) => {
    const report = await service.getForge();
    res.json({ ok: true, report });
  });

  router.get('/mystic-realm/soul', async (_req: Request, res: Response) => {
    const soul = await service.getSoul();
    res.json({ ok: true, soul });
  });

  router.patch('/mystic-realm/soul', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const patch: { risk?: number; speed?: number; taste?: number } = {};

    const risk = num01to100(body.risk);
    const speed = num01to100(body.speed);
    const taste = num01to100(body.taste);

    if (body.risk !== undefined && risk === undefined) throw new ValidationError('risk must be a number 0-100');
    if (body.speed !== undefined && speed === undefined) throw new ValidationError('speed must be a number 0-100');
    if (body.taste !== undefined && taste === undefined) throw new ValidationError('taste must be a number 0-100');

    if (risk !== undefined) patch.risk = risk;
    if (speed !== undefined) patch.speed = speed;
    if (taste !== undefined) patch.taste = taste;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('provide at least one of: risk, speed, taste');
    }

    const soul = await service.setSoul(patch);
    res.json({ ok: true, soul });
  });

  router.get('/mystic-realm/vault', async (_req: Request, res: Response) => {
    const vault = await service.getVault();
    res.json({ ok: true, vault });
  });

  return router;
}
