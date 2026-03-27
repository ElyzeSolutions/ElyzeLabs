# ElyzeLabs

<!-- Add logo above and hero banner below when assets are ready. -->

> Open-source AI operations control plane for teams building internal copilots, agent workflows, and operator dashboards.

ElyzeLabs gives you a local-first gateway, a production-ready React dashboard, typed control-plane contracts, and deploy-ready workflows so you can move from prototype to operating surface without rebuilding the stack halfway through.

## Why ElyzeLabs

- Start with a working control plane instead of stitching one together from scratch
- Keep frontend contracts stable while backend integrations evolve from mock to real
- Stay domain-neutral so the same baseline can power ops tooling, internal AI products, and human-in-the-loop workflows
- Develop locally first, then ship through Docker, GitHub Actions, or Dokploy when the shape is right

## What You Get

- React operator dashboard for mission control, schedules, backlog, browser workflows, tooling, config, and vault operations
- Typed Node gateway with runtime adapters, queueing, memory, skills, vault, and orchestration endpoints
- SQLite-backed local persistence for sessions, runs, audits, and catalog state
- Public baseline skills plus optional external skills repositories
- CI, Docker, and Dokploy support for repeatable shipping
- Unit, integration, UI, browser, and end-to-end test coverage

## Good Fit For

- Internal AI operations consoles
- Agent back-office dashboards
- Human-in-the-loop workflow systems
- Operator surfaces for automation-heavy products
- Teams that want a reusable control-plane baseline instead of a one-off admin panel

## Intentionally Not Included

ElyzeLabs is a baseline, not a locked vertical product.

- No trading logic
- No brokerage or exchange integrations
- No strategy engine
- No account or funds execution pipeline

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm doctor:config
pnpm dev
```

Local URLs:

- Gateway: [http://localhost:8788](http://localhost:8788)
- Dashboard dev server: [http://127.0.0.1:4173](http://127.0.0.1:4173)

Common commands:

```bash
pnpm dev:gateway
pnpm dev:dashboard
pnpm build
pnpm test
pnpm publish:check
```

## Stack

- Frontend: React 19 + Vite
- Backend: TypeScript + Node.js
- Monorepo: `pnpm`
- Persistence: SQLite
- Config entrypoint: [`config/control-plane.yaml`](./config/control-plane.yaml)

## Deploy And Operate

For a minimal local container run:

```bash
cp .env.example .env
make up
```

Further docs:

- [`DOKPLOY.md`](./DOKPLOY.md)
- [`dashboard/README.md`](./dashboard/README.md)
- [`docs/runbooks`](./docs/runbooks)

## Optional GitHub Access

`GITHUB_TOKEN` is optional.

You only need it when you want:

- GitHub-backed delivery or backlog flows
- Private vendor repositories such as a private `Polybot` checkout
- Authenticated GitHub API access from the running control plane

Public baseline skills do not require `OPS_GH_READ_TOKEN`, the Docker release workflow does not depend on that secret, and public `polyx-cli` installs do not need GitHub auth.

## Configuration

- Minimal env: [`.env.example`](./.env.example)
- Full env surface: [`env.full.example`](./env.full.example)
- Runtime config: [`config/control-plane.yaml`](./config/control-plane.yaml)

Real secrets belong in local env, your deployment platform, or the built-in vault. Do not commit them.

## Repository Layout

- [`dashboard`](./dashboard): operator UI
- [`packages/gateway`](./packages/gateway): API server and orchestration entrypoint
- [`packages/config`](./packages/config): typed config schema and loader
- [`packages/runtime`](./packages/runtime): runtime adapter contracts and manager
- [`packages/db`](./packages/db): persistence and migrations
- [`packages/memory`](./packages/memory): memory providers and service layer
- [`packages/skills`](./packages/skills): skill manifest, registry, and catalog loading

## License

MIT. See [LICENSE](./LICENSE).
