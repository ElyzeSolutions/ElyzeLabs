# Chat Process Runtime Certification

This lane certifies Mission Control as the operator-facing chat/process runtime surface. It focuses on visible runtime posture, authenticated browser-profile routing, Telegram-shaped conversation state, and responsive rendering.

## Command

```bash
pnpm test:chat-process:cert
```

Use Node 22 as declared in `.node-version`; local native modules are built for that runtime.

The command runs:

- `dashboard/src/pages/MissionControlPage.test.tsx`
- `packages/gateway/test/integration/runtime-certification.test.ts`
- `packages/gateway/test/integration/browser-auth-routing.test.ts`
- `pnpm test:browser`, with a focused Mission Control chat/process lane

## Artifacts

Reports are written under `.ops/certifications/chat-process-runtime/`:

- `certification-report.json`
- `browser-visual-report.json`
- `screenshots/mission-control-desktop.png`
- `screenshots/mission-control-tablet.png`
- `screenshots/mission-control-mobile.png`

These artifacts are ignored by git. Archive them with release evidence when making a chat/process runtime claim.

## Live Telegram Process Lane

The deterministic lane does not contact Telegram. Run this opt-in live lane when certifying real operator chat behavior:

```bash
OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT=1 pnpm test:live-telegram-process
```

It uses `OPS_API_TOKEN` and `TELEGRAM_CHAT_ID` from the environment or `.env`. Override with `OPS_LIVE_TELEGRAM_PROCESS_API_TOKEN`, `OPS_LIVE_TELEGRAM_PROCESS_CHAT_ID`, `OPS_LIVE_TELEGRAM_PROCESS_TOPIC_ID`, `OPS_LIVE_TELEGRAM_PROCESS_CHAT_TYPE`, or `OPS_LIVE_TELEGRAM_PROCESS_TIMEOUT_MS`.

By default the live process lane probes a short provider-backed candidate list and sets `/model` to the first route that can complete a real chat request. Put a preferred model first with `OPS_LIVE_TELEGRAM_PROCESS_MODEL`, or provide a comma-separated fallback list with `OPS_LIVE_TELEGRAM_PROCESS_MODEL_CANDIDATES`.

The lane also records operator-facing latency SLOs in both the local report and the tracked archive. By default, the provider-backed Telegram process reply must complete within `120000` ms and the full live lane must complete within `300000` ms. Override those budgets with `OPS_LIVE_TELEGRAM_PROCESS_REPLY_MAX_MS` and `OPS_LIVE_TELEGRAM_PROCESS_E2E_MAX_MS` when certifying slower hosted providers.

Before sending a live generation request, the lane preflights each candidate through `/api/llm/routing/effective?runtime=process&model=...` and verifies the requested candidate itself is the selected eligible route. Failed candidates are recorded with a redacted `reasonCode` and remediation hint, so provider-auth, billing/quota, cooldown, rate-limit, invalid model config/model-unavailable, routing fallback, and network failures are distinguishable in the local report.

The live lane verifies:

- `POST /api/telegram/smoke-test` can authenticate the bot and deliver to the operator target.
- `/runtime process` works through real Telegram ingress.
- `/model <provider-backed-process-model>` works through real Telegram ingress.
- `POST /api/onboarding/provider-keys/live-check` can complete a tiny live chat request through the selected provider-backed process model.
- A Telegram process-runtime prompt completes and replies with a synthetic marker.
- The process reply and full live lane finish inside the configured latency SLOs.
- `/task` creates a real Kanban/backlog card through Telegram.
- `/backlog` returns a Telegram backlog snapshot after task creation.

The local report is written to `.ops/certifications/live-telegram-process/certification-report.json`. A passed run writes the redacted release archive to `docs/certifications/live-telegram-process-latest.json`.

Archive the latest local report explicitly with:

```bash
pnpm archive:live-telegram-process
```

The archive command refuses to overwrite an existing passed archive with failed evidence unless `OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_ALLOW_FAILED=1` is set.

Tracked archives omit Telegram chat identifiers, sender identifiers, raw prompts, message bodies, bot tokens, API tokens, provider outputs, cookies, and storage state.

Live process reports use the shared certification redactor in `scripts/testing/redaction.mjs`, which masks authorization headers, `x-api-key` style headers, provider keys, Telegram/GitHub tokens, JWTs, private key blocks, URL query secrets, URL userinfo, cookie headers, and database connection-string passwords before evidence is persisted.

## What It Proves

- Mission Control exposes chat state, runtime posture, and browser auth posture in the main operator view.
- Runtime certification keeps process/provider readiness and Telegram routing truthfully separated.
- Provider readiness is generation-level: metadata/list endpoints are not accepted as proof that the selected process chat model can answer.
- Provider model selection is evidence-driven: the certification records the selected provider/model and redacted per-candidate failure details before it sends the Telegram `/model` command.
- Provider model selection is routing-aware: ineligible auth profiles and cooled-down routes are skipped before expensive live generation attempts.
- Provider-backed runtime claims include responsiveness evidence, not just eventual success.
- Browser auth profile routing stays explicit and persists selected profiles on sessions.
- Mission Control renders at desktop, tablet, and mobile viewport sizes without global horizontal overflow, missing core chat/runtime/browser-auth text, clipped watched elements, or broken screenshot artifacts.
- Scrapling/cookie-backed authenticated reads remain the default visible route for logged-in site reads.

## Non-Goals

- The deterministic command does not send messages through the live Telegram Bot API. Run `OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT=1 pnpm test:live-telegram-process` before claiming live delivery parity.
- It does not fetch live TikTok, Instagram, Pinterest, Reddit, or X content. Run the live social browser certification for that.
- It does not replace the full interactive browser certification for click/type/PDF operation.
