/**
 * sales/http/SalesRouter.ts
 * HTTP surface for the six Hormozi sales frameworks.
 * Deterministic, no LLM calls. Errors shaped { ok: false, error }.
 */

import { Router, Request, Response } from 'express';
import { log } from '../../core/logger';

import { valueEquation } from '../frameworks/ValueEquation';
import { grandSlamOffer, type ComposeInput } from '../frameworks/GrandSlamOffer';
import { riskReversal, type RecommendationInput } from '../frameworks/RiskReversal';
import { moneyModelBuilder, type BuildInput, type OfferInput } from '../frameworks/MoneyModel';
import { leadMagnetGenerator, type GenerateInput } from '../frameworks/LeadMagnet';
import { channelRouter, type RouteInput } from '../frameworks/ChannelRouter';
import { invisibleCost, type InvisibleCostOptions } from '../frameworks/InvisibleCost';
import type { CoreFourChannel, InvisibleCostInput } from '../types';

const CORE_FOUR: CoreFourChannel[] = [
  'warm_outreach',
  'post_free_content',
  'cold_outreach',
  'run_paid_ads',
];

function bad(res: Response, msg: string, code = 400): void {
  res.status(code).json({ ok: false, error: msg });
}

function boom(res: Response, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  log.error('sales.framework.error', { error: msg });
  res.status(500).json({ ok: false, error: msg });
}

export function createSalesRouter(): Router {
  const router = Router();

  // ─── Value Equation ──────────────────────────────────────────────
  router.post('/sales/frameworks/value-equation/score', (req: Request, res: Response) => {
    try {
      const d = String(req.body?.description ?? '');
      if (!d) return bad(res, 'description is required');
      const result = valueEquation.score(d);
      log.info('sales.value_equation.score', { len: d.length });
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/value-equation/assess', (req: Request, res: Response) => {
    try {
      const d = String(req.body?.description ?? '');
      if (!d) return bad(res, 'description is required');
      const result = valueEquation.assess(d);
      log.info('sales.value_equation.assess', { score: result.equation.normalizedScore });
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  // ─── Grand Slam Offer ────────────────────────────────────────────
  router.post('/sales/frameworks/grand-slam/compose', (req: Request, res: Response) => {
    try {
      const input = req.body as ComposeInput;
      const result = grandSlamOffer.compose(input);
      log.info('sales.grand_slam.compose', { name: result.name });
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/grand-slam/compose-trace', (req: Request, res: Response) => {
    try {
      const input = req.body as ComposeInput;
      const result = grandSlamOffer.composeWithTrace(input);
      log.info('sales.grand_slam.compose_trace');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  // ─── Risk Reversal ───────────────────────────────────────────────
  router.get('/sales/frameworks/risk-reversal/templates', (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, result: riskReversal.listTemplates() });
    } catch (e) { boom(res, e); }
  });

  router.get('/sales/frameworks/risk-reversal/templates/:id', (req: Request, res: Response) => {
    try {
      const t = riskReversal.getTemplate(req.params.id);
      if (!t) return bad(res, 'template not found', 404);
      res.json({ ok: true, result: t });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/risk-reversal/recommend', (req: Request, res: Response) => {
    try {
      const input = req.body as RecommendationInput;
      const result = riskReversal.recommend(input);
      log.info('sales.risk_reversal.recommend');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/risk-reversal/recommend-trace', (req: Request, res: Response) => {
    try {
      const input = req.body as RecommendationInput;
      const result = riskReversal.recommendWithTrace(input);
      log.info('sales.risk_reversal.recommend_trace');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  // ─── Money Model ─────────────────────────────────────────────────
  router.post('/sales/frameworks/money-model/build', (req: Request, res: Response) => {
    try {
      const input = req.body as BuildInput;
      const result = moneyModelBuilder.build(input);
      log.info('sales.money_model.build', { id: result.id });
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/money-model/build-projection', (req: Request, res: Response) => {
    try {
      const input = req.body as BuildInput;
      const result = moneyModelBuilder.buildWithProjection(input);
      log.info('sales.money_model.build_projection');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/money-model/validate', (req: Request, res: Response) => {
    try {
      const offers = Array.isArray(req.body?.offers) ? (req.body.offers as OfferInput[]) : [];
      const result = moneyModelBuilder.validate(offers);
      log.info('sales.money_model.validate', { count: offers.length });
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  // ─── Lead Magnet ─────────────────────────────────────────────────
  router.get('/sales/frameworks/lead-magnet/combos', (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, result: leadMagnetGenerator.listCombos() });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/lead-magnet/generate', (req: Request, res: Response) => {
    try {
      const input = req.body as GenerateInput;
      const result = leadMagnetGenerator.generate(input);
      log.info('sales.lead_magnet.generate', { id: result.id });
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/lead-magnet/generate-trace', (req: Request, res: Response) => {
    try {
      const input = req.body as GenerateInput;
      const result = leadMagnetGenerator.generateWithTrace(input);
      log.info('sales.lead_magnet.generate_trace');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  // ─── Channel Router ──────────────────────────────────────────────
  router.get('/sales/frameworks/channels', (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, result: channelRouter.listChannels() });
    } catch (e) { boom(res, e); }
  });

  router.get('/sales/frameworks/channels/:channel', (req: Request, res: Response) => {
    try {
      const c = req.params.channel as CoreFourChannel;
      if (!CORE_FOUR.includes(c)) return bad(res, 'unknown channel');
      const result = channelRouter.getChannel(c);
      if (!result) return bad(res, 'channel not found', 404);
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/channels/route', (req: Request, res: Response) => {
    try {
      const input = req.body as RouteInput;
      const result = channelRouter.route(input);
      log.info('sales.channel_router.route');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/channels/route-trace', (req: Request, res: Response) => {
    try {
      const input = req.body as RouteInput;
      const result = channelRouter.routeWithTrace(input);
      log.info('sales.channel_router.route_trace');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/channels/roadmap', (req: Request, res: Response) => {
    try {
      const input = req.body as RouteInput;
      const result = channelRouter.roadmap(input);
      log.info('sales.channel_router.roadmap');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  // ─── Invisible Cost ──────────────────────────────────────────────
  router.post('/sales/frameworks/invisible-cost/compute', (req: Request, res: Response) => {
    try {
      const input = req.body?.input as InvisibleCostInput;
      const opts = (req.body?.opts ?? {}) as InvisibleCostOptions;
      const result = invisibleCost.compute(input, opts);
      log.info('sales.invisible_cost.compute');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  router.post('/sales/frameworks/invisible-cost/pitch-line', (req: Request, res: Response) => {
    try {
      const input = req.body?.input as InvisibleCostInput;
      const opts = (req.body?.opts ?? {}) as InvisibleCostOptions;
      const result = invisibleCost.pitchLine(input, opts);
      log.info('sales.invisible_cost.pitch_line');
      res.json({ ok: true, result });
    } catch (e) { boom(res, e); }
  });

  return router;
}
