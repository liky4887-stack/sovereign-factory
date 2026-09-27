// Central registry of LLM engines. Populated at boot; queried by
// TwinOrchestrator and HTTP routers. No state beyond the map.
import { LlmEngine } from './LlmEngine';

export class EngineRegistry {
  private readonly engines = new Map<string, LlmEngine>();

  register(engine: LlmEngine): void {
    if (this.engines.has(engine.id)) {
      throw new Error('engine already registered: ' + engine.id);
    }
    this.engines.set(engine.id, engine);
  }

  get(id: string): LlmEngine | undefined {
    return this.engines.get(id);
  }

  list(): LlmEngine[] {
    return Array.from(this.engines.values());
  }

  ids(): string[] {
    return Array.from(this.engines.keys());
  }

  /** Engines with credentials configured and ready to serve. */
  available(): LlmEngine[] {
    return this.list().filter((e) => e.hasCredentials());
  }

  /** Engines without credentials — listed but not usable. */
  unavailable(): LlmEngine[] {
    return this.list().filter((e) => !e.hasCredentials());
  }
}
