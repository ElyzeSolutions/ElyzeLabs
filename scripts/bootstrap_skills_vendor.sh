#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SERVICE="${SERVICE:-gateway}"
SKILLS_ROOT="${SKILLS_ROOT:-/home/node/.agents/skills/vendor-skills}"
SKILLS_REPO="${SKILLS_REPO:-}"
SKILLS_REF="${SKILLS_REF:-main}"
SKILLS_DISCOVERY_DEPTH="${SKILLS_DISCOVERY_DEPTH:-6}"
TOKEN_ENV_NAME="${TOKEN_ENV_NAME:-}"
RESTART_SERVICE=0

declare -a COMPOSE_FILES=()

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap_skills_vendor.sh [options]

Bootstraps or updates an external skills repo inside the running gateway container:
1) clone/pull the skills repo into /home/node/.agents/skills/vendor-skills
2) autodiscover skills into the ElyzeLabs catalog
3) reload the skill registry
4) optionally restart the gateway service

Options:
  -f, --compose-file <path>   Additional compose file (repeatable)
      --service <name>        Compose service name (default: gateway)
      --skills-root <path>    Skills repo location in container
      --skills-repo <url>     Skills git URL (required unless SKILLS_REPO is already set)
      --skills-ref <ref>      Skills branch/tag/sha (default: main)
      --depth <n>             Autodiscover depth (default: 6)
      --token-env <name>      Host env var containing GitHub PAT (default: auto-detect)
      --restart               Restart service after successful update
  -h, --help                  Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--compose-file)
      COMPOSE_FILES+=("$2")
      shift 2
      ;;
    --service)
      SERVICE="$2"
      shift 2
      ;;
    --skills-root)
      SKILLS_ROOT="$2"
      shift 2
      ;;
    --skills-repo)
      SKILLS_REPO="$2"
      shift 2
      ;;
    --skills-ref)
      SKILLS_REF="$2"
      shift 2
      ;;
    --depth)
      SKILLS_DISCOVERY_DEPTH="$2"
      shift 2
      ;;
    --token-env)
      TOKEN_ENV_NAME="$2"
      shift 2
      ;;
    --restart)
      RESTART_SERVICE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

declare -a COMPOSE_CMD=(docker compose)
if [[ ${#COMPOSE_FILES[@]} -eq 0 ]]; then
  COMPOSE_FILES=("docker-compose.yml")
fi
for file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_CMD+=(-f "$file")
done

resolve_token() {
  if [[ -n "${TOKEN_ENV_NAME}" ]]; then
    echo "${!TOKEN_ENV_NAME:-}"
    return
  fi

  local candidates=(OPS_GITHUB_PAT GH_TOKEN GITHUB_TOKEN GH_PAT)
  local key=""
  for key in "${candidates[@]}"; do
    if [[ -n "${!key:-}" ]]; then
      TOKEN_ENV_NAME="${key}"
      echo "${!key}"
      return
    fi
  done

  TOKEN_ENV_NAME="GITHUB_TOKEN"
  echo ""
}

GITHUB_TOKEN_VALUE="$(resolve_token)"

if [[ -z "${SKILLS_REPO}" ]]; then
  echo "error: skills repo is required. Set SKILLS_REPO or pass --skills-repo <url>." >&2
  exit 2
fi

echo "info: project root: ${ROOT_DIR}"
echo "info: compose files: ${COMPOSE_FILES[*]}"
echo "info: service: ${SERVICE}"
echo "info: skills root: ${SKILLS_ROOT}"
if [[ -z "${GITHUB_TOKEN_VALUE}" ]]; then
  echo "warn: no GitHub token found. Public repos can still clone, but private repos will fail. Set OPS_GITHUB_PAT, GH_TOKEN, GITHUB_TOKEN, or GH_PAT for authenticated access." >&2
fi

(
  cd "${ROOT_DIR}"
  "${COMPOSE_CMD[@]}" exec -T \
    --env "GITHUB_TOKEN=${GITHUB_TOKEN_VALUE}" \
    --env "SKILLS_ROOT=${SKILLS_ROOT}" \
    --env "SKILLS_REPO=${SKILLS_REPO}" \
    --env "SKILLS_REF=${SKILLS_REF}" \
    --env "SKILLS_DISCOVERY_DEPTH=${SKILLS_DISCOVERY_DEPTH}" \
    "${SERVICE}" bash -s <<'IN_CONTAINER'
set -Eeuo pipefail

git_auth() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    git \
      -c credential.helper= \
      -c core.askPass= \
      -c "url.https://x-access-token:${GITHUB_TOKEN}@github.com/.insteadOf=https://github.com/" \
      -c "url.https://x-access-token:${GITHUB_TOKEN}@github.com/.insteadOf=git@github.com:" \
      -c "url.https://x-access-token:${GITHUB_TOKEN}@github.com/.insteadOf=ssh://git@github.com/" \
      "$@"
  else
    git "$@"
  fi
}

if [[ -d "${SKILLS_ROOT}/.git" ]]; then
  echo "info: updating skills repo at ${SKILLS_ROOT} (${SKILLS_REF})"
  git_auth -C "${SKILLS_ROOT}" fetch --depth 1 origin "${SKILLS_REF}"
  if git -C "${SKILLS_ROOT}" rev-parse --verify --quiet "${SKILLS_REF}" >/dev/null; then
    git -C "${SKILLS_ROOT}" checkout "${SKILLS_REF}"
  else
    git -C "${SKILLS_ROOT}" checkout -B "${SKILLS_REF}" "origin/${SKILLS_REF}"
  fi
  git_auth -C "${SKILLS_ROOT}" pull --ff-only origin "${SKILLS_REF}"
else
  echo "info: cloning skills repo into ${SKILLS_ROOT} (${SKILLS_REF})"
  mkdir -p "$(dirname "${SKILLS_ROOT}")"
  git_auth clone --depth 1 --branch "${SKILLS_REF}" "${SKILLS_REPO}" "${SKILLS_ROOT}"
fi

echo "info: autodiscovering skills"
cd /app
pnpm skills:config autodiscover "${SKILLS_ROOT}" --approved --depth "${SKILLS_DISCOVERY_DEPTH}"

echo "info: reloading skills"
pnpm skills:config reload
IN_CONTAINER
)

if [[ "${RESTART_SERVICE}" -eq 1 ]]; then
  echo "info: restarting service ${SERVICE}"
  (
    cd "${ROOT_DIR}"
    "${COMPOSE_CMD[@]}" restart "${SERVICE}"
  )
fi

echo "info: skills bootstrap/update completed successfully"
