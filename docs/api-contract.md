# Control Plane API Contract

All responses use envelope:

```json
{ "ok": true }
```

Error envelope:

```json
{ "ok": false, "error": "message", "details": {} }
```

Generated route coverage lives in [docs/generated/api-route-inventory.md](generated/api-route-inventory.md). Run `pnpm api:inventory` after gateway route changes and `pnpm api:inventory:check` in verification. The current inventory reports 288 Fastify routes, with 288 explicitly documented here and 0 undocumented routes.

## Core Endpoints

- `GET /health`
- `GET /`
- `GET /*` (built dashboard SPA fallback; API/health paths are excluded)
- `GET /api/hello`
- `GET /api/openapi`
- `GET /api/docs`
- `GET /api/health/readiness`
- `GET /api/doctor`
- `POST /api/doctor/repairs/:repairId/run` (requires auth)
- `GET /api/capabilities`
- `GET /api/sandbox/policy` (requires auth)
- `GET /api/sandbox/policy/diff?profile=restricted` (requires auth)
- `POST /api/sandbox/policy/apply` (requires auth and `approved=true` when changing profile)
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

## Frontier + Certification

Frontier endpoints manage comparator evidence, governance state, release gates, portability, and remediation planning. They are authenticated control-plane APIs unless otherwise noted by gateway policy.

Contracts and governance:
- `GET /api/frontier/contracts`
- `GET /api/frontier/governance`
- `POST /api/frontier/governance/principals`
- `POST /api/frontier/governance/companies`
- `POST /api/frontier/governance/memberships`
- `POST /api/frontier/governance/grants`
- `POST /api/frontier/governance/invites`
- `POST /api/frontier/governance/invites/accept`
- `POST /api/frontier/governance/join-requests`
- `POST /api/frontier/governance/join-requests/:requestId/decision`
- `POST /api/frontier/governance/claims/challenge`
- `POST /api/frontier/governance/claims/complete`

Issue locks, portability, and adapters:
- `GET /api/frontier/issues/locks`
- `POST /api/frontier/issues/:issueId/wakeup`
- `POST /api/frontier/issues/:issueId/release`
- `POST /api/frontier/issues/repair`
- `GET /api/frontier/portability/export`
- `POST /api/frontier/portability/import/preview`
- `POST /api/frontier/portability/import/apply`
- `GET /api/frontier/adapters/contract`
- `GET /api/frontier/adapters/diagnostics`
- `GET /api/frontier/runs/:runId/events`
- `GET /api/frontier/runs/:runId/logs`

Deployment, scorecards, comparators, and release gates:
- `GET /api/frontier/deployment`
- `PUT /api/frontier/deployment`
- `POST /api/frontier/deployment/doctor`
- `GET /api/frontier/scorecard`
- `PUT /api/frontier/scorecard`
- `GET /api/frontier/comparator/run`
- `POST /api/frontier/comparator/run`
- `GET /api/frontier/comparator/closure`
- `POST /api/frontier/comparator/closure`
- `POST /api/frontier/benchmark/delta`
- `POST /api/frontier/critic`
- `POST /api/frontier/remediation/plans`
- `GET /api/frontier/release/gate`
- `POST /api/frontier/certification/report`

Certification reports:
- `GET /api/certification/runtime`
- `POST /api/certification/runtime/report`
- `GET /api/certification/continuity`
- `POST /api/certification/continuity/report`
- `GET /api/certification/architecture`
- `POST /api/certification/architecture/report`

Certification report payloads persist into runtime state snapshots. Report bodies accept `status`, `matrix`, `comparators`, `followUpTasks`, `releaseGate`, `summary`, and evidence artifacts according to the specific certification lane (`runtime`, `continuity`, or `architecture`). Frontier release gates remain blocked while required comparator/certification evidence is missing or failed.

## Detailed Control Surfaces

Housekeeping, validation, startup, watchdog, and local runtime inventory:
- `PATCH /api/housekeeping/retention`
- `POST /api/housekeeping/dead-letter/purge`
- `POST /api/housekeeping/artifacts/cleanup`
- `GET /api/config/validate`
- `POST /api/startup-healer/run`
- `GET /api/startup-healer/audit`
- `GET /api/watchdog/config`
- `PUT /api/watchdog/config`
- `GET /api/watchdog/status`
- `GET /api/watchdog/history`
- `POST /api/watchdog/simulate`
- `POST /api/local/sessions/scan`
- `GET /api/local/sessions`
- `GET /api/local/sessions/:sessionId`
- `GET /api/local/stats`
- `GET /api/cron/status`

RBAC and principal inspection:
- `GET /api/auth/principal`
- `GET /api/rbac/policy`
- `PUT /api/rbac/policy`

Schedule lifecycle:
- `GET /api/schedules/:scheduleId`
- `GET /api/schedules/:scheduleId/history`
- `POST /api/schedules`
- `PATCH /api/schedules/:scheduleId`
- `DELETE /api/schedules/:scheduleId`
- `POST /api/schedules/request`
- `POST /api/schedules/:scheduleId/pause`
- `POST /api/schedules/:scheduleId/resume`
- `POST /api/schedules/:scheduleId/run`

Session continuation, collaboration, and browser auth binding:
- `POST /api/sessions/bulk-delete`
- `POST /api/sessions/:sessionId/browser-auth-profile`
- `GET /api/sessions/:sessionId/continuity`
- `POST /api/sessions/:sessionId/compact`
- `GET /api/sessions/:sessionId/collaboration/targets`
- `GET /api/sessions/:sessionId/collaboration/history`
- `POST /api/sessions/:sessionId/collaboration/route`
- `POST /api/sessions/:sessionId/collaboration/send`

Run diagnostics, terminals, steering, and resume:
- `GET /api/runs/:runId/liveness`
- `GET /api/runs/:runId/watchdog`
- `GET /api/runs/:runId/execution-contract`
- `POST /api/runs/:runId/control-actions`
- `GET /api/runs/:runId/terminal`
- `GET /api/runs/:runId/terminal/stream`
- `POST /api/runs/:runId/steer`
- `POST /api/runs/:runId/resume`

Backlog, delivery, orchestration, and GitHub issue linkage:
- `GET /api/backlog/contracts`
- `GET /api/backlog`
- `GET /api/backlog/board`
- `POST /api/backlog/project-intake`
- `POST /api/backlog/items`
- `GET /api/backlog/items/:itemId`
- `PATCH /api/backlog/items/:itemId`
- `DELETE /api/backlog/items/:itemId`
- `POST /api/backlog/items/:itemId/transition`
- `PUT /api/backlog/items/:itemId/dependencies`
- `PUT /api/backlog/items/:itemId/delivery`
- `POST /api/backlog/items/:itemId/delivery/reconcile`
- `GET /api/backlog/items/:itemId/delivery/detail`
- `POST /api/backlog/items/:itemId/delivery/repair`
- `POST /api/backlog/items/:itemId/delivery/publish`
- `GET /api/backlog/items/:itemId/issues`
- `POST /api/backlog/items/:itemId/issues/sync`
- `GET /api/backlog/orchestration`
- `GET /api/backlog/orchestration/decisions`
- `PUT /api/backlog/orchestration`
- `POST /api/backlog/orchestration/tick`
- `POST /api/backlog/orchestration/override`
- `POST /api/backlog/cleanup`
- `GET /api/delivery-groups`
- `GET /api/delivery-groups/:groupId`
- `GET /api/delivery-groups/:groupId/status`
- `POST /api/delivery-groups`
- `PATCH /api/delivery-groups/:groupId`
- `POST /api/delivery-groups/:groupId/publish`

GitHub repository and webhook operations:
- `GET /api/github/issues/config`
- `PUT /api/github/issues/config`
- `GET /api/github/repos`
- `POST /api/github/repos`
- `PATCH /api/github/repos/:repoConnectionId`
- `POST /api/github/repos/:repoConnectionId/sync`
- `POST /api/github/repos/:repoConnectionId/reconcile`
- `POST /api/github/webhooks`
- `GET /api/github/webhooks/events`
- `POST /api/github/webhooks/replay`

Browser operations, profiles, credentials, history, and artifacts:
- `GET /api/browser/status`
- `GET /api/browser/release-gate`
- `POST /api/browser/policy/diff`
- `POST /api/browser/policy/apply`
- `PUT /api/browser/config`
- `GET /api/browser/doctor`
- `POST /api/browser/cookie-jars/import`
- `POST /api/browser/header-profiles/upsert`
- `POST /api/browser/proxy-profiles/upsert`
- `POST /api/browser/storage-states/upsert`
- `POST /api/browser/login-capture/start`
- `POST /api/browser/connect-account`
- `POST /api/browser/interactive/run`
- `POST /api/browser/interactive/sessions`
- `POST /api/browser/interactive/sessions/:liveSessionId/actions`
- `DELETE /api/browser/interactive/sessions/:liveSessionId`
- `POST /api/browser/session-profiles/:sessionProfileId/enable`
- `POST /api/browser/session-profiles/:sessionProfileId/disable`
- `POST /api/browser/session-profiles/:sessionProfileId/revoke`
- `DELETE /api/browser/session-profiles/:sessionProfileId`
- `POST /api/browser/cookie-jars/:cookieJarId/revoke`
- `POST /api/browser/header-profiles/:profileId/revoke`
- `POST /api/browser/proxy-profiles/:profileId/revoke`
- `POST /api/browser/storage-states/:storageStateId/revoke`
- `POST /api/browser/test`
- `GET /api/browser/history`
- `GET /api/browser/history/:runId`
- `GET /api/browser/artifacts/:handle`

Interactive browser action payloads support `open`, `read`, `click`, `type`, `upload`, `download`, `scroll`, `keypress`, `wait`, `screenshot`, and `pdf`. `upload` accepts `selector` plus `filePath` or `filePaths`; `download` accepts `selector` or `url` and returns an artifact; `scroll` accepts optional `selector`, `deltaX`, and `deltaY`; `keypress` accepts `key` plus an optional `selector` to focus first.
Selector-based actions resolve targets through the main document, open shadow roots, and same-origin frames.

Self-improvement and agent operations:
- `GET /api/improvement/learnings`
- `GET /api/improvement/proposals`
- `POST /api/improvement/cycle/run`
- `PATCH /api/improvement/agents/:agentId`
- `POST /api/improvement/proposals/:proposalId/approve`
- `POST /api/improvement/proposals/:proposalId/reject`
- `POST /api/agents/profiles/:agentId/clear-history`
- `POST /api/agents/profiles/:agentId/turbo-coding`

Provider checks, memory embedding, skill contracts, bootstrap, and Telegram menu sync:
- `POST /api/onboarding/provider-keys/live-check`
- `GET /api/memory/embedding/status`
- `POST /api/skills/runtime-contracts/upsert`
- `POST /api/bootstrap/vendor`
- `POST /api/telegram/commands/sync`

### Runtime Config Security Notes

- `GET /api/config/runtime` returns:
  - `config` with sensitive fields redacted as `__REDACTED__`
  - `sensitive` metadata keyed by path (for example `server.apiToken`) with `configured/source/redacted`
- `PUT /api/config/runtime` accepts a redacted payload and preserves existing secret values when a field remains `__REDACTED__`.
- Runtime config updates persist to SQLite (`runtime_config_state`) instead of mutating on-disk config files.
- `GET /api/capabilities` includes `channel.registry.schema=ops.channel-registry.v1`, registry-backed `channel.registry.adapters[]` entries with lifecycle/runtime status, and compatibility `channel.adapters[]` entries with `ops.channel-adapter-contract.v1` so channel routing, pairing, delivery, and audit support can be inspected before new channel backends are added.
- Telegram config supports `channel.telegram.debugRawOutput`:
  - `false` (default): outbound responses are sanitized to final assistant text.
  - `true`: raw runtime output/log lines are preserved for debugging.

## Ingress + Security

- `POST /api/ingress/telegram` (pairing/allowlist/group mention policy)
- `POST /api/telegram/webhook` (same payload contract; used when `channel.telegram.useWebhook=true`)
- `POST /api/telegram/smoke-test` (requires auth; probes Telegram `getMe` and optionally sends a diagnostic `sendMessage`)
- `GET /api/pairings`
- `POST /api/pairings/:channel/:senderId/approve`
- `POST /api/pairings/:channel/:senderId/revoke`
- `POST /api/security/elevated-check`
- `GET /api/security/token-status` (requires auth)

Telegram smoke-test payload:
- Optional `chatId`/`chat_id` and `topicId`/`message_thread_id`; when omitted, the endpoint uses configured `telegram.default_chat_id` and `telegram.default_topic_id`.
- Optional `sendMessage`/`send_message`; defaults to `true`, but delivery degrades to `missing` when no target chat exists.
- Response `smoke.schema=ops.telegram-smoke-test.v1` includes redacted bot identity, delivery status, target source, latency, and overall status (`ok|degraded|failed`) without exposing the bot token.

## Memory + Skills

- `GET /api/memory/search?agentId=...&query=...`
- `POST /api/memory/remember`
  - Durable writes are evaluated by `ops.memory-write-governance.v1` before markdown, daily, or structured persistence.
  - Rejected prompt-control or credential-like writes return `422` with `details.policy`.
- `GET /api/memory/auto-remember` exposes auto-remember policy counters and `writeGovernance.telemetry`.
- `GET /api/memory/scopes` exposes memory scope contracts and durable write governance telemetry.
- `POST /api/memory/compact` (requires auth)
- `POST /api/memory/evaluate` (requires auth)
- `GET /api/trajectories/:runId`
- `POST /api/trajectories/:runId/project` (requires auth)
- `GET /api/context-graph/query?start=...&depth=2`
- `GET /api/tools`
- `PATCH /api/tools/:toolName` (requires auth)
- `GET /api/llm/limits`
- `PUT /api/llm/limits` (requires auth)
- `GET /api/llm/auth-profiles`
- `PUT /api/llm/auth-profiles/:profileId` (requires auth)
- `GET /api/llm/costs`
- `GET /api/llm/routing/effective`
- `GET /api/skills`
- `GET /api/skills/lifecycle`
- `GET /api/skills/release-gate`
- `POST /api/skills/release-gate/evaluate` (requires auth)
- `PUT /api/skills/:skillName/lifecycle` (requires auth)
- `POST /api/skills/curator/run` (requires auth)
- `GET /api/skills/catalog`
- `POST /api/skills/catalog/entries/upsert` (requires auth)
- `POST /api/skills/catalog/entries/remove` (requires auth)
- `POST /api/skills/autodiscover` (requires auth)
- `POST /api/skills/install` (requires auth)
- `POST /api/skills/remove` (requires auth)
- `POST /api/skills/resync` (requires auth)
- `POST /api/skills/reload`
- `POST /api/skills/:skillName/invoke`
- `GET /api/schedules`
- `GET /api/schedules/guardrails`
- `POST /api/schedules/:scheduleId/guardrails/apply` (requires auth)
- `GET /api/browser/session-vault` (requires auth)
- `POST /api/browser/policy/diff` (requires auth)
- `POST /api/browser/policy/apply` (requires auth)
- `POST /api/browser/managed-profiles/ensure` (requires auth)
- `POST /api/browser/session-profiles/upsert` (requires auth)
- `POST /api/browser/session-profiles/:sessionProfileId/verify` (requires auth)
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
`GET /api/skills/release-gate` evaluates curator proposals, lifecycle review queue, duplicate/command conflicts, and cron denylist posture. `POST /api/skills/release-gate/evaluate` persists the release-gate snapshot in `skills.release_gate.v1` and audit history.

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

Schedule guardrails:
- `ScheduleRow.guardrails` exposes `status`, check details, recommendations, and last delivery audit.
- Schedule completion records delivery audit evidence into run history and `lastResult.delivery`.
- `POST /api/schedules/:scheduleId/guardrails/apply` reroutes artifact/silent schedules to visible delivery, stamps review metadata, sets an operator-review approval profile when missing, and pauses schedules with suspicious prompt-injection matches.

Doctor center:
- `GET /api/doctor` includes `prompt_governance` and `memory_governance` areas summarizing recent prompt assembly and memory write/retrieval posture.
- Prompt governance checks cover context-file guardrails, source authority, quoted transcript/memory evidence, suspicious prompt-control findings, cache-tier metadata, overflow, and dropped segments.
- Memory governance checks cover durable write-policy blocks, auto-remember write failures/blocks, and the active memory retrieval backend.
- Runtime execution metadata includes `promptAssembly.schema=ops.prompt-assembly-runtime-metadata.v1` so lifecycle events can carry prompt governance and cache-tier diagnostics to adapters and observability.
- Sandbox policy checks cover active profile, network boundary, credential boundary, process boundary, and elevated skill scope alignment.
- Direct command execution consults `ops.sandbox-policy.v1`: `restricted` blocks detected network egress, `balanced` requires approval for detected network egress, and `open` removes those additional command-policy constraints.
- Workspace-scoped sandbox profiles require direct command `cwd` to stay inside the session workspace; read-only profiles block obvious filesystem mutation commands.
- Spawned runtime command environments scrub provider API keys (`OPENROUTER_API_KEY`, `GOOGLE_API_KEY`, `OPS_LLM_*_API_KEY`, etc.) and expose `OPS_SANDBOX_CREDENTIAL_BOUNDARY=brokered` evidence.
- Sandbox profile changes should be previewed through `GET /api/sandbox/policy/diff`; `POST /api/sandbox/policy/apply` persists approval evidence in audit and `sandbox.policy.approval`.

Browser managed profiles:
- `BrowserSessionProfileSummaryRow` includes `profileClass`, `isManaged`, `isIsolated`, and `isolationSummary`.
- `POST /api/browser/managed-profiles/ensure` creates or reuses an agent-only managed browser profile separated from local Chrome profile state.
- `GET /api/browser/release-gate` exposes managed-profile isolation, artifact preview, governed capture, and policy approval gate evidence.
- `POST /api/browser/policy/diff` previews browser policy changes; `POST /api/browser/policy/apply` requires `approved=true` for high-risk boundary changes such as visible browser, proxy, downloads, or weakened approval gates.

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

`GET /api/llm/limits` includes an `onboarding` block with key readiness (`openrouter/google`) and `authProfiles` with provider profile readiness/audit.
`PUT /api/llm/limits` requires credentials only for providers reachable by the active routing policy (for example when local-harness mode is enabled across runtimes, provider keys are not required).
`GET /api/llm/auth-profiles` returns `ops.llm-auth-profiles.v1` with profiles, effective status, eligibility, block reason, and recent selection/update audit entries.
`PUT /api/llm/auth-profiles/:profileId` can create/update provider profile metadata and persisted state:
- `provider`: `openrouter|google` (required for new profiles)
- `status`: `active|cooldown|billing_disabled|disabled`
- `cooldownUntil` / `disabledUntil`: ISO timestamp or null
- `credentialEnvKey` / `credentialVaultKey`: secret reference metadata, never raw key values
- `priority`, `label`, `note`, `actor`

`GET /api/llm/routing/effective` includes per runtime:
- `requestedModel`
- `primaryModel`
- `localHarness`
- `selected`
- budget/policy `checks`, including selected/blocked `authProfile` evidence

Run execution prompt contract:
- Gateway prepends a machine-readable execution envelope to model-facing prompts:
  - opening marker: `<execution_context>`
  - closing marker: `</execution_context>`
- Envelope schema: `ops.execution-context.v2`
- Envelope includes `promptPolicy.schema=ops.prompt-governance.v1` with source
  ordering, trusted instruction sources, untrusted evidence sources, and
  tool/skill/memory boundary rules.
- Envelope includes `promptPolicy.contextFileScanning.schema=ops.prompt-context-file-scan.v1`.
- Envelope includes selected route identity fields used for truthful model disclosure:
  - `route.runtime`
  - `route.model`
  - `route.provider`
- Envelope also includes session/agent/runtime diagnostics (policy checks, tool state, adapter command, timeout/workspace, skill catalog snapshot, tool governance, and memory governance) to reduce ambiguity in runtime self-reporting.

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
    - `sourceAuthorityIncluded`
    - `untrustedTranscriptQuoted`
    - `memoryRecallQuoted`
    - `promptThreatFindings` (compact `source:pattern:severity:disposition` entries)
    - `promptCacheTiers` (`stable_policy`, `session_context`, `volatile_task` token estimates)
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
