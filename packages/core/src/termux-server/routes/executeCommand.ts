import { Router, Request, Response } from 'express';
import { commandRunner } from '../services/CommandRunner';
import { ValidationError } from '../../shared/types/errors';

const router = Router();

router.post('/executeCommand', async (req: Request, res: Response) => {
  const { command, args, cwd, env, timeoutMs } = req.body ?? {};
  if (typeof command !== 'string' || command.length === 0) {
    throw new ValidationError('command is required');
  }
  if (args !== undefined && !Array.isArray(args)) {
    throw new ValidationError('args must be an array of strings');
  }

  const result = await commandRunner.run({
    command,
    args: args ?? [],
    cwd,
    env,
    timeoutMs,
  });

  res.json({ ok: true, result });
});

export default router;
