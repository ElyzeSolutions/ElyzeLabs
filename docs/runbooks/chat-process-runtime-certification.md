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

By default the live process lane sets `/model openrouter/openai/gpt-5-mini` after `/runtime process` so the run uses a provider-backed process route instead of the fail-closed local placeholder. Override with `OPS_LIVE_TELEGRAM_PROCESS_MODEL`.

The live lane verifies:

- `POST /api/telegram/smoke-test` can authenticate the bot and deliver to the operator target.
- `/runtime process` works through real Telegram ingress.
- `/model <provider-backed-process-model>` works through real Telegram ingress.
- `POST /api/onboarding/provider-keys/live-check` can complete a tiny live chat request through the selected provider-backed process model.
- A Telegram process-runtime prompt completes and replies with a synthetic marker.
- `/task` creates a real Kanban/backlog card through Telegram.
- `/backlog` returns a Telegram backlog snapshot after task creation.

The local report is written to `.ops/certifications/live-telegram-process/certification-report.json`. A passed run writes the redacted release archive to `docs/certifications/live-telegram-process-latest.json`.

Tracked archives omit Telegram chat identifiers, sender identifiers, raw prompts, message bodies, bot tokens, API tokens, provider outputs, cookies, and storage state.

## What It Proves

- Mission Control exposes chat state, runtime posture, and browser auth posture in the main operator view.
- Runtime certification keeps process/provider readiness and Telegram routing truthfully separated.
- Provider readiness is generation-level: metadata/list endpoints are not accepted as proof that the selected process chat model can answer.
- Browser auth profile routing stays explicit and persists selected profiles on sessions.
- Mission Control renders at desktop, tablet, and mobile viewport sizes without global horizontal overflow, missing core chat/runtime/browser-auth text, clipped watched elements, or broken screenshot artifacts.
- Scrapling/cookie-backed authenticated reads remain the default visible route for logged-in site reads.

## Non-Goals

- The deterministic command does not send messages through the live Telegram Bot API. Run `OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT=1 pnpm test:live-telegram-process` before claiming live delivery parity.
- It does not fetch live TikTok, Instagram, Pinterest, Reddit, or X content. Run the live social browser certification for that.
- It does not replace the full interactive browser certification for click/type/PDF operation.
