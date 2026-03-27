# Skills And Tools Runbook

## Mental Model

- `tools`: runtime/system binaries (`node`, `npx`, `git`, `codex`, `claude`, `gemini`, `tmux`) tracked in the tool registry and policy-toggleable.
- `skills`: named modules loaded by the skill registry. Skills may depend on tools (`requiredTools`) and are independently enable/disable/approval controlled.

## Skill Manifest Format

The gateway now uses `SKILL.md` as the only skill manifest format.

- Instruction/knowledge skill:
  - frontmatter has `name` + `description`
  - no `entry` field
  - invoke returns structured markdown instructions
- Executable skill (parity with old `skill.yaml`):
  - frontmatter includes `entry` plus policy fields (`scopes`, `requiresApproval`, `supportsDryRun`, `allowedCommands`, `requiredTools`)
  - invoke runs the entry script inside skill policy controls

`SKILL.md` frontmatter is parsed first; markdown body remains available for instruction context.

## Discovery, Catalog, And Policy

- Discovery directories (default local): `skills`, `.ops/skills`, `~/.agents/skills`
- Catalog persistence backend: SQLite (`skill_catalog_entries` table)
- Strict mode: `skills.catalogStrict=true` disables directory auto-discovery and uses catalog entries only.
- Installer source policy:
  - allowlist / blocklist by repo pattern
  - approval gates for install/remove/resync

## Install Locations

### Local (default)

- Repo-managed curated skills: `./skills`
- External/operator-installed skills: `./.ops/skills`
- Global `npx skills -g` installs: `~/.agents/skills`
- Catalog entries: persisted in SQLite (no manual YAML editing required)
- Installer root (default): `./.ops/skills`

### Docker Compose (default)

- Public baseline skills from `https://github.com/ElyzeSolutions/skills` are seeded into `/var/lib/ops/skills` inside the persisted `/var/lib/ops` volume
- Runtime `uv tool` environments for `polyx` / `polybot-*` are persisted in `/var/lib/ops/tooling/uv-tools`
- Global installs (`npx skills -g`) and vendor/system skills live in `/home/node/.agents/skills`
- Distinct external skills repos can be cloned into `/home/node/.agents/skills/vendor-skills`
- Catalog entries: persisted in SQLite at `/var/lib/ops/state/control-plane.db`
- Installer root: `/home/node/.agents/skills`
- In Dokploy, prefer `/home/node/.agents/skills` as the primary persisted skill root because Codex,
  Gemini CLI, Claude, and similar tooling look there by default for system/global skills.
- Default compose reduces persistence to two named volumes:
  - `/var/lib/ops` for state, workspaces, and logs
  - `/home/node/.agents/skills` for persisted system/global skills
- In that setup:
  - clone distinct external skills into `/home/node/.agents/skills/vendor-skills`
  - keep `OPS_SKILLS_DIRECTORIES=/var/lib/ops/skills,/home/node/.agents/skills`
  - set `OPS_SKILLS_INSTALLER_INSTALL_ROOT=/home/node/.agents/skills`

Recommended external-repo sync:

- Use `scripts/bootstrap_skills_vendor.sh` to clone or pull a distinct skills repo into `/home/node/.agents/skills/vendor-skills`
- Then autodiscover and reload through `pnpm skills:config`

### Docker + host global skills (optional)

By default, Docker uses the named volume `ops_agents_skills` at `/home/node/.agents/skills`.
If you want Docker to read your host global installs directly, bind mount host global path to the same target:

- macOS host global dir: `${HOME}/.agents/skills`
- container target: `/home/node/.agents/skills`

Example compose override:

```yaml
services:
  gateway:
    volumes:
      - ${HOME}/.agents/skills:/home/node/.agents/skills
```

Relevant env vars:

- `OPS_SKILLS_DIRECTORIES=/var/lib/ops/skills,/home/node/.agents/skills`
- `OPS_SKILLS_INSTALLER_INSTALL_ROOT=/home/node/.agents/skills`
- `OPS_SKILLS_CATALOG_STRICT=false|true`

## API Surface

Skills:

- `GET /api/skills`
- `GET /api/skills/catalog`
- `POST /api/skills/catalog/entries/upsert`
- `POST /api/skills/catalog/entries/remove`
- `POST /api/skills/autodiscover`
- `POST /api/skills/install`
- `POST /api/skills/remove`
- `POST /api/skills/resync`
- `POST /api/skills/reload`
- `POST /api/skills/:skillName/invoke`

Tools:

- `GET /api/tools`
- `PATCH /api/tools/:toolName`

Installer readiness requires `node`, `npm`, and `npx`. `skills` binary is optional because install uses `npx skills ...`.

## Catalog Management (No Manual YAML Editing Required)

Use any of these surfaces:

- Dashboard: `Skills` page -> `Add To Catalog` / `Remove Entry`
- Dashboard: `Skills` page -> `Autodiscover` (workspace root or custom path)
- API:
  - `POST /api/skills/catalog/entries/upsert` with `{ path, name?, approved }`
  - `POST /api/skills/catalog/entries/remove` with `{ path, approved }`
  - `POST /api/skills/autodiscover` with `{ roots?, depth?, approved }`
- CLI:
  - `pnpm skills:config catalog-add /absolute/path/to/skill --approved`
  - `pnpm skills:config catalog-remove /absolute/path/to/skill --approved`
  - `pnpm skills:config autodiscover [root] --approved --depth 6`
  - `pnpm skills:config show`

This is how you onboard skills from any cloned repo path that contains `SKILL.md`, including agent-cloned repos in runtime workspaces.

## Creating A New Skill With `skill-creator`

This uses your local system skill-creator package.
Set these first:

- `REPO_ROOT=/absolute/path/to/your/repo`
- `SKILL_CREATOR=$HOME/.codex/skills/.system/skill-creator/scripts`

### 1) Initialize a new markdown skill skeleton

```bash
python3 "$SKILL_CREATOR/init_skill.py" \
  my-new-skill \
  --path "$REPO_ROOT/skills" \
  --resources scripts,references
```

This creates:

- `$REPO_ROOT/skills/my-new-skill/SKILL.md`
- optional resource directories you requested.

### 2) Edit `SKILL.md`

- Fill frontmatter (`name`, `description`) clearly.
- Keep instructions concise and split large details into `references/`.

### 3) Validate

```bash
python3 "$SKILL_CREATOR/quick_validate.py" \
  "$REPO_ROOT/skills/my-new-skill"
```

### 4) Optional: generate `agents/openai.yaml` metadata

```bash
python3 "$SKILL_CREATOR/generate_openai_yaml.py" \
  "$REPO_ROOT/skills/my-new-skill" \
  --interface display_name="My New Skill" \
  --interface short_description="One-line value summary" \
  --interface default_prompt="Use this skill for <trigger>"
```

### 5) Reload into gateway

```bash
curl -sS -X POST http://localhost:8788/api/skills/reload
```

## Creating An Executable Skill (`SKILL.md`)

Use this when you need process execution with explicit permission scopes.

Minimal example:

```md
---
id: my-exec-skill
name: my-exec-skill
version: 1.0.0
description: Executes a bounded local workflow
entry: index.js
enabled: true
requiresApproval: false
supportsDryRun: true
allowedCommands: []
requiredTools:
  - node
scopes:
  filesystem: read
  process: none
  network: none
  secrets: none
---

# My Exec Skill

Describe what the script does and how operators should invoke it.
```

Pair it with `index.js`, then reload skills.
