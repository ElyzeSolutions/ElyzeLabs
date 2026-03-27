# Queue Stall Recovery

## Detection Signals
- `queue.processing` remains zero while `queue.queued` grows.
- No new `run.accepted` events in SSE stream.

## Recovery Procedure
1. Confirm worker thread is active (`/api/health` queue checks).
2. Inspect processing items and leases (`/api/queue`).
3. Restart gateway process; queue engine reclaims expired leases.
4. Re-run synthetic ingress request and verify `run.accepted` transition.

## No-Loss Verification
- Compare queued + processing + done + dead-letter counts before/after restart.
- Ensure no run id disappears between snapshots.
