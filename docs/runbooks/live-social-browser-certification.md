# Live Social Browser Certification

This opt-in lane proves that ElyzeLabs can route Telegram and authenticated browser work through saved session profiles without committing credentials or live artifacts.

Default behavior is skip-safe:

```bash
pnpm test:live-social-browser
```

Run the local live check:

```bash
OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1 \
OPS_LIVE_SCENARIO_SITES=instagram,tiktok,pinterest,x,reddit \
pnpm test:live-social-browser
```

Add real profile verification:

```bash
OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1 \
OPS_LIVE_SCENARIO_VERIFY=1 \
pnpm test:live-social-browser
```

Add a real Telegram outbound smoke:

```bash
OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1 \
OPS_LIVE_SCENARIO_TELEGRAM=1 \
OPS_LIVE_SCENARIO_TELEGRAM_CHAT_ID=<chat-id> \
pnpm test:live-social-browser
```

Add Telegram-facing social prompts that prove saved-profile inference without `/browser use`:

```bash
OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1 \
OPS_LIVE_SCENARIO_TELEGRAM=1 \
OPS_LIVE_SCENARIO_TELEGRAM_PROMPTS=1 \
OPS_LIVE_SCENARIO_SITES=instagram,tiktok,pinterest,x,reddit \
OPS_LIVE_SCENARIO_TIMEOUT_MS=120000 \
pnpm test:live-social-browser
```

Archive a redacted release summary after a successful live run:

```bash
pnpm archive:live-social-browser
```

The archive is written to `docs/certifications/live-social-browser-latest.json`. It keeps only pass/fail gates, site keys, provider/routing decisions, Telegram smoke status, and profile health states. It omits profile ids, profile labels, chat ids, sender ids, cookies, tokens, storage state, terminal text, artifact previews, base64 payloads, and social-site content.

Add the rendered interactive browser provider only when needed:

```bash
OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1 \
OPS_LIVE_SCENARIO_VERIFY=1 \
OPS_LIVE_SCENARIO_INTERACTIVE=1 \
pnpm test:live-social-browser
```

The raw local report is written to `.ops/certifications/live-social-browser/certification-report.json`. It records profile routing decisions, verification summaries, interactive artifact previews, Telegram smoke status, and Telegram prompt scenario evidence. It never writes API tokens, cookies, storage-state bodies, Telegram bot tokens, or base64 screenshots.

Local report previews and errors use the shared certification redactor in `scripts/testing/redaction.mjs`, which masks authorization headers, `x-api-key` style headers, provider keys, Telegram/GitHub tokens, JWTs, private key blocks, URL query secrets, URL userinfo, cookie headers, and database connection-string passwords before evidence is persisted.

Telegram prompt scenarios use Telegram-shaped ingress or webhook payloads against the live gateway and verify the resulting run timeline, browser trace, terminal state, and session messages. The important release signal is `telegram.promptScenarios.status=passed`, with `browser.auth_profile.resolved` showing `source=auto_site` or another explicit selected-profile source. Use `OPS_LIVE_SCENARIO_TELEGRAM_MODE=webhook` or `ingress` to override auto-detection from gateway config.

X can take materially longer than the other social sites. The default manifest gives the X scenario a 180 second timeout so a slow but valid authenticated read is not mislabeled as a failed login.

If verification fails with a missing Playwright or Chrome-for-Testing executable under `~/Library/Caches/ms-playwright`, rebuild Scrapling's browser cache before retrying:

```bash
scrapling install --force
```

Use the Browser page to create or import session profiles first. Prefer the saved Scrapling cookie/storage-state path for read-only authenticated social scraping, and use the interactive provider only for dynamic pages that need rendered click/type/read behavior.

Telegram operators can start a host-browser login capture with `/browser connect <site> [chrome|edge|firefox|zen]`, then save it with `/browser save <site> [chrome|edge|firefox|zen]`. Zen is treated as a Firefox-compatible local profile source internally, but it remains an explicit operator-facing selector so Zen users do not have to choose generic Firefox.

Operators who do not know the right import path can send `/browser help` in Telegram. The response lists the supported paths in order: automatic saved-profile inference, host login capture, current Playwright/CDP session import, mobile handoff, then `/browser live` for rendered click/type fallback. This preserves the Scrapling-first low-detection route for normal authenticated reads.

The current-session import is useful when a `Google Chrome for Testing` or other Playwright/CDP browser is already logged in. Browser Ops can call `POST /api/browser/playwright-auth/save-current` with either the active Playwright CLI state or a local session metadata file containing a CDP endpoint and profile directory. The resulting profile stores filtered storage state for Scrapling reuse instead of requiring the agent to keep controlling the live browser for read-only checks.

The mobile handoff path is for phone-only logins. Browser Ops creates a one-time handoff URL through `POST /api/browser/mobile-handoff/start`; the phone opens that URL, submits a cookie export or raw cookie header, and the gateway verifies the resulting session profile before exposing it to agents.
