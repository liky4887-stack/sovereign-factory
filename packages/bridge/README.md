# Sovereign Bridge

A self-healing, self-evolving AI orchestration layer that runs entirely on
Android via Termux. Backend only — no frontend code lives in this repo.

## Design principles

- **P1** Do not corrupt or silently alter the Truth Ledger.
- **P2** Preserve owner intent as faithfully as possible, within real constraints.
- **P3** Prefer transparency over hidden behavior.
- **P4** Separate concerns between orchestration, execution, storage, and UI.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | /health | Server status, ledger verification, evolution version |
| POST | /task | Run a task through the orchestrator |
| GET  | /ledger | Recent Truth Ledger entries |
| POST | /omega/execute | Full-stack pipeline: manifest -> map -> compliance -> orchestrate |
| GET  | /evolution/proposals | Propose a config update from recent ledger observations |
| POST | /evolution/apply | Apply a proposed config (manual approval) |
| POST | /simulation/run | Forward a scene spec to an external simulation engine |

## Layers

1. Bridge server - Express HTTP surface on 127.0.0.1:8787.
2. Self-Healing Loop - periodic ledger scan, auto-recovery, config tuning.
3. Sovereign Orchestrator - single entry point for all tasks.
4. Compliance Override - approves, denies, or amends intent with an explicit reason.
5. Self-Evolution Engine - versioned config with rollback history.
6. Modal Sync - dispatches by modality (text, vision_3d, extensible).
7. Simulation Hub - returns render-plan JSON; external engines consume it.
8. Truth Ledger - SHA-256 hash-chained JSONL, tamper-evident.
9. Absolute Source + SourceMapper + ManifestationEngine - principles to plan.

## Run

    npm install
    npm run build
    npm start

Server listens on http://127.0.0.1:8787.

## Environment

- PORT (default 8787)
- HOST (default 127.0.0.1)
- SELF_HEAL_INTERVAL_MS (default 60000)
- AI_API_KEY (optional - text handler returns a stub without it)
- AI_BASE_URL (optional - OpenAI-compatible endpoint)
- SIM_API_URL (optional - external simulation engine HTTP endpoint)
- LOG_LEVEL (debug | info | warn | error; default info)
