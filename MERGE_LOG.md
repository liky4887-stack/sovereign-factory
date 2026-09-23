# Sovereign Factory — Merge Log

Timestamp: 2026-09-23
Author: Chief Architect (AI)

## Canonical decisions (final)

| # | Decision | Canonical source | Legacy |
|---|----------|------------------|--------|
| 1 | Truth Ledger | `packages/core/src/ledger/` (from sovereign-core) | `legacy/truth-ledger-bridge/TruthLedger.ts`, `legacy/v1-bridge-truthLedger/truthLedger.js` |
| 2 | Orchestrator | `packages/core/src/orchestrator/` (from sovereign-core) | `legacy/sovereign-orchestrator/SovereignOrchestrator.ts`, `legacy/bridge-20260923/bridge/orchestrator/` |
| 3 | DeepSeek client | `apps/bridge/src/deepseek/deepseekClient.js` (ported from `~/archive/bridge.20260923/lib/deepseekClient.js`, 48 lines, unchanged) | — |
| 4 | Monorepo | `~/sovereign-factory/` (new, fresh git repo) | previous separate repos left in place |

## Operations performed

### Backups (non-destructive)
- `~/sovereign-core` → `legacy/bridge-20260923/sovereign-core/`
- `~/sovereign-bridge` → `legacy/bridge-20260923/sovereign-bridge/`
- `~/bridge` → `legacy/bridge-20260923/bridge/`
- `~/ai_factory/app` → `legacy/bridge-20260923/app/`
- `~/ai_factory/control-console` → `legacy/bridge-20260923/control-console/`

### Copies (originals untouched)
- `~/sovereign-core/src/*` → `packages/core/src/*` (excluding dist)
- `~/sovereign-bridge/src/{fusion,persona,scout,sim,sales,evolution,selfHealing,compliance,modal}` → `packages/core/src/engines/*`
- `~/sovereign-bridge/src/core` → `packages/core/src/engines/core` (renamed from bridge-core)
- `~/sovereign-bridge/src/shared` → `packages/core/src/engines/shared`
- `~/sovereign-bridge/src/types` → `packages/core/src/engines/types`
- `~/sovereign-bridge/src/routes/*` → `apps/backend/src/routes/*`
- `~/bridge/*` (excluding node_modules, .git) → `apps/bridge/*`
- `~/ai_factory/app/*` → `apps/frontend-mobile/*`
- `~/ai_factory/control-console/*` → `apps/frontend/*`
- `~/ai_factory/shared/*` → `packages/shared/*`

### Legacy moves
- `sovereign-bridge/src/ledger/TruthLedger.ts` → `legacy/truth-ledger-bridge/TruthLedger.ts`
- `sovereign-bridge/src/orchestrator/SovereignOrchestrator.ts` → `legacy/sovereign-orchestrator/SovereignOrchestrator.ts`
- `apps/bridge/src/truthLedger.js` → `legacy/v1-bridge-truthLedger/truthLedger.js`
- DeepSeek client copied from archive: `~/archive/bridge.20260923/lib/deepseekClient.js` → `apps/bridge/src/deepseek/deepseekClient.js`

## Wired now
- **Truth Ledger** — canonical, mounted by `TermuxBridgeServer` at `packages/core/src/termux-server/`
- **Orchestrator** — canonical, mounted as `OrchestratorHttpServer` on port 8791
- **DeepSeek client** — ported as-is, not yet invoked from any runtime path

## Pending (documented, not yet done)
- Engines (fusion/persona/scout/sim/sales) copied but not mounted in `apps/backend/src/index.ts`. Wiring blocked on verifying that all engine-internal relative imports resolve in the new location.
- Unified startup script under `scripts/`
- Cross-package type imports between `packages/core` and `packages/shared`
- `apps/bridge/src/server.js` not yet booted alongside backend

## Nothing deleted
No file from any original project has been removed from its source location. All changes are copies into the new monorepo.
