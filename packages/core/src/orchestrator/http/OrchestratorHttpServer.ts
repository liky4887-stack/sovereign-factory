import 'express-async-errors';
import express, { Express, Request, Response } from 'express';
import * as http from 'http';
import { config } from '../../config';
import { log } from '../../shared/logger';
import { errorHandler } from '../../termux-server/middleware/errors';
import { loggingMiddleware } from '../../termux-server/middleware/logging';
import { authMiddleware } from '../../termux-server/middleware/auth';
import { Orchestrator } from '../Orchestrator';
import { TaskRequest } from '../types/TaskTypes';
import { ValidationError } from '../../shared/types/errors';
import { TruthLedgerClient } from '../../clients/TruthLedgerClient';

export interface OrchestratorHttpServerOptions {
  orchestrator: Orchestrator;
  ledgerClient: TruthLedgerClient;
}

export class OrchestratorHttpServer {
  private app: Express;
  private server: http.Server | null = null;
  private orchestrator: Orchestrator;
  private ledgerClient: TruthLedgerClient;

  constructor(opts: OrchestratorHttpServerOptions) {
    this.orchestrator = opts.orchestrator;
    this.ledgerClient = opts.ledgerClient;

    this.app = express();
    this.app.disable('x-powered-by');
    this.app.use(express.json({ limit: config.BODY_LIMIT }));
    this.app.use(loggingMiddleware);

    this.app.get('/orchestrator/health', (_req: Request, res: Response) => {
      res.json({
        ok: true,
        service: 'sovereign-orchestrator',
        uptimeSeconds: Math.floor(process.uptime()),
        queue: {
          pending: this.orchestrator.queueDepth(),
          active: this.orchestrator.activeCount(),
        },
      });
    });

    this.app.use(authMiddleware);

    this.app.post('/orchestrator/execute', async (req: Request, res: Response) => {
      const body = req.body;
      if (!body || typeof body !== 'object' || typeof body.type !== 'string') {
        throw new ValidationError('body must be an object with a string "type"');
      }

      const task = body as TaskRequest;
      log.info('orchestrator.http.execute', { type: task.type, correlationId: task.correlationId });

      const result = await this.orchestrator.execute(task);
      res.status(result.ok ? 200 : 500).json(result);
    });

    this.app.get('/orchestrator/ledger/integrity', async (_req: Request, res: Response) => {
      const integrity = await this.ledgerClient.integrity();
      res.json(integrity);
    });

    this.app.get('/orchestrator/ledger/query', async (req: Request, res: Response) => {
      const result = await this.ledgerClient.query({
        type: req.query.type as never,
        source: req.query.source as string | undefined,
        correlationId: req.query.correlationId as string | undefined,
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
        offset: req.query.offset ? parseInt(String(req.query.offset), 10) : undefined,
      });
      res.json({ ok: true, ...result });
    });

    this.app.use(errorHandler);
  }

  getExpressApp(): Express {
    return this.app;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(
        config.ORCHESTRATOR_PORT,
        config.HOST,
        async () => {
          await this.ledgerClient.appendSafe({
            type: 'SERVER_START',
            source: 'sovereign-orchestrator',
            payload: {
              host: config.HOST,
              port: config.ORCHESTRATOR_PORT,
            },
            tags: ['orchestrator', 'startup'],
          });
          log.info('orchestrator.http.listening', {
            url: 'http://' + config.HOST + ':' + config.ORCHESTRATOR_PORT,
          });
          resolve();
        },
      );
    });
  }

  async stop(signal: string): Promise<void> {
    if (!this.server) return;
    await this.ledgerClient.appendSafe({
      type: 'SERVER_STOP',
      source: 'sovereign-orchestrator',
      payload: { signal },
      tags: ['orchestrator', 'shutdown'],
    });
    return new Promise((resolve) => {
      this.server!.close(() => resolve());
    });
  }
}
