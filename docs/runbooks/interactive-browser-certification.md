# Interactive Browser Certification

Use this lane when changing the CDP/interactive browser provider, API routing, Browser page live controls, or Telegram `/browser` commands.

```bash
pnpm test:interactive-browser:cert
```

The report is written to `.ops/certifications/interactive-browser/certification-report.json`.

This lane certifies deterministic click/type/read/snapshot/upload/download/scroll/keypress/screenshot/PDF behavior, persistent live sessions, API profile routing, and Telegram live browser commands. It is complementary to the Scrapling-first authenticated social browser lane; read-only social scraping should continue to use saved cookie/storage-state capture by default.

Run the opt-in live external lane before claiming arbitrary third-party interactive operation:

```bash
OPS_RUN_LIVE_INTERACTIVE_BROWSER_CERT=1 pnpm test:interactive-browser:live
```

The live lane targets Selenium's public web form fixture with non-mutating local form actions. It exercises real CDP read/click/type/snapshot/screenshot/PDF behavior against an external page, writes the raw local report to `.ops/certifications/interactive-browser-live/certification-report.json`, persists screenshot/PDF binaries under `.ops/certifications/interactive-browser-live/artifacts`, and writes a redacted tracked summary to `docs/certifications/interactive-browser-live-latest.json`.
