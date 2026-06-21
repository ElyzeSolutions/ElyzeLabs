# Live GitHub Delivery Certification

This opt-in lane proves that the operator Kanban can connect to a real GitHub repository, create a backlog item, sync it into a GitHub issue, read delivery detail, and apply the safe `refresh` repair action.

## Command

Dry default:

```bash
pnpm test:live-github-delivery
```

Live run:

```bash
OPS_RUN_LIVE_GITHUB_DELIVERY_CERT=1 \
OPS_LIVE_GITHUB_DELIVERY_REPO=owner/repo \
OPS_LIVE_GITHUB_DELIVERY_TOKEN_ENV=OPS_GITHUB_PAT \
pnpm test:live-github-delivery
```

Strict live run:

```bash
OPS_RUN_LIVE_GITHUB_DELIVERY_CERT=1 \
OPS_LIVE_GITHUB_DELIVERY_STRICT=1 \
OPS_LIVE_GITHUB_DELIVERY_REPO=owner/repo \
OPS_LIVE_GITHUB_DELIVERY_TOKEN_ENV=OPS_GITHUB_PAT \
pnpm test:live-github-delivery
```

The token value must be available to the gateway process through the referenced env key. The script sends only `env:<key>` to the API; it never sends a raw GitHub token.

## Required Setup

- Start the gateway with `OPS_API_TOKEN` configured.
- Expose a GitHub token to the gateway through `GITHUB_TOKEN`, `GH_TOKEN`, or `OPS_GITHUB_PAT`.
- Set `OPS_LIVE_GITHUB_DELIVERY_REPO=owner/repo`.
- Ensure the token can read the repo and create/update issues.

## Side Effect

A live run creates or updates one GitHub issue with a certification marker. Keep this pointed at a repository where that is acceptable.

## Artifacts

Raw local report:

- `.ops/certifications/live-github-delivery/certification-report.json`

Tracked redacted archive:

- `docs/certifications/live-github-delivery-latest.json`

## What It Proves

- Repo connection creation uses `env:` or vault-style secret references, not raw PATs.
- GitHub credential resolution and repo sync work against a real repository.
- Kanban backlog delivery links to a repo connection.
- Backlog issue sync can create/update a real GitHub issue.
- Delivery detail and safe repair receipts are available for operator recovery.
