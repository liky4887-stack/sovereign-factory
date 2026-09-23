/**
 * routes for the Persona Layer, mounted at /persona.
 *
 * Endpoints:
 *   GET  /persona/status          — registry counts + persona names
 *   GET  /persona/list            — full persona definitions
 *   GET  /persona/get/:id         — single persona
 *   POST /persona/evaluate        — run one persona against a goal
 *   POST /persona/panel           — full multi-persona review
 *   POST /persona/panel/refine    — panel + plan variants
 */

import { Router, Request, Response } from 'express';
import { personaRegistry } from '../PersonaRegistry';
import { personaEvaluator } from '../PersonaEvaluator';
import { multiPersonaPanel } from '../MultiPersonaPanel';
import { planRefiner } from '../PlanRefiner';
import { abstractionEngine } from '../../fusion/AbstractionEngine';
import { ValidationError } from '../../shared/types/errors';
import { log } from '../../core/logger';
import type { Severity } from '../types';

export function createPersonaRouter(): Router {
  const router = Router();

  router.get('/persona/status', (_req: Request, res: Response) => {
    const personas = personaRegistry.list();
    res.json({
      ok: true,
      count: personaRegistry.count(),
      personas: personas.map((p) => ({ id: p.id, name: p.name, domain: p.domain, checks: p.checks.length })),
    });
  });

  router.get('/persona/list', (_req: Request, res: Response) => {
    res.json({ ok: true, personas: personaRegistry.list() });
  });

  router.get('/persona/get/:id', (req: Request, res: Response) => {
    const persona = personaRegistry.get(req.params.id);
    if (!persona) return res.status(404).json({ ok: false, error: 'persona_not_found' });
    res.json({ ok: true, persona });
  });

  router.post('/persona/evaluate', (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.personaId !== 'string') throw new ValidationError('personaId is required');
    if (typeof body.goal !== 'string' || body.goal.length === 0) {
      throw new ValidationError('goal is required');
    }

    const persona = personaRegistry.get(body.personaId);
    if (!persona) return res.status(404).json({ ok: false, error: 'persona_not_found' });

    // Derive abstraction features from the goal via FusionEngine's abstraction
    const abstraction = abstractionEngine.abstract(body.goal, body.constraints ?? []);

    const review = personaEvaluator.evaluate(persona, {
      goal: body.goal,
      features: abstraction.features,
      constraints: body.constraints ?? [],
    });

    log.info('persona.http.evaluate', { personaId: persona.id, fired: review.checksFired });

    res.json({ ok: true, persona: { id: persona.id, name: persona.name }, review, abstraction });
  });

  router.post('/persona/panel', (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.goal !== 'string' || body.goal.length === 0) {
      throw new ValidationError('goal is required');
    }

    const abstraction = abstractionEngine.abstract(body.goal, body.constraints ?? []);

    const review = multiPersonaPanel.review(body.goal, {
      personaIds: Array.isArray(body.personaIds) ? body.personaIds : undefined,
      features: abstraction.features,
      constraints: body.constraints ?? [],
      minSeverityForBlocking: typeof body.minSeverityForBlocking === 'string'
        ? (body.minSeverityForBlocking as Severity)
        : undefined,
    });

    log.info('persona.http.panel', {
      goal: body.goal.slice(0, 80),
      personas: review.personasInvoked.length,
      blocking: review.blockingIssues.length,
    });

    res.json({ ok: true, abstraction, review });
  });

  router.post('/persona/panel/refine', (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.goal !== 'string' || body.goal.length === 0) {
      throw new ValidationError('goal is required');
    }

    const abstraction = abstractionEngine.abstract(body.goal, body.constraints ?? []);

    const baseReview = multiPersonaPanel.review(body.goal, {
      personaIds: Array.isArray(body.personaIds) ? body.personaIds : undefined,
      features: abstraction.features,
      constraints: body.constraints ?? [],
      minSeverityForBlocking: typeof body.minSeverityForBlocking === 'string'
        ? (body.minSeverityForBlocking as Severity)
        : undefined,
    });

    const refined = planRefiner.refine(baseReview);

    log.info('persona.http.refine', {
      goal: body.goal.slice(0, 80),
      recommended: refined.recommendedVariantId,
    });

    res.json({ ok: true, abstraction, review: refined });
  });

  return router;
}
