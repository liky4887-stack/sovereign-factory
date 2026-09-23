/**
 * SelfEvolutionEngine — versioned config store.
 * Cites P2 (preserve intent) and P3 (transparency).
 */

import * as fs from 'fs';
import * as path from 'path';
import { EvolutionConfig } from '../types';
import { ledger } from '../ledger/TruthLedger';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'evolution-config.json');
const HISTORY_PATH = path.join(DATA_DIR, 'evolution-history.jsonl');

function defaultConfig(): EvolutionConfig {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    promptTemplates: {
      default: 'You are a helpful assistant. Respond to: {{prompt}}',
      concise: 'Answer briefly and directly: {{prompt}}',
    },
    routingStrategies: ['default'],
    notes: ['Initial config created by SelfEvolutionEngine'],
  };
}

export class SelfEvolutionEngine {
  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig(), null, 2));
    }
    if (!fs.existsSync(HISTORY_PATH)) {
      fs.writeFileSync(HISTORY_PATH, '');
    }
  }

  getCurrentConfig(): EvolutionConfig {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as EvolutionConfig;
  }

  proposeUpdate(observations: {
    recentErrorCount: number;
    averageTaskLatencyMs: number;
  }): EvolutionConfig {
    const current = this.getCurrentConfig();
    const next: EvolutionConfig = {
      ...current,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      promptTemplates: { ...current.promptTemplates },
      routingStrategies: [...current.routingStrategies],
      notes: [...current.notes],
    };

    if (observations.recentErrorCount >= 3) {
      next.notes.push(
        'Elevated error rate (' + observations.recentErrorCount + ') — adding retry strategy.',
      );
      if (!next.routingStrategies.includes('retry_once')) {
        next.routingStrategies.push('retry_once');
      }
    }

    if (observations.averageTaskLatencyMs > 5000) {
      next.notes.push('High latency — enabling concise prompt template.');
      next.promptTemplates.default = next.promptTemplates.concise;
    }

    ledger.appendEntry({
      actor: 'selfEvolutionEngine',
      eventType: 'CONFIG_PROPOSED',
      payload: {
        fromVersion: current.version,
        toVersion: next.version,
        observations,
      },
    });

    return next;
  }

  applyUpdate(newConfig: EvolutionConfig): void {
    const current = this.getCurrentConfig();

    fs.appendFileSync(
      HISTORY_PATH,
      JSON.stringify({ ...current, supersededAt: new Date().toISOString() }) + '\n',
    );

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));

    ledger.appendEntry({
      actor: 'selfEvolutionEngine',
      eventType: 'CONFIG_UPDATE',
      payload: {
        fromVersion: current.version,
        toVersion: newConfig.version,
      },
    });
  }

  rollback(): EvolutionConfig | null {
    const lines = fs
      .readFileSync(HISTORY_PATH, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    const last = JSON.parse(lines[lines.length - 1]) as EvolutionConfig;
    const truncated = lines.slice(0, -1).join('\n') + (lines.length > 1 ? '\n' : '');
    fs.writeFileSync(HISTORY_PATH, truncated);

    const restored: EvolutionConfig = {
      ...last,
      version: last.version + 1,
      updatedAt: new Date().toISOString(),
      notes: [...last.notes, 'Restored by rollback'],
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(restored, null, 2));

    ledger.appendEntry({
      actor: 'selfEvolutionEngine',
      eventType: 'CONFIG_ROLLBACK',
      payload: { restoredVersion: restored.version },
    });

    return restored;
  }
}

export const evolution = new SelfEvolutionEngine();
