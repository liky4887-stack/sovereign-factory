/**
 * src/index.ts - process entrypoint.
 *
 * Boots three services in one process:
 *   1. LedgerService (shared by everything below)
 *   2. TermuxBridgeServer on BRIDGE_PORT (default 8790)
 *   3. OrchestratorHttpServer on ORCHESTRATOR_PORT (default 8791)
 *
 * The bridge and the orchestrator talk to each other over HTTP, not through
 * in-process references, so either can be split into its own process later
 * without code changes.
 */

import { config } from './config';
import { log } from './shared/logger';
import { LedgerService } from './ledger/api/LedgerService';
import { ProjectService } from './projects/api/ProjectService';
import { JsonProjectRepository } from './projects/storage/JsonProjectRepository';
import { TaskService } from './tasks/api/TaskService';
import { JsonTaskRepository } from './tasks/storage/JsonTaskRepository';
import { AgentService } from './agents/api/AgentService';
import { JsonAgentRepository } from './agents/storage/JsonAgentRepository';
import { GoalService } from './goals/api/GoalService';
import { JsonGoalRepository } from './goals/storage/JsonGoalRepository';
import { OfferService } from './offers/api/OfferService';
import { JsonOfferRepository } from './offers/storage/JsonOfferRepository';
import { JsonlLedgerRepository } from './ledger/storage/JsonlLedgerRepository';
import { TermuxBridgeServer } from './termux-server/TermuxBridgeServer';
import { TermuxBridgeClient } from './clients/TermuxBridgeClient';
import { TruthLedgerClient } from './clients/TruthLedgerClient';
import { Orchestrator } from './orchestrator/Orchestrator';
import { OrchestratorHttpServer } from './orchestrator/http/OrchestratorHttpServer';

async function main(): Promise<void> {
  log.info('boot.start', {
    host: config.HOST,
    bridgePort: config.BRIDGE_PORT,
    orchestratorPort: config.ORCHESTRATOR_PORT,
    ledgerFile: config.LEDGER_FILE,
    requireAuth: config.REQUIRE_AUTH,
    allowedCommands: config.ALLOWED_COMMANDS.length,
    allowedPaths: config.ALLOWED_PATHS.length,
  });

  const ledgerRepo = new JsonlLedgerRepository(config.LEDGER_FILE);
  const ledger = new LedgerService(ledgerRepo);
  await ledger.init();

  const integrity = await ledger.verifyIntegrity();
  if (!integrity.ok) {
    log.error('ledger.integrity_failed', {
      brokenAt: integrity.brokenAt,
      reason: integrity.reason,
    });
    process.exit(1);
  }

  const projectRepo = new JsonProjectRepository(config.PROJECTS_FILE);
  const projects = new ProjectService(projectRepo);

  const taskRepo = new JsonTaskRepository(config.TASKS_FILE);
  const tasks = new TaskService(taskRepo);

  const agentRepo = new JsonAgentRepository(config.AGENTS_FILE);
  const agents = new AgentService(agentRepo);

  const goalRepo = new JsonGoalRepository(config.GOALS_FILE);
  const goals = new GoalService(goalRepo);

  const offerRepo = new JsonOfferRepository(config.OFFERS_FILE);
  const offers = new OfferService(offerRepo);

  const bridgeServer = new TermuxBridgeServer({ ledger, projects, tasks, agents, goals, offers });
  await bridgeServer.start();

  const bridgeBaseUrl = 'http://' + config.HOST + ':' + config.BRIDGE_PORT;
  const bridgeClient = new TermuxBridgeClient(bridgeBaseUrl);
  const ledgerClient = new TruthLedgerClient(bridgeBaseUrl);

  const orchestrator = new Orchestrator({
    bridge: bridgeClient,
    ledger: ledgerClient,
    concurrency: 4,
    maxQueueDepth: 100,
  });

  const orchestratorServer = new OrchestratorHttpServer({
    orchestrator,
    ledgerClient,
  });
  await orchestratorServer.start();

  log.info('boot.ready', {
    bridge: bridgeBaseUrl,
    orchestrator: 'http://' + config.HOST + ':' + config.ORCHESTRATOR_PORT,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('boot.shutdown', { signal });
    try {
      await orchestratorServer.stop(signal);
      await bridgeServer.stop(signal);
      await ledger.close();
    } catch (err) {
      log.error('boot.shutdown_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  process.on('uncaughtException', (err) => {
    log.error('process.uncaught_exception', { error: err.message, stack: err.stack });
  });
  process.on('unhandledRejection', (reason) => {
    log.error('process.unhandled_rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

main().catch((err) => {
  log.error('boot.fatal', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
