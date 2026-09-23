/**
 * apps/backend/src/index.ts
 * Unified entrypoint for the Sovereign Factory.
 *
 * Boots:
 *   1. Canonical Truth Ledger (packages/core/src/ledger)
 *   2. Canonical Orchestrator (packages/core/src/orchestrator) on 8791
 *   3. Canonical Bridge HTTP server (packages/core/src/termux-server) on 8790
 *
 * Engines (fusion, persona, scout, sim, sales) are copied into
 * packages/core/src/engines but are NOT yet mounted here. Wiring them
 * is a follow-up task pending import-path verification. See MERGE_LOG.md.
 */

import { config } from '../../../packages/core/src/config';
import { log } from '../../../packages/core/src/shared/logger';
import { LedgerService } from '../../../packages/core/src/ledger/api/LedgerService';
import { JsonlLedgerRepository } from '../../../packages/core/src/ledger/storage/JsonlLedgerRepository';
import { ProjectService } from '../../../packages/core/src/projects/api/ProjectService';
import { JsonProjectRepository } from '../../../packages/core/src/projects/storage/JsonProjectRepository';
import { TaskService } from '../../../packages/core/src/tasks/api/TaskService';
import { JsonTaskRepository } from '../../../packages/core/src/tasks/storage/JsonTaskRepository';
import { AgentService } from '../../../packages/core/src/agents/api/AgentService';
import { JsonAgentRepository } from '../../../packages/core/src/agents/storage/JsonAgentRepository';
import { GoalService } from '../../../packages/core/src/goals/api/GoalService';
import { JsonGoalRepository } from '../../../packages/core/src/goals/storage/JsonGoalRepository';
import { OfferService } from '../../../packages/core/src/offers/api/OfferService';
import { JsonOfferRepository } from '../../../packages/core/src/offers/storage/JsonOfferRepository';
import { SystemPowerService } from '../../../packages/core/src/system-power/api/SystemPowerService';
import { JsonSystemPowerRepository } from '../../../packages/core/src/system-power/storage/JsonSystemPowerRepository';
import { TermuxBridgeServer } from '../../../packages/core/src/termux-server/TermuxBridgeServer';
import { TermuxBridgeClient } from '../../../packages/core/src/clients/TermuxBridgeClient';
import { TruthLedgerClient } from '../../../packages/core/src/clients/TruthLedgerClient';
import { Orchestrator } from '../../../packages/core/src/orchestrator/Orchestrator';
import { OrchestratorHttpServer } from '../../../packages/core/src/orchestrator/http/OrchestratorHttpServer';

async function main(): Promise<void> {
  log.info('factory.boot.start', {
    host: config.HOST,
    bridgePort: config.BRIDGE_PORT,
    orchestratorPort: config.ORCHESTRATOR_PORT,
  });

  // Ledger
  const ledger = new LedgerService(new JsonlLedgerRepository(config.LEDGER_FILE));
  await ledger.init();
  const integrity = await ledger.verifyIntegrity();
  if (!integrity.ok) {
    log.error('factory.ledger.integrity_failed', { ...integrity });
    process.exit(1);
  }

  // Domain services
  const projects = new ProjectService(new JsonProjectRepository(config.PROJECTS_FILE));
  const tasks = new TaskService(new JsonTaskRepository(config.TASKS_FILE));
  const agents = new AgentService(new JsonAgentRepository(config.AGENTS_FILE));
  const goals = new GoalService(new JsonGoalRepository(config.GOALS_FILE));
  const offers = new OfferService(new JsonOfferRepository(config.OFFERS_FILE));
  const systemPower = new SystemPowerService(new JsonSystemPowerRepository(config.SYSTEM_POWER_FILE));

  // Wire SystemPower toggles to the Truth Ledger
  systemPower.setLedgerAppend(async (entry) => {
    await ledger.append({
      type: entry.type,
      source: entry.source,
      payload: entry.payload,
      tags: entry.tags,
    });
  });

  // Bridge (8790)
  const bridgeServer = new TermuxBridgeServer({ ledger, projects, tasks, agents, goals, offers, systemPower });
  await bridgeServer.start();

  // Orchestrator (8791)
  const base = `http://${config.HOST}:${config.BRIDGE_PORT}`;
  const orchestrator = new Orchestrator({
    bridge: new TermuxBridgeClient(base),
    ledger: new TruthLedgerClient(base),
    concurrency: 4,
    maxQueueDepth: 100,
  });
  const orchestratorServer = new OrchestratorHttpServer({
    orchestrator,
    ledgerClient: new TruthLedgerClient(base),
  });
  await orchestratorServer.start();

  log.info('factory.boot.ready', { bridge: base });

  // Graceful shutdown
  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log.info('factory.boot.shutdown', { signal });
    try {
      await orchestratorServer.stop(signal);
      await bridgeServer.stop(signal);
      await ledger.close();
    } catch (err) {
      log.error('factory.shutdown_error', { error: err instanceof Error ? err.message : String(err) });
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
