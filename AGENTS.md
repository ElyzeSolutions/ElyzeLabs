# AI Agent Playbook - Operations Dashboard Template

This repository is a **trading-free baseline** for new dashboard projects.

## Mission
- Build and iterate on operations dashboards quickly.
- Keep backend APIs generic and mock-friendly.
- Use clear module/state/event contracts that can be adapted to any domain.

## Active Runtime
- Backend: `packages/gateway/src/index.ts` via `pnpm dev:gateway` / `pnpm start:gateway`
- Frontend: `dashboard` (Vite + React)
- Config: `config/control-plane.yaml`
- UI examples (reference-only): `dashboard/examples/template`

## Development Commands
```bash
# Install
pnpm install

# Full local dev
pnpm dev

# Backend only
pnpm dev:gateway

# Frontend only
pnpm dev:dashboard

# Frontend build
pnpm --filter dashboard build
```

## Implementation Guidelines
- Prefer domain-neutral naming (`module`, `worker`, `job`, `event`) over business-specific terms.
- Keep API responses stable and typed to support reusable frontend components.
- Use mock data first, then swap to real integrations without changing UI contracts.
- Keep dashboards resilient: degraded states, empty states, and clear operator actions.

## Out of Scope (for this template)
- Trading logic
- Brokerage/exchange integrations
- Account/profile/funds execution pipelines
- Strategy or signal engines

## Suggested Expansion Areas
- Real worker orchestration adapters
- Auth and role-based controls
- Audit trails and change history
- Multi-environment configuration profiles
