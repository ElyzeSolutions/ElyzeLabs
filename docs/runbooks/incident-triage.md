# Incident Triage Runbook

## Severity Mapping
- `critical`: ingress unavailable or message loss risk.
- `high`: queue dead-letter surge, repeated runtime failures.
- `medium`: degraded dashboard stream or stale office presence.
- `low`: isolated adapter failure with fallback available.

## Triage Steps
1. Check `/api/health/readiness` and `/api/metrics`.
2. Inspect recent audit entries `/api/audit`.
3. Review failed queue items `/api/queue` dead-letter payload.
4. Verify runtime adapter status `/api/capabilities`.
5. Open remediation task `/api/remediation` with evidence links.

## Resolution Targets
- Critical: recover within 15 minutes.
- High: recover within 60 minutes.
- Medium/Low: recover within same business day.
