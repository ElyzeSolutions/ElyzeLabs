# Control Plane API Contract

All responses use envelope:

```json
{ "ok": true }
```

Error envelope:

```json
{ "ok": false, "error": "message", "details": {} }
```

## Core Endpoints

- `GET /health`
- `GET /api/health/readiness`
- `GET /api/capabilities`
- `GET /api/config/runtime` (requires auth)
- `PUT /api/config/runtime` (requires auth)
- `GET /api/housekeeping` (requires auth)
- `POST /api/housekeeping/run` (requires auth)
- `GET /api/sessions`
- `POST /api/sessions` (requires auth)
- `POST /api/sessions/:sessionId/link-code` (requires auth)
- `POST /api/sessions/:sessionId/delegate` (requires auth)
- `GET /api/sessions/:sessionId`
- `PATCH /api/sessions/:sessionId/preferences` (requires auth)
- `POST /api/sessions/:sessionId/switch-runtime` (requires auth)
- `GET /api/runs`
- `GET /api/runs/:runId`
- `POST /api/sessions/:sessionId/runs` (requires auth + `Idempotency-Key`)
- `POST /api/runs/:runId/abort` (requires auth)
- `GET /api/runs/:runId/timeline`
- `GET /api/runs/:runId/prompt-assembly`
- `GET /api/queue`
- `GET /api/messages?sessionId=...`

### Runtime Config Security Notes

- `GET /api/config/runtime` returns:
  - `config` with sensitive fields redacted as `__REDACTED__`
  - `sensitive` metadata keyed by path (for example `server.apiToken`) with `configured/source/redacted`
- `PUT /api/config/runtime` accepts a redacted payload and preserves existing secret values when a field remains `__REDACTED__`.
- Runtime config updates persist to SQLite (`runtime_config_state`) instead of mutating on-disk config files.
- Telegram config supports `channel.telegram.debugRawOutput`:
  - `false` (default): outbound responses are sanitized to final assistant text.
  - `true`: raw runtime output/log lines are preserved for debugging.

## Ingress + Security

- `POST /api/ingress/telegram` (pairing/allowlist/group mention policy)
- `POST /api/telegram/webhook` (same payload contract; used when `channel.telegram.useWebhook=true`)
- `GET /api/pairings`
- `POST /api/pairings/:channel/:senderId/approve`
- `POST /api/pairings/:channel/:senderId/revoke`
- `POST /api/security/elevated-check`
- `GET /api/security/token-status` (requires auth)

## Memory + Skills

- `GET /api/memory/search?agentId=...&query=...`
- `POST /api/memory/remember`
- `POST /api/memory/compact` (requires auth)
- `POST /api/memory/evaluate` (requires auth)
- `GET /api/trajectories/:runId`
- `POST /api/trajectories/:runId/project` (requires auth)
- `GET /api/context-graph/query?start=...&depth=2`
- `GET /api/tools`
- `PATCH /api/tools/:toolName` (requires auth)
- `GET /api/llm/limits`
- `PUT /api/llm/limits` (requires auth)
- `GET /api/llm/costs`
- `GET /api/llm/routing/effective`
- `GET /api/skills`
- `GET /api/skills/catalog`
- `POST /api/skills/catalog/entries/upsert` (requires auth)
- `POST /api/skills/catalog/entries/remove` (requires auth)
- `POST /api/skills/autodiscover` (requires auth)
- `POST /api/skills/install` (requires auth)
- `POST /api/skills/remove` (requires auth)
- `POST /api/skills/resync` (requires auth)
- `POST /api/skills/reload`
- `POST /api/skills/:skillName/invoke`
- `GET /api/agents/profiles`
- `POST /api/agents/profiles` (requires auth)
- `PATCH /api/agents/profiles/:agentId` (requires auth)
- `DELETE /api/agents/profiles/:agentId` (requires auth)
- `POST /api/agents/profiles/:agentId/reset-baseline` (requires auth)
- `POST /api/agents/profiles/:agentId/harness/start` (requires auth)
- `POST /api/agents/profiles/:agentId/harness/stop` (requires auth)
- `POST /api/agents/profiles/:agentId/sessions` (requires auth)
- `GET /api/onboarding/status` (requires auth)
- `POST /api/onboarding/ceo-baseline` (requires auth)
- `POST /api/onboarding/vault/bootstrap` (requires auth)
- `POST /api/onboarding/vault/unlock` (requires auth)
- `POST /api/onboarding/provider-keys/check` (requires auth)
- `POST /api/onboarding/smoke-run` (requires auth)

`GET /api/capabilities` includes runtime workspace strategy/root, memory settings,
skill catalog metadata, and `runtime.processAccess`:
- active shell env
- detected shell binaries (`bash`, `zsh`, `sh`, etc.)
- detected multiplexers (`tmux`, `screen`, `zellij`, `cmux`, `dmux`)

Skill catalog uses `SKILL.md` manifests and persists catalog entries in SQLite (`skill_catalog_entries`). Script execution parity is configured via frontmatter (for example `entry`, `scopes`, `requiresApproval`, `supportsDryRun`).

Agent profile payload now supports:
- `executionMode` (`on_demand` | `persistent_harness` | `dispatch_only`)
- `harnessRuntime` (`codex|claude|gemini|process|null`)
- `harnessAutoStart` (boolean)
- `harnessCommand` (optional custom executable)
- `harnessArgs` (optional arg list)
- `protectedDefault` (read-only policy flag for seeded profiles, e.g. `ceo-default`)
- `baselineVersion` (read-only recommended baseline metadata)

Protected default profile behavior:
- `ceo-default` is non-deletable/non-disableable by policy.
- use `POST /api/agents/profiles/:agentId/reset-baseline` to restore seeded defaults safely.

Onboarding API model:
- status: `not_started | in_progress | blocked | ready`
- step checkpoints: `ceo_baseline`, `vault`, `provider_keys`, `smoke_run`
- evidence persisted in SQLite (`onboarding_state`) for resumable setup.
- `POST /api/onboarding/ceo-baseline` accepts optional `companyName`, `ceoName`, `ceoTitle`, and `ceoSystemPrompt` to set CEO identity and prompt during onboarding.
- onboarding payloads expose `companyName`, derived `ceoAgentId` (for example `ceo-acme-labs`), and resolved CEO identity fields (`ceoName`, `ceoTitle`, `ceoSystemPrompt`) when available.

LLM limits payload supports:
- `providerCallBudgetDaily`
- `providerCallsPerMinute`
- `providerCostBudgetUsdDaily`
- `providerCostBudgetUsdMonthly`
- `modelCallBudgetDaily`
- `primaryModelByRuntime` (`codex|claude|gemini|process -> model|null`)
- `fallbackByRuntime` (`codex|claude|gemini|process -> [{ runtime, model? }]`)
- `localHarnessByRuntime` (`codex|claude|gemini|process -> boolean`)
- `orchestratorPrimaryModelByRuntime` (`codex|claude|gemini|process -> model|null`)
- `orchestratorFallbackByRuntime` (`codex|claude|gemini|process -> [{ runtime, model? }]`)
- `orchestratorLocalHarnessByRuntime` (`codex|claude|gemini|process -> boolean`)

Primary model note:
- Primary models are mandatory for all runtimes in both worker and orchestrator policies.

`GET /api/llm/limits` includes an `onboarding` block with key readiness (`openrouter/google`).
`PUT /api/llm/limits` requires credentials only for providers reachable by the active routing policy (for example when local-harness mode is enabled across runtimes, provider keys are not required).

`GET /api/llm/routing/effective` includes per runtime:
- `requestedModel`
- `primaryModel`
- `localHarness`
- `selected`
- budget/policy `checks`

Run execution prompt contract:
- Gateway prepends a machine-readable execution envelope to model-facing prompts:
  - opening marker: `<execution_context>`
  - closing marker: `</execution_context>`
- Envelope schema: `ops.execution-context.v2`
- Envelope includes selected route identity fields used for truthful model disclosure:
  - `route.runtime`
  - `route.model`
  - `route.provider`
- Envelope also includes session/agent/runtime diagnostics (policy checks, tool state, adapter command, timeout/workspace, and skill catalog snapshot) to reduce ambiguity in runtime self-reporting.

Prompt assembly snapshot contract:
- `GET /api/runs/:runId/prompt-assembly`
- 404 when run or snapshot does not exist.
- Success payload includes:
  - `snapshot.runId`
  - `snapshot.sessionId`
  - `snapshot.contextLimit`
  - `snapshot.totalEstimatedTokens`
  - `snapshot.overflowStrategy`
  - `snapshot.overflowed`
  - `snapshot.continuityCoverage`:
    - `transcriptMessagesSelected`
    - `transcriptTurnsSelected`
    - `memoryCandidatesSelected`
    - `unresolvedConstraintIncluded`
  - `snapshot.segments[]`
  - `snapshot.droppedSegments[]`
  - `snapshot.promptPreview`
  - `snapshot.createdAt`
  - `snapshot.updatedAt`

Continuity signal contract:
- `GET /api/continuity/signals?limit=<1..500>`
  - Returns latest `signals[]` with parsed `details` object.
- `POST /api/continuity/signals`
  - Body:
    - `summary` (required)
    - `runId` (optional)
    - `sessionId` (optional)
    - `source` (optional, defaults to `operator_feedback`)
    - `code` (optional, defaults to `operator_feedback`)
    - `severity` (optional; `low|medium|high|critical`, defaults to `medium`)
    - `details` (optional object)
  - Returns created `signal` (`201`).
- `POST /api/continuity/signals/:signalId/resolve`
  - Marks signal status as `resolved`.
  - Returns `404` when `signalId` is not found.

## Realtime

- `GET /api/events?since=0&limit=100`
- `GET /api/events/stream?since=0` (SSE with sequence IDs + heartbeat)
- `GET /api/office/presence`
- `GET /api/office/stream?since=0`

## BFF

- `GET /api/bff/cards`
- `GET /api/bff/board`
- `GET /api/bff/chats`
- `GET /api/bff/health-cards`

## Operations

- `GET /api/audit`
- `GET /api/metrics`
- `GET /api/remediation`
- `POST /api/remediation`
- `GET /api/remediation/signals`
- `POST /api/remediation/signals` (requires auth)
- `GET /api/remediation/plans`
- `POST /api/remediation/plans/:planId/approve` (requires auth)
- `POST /api/remediation/plans/:planId/execute` (requires auth)
- `GET /api/remediation/outcomes`
- `GET /api/continuity/signals`
- `POST /api/continuity/signals` (requires auth)
- `POST /api/continuity/signals/:signalId/resolve` (requires auth)
- `GET /api/vault/status`
- `POST /api/vault/reset-empty` (requires auth + approved flag; only when no secrets exist)
- `POST /api/vault/bootstrap` (requires auth)
- `POST /api/vault/unlock` (requires auth)
- `POST /api/vault/lock` (requires auth)
- `GET /api/vault/secrets`
- `PUT /api/vault/secrets/:name` (requires auth)
- `POST /api/vault/secrets/:name/rotate` (requires auth)
- `DELETE /api/vault/secrets/:name` (requires auth + approved flag)
- `POST /api/vault/rotate-master-key` (requires auth + approved flag)
- `GET /api/backup/export`

## Authentication

Side-effect routes require either:
- `Authorization: Bearer <token>`
- or `x-api-token: <token>`

Telegram ingress routes are exempt to allow bot webhook/polling delivery.
Telegram control commands include:
- `/runtime <codex|claude|gemini|process>`
- `/model <model|default>`
- `/agent` or `/agent show`
- `/agent mode <on_demand|persistent_harness>`
- `/agent harness <codex|claude|gemini|process>`
- `/agent start-harness`
- `/agent stop-harness`
- `/llm show`
- `/llm primary <runtime> <model|default>`
- `/llm fallback <runtime> <runtime:model,runtime:model,...>`

## Idempotency

`POST /api/sessions/:sessionId/runs` requires `Idempotency-Key`.
Same key returns the same run reference.

`POST /api/sessions/:sessionId/runs` accepts optional:
- `runtime`
- `model`
- `source` (`dashboard`, `api`, etc.)

`POST /api/sessions/:sessionId/delegate` accepts:
- `targetAgentId` (required)
- `prompt` (required)
- `runtime` (optional)
- `model` (optional)
- `mode` (optional, default `handoff`)

`POST /api/sessions` accepts optional:
- `label`
- `agentId`
- `runtime`
- `model`

`POST /api/sessions/:sessionId/link-code` accepts optional:
- `ttlSec` (clamped to 60..3600, default 600)
