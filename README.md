# ElyzeLabs

ElyzeLabs is a local-first AI operations control plane and dashboard template.

It ships a typed Node gateway, a React operator UI, reusable control-plane contracts, and a deployment surface designed to start simple and stay adaptable. The vocabulary stays intentionally neutral: `module`, `worker`, `job`, `event`, `session`.

## Why This Repo Exists

- Start operations dashboards quickly without inventing the control plane from scratch
- Keep APIs stable and mock-friendly while you iterate on the UI
- Add integrations later without rewriting the frontend contracts
- Run locally first, then move to Docker or Dokploy when the shape is right

## What You Get

- React dashboard for operations, tooling, schedules, backlog, config, and browser workflows
- Typed gateway API with queueing, memory, vault, runtime adapters, and skills
- SQLite-backed local persistence for sessions, runs, audits, and catalog state
- Public baseline skills plus optional external skills repositories
- GitHub Actions, Docker, and Dokploy support for repeatable shipping
- Unit, integration, UI, browser, and end-to-end test coverage

## What You Do Not Get

This is a baseline, not a vertical product.

- No trading logic
- No brokerage or exchange integrations
- No strategy engine
- No account or funds execution pipeline

## Stack

- Frontend: React 19 + Vite
- Backend: TypeScript + Node.js
- Monorepo: `pnpm`
- Persistence: SQLite
- Config entrypoint: [`config/control-plane.yaml`](./config/control-plane.yaml)

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

## Configuration

- Minimal env: [`.env.example`](./.env.example)
- Full env surface: [`env.full.example`](./env.full.example)
- Runtime config: [`config/control-plane.yaml`](./config/control-plane.yaml)

Real secrets belong in local env, your deployment platform, or the built-in vault. Do not commit them.

## GitHub Access

`GITHUB_TOKEN` is optional.

You only need it when you want:

- GitHub-backed delivery or backlog flows
- Private vendor repositories such as a private `Polybot` checkout
- Authenticated GitHub API access from the running control plane

Public baseline skills do not require `OPS_GH_READ_TOKEN`, the Docker release workflow no longer depends on that secret, and public `polyx-cli` installs do not need GitHub auth.

## Docker And Deploy

For a minimal local container run:

```bash
cp .env.example .env
make up
```

Further docs:

- [`DOKPLOY.md`](./DOKPLOY.md)
- [`dashboard/README.md`](./dashboard/README.md)
- [`docs/runbooks`](./docs/runbooks)

## Repository Layout

- [`dashboard`](./dashboard): operator UI
- [`packages/gateway`](./packages/gateway): API server and orchestration entrypoint
- [`packages/config`](./packages/config): typed config schema and loader
- [`packages/runtime`](./packages/runtime): runtime adapter contracts and manager
- [`packages/db`](./packages/db): persistence and migrations
- [`packages/memory`](./packages/memory): memory providers and service layer
- [`packages/skills`](./packages/skills): skill manifest, registry, and catalog loading

## Public Release Checklist

Before publishing or tagging a release:

1. Run `pnpm publish:check`
2. Run `pnpm build` and `pnpm test`
3. Confirm `.env` stays local-only
4. Rotate any credential that may have been exposed during development
5. Enable secret scanning, push protection, branch protection, and Dependabot on the GitHub repo

## License

MIT. See [LICENSE](./LICENSE).
