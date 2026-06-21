# Kanban Workboard Certification

This lane certifies the operator Backlog/Kanban workboard across dashboard UI contracts, Telegram task intake, GitHub delivery truth, and responsive browser rendering.

## Command

```bash
pnpm test:kanban-workboard:cert
```

The command runs:

- `dashboard/src/pages/BacklogPage.test.tsx`
- `dashboard/src/components/backlog/GithubDeliveryCockpit.test.tsx`
- `packages/gateway/test/integration/telegram-backlog-kanban.test.ts`
- `packages/gateway/test/integration/github-delivery-certification.test.ts`
- `pnpm test:browser`, including Backlog desktop/tablet/mobile screenshot and overflow checks

## Artifacts

Reports are written under `.ops/certifications/kanban-workboard/`:

- `certification-report.json`
- `browser-visual-report.json`
- `screenshots/backlog-desktop.png`
- `screenshots/backlog-tablet.png`
- `screenshots/backlog-mobile.png`

These artifacts are ignored by git. Archive them with release evidence when making a best-in-class Kanban/workboard claim.

## What It Proves

- Contract-aware Kanban transitions, drag/drop, keyboard movement, and board task creation still work.
- The operator focus strip summarizes dispatchable work, WIP pressure, verification queue, stalled work, and delivery risk while driving lane filters.
- Telegram task creation maps into backlog workflow contracts.
- GitHub delivery cockpit renders API truth, blocker diagnostics, journal parity, and repair receipts.
- Backlog renders at desktop, tablet, and mobile viewport sizes without global horizontal overflow, missing core workboard text, clipped watched elements, or broken screenshot artifacts.

## Non-Goals

- It does not exercise a live GitHub repository token. Run a live delivery-sync scenario before claiming real-repo parity.
- It does not replace live operator review of final naming and density. It protects the current implementation from functional and responsive regressions.
