# Chaos Drill Notes

## Drill: Queue Worker Crash
- Injected worker exceptions via chaos suite.
- Expected: lease expiration requeues item, no silent drop.
- Command: `pnpm test:chaos`.

## Drill: Runtime Adapter Failure Burst
- Simulate failing prompts (`fail` keyword) and verify dead-letter path.
- Expected: dead-letter count increments and audit/event trails preserved.

## Drill: Stream Drop + Reconnect
- Restart browser tab and observe replay from `lastSequence`.
- Expected: no duplicate/out-of-order event rendering.
