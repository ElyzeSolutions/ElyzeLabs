# Fake Provider E2E Certification

Use this lane when changing provider-backed process routing, native tool-call handling, tool-result reply formatting, model fallback routing, or certification artifacts.

```bash
pnpm test:fake-provider-e2e:cert
```

The lane runs `packages/gateway/test/integration/fake-provider-e2e.test.ts` against the real gateway test harness while stubbing only provider HTTP responses. It verifies compact Gemini-style tool calls, native tool-session execution paths, clean operator replies, fake primary-provider saturation, and OpenRouter-compatible fallback recovery.

The local report is written to `.ops/certifications/fake-provider-e2e/certification-report.json`. A redacted tracked archive is written to `docs/certifications/fake-provider-e2e-latest.json`; it omits raw provider request/response bodies, API keys, bearer tokens, and full test logs.
