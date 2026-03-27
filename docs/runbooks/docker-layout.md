# Docker Layout Runbook

## Persistence Layout
- `/var/lib/ops/state`:
  - SQLite (`control-plane.db`)
  - durable control-plane data (sessions, runs, queue, audit, structured memory)
- `/var/lib/ops/workspaces`:
  - runtime workspaces
  - per-session memory markdown (`MEMORY.md`, `.ops/memory-daily/*.md`)
- `/var/lib/ops/tooling/bin`:
  - persisted runtime CLI installs (`polyx`, `polybot-*`)
- `/var/lib/ops/tooling/uv-tools`:
  - persisted `uv tool` environments backing `polyx` and `polybot-*`
- `/var/lib/ops/skills`:
  - baseline skills seeded from the image on first empty-volume startup
- `/home/node/.agents/skills`:
  - global `npx skills -g` skill installs and persisted vendor/system skills repos
- `/var/lib/ops/logs`:
  - container/runtime logs and troubleshooting exports

## Simple Dokploy Pattern
- Recommended Dokploy deployment uses only two named volumes:
  - `/var/lib/ops`
  - `/home/node/.agents/skills`
- Keep durable runtime paths under `/var/lib/ops`:
  - `/var/lib/ops/state`
  - `/var/lib/ops/workspaces`
  - `/var/lib/ops/tooling/bin`
  - `/var/lib/ops/tooling/uv-tools`
  - `/var/lib/ops/logs`
- Keep system/global skills in `/home/node/.agents/skills`.
- This preserves the default skill path expected by Codex, Gemini CLI, Claude, and similar tools.
- This is also the default layout in the root `docker-compose.yml`.

## Workspace Strategy
- `runtime.workspaceStrategy=session` (default):
  - one workspace per session id (`/var/lib/ops/workspaces/<session-id>`)
  - safest for multi-tenant/operator isolation.
- `runtime.workspaceStrategy=shared`:
  - all runs share one workspace root
  - useful for single-repo automation where all agents collaborate in one tree.

## CLI Tooling in Image
- The gateway image provisions a CLI suite installer (`scripts/docker/install-cli-suite.sh`).
- Base tools installed in image: `git`, `curl`, `wget`, `jq`, `ripgrep`, `openssh-client`, `tmux`, `bun`.
- Vendor CLIs are install-at-build and configurable via build args:
  - `CODEX_NPM_PACKAGE`
  - `CLAUDE_NPM_PACKAGE`
  - `GEMINI_NPM_PACKAGE`
- Optional strict mode:
  - `CLI_INSTALL_STRICT=true|false`
- Install summary is written to `/opt/ops/tooling/tooling.env`.
- PolyX now defaults to the public `polyx-cli` package at build time.
- Polybot still uses runtime bootstrap with `scripts/bootstrap_poly_vendor.sh` for private repo access and fast updates.
- Runtime bootstrap installs `polybot-*` from the persistent vendor repo under `/var/lib/ops/workspaces/vendor`
  and installs `polyx` from `polyx-cli` by default, with all backing `uv` tool environments persisted in
  `/var/lib/ops/tooling/uv-tools`.

## Skill Gating Model
- Skill discovery can be catalog-driven with SQLite-backed catalog entries (`skill_catalog_entries`).
- Catalog strict mode (`skills.catalogStrict=true`) disables directory auto-discovery.
- Per-skill controls:
  - `allowedCommands` blocks unsupported payload command requests.
  - `requiredTools` auto-disables skills when required commands are missing.
- Default compose wiring:
  - public baseline skills seeded into `/var/lib/ops/skills`
  - global/system skills path: `/home/node/.agents/skills`
  - installer root: `/home/node/.agents/skills`
  - in Docker and Dokploy, `/home/node/.agents/skills` is the primary install target because
    external CLI tooling expects it by default
  - env:
    - `OPS_SKILLS_DIRECTORIES=/var/lib/ops/skills,/home/node/.agents/skills`
    - `OPS_SKILLS_INSTALLER_INSTALL_ROOT=/home/node/.agents/skills`
  - default compose uses:
    - `/var/lib/ops` for state/workspaces/logs
    - `/home/node/.agents/skills` for persistent system skills
    - `OPS_SKILLS_INSTALLER_INSTALL_ROOT=/home/node/.agents/skills`
  - optional host workspace bind override:
    - `docker compose -f docker-compose.yml -f docker-compose.workspace-bind.yml up -d`
