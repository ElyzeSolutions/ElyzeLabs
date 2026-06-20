# Interactive Browser Certification

Use this lane when changing the CDP/interactive browser provider, API routing, Browser page live controls, or Telegram `/browser` commands.

```bash
pnpm test:interactive-browser:cert
```

The report is written to `.ops/certifications/interactive-browser/certification-report.json`.

This lane certifies deterministic click/type/read/snapshot/upload/download/scroll/keypress/screenshot/PDF behavior, persistent live sessions, API profile routing, and Telegram live browser commands. It is complementary to the Scrapling-first authenticated social browser lane; read-only social scraping should continue to use saved cookie/storage-state capture by default.
