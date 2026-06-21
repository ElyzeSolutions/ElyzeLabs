# Nightly Certification

This lane turns the individual best-in-class certification commands into one scheduled operator habit. It records deterministic gates every night, requires recent tracked live-evidence archives, and keeps secret-bearing live refresh runs opt-in until stable credentials, gateway access, and browser session profiles are available.

## Commands

Dry-run the plan without executing child certifications:

```bash
OPS_NIGHTLY_CERT_DRY_RUN=1 pnpm test:nightly-cert
```

Run deterministic local/nightly gates:

```bash
pnpm test:nightly-cert
```

By default this also verifies tracked live evidence archives for live interactive browser, live social browser, and live GitHub delivery. The archives must be `passed`, include their critical sub-gates, and be no older than `168` hours.

Change the live-evidence freshness window:

```bash
OPS_NIGHTLY_CERT_LIVE_EVIDENCE_MAX_AGE_HOURS=72 pnpm test:nightly-cert
```

Temporarily skip archived live-evidence gates while debugging deterministic lanes:

```bash
OPS_NIGHTLY_CERT_REQUIRE_LIVE_EVIDENCE=0 pnpm test:nightly-cert
```

Run deterministic gates plus live lanes:

```bash
OPS_NIGHTLY_CERT_INCLUDE_LIVE=1 pnpm test:nightly-cert
```

Fail selected live lanes when they are blocked instead of recording them as blocked evidence:

```bash
OPS_NIGHTLY_CERT_INCLUDE_LIVE=1 OPS_NIGHTLY_CERT_STRICT_LIVE=1 pnpm test:nightly-cert
```

## Scheduled Workflow

`.github/workflows/nightly-certification.yml` runs at `03:17 UTC` daily and can also be started manually from GitHub Actions.

The default scheduled run executes deterministic gates and verifies tracked live evidence freshness. Manual dispatch can set `include_live=true` to refresh live lanes with current credentials and session profiles.

## Deterministic Lanes

- Best-in-class matrix freshness
- Fake OpenAI-compatible provider E2E
- Interactive browser deterministic control surface
- Kanban workboard certification
- Chat/process runtime certification
- Browser schedule certification

## Live Lanes

These run only when `OPS_NIGHTLY_CERT_INCLUDE_LIVE=1` is set:

- Live interactive browser certification
- Live social browser certification
- Live Telegram process certification
- Live GitHub delivery certification

The wrapper reads each child certification report after execution. A child script that exits successfully but writes `blocked` or `skipped` still appears that way in the nightly report.

## Archived Live Evidence

These are required by default unless `OPS_NIGHTLY_CERT_REQUIRE_LIVE_EVIDENCE=0` or `--no-live-evidence` is set:

- `docs/certifications/interactive-browser-live-latest.json`
- `docs/certifications/live-social-browser-latest.json`
- `docs/certifications/live-github-delivery-latest.json`

The gate checks archive status, timestamp freshness, and critical sub-gates such as CDP click/type artifacts, Scrapling preservation for authenticated social reads, shared-profile auto-selection, GitHub write acceptance, and redacted archive output.

## Artifacts

Raw local report:

- `.ops/certifications/nightly/certification-report.json`

Tracked redacted archive:

- `docs/certifications/nightly-certification-latest.json`

GitHub Actions also uploads `.ops/certifications/**` reports as workflow artifacts.

## What It Proves

- Deterministic certification lanes stay runnable from one command and one scheduled workflow.
- Live certification readiness is visible and cannot be confused with deterministic pass/fail status.
- Recent live evidence is required even when secret-bearing live refresh lanes are not selected.
- Reports distinguish `passed`, `failed`, `blocked`, `skipped`, and dry-run `planned` states.
- Archives omit command output and live artifact payloads.

## Non-Goals

- This does not provide live credentials or logged-in browser profiles.
- This does not make live third-party sites deterministic; it records their actual readiness state.
- This does not replace focused live debug runs when a specific lane fails.
