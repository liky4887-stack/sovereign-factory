# sovereign-factory — BACKEND

The brain. Orchestration, engines, Truth Ledger, Termux bridge, HTTP API.

## What's here

- `packages/core/`   — bridge server (8790), orchestrator (8791), Truth Ledger,
                       domains: projects, tasks, agents, goals, offers
- `packages/bridge/` — fusion, persona, scout, sim, sales, evolution, selfHealing
- `packages/shared/` — cross-cutting types
- `apps/backend/`    — unified entrypoint
- `apps/bridge/`     — V1 bridge: cookie vault, DeepSeek client, SSE router
- `legacy/`          — pre-merge snapshots (read-only)

## Frontend lives elsewhere

Console UI: **https://github.com/liky4887-stack/ai-factory-control-console**

The frontend is a separate Expo app that talks to this backend over HTTP
on port **8790**. No frontend code lives in this repo.

## Run

    npm install
    cd apps/backend && npm run build && cd ../..

    node apps/backend/dist/apps/backend/src/index.js

One-shot script: `~/start-factory.sh`

## Endpoints

- `GET  /health`                    — service health
- `GET  /projects`                  — list projects
- `POST /projects`                  — create project
- `GET  /tasks`                     — list tasks
- `PATCH /tasks/:id`                — update task status
- `GET  /agents`                    — list agents
- `PATCH /agents/:id`               — pause/resume
- `GET  /goals`                     — list goals
- `GET  /offers`                    — list offers
- `POST /executeCommand`            — run an allowlisted shell command
- `POST /file/read|write|list`      — file operations
- `GET  /ledger/query`              — read the hash-chained audit trail
