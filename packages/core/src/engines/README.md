# Engines — two meanings, one directory

This directory holds two different kinds of "engine." Only the first is live.

## Live — LLM providers (5 files)

Registered in `apps/backend/src/index.ts`, mounted at `/engines` via
`http/EnginesRouter.ts`, exercised by frontend `engineChat` / `twinChat`.

| File | Role |
|---|---|
| `LlmEngine.ts` | Provider interface. Every LLM engine implements this. |
| `EngineRegistry.ts` | Map of `engineId → LlmEngine`. Populated at boot. |
| `TwinOrchestrator.ts` | Multi-engine fan-out with 4 arbitration policies. |
| `adapters/DeepSeekEngineAdapter.ts` | Wraps `DeepSeekService` behind `LlmEngine`. |
| `http/EnginesRouter.ts` | Mounts `/engines`, `/engines/:id/chat`, `/engines/twin/chat`. |

## Dead — feature modules (46 files, 12 subdirs)

No importers. Not compiled by `apps/backend/tsconfig.json`. Not reachable
from any live route. Kept for reference; may be resurrected or removed in
a future phase.

| Subdir | Files | Purpose (unused) |
|---|---|---|
| `compliance/` | 1 | Prompt compliance adapter |
| `core/` | 8 | Source mapper, omega tiers, manifestation engine |
| `evolution/` | 1 | Self-evolution loop |
| `fusion/` | 6 | Knowledge graph reasoning |
| `modal/` | 1 | Modal router |
| `persona/` | 6 | Multi-persona panel + evaluator |
| `sales/` | 9 | Sales offer frameworks |
| `scout/` | 6 | GitHub pattern scout |
| `selfHealing/` | 1 | Self-healing loop |
| `shared/types/` | 1 | Error types |
| `sim/` | 5 | Plan simulator + shadow runner |
| `types/` | 1 | Type barrel |

## Why this README exists

Without it, a reader opening `engines/LlmEngine.ts` and
`engines/sales/frameworks/MoneyModel.ts` in the same directory has no
signal which is which. Same word, two meanings — see the frontend
`src/README.md` for the parallel case.
