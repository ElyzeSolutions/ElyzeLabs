# Competitor Feature Analysis

Scope:

- Current product: `/Users/p4r4disi4c/Documents/Elyze/ElyzeLabs`
- Reference repos:
  - `/Users/p4r4disi4c/Documents/ROADMAP/hermes-agent`
  - `/Users/p4r4disi4c/Documents/ROADMAP/NemoClaw`
  - `/Users/p4r4disi4c/Documents/ROADMAP/openclaw`

This is a product and engineering comparison, not a recommendation to clone each repo wholesale. ElyzeLabs is already an operations dashboard/control plane. The best improvements are the ones that strengthen that identity: safer execution, better operator recovery, tighter feature lifecycle, and fewer half-hidden capabilities.

## Executive Read

ElyzeLabs already has many of the right primitives: an operator dashboard, typed gateway APIs, sessions/runs/queueing, schedules, memory, skills, browser operations, vault, LLM routing, backlog/GitHub surfaces, onboarding, audits, metrics, and remediation hooks.

The main gap is not raw feature count. The main gap is productization and hardening:

- Large gateway/frontend files make existing behavior hard to evolve safely.
- Some APIs are ahead of UI/docs maturity.
- Security boundaries exist, but they are not yet expressed as a clear sandbox/policy model operators can inspect and approve.
- Skills, schedules, browser operations, and agent delegation exist, but need lifecycle views, guardrails, evaluation, and recovery tooling.
- Telegram exists, but ElyzeLabs does not yet have a general channel abstraction like OpenClaw/Hermes.

The highest-leverage direction is:

1. Polish the existing control plane before adding broad new surface area.
2. Add a first-class doctor/repair center.
3. Add channel and delivery abstractions incrementally, starting with Slack/Discord after Telegram.
4. Add skill lifecycle management inspired by Hermes.
5. Add sandbox policy profiles inspired by NemoClaw.
6. Add managed browser profiles and device/node protocol primitives inspired by OpenClaw.

## Current ElyzeLabs Baseline

### Strengths

ElyzeLabs is strongest as an operations dashboard:

- Dashboard navigation already covers overview, mission control, office, backlog, agents, skills, tools, browser ops, schedules, LLM routing, vault, control plane config, housekeeping, onboarding, and access settings.
- The gateway already exposes broad control-plane APIs for sessions, runs, queues, schedules, backlog, GitHub integration, agents, onboarding, vault, provider keys, memory, trajectories, tools, browser, skills, pairings, Telegram, events, office, BFF views, audit, metrics, remediation, frontier scoring, certification, and backup.
- Runtime adapters already support multiple agent providers such as Codex, Claude, Gemini, and process-based execution.
- Queueing already has lane concurrency, locks, retries, lease heartbeat, and dead-letter behavior.
- Browser policy already includes allow/deny domains, stealth/proxy/download approvals, prompt-injection escalation, and artifacts/history.
- Skills already have manifests, scopes, approval flags, allowed commands, required tools, install policies, and catalog/install/remove/resync flows.
- Memory already has structured records, daily memory, auto-remember behavior, embeddings, and adaptive ANN settings.
- Vault, pairing, RBAC, audit, metrics, remediation, backups, onboarding checks, and doctor-like scripts are already present.

This means the roadmap should avoid "basic agent platform" work that ElyzeLabs already has. The better work is making those capabilities coherent and reliable for operators.

### Current Polish Debt

These are not competitor features, but they directly affect how fast new features can be added:

- `packages/gateway/src/server.ts` is very large and currently acts as a route registry, controller layer, orchestration layer, and feature aggregation point. It should be split by bounded area before more APIs are added.
- `packages/db/src/database.ts` is also very large and should be split by table/domain modules or repositories.
- Several dashboard pages are very large, especially browser, schedules, backlog, mission control, cost control, config, onboarding, and skills. These pages need smaller components and hooks around concrete workflows.
- The repo standard says TypeScript should not use typecasts, but the current codebase contains many casts in dashboard, gateway, DB, and scorecard code. This should be treated as hygiene debt and cleaned incrementally when touching those files.
- The API contract docs are useful, but the actual gateway route surface is broader than the docs. Operator-facing docs and generated route inventory should be reconciled.
- The config schema has enough surface area that duplicate keys and drift are easy to introduce. It needs schema tests and config snapshot tests around high-risk policy fields.

## Reference Repo Takeaways

### 2026-06-22 Refresh

The reference repos were refreshed on June 22, 2026 before this pass:

- OpenClaw moved further into tool/result UX, effective tool inventory, session artifact indexing, Workboard persistence limits, provider catalog/failover, and chat/session regression coverage.
- Hermes added a large generic `computer_use` lane with screenshot/SOM capture, click/type/scroll/key actions, approval gates, driver doctor checks, richer goal continuation, desktop session actions, and memory provider setup.
- NemoClaw added a live Telegram injection e2e scenario that proves shell metacharacters stay literal through sandbox exec/SSH paths and verifies process tables do not leak provider secrets.
- PolyX reinforces the X-specific low-detection pattern: cookie-backed GraphQL requests with `auth_token` plus `ct0`, stable browser-like headers, query-id discovery, and request pacing.

Impact for ElyzeLabs:

- Keep Scrapling/cookie and storage-state auth as the default authenticated social read path.
- Treat Playwright/CDP and interactive browser as guided fallback paths, not the default for read-only social scraping.
- Make the chat-facing `/browser` help path explicit so non-technical operators can discover host capture, current-session import, and mobile handoff without knowing endpoint names.
- Keep adding live injection/redaction checks around Telegram and provider credentials before expanding more remote browser execution.

### Hermes Agent

Hermes is closest to a broad personal agent runtime. Its strongest ideas are:

- Self-improvement loop: creates skills from experience, improves them during use, nudges memory, searches past conversations, and models the user.
- Skill curator: a background maintenance loop reviews agent-created skills, tracks lifecycle states, pins, archives, consolidates, patches, and avoids blind auto-delete.
- Scheduled automation discipline: cron execution disables protected toolsets, layers user-disabled toolsets, and scans the fully assembled cron prompt, including loaded skill content, for prompt-injection issues.
- Multi-channel delivery: Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, Home Assistant, SMS, email, webhooks, and more.
- Terminal/TUI ergonomics: commands like model switching, retry, undo, compress, usage, skills, stop, and status make the agent operational from a shell, not only a web UI.
- Tool/provider breadth: model providers, search providers, browser providers, memory providers, image/video/TTS, observability, kanban, and security guidance are all plugin-like.
- Execution backend breadth: local, Docker, SSH, Singularity, Modal, Daytona, and batch trajectory support.
- Supply-chain stance: core dependencies are exact-pinned while provider-specific extras are lazy-installed.

Best fit for ElyzeLabs:

- Adopt the skill curator and lifecycle model.
- Adopt cron guardrails and delivery semantics.
- Adopt a small, useful terminal operator surface.
- Adopt exact-pin/lazy-extra dependency discipline where it fits the monorepo.
- Use the provider/plugin breadth as a design target, not as an immediate implementation list.

Avoid copying:

- Do not add every provider/channel before ElyzeLabs has stable extension contracts.
- Do not turn the product into a consumer personal assistant unless that is an explicit strategy shift.

### NemoClaw

NemoClaw is alpha, but it has the clearest security and lifecycle ideas:

- Deny-by-default network policy: only explicitly allowed endpoints are reachable, and unlisted requests go through operator approval.
- Policy tiers: restricted, balanced, and open presets make sandbox posture understandable.
- Endpoint groups: network rules include endpoints, binaries, protocols, ports, and read/write intent.
- Filesystem policy: sandbox-writable paths are narrow; system paths are read-only; dedicated sandbox user is assumed.
- Host-side credential boundary: external inference providers are reached through a gateway, not direct sandbox egress.
- Blueprint lifecycle: OpenShell/OpenClaw versions, image digest pins, min/max compatibility, restore behavior, and backup policy are codified.
- Operator approval loop: blocked egress can be reviewed and persisted as policy.

Best fit for ElyzeLabs:

- Add a NemoClaw-lite sandbox policy model to ElyzeLabs before adding more remote execution.
- Express policy in operator-friendly profiles, not just hidden config flags.
- Keep credentials outside worker sandboxes.
- Add import/export/versioning for runtime policy bundles.

Avoid copying:

- Do not take on the full OpenShell stack unless ElyzeLabs is explicitly becoming a sandbox runtime distribution.
- Do not block product work on perfect sandboxing; start with inspectable policy, audit, and approval flows.

### OpenClaw

OpenClaw has the most mature product shape for a local-first assistant network:

- Gateway as the long-lived control plane: clients and nodes connect over WebSocket, declare roles, expose capabilities, and receive typed commands.
- Device/node protocol: challenge/nonce handshake, role, scopes, capabilities, permissions, device identity, signatures, and issued device tokens.
- Channel routing: deterministic account, peer, guild/team, channel, agent, and session key routing.
- DM pairing default: unknown senders get a code; messages are not processed until pairing succeeds; doctor surfaces risky DM policy.
- Managed browser profile: separate agent-only browser profile, optional real-user Chrome profile attach, deterministic tab/click/type/screenshot/PDF control.
- Canvas/A2UI: live visual host for agent UI, camera/screen/location tools, and richer device capabilities.
- Onboarding and doctor: setup flows cover model/auth, workspace, gateway, channels, daemon, health, skills, browser migration, services, DM policies, and state dirs.
- Model failover: auth profile rotation, model fallback, round-robin, session stickiness, cooldowns, and billing-disable behavior.
- Plugin SDK: external plugins register providers, channels, speech, media understanding, image generation, web search, and tools.

Best fit for ElyzeLabs:

- Adopt a typed WebSocket/device-node model after the current SSE/event surfaces are stabilized.
- Adopt deterministic channel routing before adding more channels.
- Adopt managed browser profiles and deterministic browser control.
- Adopt doctor/repair breadth.
- Adopt auth profile rotation and failover for LLM routing.

Avoid copying:

- Do not start with all OpenClaw channels, apps, voice, Canvas, and companion devices.
- Do not add a plugin SDK until internal boundaries are split enough to support one.

## Have, But Needs Polish

| Area | ElyzeLabs today | Reference idea | Recommended polish |
| --- | --- | --- | --- |
| Skills | Manifest, registry, install/remove/resync, scopes, approvals, runtime contracts. | Hermes skill creation, improvement, curator, lifecycle states. | Add lifecycle states: draft, active, pinned, needs-review, archived. Add skill evaluation runs, usage telemetry, conflict detection, and operator review queues. |
| Memory/context | Structured memory, daily memory, auto-remember, embeddings, adaptive ANN, trajectories. | Hermes memory manager and user model. | Add a memory search/debug UI with provenance. Fence/scrub retrieved context. Show what memory was injected into a run and why. |
| Schedules | Schedules, cadence, cron, workflows, browser/scrape support. | Hermes cron guardrails and multi-channel delivery. | Add delivery targets, last-delivery audit, prompt-injection scan after skill expansion, cron-specific tool denylist, and output silence/heartbeat policy. |
| Browser ops | Browser config, allow/deny domains, prompt-injection checks, session vault, artifacts/history. | OpenClaw managed browser profile and deterministic tab controls. | Add agent-only browser profile, optional user-profile attach, tab list, click/type/read/screenshot/PDF actions, policy diff approvals, and artifact preview. |
| Agents/delegation | Profiles, harness, turbo coding, runtime adapters, delegate policy. | Hermes subagents and remote execution backends. | Show spawn tree, delegated task ownership, per-agent workspace/auth/profile, budget, and cancellation. Add remote backend abstraction only after policy is stable. |
| Onboarding | Onboarding APIs, vault/provider key setup, smoke runs, config doctor commands. | OpenClaw wizard/doctor/repair. | Add a single repair center that checks config, services, browser, skills, vault, schedules, pairings, DB, migrations, and risky policies. Include one-click repair where safe. |
| Security/vault | Vault, pairings, RBAC, audit, browser policy, elevated execution flags. | NemoClaw sandbox profiles and OpenClaw device tokens. | Add per-agent sandbox posture, deny-by-default egress profile, policy approval history, device token inventory, and policy diff review. |
| LLM routing/cost | Routing, limits, effective routing, cost controls. | OpenClaw auth profile rotation and fallback. | Add provider auth profiles, session stickiness, cooldowns, round-robin/fallback rules, billing-disabled state, and a failover audit trail. |
| Realtime/office | SSE/events and office surfaces. | OpenClaw typed WebSocket gateway. | Keep SSE for dashboard notifications, but add a typed WS control plane for nodes/devices once route modules are cleaner. |
| Operator CLI | Many scripts exist, but UX is fragmented. | Hermes terminal/TUI commands. | Add a small `elyze` CLI surface for status, runs, queue, schedules, skills, doctor, usage, stop, retry, and vault checks. |
| Dependency/plugin posture | Monorepo packages and broad dependencies. | Hermes exact pins and lazy provider extras. | Keep core dependencies tight. Move optional provider-specific packages behind adapters and document install boundaries. |

## Missing, Worth Adding

### P0: Stabilize Before Expanding

These are immediate because they reduce risk across every future feature:

- Split `packages/gateway/src/server.ts` into route modules by area: sessions/runs, schedules, browser, skills, agents, memory, backlog, auth/vault, operations.
- Split `packages/db/src/database.ts` into smaller DB modules with typed row mapping and no broad casts.
- Split large dashboard pages into workflow components and hooks.
- Add a generated route inventory and compare it with `docs/api-contract.md`.
- Add schema snapshot tests for config policy fields.
- Start a no-new-casts enforcement path for touched TypeScript files.

### P1: Doctor + Repair Center

This is the highest-value product improvement because ElyzeLabs already has many operational pieces. Operators need a single place that says what is healthy, risky, stale, misconfigured, or recoverable.

Include checks for:

- Gateway health, config load, route inventory, DB migrations, queue lanes, stuck sessions, dead letters.
- Vault locked/unlocked state, provider key availability, stale tokens, pairing policy.
- Browser status, profile availability, policy drift, blocked domains, prompt-injection events.
- Skills catalog, invalid manifests, missing tools, blocked sources, stale runtime contracts.
- Schedules, failed deliveries, silent jobs, missing delivery targets, risky toolsets.
- LLM routing, missing providers, rate-limit/cooldown states, cost-limit exhaustion.
- Backups, restore points, audit log integrity, housekeeping retention.

### P1: Channel Adapter Abstraction

ElyzeLabs should not add 20 channels immediately. It should add a small channel contract first:

- `channelId`, `accountId`, `peerId`, `threadId`, `agentId`, `sessionKey`.
- Inbound message normalization.
- Outbound delivery result/audit.
- Pairing and allowlist policy.
- Per-channel capability flags: text, files, images, voice, reactions, threads.

After Telegram, the first useful additions are Slack and Discord because they map well to operations teams. Email/webhook delivery should be added for schedules and incident-style notifications.

### P1: Skill Lifecycle + Curator

Borrow from Hermes, but keep it operator-centric:

- Skill states: candidate, active, pinned, needs-review, deprecated, archived.
- Skill provenance: manually installed, generated, imported, modified by agent.
- Skill health: last run, failures, permissions used, tool dependencies, owner.
- Curator jobs: duplicate detection, stale skill detection, unsafe command review, manifest repair suggestions.
- Evaluation harness: dry run, fixture run, regression run before activation.

This directly improves the current skills page instead of adding another separate feature.

### P1: Schedule Delivery + Cron Guardrails

Schedules should become operational automations with explicit delivery and safety:

- Delivery targets: dashboard, Telegram, Slack/Discord later, email, webhook.
- Per-schedule tool policy.
- Prompt-injection scan after skills/context are assembled.
- Protected toolsets disabled by default in cron.
- Output requirement: deliver, store artifact, or mark intentionally silent.
- Missed-run, retry, and escalation policy.

### P1: Managed Browser Profile

Current browser ops are useful, but OpenClaw's browser model would make it much more powerful:

- Agent-only browser profile managed by ElyzeLabs.
- Optional user Chrome attach with explicit operator approval.
- Deterministic actions: list tabs, open URL, read page, click, type, screenshot, PDF, download artifact.
- Profile-specific cookies/session vault.
- Clear isolation between automation profile and personal browser.

### P2: Sandbox Policy Profiles

Adopt NemoClaw's policy model without adopting its whole runtime:

- Profiles: `trusted_local`, `restricted`, `balanced`, `open`.
- Policy dimensions: filesystem, process, network, environment, credentials, browser, downloads.
- Endpoint groups with binary/process scope.
- Deny-by-default egress option with approval flow.
- Policy diff review before a run escalates permissions.
- Export/import policy bundles for environments.

### P2: Auth Profiles + Model Failover

The LLM routing UI should support:

- Multiple auth profiles per provider.
- Profile rotation and cooldown.
- Session stickiness.
- Fallback chains by task class.
- Disabled/billing-exhausted state.
- Audit explaining why a model/profile was selected.

### P2: Typed WebSocket Device/Node Model

ElyzeLabs already has event streams. A WS control plane is worth adding when device/node use cases become real:

- First-frame handshake.
- Role: dashboard, node, worker, browser-host, canvas-host.
- Capabilities and scopes.
- Device token lifecycle.
- Presence and heartbeat.
- Typed commands and command acknowledgements.

This should come after route/module cleanup so the protocol does not inherit current monolith complexity.

### P2: Plugin SDK Boundaries

Add plugin boundaries only after internal adapters are clean:

- Provider plugins.
- Channel plugins.
- Tool plugins.
- Search/browser plugins.
- Speech/media plugins later.

The first version can be internal-only. External plugin distribution should wait for manifest validation, sandbox policy, tests, and install-source governance.

### P3: Defer Unless Strategy Changes

These are interesting, but not urgent for an operations dashboard:

- OpenClaw-style Canvas/A2UI host.
- Mobile/desktop companion apps.
- Full personal assistant channel catalog.
- Voice wake/talk pipeline.
- Remote compute backends like Modal/Daytona.
- Hosted portal bundling all third-party model/search/browser/TTS services.

## Recommended Roadmap

### 0-2 Weeks

- Keep generated route inventory current and use it to reconcile API docs (`pnpm api:inventory`, `docs/generated/api-route-inventory.md`).
- Split the largest gateway route areas out of `server.ts`.
- Add config schema snapshot tests around policy-heavy fields.
- Add dashboard feature inventory page or internal docs that map UI pages to APIs.
- Start no-new-casts cleanup on files touched by ongoing work.
- Fix obvious schema drift and duplicate-key risks.

### 2-6 Weeks

- Build doctor/repair center MVP.
- Add skill lifecycle states and review queue.
- Add schedule delivery targets and cron safety checks.
- Add Slack/Discord-ready channel adapter interface, but ship only one extra channel first.
- Add browser profile inventory and basic tab/action controls.

### 6-12 Weeks

- Add NemoClaw-lite sandbox policy profiles.
- Add managed browser profile isolation and artifact preview.
- Add auth profiles and model failover.
- Add device/node protocol design and a small internal WS prototype.
- Add skill evaluation harness.

### Later

- External plugin SDK and marketplace-style installation.
- Canvas/A2UI and companion node hosts.
- Remote execution backends.
- More channels after routing, pairing, and audit behavior is proven.

## Practical Product Positioning

ElyzeLabs should not become a generic personal assistant clone. The stronger position is:

> An operator-grade control plane for running, supervising, repairing, and safely extending AI workers.

That means the most valuable competitor ideas are not the flashiest UI features. They are the operational primitives:

- Hermes: self-improving skills, cron discipline, TUI ergonomics.
- NemoClaw: policy tiers, deny-by-default execution boundaries, blueprint lifecycle.
- OpenClaw: gateway/device protocol, channel routing, browser profiles, doctor/onboarding, model failover.

## Progress Applied From This Analysis

- Generated route inventory now exists at `docs/generated/api-route-inventory.md` and `docs/generated/api-route-inventory.json`.
- `pnpm api:inventory` regenerates the inventory from `packages/gateway/src/server.ts`; `pnpm api:inventory:check` fails when the checked-in inventory is stale.
- The inventory compares AST-extracted Fastify routes against endpoint mentions in `docs/api-contract.md`, making API-doc drift visible. Current baseline: 279 routes, 279 documented, 0 undocumented.
- NemoClaw-style sandbox policy profiles now exist in config (`trusted_local`, `restricted`, `balanced`, `open`), are exposed through `/api/sandbox/policy`, appear in execution context, and are surfaced in Doctor Center.
- Direct command policy now consumes the active sandbox profile: `restricted` blocks detected network egress, `balanced` requires explicit approval for detected network egress, and `open` avoids additional sandbox command constraints.
- Workspace-scoped sandbox profiles now reject direct command working directories outside the session workspace, and read-only profiles block obvious filesystem mutation commands.
- Telegram now has an authenticated live smoke-test surface at `POST /api/telegram/smoke-test`: it verifies bot identity with `getMe`, optionally sends a diagnostic `sendMessage` to a supplied or configured chat/topic, returns redacted structured evidence, and records a safe audit row.
- Best-in-class claims are now gated by `docs/best-in-class-capability-matrix.json` and generated evidence in `docs/generated/best-in-class-capability-matrix.md`. Run `pnpm best-in-class:matrix` after matrix changes and `pnpm best-in-class:matrix:check` in verification. Current readiness is `not_ready`: 10 capabilities tracked, 2 ahead, 2 parity, 5 partial, 0 missing, 1 deferred, with 5 required gaps remaining.
- Channel adapter groundwork now exists for Telegram in `packages/gateway/src/channel-adapter.ts`: it declares a reusable channel contract, registers Telegram in an `ops.channel-registry.v1` capability surface, normalizes Telegram inbound payloads, derives deterministic session routes, and exposes lifecycle/runtime metadata through `/api/capabilities`. This moves channel abstraction from missing to partial; remaining work is extracting Telegram command handling behind the registry lifecycle before Slack/Discord/email/webhook expansion.

## Source Notes

Current ElyzeLabs areas reviewed:

- `README.md`
- `dashboard/src/app/navigation.ts`
- `docs/api-contract.md`
- `package.json`
- `packages/config/src/schema.ts`
- `packages/gateway/src/server.ts`
- `packages/gateway/src/browser-service.ts`
- `packages/runtime/src/types.ts`
- `packages/runtime/src/manager.ts`
- `packages/queue/src/index.ts`
- `packages/skills/src/manifest.ts`
- `packages/skills/src/registry.ts`
- `packages/memory/src/service.ts`

Hermes areas reviewed:

- `README.md`
- `pyproject.toml`
- `cron/scheduler.py`
- `agent/memory_manager.py`
- `agent/curator.py`
- `gateway/platform_registry.py`
- `plugins/`

NemoClaw areas reviewed:

- `README.md`
- `skills/nemoclaw-user-reference/references/network-policies.md`
- `nemoclaw-blueprint/blueprint.yaml`
- `schemas/sandbox-policy.schema.json`

OpenClaw areas reviewed:

- `README.md`
- `docs/concepts/architecture.md`
- `docs/gateway/protocol.md`
- `docs/tools/browser.md`
- `docs/channels/index.md`
- `docs/channels/channel-routing.md`
- `docs/start/wizard.md`
- `docs/gateway/doctor.md`
- `docs/concepts/model-failover.md`
- `docs/plugins/building-plugins.md`
