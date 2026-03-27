# Runtime Recovery

## Symptoms
- Adapter reports repeated failures.
- Runs stuck in `running` without completion.

## Steps
1. Abort affected run via `POST /api/runs/:id/abort`.
2. Validate adapter registry via `/api/capabilities`.
3. Switch runtime on next run request (`runtime` field) if needed.
4. Capture adapter stderr from run timeline.
5. Add remediation task with adapter error cluster.

## Restart Safety
- Existing queued items remain persisted in SQLite.
- Failed runs are retriable via new queued runs using same session.
