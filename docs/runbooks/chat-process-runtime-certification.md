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

## What It Proves

- Mission Control exposes chat state, runtime posture, and browser auth posture in the main operator view.
- Runtime certification keeps process/provider readiness and Telegram routing truthfully separated.
- Browser auth profile routing stays explicit and persists selected profiles on sessions.
- Mission Control renders at desktop, tablet, and mobile viewport sizes without global horizontal overflow, missing core chat/runtime/browser-auth text, clipped watched elements, or broken screenshot artifacts.
- Scrapling/cookie-backed authenticated reads remain the default visible route for logged-in site reads.

## Non-Goals

- It does not send messages through the live Telegram Bot API. Run an opt-in live Telegram scenario before claiming live delivery parity.
- It does not fetch live TikTok, Instagram, Pinterest, Reddit, or X content. Run the live social browser certification for that.
- It does not replace the full interactive browser certification for click/type/PDF operation.
