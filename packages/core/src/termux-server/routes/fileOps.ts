import { Router, Request, Response } from 'express';
import { fileOperator } from '../services/FileOperator';
import { ValidationError } from '../../shared/types/errors';

const router = Router();

router.post('/file/read', async (req: Request, res: Response) => {
  const { path: p } = req.body ?? {};
  if (typeof p !== 'string') throw new ValidationError('path is required');
  const result = await fileOperator.read(p);
  res.json({ ok: true, result });
});

router.post('/file/write', async (req: Request, res: Response) => {
  const { path: p, content } = req.body ?? {};
  if (typeof p !== 'string') throw new ValidationError('path is required');
  if (typeof content !== 'string') throw new ValidationError('content is required');
  const result = await fileOperator.write(p, content);
  res.json({ ok: true, result });
});

router.post('/file/list', async (req: Request, res: Response) => {
  const { path: p } = req.body ?? {};
  if (typeof p !== 'string') throw new ValidationError('path is required');
  const result = await fileOperator.list(p);
  res.json({ ok: true, result });
});

export default router;
