/**
 * system-power/http/SystemPowerRouter.ts
 *   GET  /system-power/status     → full SystemPowerStatus
 *   POST /system-power/toggle     → flip a toggle, returns updated status
 */

import { Router, Request, Response } from 'express';
import { SystemPowerService } from '../api/SystemPowerService';
import { SystemPowerToggleKey } from '../models/SystemPowerState';
import { ValidationError } from '../../shared/types/errors';

const VALID_KEYS: SystemPowerToggleKey[] = ['accelEnabled', 'deepSim'];

export function createSystemPowerRouter(service: SystemPowerService): Router {
  const router = Router();

  router.get('/system-power/status', async (_req: Request, res: Response) => {
    const status = await service.getStatus();
    res.json({ ok: true, status });
  });

  router.post('/system-power/toggle', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.key !== 'string' || !VALID_KEYS.includes(body.key as SystemPowerToggleKey)) {
      throw new ValidationError(`key must be one of: ${VALID_KEYS.join(', ')}`);
    }
    if (typeof body.value !== 'boolean') {
      throw new ValidationError('value must be a boolean');
    }
    const status = await service.setToggle(body.key as SystemPowerToggleKey, body.value);
    res.json({ ok: true, status });
  });

  return router;
}
