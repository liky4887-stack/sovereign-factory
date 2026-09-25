/**
 * apps/backend/src/index.ts
 * Unified entrypoint for the Sovereign Factory.
 *
 * Boots:
 *   1. Canonical Truth Ledger (packages/core/src/ledger)
 *   2. Canonical Orchestrator (packages/core/src/orchestrator) on 8791
 *   3. Canonical Bridge HTTP server (packages/core/src/termux-server) on 8790
 *   4. DeepSeek bridge (packages/core/src/deepseek) mounted at /deepseek/*
 *
 * Engines (fusion, persona, scout, sim, sales) are copied into
 * packages/core/src/engines but are NOT yet mounted here. Wiring them
 * is a follow-up task pending import-path verification. See MERGE_LOG.md.
 */

import { existsSync, readFileSync } from 'node:fs';

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
import { GodModeService } from '../../../packages/core/src/god-mode/api/GodModeService';
import { MysticRealmService } from '../../../packages/core/src/mystic-realm/api/MysticRealmService';
import { JsonSoulRepository } from '../../../packages/core/src/mystic-realm/storage/JsonSoulRepository';
import { IdeService } from '../../../packages/core/src/ide/api/IdeService';
import { JsonIdeRepository } from '../../../packages/core/src/ide/storage/JsonIdeRepository';
import { TermuxBridgeServer } from '../../../packages/core/src/termux-server/TermuxBridgeServer';
import { TermuxBridgeClient } from '../../../packages/core/src/clients/TermuxBridgeClient';
import { TruthLedgerClient } from '../../../packages/core/src/clients/TruthLedgerClient';
import { Orchestrator } from '../../../packages/core/src/orchestrator/Orchestrator';
import { OrchestratorHttpServer } from '../../../packages/core/src/orchestrator/http/OrchestratorHttpServer';

import { InMemoryCredentialStore } from '../../../packages/core/src/deepseek/storage/InMemoryCredentialStore';
import { PowSolver } from '../../../packages/core/src/deepseek/pow/PowSolver';
import { DeepSeekService } from '../../../packages/core/src/deepseek/api/DeepSeekService';
import { CredentialsFileShape } from '../../../packages/core/src/deepseek/models/DeepSeekTypes';
import { UEB, registerTermuxHandler, registerChatHandler, registerChatIntentRouter, registerMysticHandler, registerGodModeHandler, registerWorkspaceHandler, registerResultHandlers } from '../../../packages/core/src/events';

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

  const godMode = new GodModeService({ ledger, projects, tasks, agents });
  const mysticRealm = new MysticRealmService({
    ledger, projects, tasks, goals,
    soulRepo: new JsonSoulRepository(config.SOUL_FILE),
  });

  const ide = new IdeService({
    ledger,
    repo: new JsonIdeRepository(config.BLUEPRINTS_FILE),
  });

  // ─── DeepSeek bridge ─────────────────────────────────────────────────
  const deepseekCreds = new InMemoryCredentialStore();
  const deepseekPow = new PowSolver(config.DEEPSEEK.wasmPath);
  const deepseek = new DeepSeekService(deepseekCreds, deepseekPow, {
    baseUrl: config.DEEPSEEK.baseUrl,
    defaultTargetPath: config.DEEPSEEK.defaultTargetPath,
    defaultModel: config.DEEPSEEK.defaultModel,
    requestTimeoutMs: config.DEEPSEEK.requestTimeoutMs,
    pathTokenTtlSafetyMs: config.DEEPSEEK.pathTokenTtlSafetyMs,
  });

  // Boot-time credential loading (file takes precedence over env vars).
  if (config.DEEPSEEK.credentialsFile && existsSync(config.DEEPSEEK.credentialsFile)) {
    try {
      const raw = JSON.parse(readFileSync(config.DEEPSEEK.credentialsFile, 'utf8')) as CredentialsFileShape;
      if (raw.bearerToken && raw.cookies) {
        deepseek.setCredentials({
          bearerToken: raw.bearerToken,
          cookies: raw.cookies,
          hifLeim: raw.hifLeim,
          hifDliq: raw.hifDliq,
          deviceId: raw.deviceId,
        });
        log.info('deepseek.credentials.loaded_from_file', {
          path: config.DEEPSEEK.credentialsFile,
        });
      } else {
        log.warn('deepseek.credentials.file_missing_fields', {
          path: config.DEEPSEEK.credentialsFile,
        });
      }
    } catch (e) {
      log.warn('deepseek.credentials.file_unreadable', {
        path: config.DEEPSEEK.credentialsFile,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else if (config.DEEPSEEK.envBearerToken && config.DEEPSEEK.envCookies) {
    deepseek.setCredentials({
      bearerToken: config.DEEPSEEK.envBearerToken,
      cookies: config.DEEPSEEK.envCookies,
    });
    log.info('deepseek.credentials.loaded_from_env');
  } else {
    log.info('deepseek.credentials.absent', {
      hint: 'POST /deepseek/credentials to set them at runtime',
    });
  }

  if (!deepseekPow.wasmExists()) {
    log.warn('deepseek.pow.wasm_missing', { path: config.DEEPSEEK.wasmPath });
  }

  // Universal Event Bus — register handlers before HTTP boot
  const commandRunner = new (require('../../../packages/core/src/termux-server/services/CommandRunner').CommandRunner)();
  registerTermuxHandler(commandRunner);
  registerChatHandler();
  registerChatIntentRouter();
  registerMysticHandler(mysticRealm);
  registerGodModeHandler(godMode);
  registerWorkspaceHandler();
  registerResultHandlers();
  log.info('ueb.boot.ready', { handlers: ['termuxHandler', 'chatHandler', 'chatIntentRouter', 'mysticHandler', 'godmodeHandler', 'workspaceHandler', 'resultHandlers'] });

  // Bridge (8790)
  const bridgeServer = new TermuxBridgeServer({
    ledger,
    projects,
    tasks,
    agents,
    goals,
    offers,
    systemPower,
    godMode,
    mysticRealm,
    ide,
    deepseek,
  });
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
