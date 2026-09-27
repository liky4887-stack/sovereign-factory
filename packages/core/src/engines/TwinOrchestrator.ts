// Twin-engine dispatcher. Sends the same request to one or more
// engines in parallel, tags every response with its origin, and
// never lets one engine's failure affect another's.
//
// Isolation guarantee: if Qwen is down, a DeepSeek call still returns
// successfully. If both are up, both results come back with metadata.
import { EngineRegistry } from './EngineRegistry';
import { LlmEngine, LlmCallOptions, LlmResponse, ENGINE_IDS } from './LlmEngine';
import { log } from '../shared/logger';

export interface TaggedResponse {
  engineId: string;
  engineLabel: string;
  ok: boolean;
  response?: LlmResponse;
  error?: string;
  latencyMs: number;
  at: number;
}

export interface TwinCallResult {
  requested: string[];
  succeeded: string[];
  failed: string[];
  results: TaggedResponse[];
  at: number;
}

export type ArbitrationPolicy =
  | 'all'                    // return every engine's response
  | 'first-available'        // return the first engine that succeeds, in registry order
  | 'fastest'                // return whichever engine succeeds first
  | 'primary-with-fallback'; // prefer primary, fall back if it fails

export class TwinOrchestrator {
  constructor(
    private readonly registry: EngineRegistry,
    private readonly primaryEngineId: string = ENGINE_IDS.DEEPSEEK,
    private readonly policy: ArbitrationPolicy = 'all',
  ) {}

  /** Call a specific engine. Failure is captured, not thrown. */
  async callSingle(
    engineId: string,
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): Promise<TaggedResponse> {
    const engine = this.registry.get(engineId);
    const at = Date.now();

    if (!engine) {
      return {
        engineId,
        engineLabel: engineId,
        ok: false,
        error: 'engine not registered: ' + engineId,
        latencyMs: 0,
        at,
      };
    }

    if (!engine.hasCredentials()) {
      return {
        engineId,
        engineLabel: engine.label,
        ok: false,
        error: 'engine has no credentials configured',
        latencyMs: 0,
        at,
      };
    }

    const started = Date.now();
    try {
      const response = await engine.call(input, options);
      return {
        engineId,
        engineLabel: engine.label,
        ok: true,
        response,
        latencyMs: Date.now() - started,
        at,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('twin.engine.failed', { engineId, error: msg });
      return {
        engineId,
        engineLabel: engine.label,
        ok: false,
        error: msg,
        latencyMs: Date.now() - started,
        at,
      };
    }
  }

  /** Send the same input to every registered engine in parallel. */
  async callAll(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
    engineIds?: string[],
  ): Promise<TwinCallResult> {
    const targets = engineIds ?? this.registry.ids();
    const at = Date.now();

    const results = await Promise.all(
      targets.map((id) => this.callSingle(id, input, options)),
    );

    return {
      requested: targets,
      succeeded: results.filter((r) => r.ok).map((r) => r.engineId),
      failed: results.filter((r) => !r.ok).map((r) => r.engineId),
      results,
      at,
    };
  }

  /** Apply the configured arbitration policy to a multi-engine dispatch. */
  async callWithPolicy(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): Promise<TwinCallResult> {
    if (this.policy === 'all') {
      return this.callAll(input, options);
    }

    if (this.policy === 'primary-with-fallback') {
      const primary = await this.callSingle(this.primaryEngineId, input, options);
      if (primary.ok) {
        return {
          requested: [this.primaryEngineId],
          succeeded: [this.primaryEngineId],
          failed: [],
          results: [primary],
          at: Date.now(),
        };
      }
      const others = this.registry.ids().filter((id) => id !== this.primaryEngineId);
      if (others.length === 0) {
        return {
          requested: [this.primaryEngineId],
          succeeded: [],
          failed: [this.primaryEngineId],
          results: [primary],
          at: Date.now(),
        };
      }
      return this.callAll(input, options, others);
    }

    if (this.policy === 'first-available') {
      const engines = this.registry.available();
      if (engines.length === 0) {
        return {
          requested: [],
          succeeded: [],
          failed: [],
          results: [],
          at: Date.now(),
        };
      }
      const r = await this.callSingle(engines[0].id, input, options);
      return {
        requested: [engines[0].id],
        succeeded: r.ok ? [engines[0].id] : [],
        failed: r.ok ? [] : [engines[0].id],
        results: [r],
        at: Date.now(),
      };
    }

    if (this.policy === 'fastest') {
      const targets = this.registry.ids();
      const at = Date.now();
      return new Promise((resolve) => {
        const results: TaggedResponse[] = [];
        let settled = 0;
        let done = false;
        for (const id of targets) {
          this.callSingle(id, input, options).then((r) => {
            results.push(r);
            settled++;
            if (!done && r.ok) {
              done = true;
              resolve({
                requested: targets,
                succeeded: [r.engineId],
                failed: [],
                results: [r],
                at,
              });
            } else if (settled === targets.length && !done) {
              done = true;
              resolve({
                requested: targets,
                succeeded: [],
                failed: results.map((x) => x.engineId),
                results,
                at,
              });
            }
          });
        }
      });
    }

    // Fallback: treat unknown policy as 'all'
    return this.callAll(input, options);
  }

  getPrimaryEngineId(): string {
    return this.primaryEngineId;
  }

  getPolicy(): ArbitrationPolicy {
    return this.policy;
  }
}
