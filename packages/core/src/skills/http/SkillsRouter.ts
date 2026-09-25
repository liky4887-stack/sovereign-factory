import { Router, Request, Response } from 'express';
import { SkillLoader } from '../SkillLoader';

export function createSkillsRouter(loader: SkillLoader): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    const skills = await loader.load(false);
    res.json({
      ok: true,
      configured: loader.isConfigured(),
      count: skills.length,
      loadedAt: loader.getLoadedAt() || null,
      lastError: loader.getLastError(),
      skills: skills.map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        source: s.source,
        bytes: s.content.length,
      })),
    });
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const skills = await loader.load(false);
    const found = skills.find((s) => s.id === req.params.id);
    if (!found) {
      res.status(404).json({ ok: false, error: 'skill not found' });
      return;
    }
    res.json({ ok: true, skill: found });
  });

  router.post('/refresh', async (_req: Request, res: Response) => {
    const skills = await loader.load(true);
    res.json({
      ok: true,
      count: skills.length,
      loadedAt: loader.getLoadedAt() || null,
      lastError: loader.getLastError(),
    });
  });

  return router;
}
