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

Add the rendered interactive browser provider only when needed:

```bash
OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1 \
OPS_LIVE_SCENARIO_VERIFY=1 \
OPS_LIVE_SCENARIO_INTERACTIVE=1 \
pnpm test:live-social-browser
```

The report is written to `.ops/certifications/live-social-browser/certification-report.json`. It records profile routing decisions, verification summaries, interactive artifact previews, and Telegram smoke status. It never writes API tokens, cookies, storage-state bodies, Telegram bot tokens, or base64 screenshots.

X can take materially longer than the other social sites. The default manifest gives the X scenario a 180 second timeout so a slow but valid authenticated read is not mislabeled as a failed login.

If verification fails with a missing Playwright or Chrome-for-Testing executable under `~/Library/Caches/ms-playwright`, rebuild Scrapling's browser cache before retrying:

```bash
scrapling install --force
```

Use the Browser page to create or import session profiles first. Prefer the saved Scrapling cookie/storage-state path for read-only authenticated social scraping, and use the interactive provider only for dynamic pages that need rendered click/type/read behavior.
