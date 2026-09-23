import 'express-async-errors';
import express, { Express } from 'express';
import * as http from 'http';
import { config } from '../config';
import { log } from '../shared/logger';
import { authMiddleware } from './middleware/auth';
import { loggingMiddleware } from './middleware/logging';
import { errorHandler } from './middleware/errors';
import healthRouter from './routes/health';
import executeCommandRouter from './routes/executeCommand';
import fileOpsRouter from './routes/fileOps';
import processStatusRouter from './routes/processStatus';
import { LedgerService } from '../ledger/api/LedgerService';
import { createLedgerRouter } from '../ledger/http/LedgerHttpRouter';
import { ProjectService } from '../projects/api/ProjectService';
import { createProjectRouter } from '../projects/http/ProjectRouter';
import { TaskService } from '../tasks/api/TaskService';
import { createTaskRouter } from '../tasks/http/TaskRouter';
import { AgentService } from '../agents/api/AgentService';
import { createAgentRouter } from '../agents/http/AgentRouter';
import { GoalService } from '../goals/api/GoalService';
import { createGoalRouter } from '../goals/http/GoalRouter';
import { OfferService } from '../offers/api/OfferService';
import { createOfferRouter } from '../offers/http/OfferRouter';
import { SystemPowerService } from '../system-power/api/SystemPowerService';
import { createSystemPowerRouter } from '../system-power/http/SystemPowerRouter';
import { GodModeService } from '../god-mode/api/GodModeService';
import { createGodModeRouter } from '../god-mode/http/GodModeRouter';
import { MysticRealmService } from '../mystic-realm/api/MysticRealmService';
import { createMysticRealmRouter } from '../mystic-realm/http/MysticRealmRouter';
import { IdeService } from '../ide/api/IdeService';
import { createIdeRouter } from '../ide/http/IdeRouter';

export interface TermuxBridgeServerOptions {
  ledger: LedgerService;
  projects: ProjectService;
  tasks: TaskService;
  agents: AgentService;
  goals: GoalService;
  offers: OfferService;
  systemPower: SystemPowerService;
  godMode: GodModeService;
  mysticRealm: MysticRealmService;
  ide: IdeService;
}

export class TermuxBridgeServer {
  private app: Express;
  private server: http.Server | null = null;
  private ledger: LedgerService;
  private projects: ProjectService;
  private tasks: TaskService;
  private agents: AgentService;
  private goals: GoalService;
  private offers: OfferService;
  private systemPower: SystemPowerService;
  private godMode: GodModeService;
  private mysticRealm: MysticRealmService;
  private ide: IdeService;

  constructor(opts: TermuxBridgeServerOptions) {
    this.ledger = opts.ledger;
    this.projects = opts.projects;
    this.tasks = opts.tasks;
    this.agents = opts.agents;
    this.goals = opts.goals;
    this.offers = opts.offers;
    this.systemPower = opts.systemPower;
    this.godMode = opts.godMode;
    this.mysticRealm = opts.mysticRealm;
    this.ide = opts.ide;
    this.app = express();
    this.app.disable('x-powered-by');
    this.app.use(express.json({ limit: config.BODY_LIMIT }));
    this.app.use(loggingMiddleware);

    // Health and process status are unauthenticated for monitoring.
    this.app.use(healthRouter);
    this.app.use(processStatusRouter);

    // Everything else requires auth when REQUIRE_AUTH=true.
    this.app.use(authMiddleware);

    this.app.use(executeCommandRouter);
    this.app.use(fileOpsRouter);
    this.app.use(createLedgerRouter(this.ledger));
    this.app.use(createProjectRouter(this.projects));
    this.app.use(createTaskRouter(this.tasks));
    this.app.use(createAgentRouter(this.agents));
    this.app.use(createGoalRouter(this.goals));
    this.app.use(createOfferRouter(this.offers));
    this.app.use(createSystemPowerRouter(this.systemPower));
    this.app.use(createGodModeRouter(this.godMode));
    this.app.use(createMysticRealmRouter(this.mysticRealm));
    this.app.use(createIdeRouter(this.ide));

    this.app.use(errorHandler);
  }

  getExpressApp(): Express {
    return this.app;
  }

  async start(): Promise<void> {
    await this.ledger.init();
    await this.projects.init();
    await this.tasks.init();
    await this.agents.init();
    await this.goals.init();
    await this.offers.init();
    await this.systemPower.init();
    await this.godMode.init();
    await this.mysticRealm.init();
    await this.ide.init();

    return new Promise((resolve) => {
      this.server = this.app.listen(config.BRIDGE_PORT, config.HOST, async () => {
        await this.ledger.append({
          type: 'SERVER_START',
          source: 'termux-bridge',
          payload: {
            host: config.HOST,
            port: config.BRIDGE_PORT,
            requireAuth: config.REQUIRE_AUTH,
            allowedCommands: config.ALLOWED_COMMANDS.length,
            allowedPaths: config.ALLOWED_PATHS,
          },
          tags: ['bridge', 'startup'],
        });
        log.info('termux.bridge.listening', {
          url: 'http://' + config.HOST + ':' + config.BRIDGE_PORT,
        });
        resolve();
      });
    });
  }

  async stop(signal: string): Promise<void> {
    if (!this.server) return;
    await this.ledger.append({
      type: 'SERVER_STOP',
      source: 'termux-bridge',
      payload: { signal },
      tags: ['bridge', 'shutdown'],
    });
    return new Promise((resolve) => {
      this.server!.close(() => resolve());
    });
  }
}
