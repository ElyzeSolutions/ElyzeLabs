# Startup Runbook

## Preconditions
- Node 22+, pnpm 10+, Docker (optional).
- Config file present at `config/control-plane.yaml`.

## Local Startup
1. `pnpm install`
2. `pnpm doctor:config`
3. `pnpm dev`
4. Optional split frontend dev with Vite HMR:
   - `pnpm dev:split`
   - or run `pnpm dev:dashboard` separately while `pnpm dev:gateway` is already running
   - open `http://127.0.0.1:4173` for live frontend changes; Vite proxies `/api` to `http://127.0.0.1:8788`
5. Built-bundle mode without HMR:
   - `pnpm dev:gateway-only` or `pnpm start`
   - these modes serve `dashboard/dist` from the gateway on `http://127.0.0.1:8788`
   - both commands rebuild the dashboard first and will fail if the frontend has TypeScript or build errors
6. Optional vault bootstrap/unlock:
   - `pnpm vault:keygen`
   - `pnpm vault:bootstrap -- --material <master-material>`
   - `pnpm vault:unlock -- --material <master-material>`
7. Vault-first secret naming (no explicit env pointer required):
   - Telegram token: `telegram.bot_token`
   - Telegram default fallback chat id: `telegram.default_chat_id`
   - Telegram default fallback topic id (optional): `telegram.default_topic_id`
   - Voyage embedding key: `providers.voyage_api_key`
   - OpenRouter key: `providers.openrouter_api_key`
   - OpenAI key: `providers.openai_api_key`
   - Anthropic key: `providers.anthropic_api_key`
   - Google key: `providers.google_api_key`
   - Runtime behavior: outbound delivery always targets the originating Telegram chat first;
     default chat/topic values are only used as fallback when the session chat is missing/stale.
8. Optional LLM routing policy setup:
   - `pnpm llm:config show`
   - `pnpm llm:config primary codex openrouter/free`
   - `pnpm llm:config fallback codex "gemini:gemini-3-flash-preview,process:openrouter/minimax/minimax-m2.5"`
9. Optional agent execution-mode setup (LLM-first vs persistent harness):
   - `pnpm agent:config list`
   - `pnpm agent:config set-mode ceo-default on_demand`
   - `pnpm agent:config set-model ceo-default openrouter/openai/gpt-5-mini`
   - `pnpm agent:config set-mode software-engineer persistent_harness`
   - `pnpm agent:config start-harness software-engineer`

## Success Criteria
- `GET /health` returns `{ ok: true, status: "ok" }`
- `GET /api/health/readiness` returns `tier` in `ready|degraded`
- `GET /api/llm/limits` returns active policy object
- `GET /api/llm/limits` onboarding section reports provider keys required by the active routing policy
- `GET /api/llm/costs` returns usage/budget telemetry window
- Dashboard route `/` renders and receives SSE updates.

## Docker Mount Model
- Structured state (sessions/runs/queue/memory index) is stored in SQLite at `/var/lib/ops/state/control-plane.db`.
- Workspace files (including `MEMORY.md` and daily memory logs) are stored under `/var/lib/ops/workspaces/<session-id>/` when `runtime.workspaceStrategy=session`.
- Skills can be mounted from `/var/lib/ops/skills`; catalog entries persist in SQLite (`/var/lib/ops/state/control-plane.db`).
- Global `npx skills -g` installs and system skills can be mounted at `/home/node/.agents/skills`.
- Local/non-Docker default skill discovery includes `.ops/skills` so installed skills persist under workspace state.
- Local/non-Docker default skill discovery also includes `~/.agents/skills`.
- Default compose uses two named volumes and image-baked `config/`; public baseline skills are
  seeded into `/var/lib/ops/skills`, and system skills persist at `/home/node/.agents/skills`.
- For host workspace bind, use:
  - `docker compose -f docker-compose.yml -f docker-compose.workspace-bind.yml up -d`
  - with `OPS_HOST_WORKSPACE=/absolute/path/to/workspace-root`.
- On Colima, if bind mounts fail with `operation not permitted` or empty mounts:
  - run `colima start --edit`
  - ensure the project path is under a configured `mounts` entry (for example `/Users/<you>`, writable)
  - run `colima restart`
  - reference: Colima FAQ `Issue with Docker bind mount showing empty` and default `mounts` template

For full skills/tools behavior (formats, install roots, mount paths, creation flow), see:
- `docs/runbooks/skills-and-tools.md`

## Failure Recovery
- Config failure: run `pnpm doctor:config -- --config <path>`.
- Schema mismatch: ensure migrations include `007_backlog_orchestration_and_github_delivery` and restart.
- Queue halted: verify gateway process includes queue worker startup logs.
- Vault locked + secret references in config: unlock via API (`POST /api/vault/unlock`) or `pnpm vault:unlock -- --material <master-material>`.
