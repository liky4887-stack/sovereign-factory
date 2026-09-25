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

  router.post('/import', async (req: Request, res: Response) => {
    const url = (req.body && req.body.url) || '';
    if (typeof url !== 'string' || url.trim().length === 0) {
      res.status(400).json({ ok: false, error: 'url is required' });
      return;
    }
    try {
      const skill = await loader.importFromUrl(url.trim());
      res.json({
        ok: true,
        skill: {
          id: skill.id,
          label: skill.label,
          description: skill.description,
          source: skill.source,
          bytes: skill.content.length,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(422).json({ ok: false, error: msg });
    }
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
