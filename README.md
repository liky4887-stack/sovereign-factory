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

## Operational scripts (Termux)

These live in `~/` (outside the repo) and manage the runtime:

| Script | Purpose |
|---|---|
| `~/start-factory.sh` | Detached backend launcher; loads credentials from `~/cookies/deepseek-creds.json` |
| `~/stop-factory.sh` | Clean backend stop |
| `~/watchdog.sh` | 60 s health poll; auto-restarts backend on failure with exponential backoff |
| `~/start-watchdog.sh` | Detached watchdog launcher |
| `~/stop-watchdog.sh` | Clean watchdog stop |
| `~/rotate-logs.sh` | Truncates backend.log / watchdog.log when > 5 MB |
| `~/start-rotator.sh` | Runs rotate-logs every 15 min |
| `~/stop-rotator.sh` | Clean rotator stop |
| `~/.termux/boot/00-sovereign.sh` | Termux:Boot hook - starts backend, watchdog, rotator 15 s after device boot (requires Termux:Boot app from F-Droid) |

## Chat slash commands

The Chat tab in the frontend exposes an orchestrator shell:

- `/run <cmd> [args]` - execute allowlisted commands via `CommandRunner`
- `/ls [path]` - list a directory inside the allowlist
- `/read <path>` - read a file (5 MB cap)
- `/write <path> <content>` - write a file (mode 0600)
- `/manifest <intent>` - run `MysticRealmService.manifest()`
- `/storm <target> [ms]` - run `GodModeService.runChaos()`
- `/help` - command list

Free-form text routes to DeepSeek unchanged. Every slash command flows through
the Universal Event Bus and is visible in the Events panel with a shared
correlation ID.
