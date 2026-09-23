/**
 * server.ts - HTTP surface.
 *
 * Mounts every route module. Startup logs to the Truth Ledger.
 * Cites P1 (preserve ledger), P3 (transparency), P4 (separation of routes).
 */

import express, { Request, Response } from 'express';
import { config } from './config';
import { log } from './core/logger';
import { ledger } from './ledger/TruthLedger';
import { selfHealingLoop } from './selfHealing/SelfHealingLoop';

import healthRouter from './routes/health';
import ledgerRouter from './routes/ledger';
import orchestratorRouter from './routes/orchestrator';
import evolutionRouter from './routes/evolution';
import simulationRouter from './routes/simulation';
import omegaRouter from './routes/omega';
import { createScoutRouter } from './scout/http/ScoutRouter';
import { createFusionRouter } from './fusion/http/FusionRouter';
import { createPersonaRouter } from './persona/http/PersonaRouter';
import { createSimRouter } from './sim/http/SimRouter';
import { createSalesRouter } from './sales/http/SalesRouter';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Request logger
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    log.info(req.method + ' ' + req.path, {
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
});

// Mount routes
app.use(healthRouter);
app.use(ledgerRouter);
app.use(orchestratorRouter);
app.use(evolutionRouter);
app.use(simulationRouter);
app.use(omegaRouter);
app.use(createScoutRouter());
app.use(createFusionRouter());
app.use(createPersonaRouter());
app.use(createSimRouter());
app.use(createSalesRouter());

// Error handler
app.use((err: unknown, req: Request, res: Response, _next: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log.error('express error', { path: req.path, error: message });
  ledger.appendEntry({
    actor: 'server',
    eventType: 'ERROR',
    payload: { where: 'express_error_handler', path: req.path, error: message },
  });
  res.status(500).json({ ok: false, error: 'internal_error', message });
});

// Boot
ledger.appendEntry({
  actor: 'server',
  eventType: 'SERVER_START',
  payload: { host: config.HOST, port: config.PORT, routes: 6 },
});

selfHealingLoop.start();

const server = app.listen(config.PORT, config.HOST, () => {
  log.info('[sovereign-bridge] listening', {
    url: 'http://' + config.HOST + ':' + config.PORT,
    routes: ['/health', '/ledger', '/task', '/evolution/*', '/simulation/*', '/omega/execute'],
  });
});

function shutdown(signal: string): void {
  log.info('shutdown', { signal });
  ledger.appendEntry({
    actor: 'server',
    eventType: 'SERVER_STOP',
    payload: { signal },
  });
  selfHealingLoop.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
