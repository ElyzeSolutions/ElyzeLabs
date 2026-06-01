# System Prompt, Tools, Skills, And Memory Comparison

This note compares ElyzeLabs against the ROADMAP repos shared for review:

- `/Users/p4r4disi4c/Documents/ROADMAP/hermes-agent`
- `/Users/p4r4disi4c/Documents/ROADMAP/NemoClaw`
- `/Users/p4r4disi4c/Documents/ROADMAP/openclaw`

## What Competitors Do Well

Hermes is strongest on prompt layering and cache discipline. Its `agent/system_prompt.py` separates stable identity/tool/skill guidance, context files, and volatile memory/session data. It also treats memory as declarative durable facts rather than imperative instructions, scopes profile data carefully, and blocks suspicious context files before injection through `agent/prompt_builder.py`.

OpenClaw is strongest on pluggable context and memory contracts. Its `src/context-engine/types.ts` exposes a context engine lifecycle for ingest, assemble, compact, maintain, and subagent preparation. Its `src/memory/prompt-section.ts` lets memory providers contribute bounded prompt sections without hardcoding one memory backend into the core runtime.

NemoClaw is less prompt-centric, but its onboarding and Telegram paths are useful: `src/lib/onboard/telegram-reachability.ts` soft-fails optional Telegram integration when the network or token is bad, while `src/lib/onboard/hermes-managed-tools.ts` makes managed tool gateway selection explicit and testable.

## ElyzeLabs Baseline

Before this pass, ElyzeLabs already had a strong execution envelope:

- `ops.execution-context.v2` with runtime/model/provider truth.
- Prompt assembly snapshots at `GET /api/runs/:runId/prompt-assembly`.
- Transcript and memory recall budgets with deterministic drop order.
- Skill catalog and tool catalog summaries in CEO prompts.
- Telegram routing and delivery tests across several flows.

The main weakness was source authority. Transcript and memory recall were injected as plain text, and memory/tool/skill authority rules could be pushed late in the instruction segment where budget truncation could remove them.

## Changes Adopted

Implemented best-in-class prompt governance in this pass:

- Added a `SOURCE_AUTHORITY` section to assembled prompts.
- Rendered `RECENT_TRANSCRIPT` and `MEMORY_RECALL` content as quoted evidence instead of raw instructions.
- Added continuity coverage flags showing source authority and quoting behavior.
- Added prompt-security findings for suspicious prompt-control text in instructions, current task, transcript, memory recall, and skill metadata.
- Added `CONTEXT_FILE_SCAN` diagnostics so repo context files (`AGENTS.md`, `README.md`, `MEMORY.md`, `.agents/PRD.md`, `.agents/PLAN.md`) are scanned before they can influence prompt behavior.
- Added prompt cache-tier metadata for stable policy, session context, and volatile task content.
- Added `ops.prompt-governance.v1` to execution context with explicit source ordering, trusted sources, untrusted evidence sources, tool/skill boundaries, and memory rules.
- Added top-level execution-context `tools` and `memory` governance snapshots.
- Added pluggable memory prompt sections so future memory providers can register bounded guidance without editing the core session prompt.
- Moved memory recall/write rules before the long skill protocol block so they survive instruction-budget truncation.
- Marked suspicious skill catalog text as capability metadata, not authority, inside `<safety_findings>`.
- Added Telegram-specific trust guidance to prevent Telegram text from redefining hidden prompts, tools, skills, memory, approvals, routing, or delivery policy.
- Classified Telegram startup probe failures so invalid tokens remain hard failures while network/timeouts degrade startup with warnings.
- Added an authenticated Telegram smoke-test endpoint (`POST /api/telegram/smoke-test`) that verifies bot identity through `getMe` and, when a target chat is available, verifies real outbound delivery through `sendMessage`.
- Added Doctor Center prompt governance diagnostics covering source authority, quoted evidence, threat findings, cache-tier metadata, overflow, and dropped segments.
- Added Doctor Center context-file guardrail diagnostics for suspicious repo instruction files.
- Added durable memory write governance (`ops.memory-write-governance.v1`) so explicit memory, auto-remember, imported `MEMORY.md` blocks, and compacted trajectories are evaluated before persistence.
- Blocked credential-like or prompt-control memory writes across HTTP and Telegram, with Telegram returning an explicit “not stored” response.
- Added Doctor Center memory governance diagnostics covering write-policy blocks, auto-remember write failures/blocks, and the active memory retrieval backend.
- Propagated prompt assembly/cache-tier metadata into runtime execution metadata and lifecycle events for adapter and observability consumers.

## Worth Adding Next

The highest-value next improvements are:

- Provider-native prompt-cache markers if the selected provider exposes stable cache-control APIs. The gateway now reports and propagates cache tiers; adapter-level marker emission should stay provider-gated rather than guessing unsupported request fields.
- A richer context-file loader can safely add short, quoted excerpts later; the guardrail now exists, but the current prompt intentionally reports findings without injecting full file bodies.

## Test Coverage

Added focused coverage for the new contract:

- Unit: prompt assembly quotes transcript and memory recall as evidence and records governance flags.
- Unit: prompt governance detects adversarial prompt-control text, supports pluggable memory sections, and exposes cache-tier estimates.
- Unit: prompt governance scans repo context files and renders findings without exposing raw malicious file text.
- Unit: memory service blocks prompt-control and credential-like writes before durable persistence, skips unsafe `MEMORY.md` ingestion blocks, and reports policy-blocked auto-remember decisions.
- Unit: startup healer distinguishes invalid Telegram credentials from transient Telegram reachability failures.
- Unit: runtime manager carries prompt assembly metadata through lifecycle events.
- Integration: Doctor Center exposes prompt and memory governance posture.
- Integration: Telegram ingress creates a real session/run, carries prior Telegram transcript plus structured memory into prompt assembly, verifies source authority, prompt-security findings, cache tiers, Doctor Center diagnostics, and memory/tool/skill rules in the snapshot, and verifies the runtime receives the governed prompt before Telegram delivery.
- Integration: Telegram `/remember` blocks credential-like durable memory writes and surfaces the memory governance warning.
- Integration: Telegram smoke-test probes bot identity, sends a diagnostic message with optional topic routing, records a redacted audit row, and degrades explicitly when no delivery target is configured.
