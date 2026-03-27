# Dokploy Quickstart

Use this when deploying ElyzeLabs on Dokploy with optional vendor repositories.

## GitHub Auth Model In Dokploy

Dokploy uses two different GitHub auth mechanisms:

1. `Git` in Dokploy:
   Dokploy creates and installs a GitHub App on either the user's personal account or the GitHub
   organization. This is what Dokploy uses to read the ElyzeLabs repository itself and trigger
   auto-deploys from Git pushes.
2. `Registry` in Dokploy for `ghcr.io`:
   Dokploy uses a GitHub username plus a Personal Access Token as the registry password.

Important:
- The Dokploy `Git` integration is not the same thing as the ElyzeLabs runtime `GITHUB_TOKEN`
- The Dokploy `Git` integration uses a GitHub App
- The Dokploy `GHCR` registry uses a PAT
- ElyzeLabs runtime uses `GITHUB_TOKEN` for bootstrap scripts and GitHub-backed delivery/backlog repo operations

Recommended setup:
- Install the Dokploy GitHub App for the ElyzeLabs repo in the correct personal account or org
- Create one dedicated GitHub PAT for runtime/registry use only if you need GitHub-backed delivery flows or private vendor repos such as Polybot
- Reuse that PAT as:
  - the Dokploy `GHCR` registry password
  - optionally the ElyzeLabs `GITHUB_TOKEN` environment variable
  - the token consumed by `bootstrap_poly_vendor.sh`
  - the token consumed by `bootstrap_skills_vendor.sh` when that repo is private
  - the token used by ElyzeLabs runtime for GitHub-backed backlog/delivery repo work

If you want one token to cover both GHCR and private repo cloning, make it a `classic` PAT with:
- `write:packages` for GHCR push access in Dokploy
- `read:packages` if you only need pull access
- read access to any private vendor repositories you want the runtime bootstrap scripts to clone

If your GitHub organization enforces SSO or token approval, make sure the PAT is authorized for the org.

## 1. Add These Dokploy Environment Variables First

Minimum useful setup:

```bash
OPS_API_TOKEN=<long-random-token>
OPS_TELEGRAM_ENABLED=true
OPS_TELEGRAM_BOT_TOKEN=<telegram-bot-token>
GOOGLE_API_KEY=<gemini-key>
# or use OPENROUTER_API_KEY=<openrouter-key> instead of GOOGLE_API_KEY

# Optional generic extra published port
# Default compose publishes container port 8080 on host port 8080.
# Override this if your embedded service uses a different container or host port.
OPS_EXTRA_PORT_SPEC=8080:8080
```

How to get them:
- `OPS_API_TOKEN`: generate with `openssl rand -hex 32`, `pnpm token:generate`, or the onboarding page's local `Generate Token` helper
- `OPS_TELEGRAM_BOT_TOKEN`: create a bot with `@BotFather`
- `GOOGLE_API_KEY`: create in Google AI Studio
- `OPENROUTER_API_KEY`: create in OpenRouter
- `OPS_GATEWAY_PORT_SPEC`: optional host-to-container publish spec for the ElyzeLabs UI/API; default is `8788:8788`
- `OPS_EXTRA_PORT_SPEC`: optional host-to-container publish spec for one extra TCP service; default is `8080:8080`

Notes:
- The onboarding page can generate an API token locally in your browser, but ElyzeLabs will not trust it until you save it as `OPS_API_TOKEN` and restart or redeploy.
- For any public Dokploy deployment, set a real `OPS_API_TOKEN` before first exposure.
- You need at least one model provider key: `GOOGLE_API_KEY` or `OPENROUTER_API_KEY`
- `GITHUB_TOKEN` is optional unless you need GitHub-backed delivery flows or private vendor repositories such as Polybot.
- If you want to reuse the same token for Dokploy GHCR and ElyzeLabs runtime, use a classic PAT
- ElyzeLabs can also resolve the same GitHub credential from `GH_TOKEN`, `OPS_GITHUB_PAT`, or Vault secret `providers.github_pat`, but shared runtime env is preferred

Telegram note:
- `OPS_TELEGRAM_CHAT_ID` is optional.
- ElyzeLabs replies to the originating Telegram chat/session automatically when a user messages the bot.
- Only set `OPS_TELEGRAM_CHAT_ID` if you want a fixed fallback chat for proactive outbound delivery when there is no originating session chat available.
- If you need to discover a chat ID, send a message to the bot first and then call:
  `https://api.telegram.org/bot<OPS_TELEGRAM_BOT_TOKEN>/getUpdates`
  Then inspect `message.chat.id` in the JSON response.

## 2. Set `OPS_API_TOKEN` The Safe Way

Choose one:
- recommended: generate a real `OPS_API_TOKEN` before first public deploy and add it in Dokploy Environment
- assisted first boot: deploy privately, open ElyzeLabs onboarding, click `Generate Token`, save that value into Dokploy Environment as `OPS_API_TOKEN`, then redeploy before normal use

Important:
- the onboarding page generates the token locally in the browser
- that generated value does nothing until the container restarts with `OPS_API_TOKEN` set
- do not leave the default placeholder token on an internet-exposed deployment

## 3. Deploy With Docker Compose

Use the same root compose file the repo uses locally:
- `docker-compose.yml`

It pulls this published GHCR image:
- `ghcr.io/elyzesolutions/elyzelabs:latest`

The root compose file also sets `pull_policy: always` on the gateway service so Dokploy/Compose
pulls a fresh GHCR image on each redeploy instead of reusing a stale cached `:latest` image.

That single container serves both:
- the ElyzeLabs UI
- the ElyzeLabs API

Use Dokploy service port `8788` for the ElyzeLabs UI/API unless you override `OPS_GATEWAY_PORT_SPEC`.

If you want one additional embedded service exposed directly, the root compose file supports a generic extra publish slot:
- `OPS_EXTRA_PORT_SPEC=8080:8080` exposes container port `8080` publicly on host port `8080`
- `OPS_EXTRA_PORT_SPEC=8888:8888` exposes container port `8888` publicly on host port `8888`
- `OPS_EXTRA_PORT_SPEC=127.0.0.1:9999:9000` exposes container port `9000` on loopback-only host port `9999`

Important:
- by default, the extra port slot is `8080:8080`, which publishes container port `8080` publicly on host port `8080`
- in the current Polybot repo, `8080` is the frontend dashboard and `8888` is the backend API
- this keeps the base compose generic, but it also means the base file reserves and exposes one extra host port by default
- if you need zero extra host-port mapping on some installs, keep using an override-file approach instead

You do not need to manually create Docker volumes in Dokploy for the default setup.
Dokploy runs the repo `docker-compose.yml`, and Docker Compose creates the named volumes automatically on first deploy.

The compose file defines two named volumes:
- `elyzelabs_ops`
- `elyzelabs_agents_skills`

They are mounted in the container as:
- `elyzelabs_ops` -> `/var/lib/ops`
- `elyzelabs_agents_skills` -> `/home/node/.agents/skills`

`/var/lib/ops` holds:
- `/var/lib/ops/state`
- `/var/lib/ops/workspaces`
- `/var/lib/ops/logs`

`/home/node/.agents/skills` is the dedicated system-skills mount used by Codex, Gemini CLI,
Claude, and ElyzeLabs skill discovery.

If you use Dokploy `Volume Backups`, select the created Docker named volumes after the first deploy.
Depending on Dokploy/Docker Compose project naming, Docker may prefix the final on-disk volume names automatically.

## 4. Bootstrap Polybot And Install PolyX After Deploy

Run inside the ElyzeLabs repo or from a Dokploy post-deploy command:

```bash
GITHUB_TOKEN=your-github-token ./scripts/bootstrap_poly_vendor.sh --restart
```

This will:
- clone or update `Polybot`
- run `uv sync` in `Polybot`
- install public `polyx-cli`
- install `polyx` and `polybot-*` into persisted runtime bin `/var/lib/ops/tooling/bin`
- persist the backing `uv tool` environments in `/var/lib/ops/tooling/uv-tools`

Dashboard alternative:
- open ElyzeLabs UI
- complete API token onboarding
- use the onboarding `Post-Deploy` bootstrap panel or the `Tools` page bootstrap panel
- choose the recommended bootstrap action to run the same in-gateway workflow without SSH

## 5. Bootstrap Skills

Only do this when you have a separate skills repo beyond the public baked baseline skills.

```bash
./scripts/bootstrap_skills_vendor.sh --skills-repo https://github.com/acme/vendor-skills.git
```

This will:
- clone or update the configured skills repo into `/home/node/.agents/skills/vendor-skills`
- autodiscover skills
- reload the skill catalog

If that repo is private, add `GITHUB_TOKEN=your-github-token` when you run the command.

If you are running from a normal ElyzeLabs checkout with `.env` present, the simpler wrapper is:

```bash
make bootstrap
```

That always runs the Polybot bootstrap and public PolyX install, and it only runs the vendor skills bootstrap when
`OPS_BOOTSTRAP_SKILLS_REPO` / `OPS_BOOTSTRAP_SKILLS_REF` or `SKILLS_REPO` / `SKILLS_REF`
point to a repo or ref that differs from the baked baseline skills source.

If you need to force the separate vendor skills sync, set `OPS_BOOTSTRAP_SKILLS_REPO` or `SKILLS_REPO`, then run:

```bash
make bootstrap-skills
```

## 6. Initialize Vault In The UI

After the stack is up:
1. Open ElyzeLabs UI
2. Go to Vault
3. Initialize the vault
4. Copy the generated vault material exactly once

Then add these Dokploy env vars and redeploy:

```bash
OPS_VAULT_ENABLED=true
OPS_VAULT_AUTO_UNLOCK_FROM_ENV=true
OPS_VAULT_ENV_KEY=<paste-the-vault-material-from-the-ui>
```

Important:
- `OPS_VAULT_ENV_KEY` currently stores the actual vault material value
- do not point it at another env var name

## 7. Move Secrets Into Vault

Store these in the Vault UI:
- `telegram.bot_token`
- `providers.google_api_key`
- or `providers.openrouter_api_key`

Optional:
- `providers.github_pat`
- `telegram.default_chat_id`
- `telegram.default_topic_id`

After vault auto-unlock works, you may remove plaintext `OPS_TELEGRAM_BOT_TOKEN` and
`GOOGLE_API_KEY` or `OPENROUTER_API_KEY` from Dokploy env if they now live in vault.

Keep these in Dokploy env:
- `OPS_API_TOKEN`
- `GITHUB_TOKEN` only when you use GitHub-backed flows or private vendor repos such as Polybot

## 8. Schedule Updates

Example:

```bash
*/30 * * * * cd /path/to/ElyzeLabs && GITHUB_TOKEN=your-github-token ./scripts/bootstrap_poly_vendor.sh --restart >> /var/log/elyze-poly-vendor.log 2>&1
*/30 * * * * cd /path/to/ElyzeLabs && ./scripts/bootstrap_skills_vendor.sh --skills-repo https://github.com/acme/vendor-skills.git >> /var/log/elyze-skills-vendor.log 2>&1
```

Make sure scheduled jobs also receive `GITHUB_TOKEN` when the target repo is private.
Only schedule the skills sync if you actually use a distinct external skills repo at runtime.
