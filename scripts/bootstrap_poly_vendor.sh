#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SERVICE="${SERVICE:-gateway}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-/var/lib/ops/workspaces/vendor}"
POLYBOT_DIR="${POLYBOT_DIR:-${WORKSPACE_ROOT}/Polybot}"
TOOL_BIN_DIR="${TOOL_BIN_DIR:-${OPS_RUNTIME_TOOL_BIN_DIR:-/var/lib/ops/tooling/bin}}"
TOOL_ENV_DIR="${TOOL_ENV_DIR:-${OPS_RUNTIME_UV_TOOL_DIR:-/var/lib/ops/tooling/uv-tools}}"
TOOL_PYTHON_DIR="${TOOL_PYTHON_DIR:-${OPS_RUNTIME_UV_PYTHON_INSTALL_DIR:-/var/lib/ops/tooling/python}}"
POLYBOT_CONFIG_PATH="${POLYBOT_CONFIG_PATH:-${POLYBOT_CONFIG:-/var/lib/ops/state/polybot/config.yaml}}"
POLYX_PACKAGE="${POLYX_PACKAGE:-${OPS_BOOTSTRAP_POLYX_PACKAGE:-${POLYX_UV_PACKAGE:-polyx-cli}}}"
POLYBOT_REPO="${POLYBOT_REPO:-https://github.com/ElyzeSolutions/Polybot.git}"
POLYBOT_REF="${POLYBOT_REF:-main}"
TOKEN_ENV_NAME="${TOKEN_ENV_NAME:-}"

INSTALL_POLYX_CLI=1
INSTALL_POLYBOT_CLI=1
RESTART_SERVICE=0

declare -a COMPOSE_FILES=()

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap_poly_vendor.sh [options]

Bootstraps Polybot inside the running gateway container and installs PolyX from its public package by default:
1) clone/pull Polybot into /var/lib/ops/workspaces/vendor
2) run uv sync in Polybot
3) install/update Polybot operator tools and the PolyX CLI into /var/lib/ops/tooling/bin (optional)
4) seed /var/lib/ops/state/polybot/config.yaml from the Polybot repo if missing
5) restart gateway service (optional)

Options:
  -f, --compose-file <path>   Additional compose file (repeatable)
      --service <name>        Compose service name (default: gateway)
      --workspace-root <path> Vendor workspace root in container
      --tool-bin <path>       CLI install target in container
      --tool-env <path>       uv tool environment root in container
      --polybot-config <path> Polybot config target in container
      --polyx-package <spec>  PolyX package spec (default: polyx-cli)
      --polybot-repo <url>    Polybot git URL
      --polybot-ref <ref>     Polybot branch/tag/sha (default: main)
      --token-env <name>      Host env var containing GitHub PAT (default: auto-detect)
      --skip-polybot-cli      Skip uv tool install for Polybot operator tools
      --skip-polyx-cli        Skip uv tool install for PolyX CLI
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
    --workspace-root)
      WORKSPACE_ROOT="$2"
      POLYBOT_DIR="${WORKSPACE_ROOT}/Polybot"
      shift 2
      ;;
    --tool-bin)
      TOOL_BIN_DIR="$2"
      shift 2
      ;;
    --tool-env)
      TOOL_ENV_DIR="$2"
      shift 2
      ;;
    --polybot-config)
      POLYBOT_CONFIG_PATH="$2"
      shift 2
      ;;
    --polyx-package)
      POLYX_PACKAGE="$2"
      shift 2
      ;;
    --polybot-repo)
      POLYBOT_REPO="$2"
      shift 2
      ;;
    --polybot-ref)
      POLYBOT_REF="$2"
      shift 2
      ;;
    --token-env)
      TOKEN_ENV_NAME="$2"
      shift 2
      ;;
    --skip-polybot-cli)
      INSTALL_POLYBOT_CLI=0
      shift
      ;;
    --skip-polyx-cli)
      INSTALL_POLYX_CLI=0
      shift
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

echo "info: project root: ${ROOT_DIR}"
echo "info: compose files: ${COMPOSE_FILES[*]}"
echo "info: service: ${SERVICE}"
echo "info: workspace root: ${WORKSPACE_ROOT}"
echo "info: tool bin: ${TOOL_BIN_DIR}"
echo "info: tool env: ${TOOL_ENV_DIR}"
echo "info: tool python: ${TOOL_PYTHON_DIR}"
echo "info: polybot config: ${POLYBOT_CONFIG_PATH}"
echo "info: polyx package: ${POLYX_PACKAGE:-<disabled>}"
if [[ -z "${GITHUB_TOKEN_VALUE}" ]]; then
  echo "warn: no GitHub token found. Public repos can still clone, but private repos will fail. Set OPS_GITHUB_PAT, GH_TOKEN, GITHUB_TOKEN, or GH_PAT for authenticated access." >&2
fi

(
  cd "${ROOT_DIR}"
  "${COMPOSE_CMD[@]}" exec -T \
    --env "GITHUB_TOKEN=${GITHUB_TOKEN_VALUE}" \
    --env "WORKSPACE_ROOT=${WORKSPACE_ROOT}" \
    --env "POLYBOT_DIR=${POLYBOT_DIR}" \
    --env "TOOL_BIN_DIR=${TOOL_BIN_DIR}" \
    --env "TOOL_ENV_DIR=${TOOL_ENV_DIR}" \
    --env "TOOL_PYTHON_DIR=${TOOL_PYTHON_DIR}" \
    --env "POLYBOT_CONFIG_PATH=${POLYBOT_CONFIG_PATH}" \
    --env "POLYBOT_REPO=${POLYBOT_REPO}" \
    --env "POLYBOT_REF=${POLYBOT_REF}" \
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

clone_or_update() {
  local target_dir="$1"
  local repo_url="$2"
  local ref="$3"

  if [[ -d "${target_dir}/.git" ]]; then
    echo "info: updating $(basename "${target_dir}") at ${target_dir} (${ref})"
    git_auth -C "${target_dir}" fetch --depth 1 origin "${ref}"
    if git -C "${target_dir}" rev-parse --verify --quiet "${ref}" >/dev/null; then
      git -C "${target_dir}" checkout "${ref}"
    else
      git -C "${target_dir}" checkout -B "${ref}" "origin/${ref}"
    fi
    git_auth -C "${target_dir}" pull --ff-only origin "${ref}"
  else
    echo "info: cloning $(basename "${target_dir}") into ${target_dir} (${ref})"
    mkdir -p "$(dirname "${target_dir}")"
    git_auth clone --depth 1 --branch "${ref}" "${repo_url}" "${target_dir}"
  fi
}

mkdir -p "${WORKSPACE_ROOT}" "${TOOL_BIN_DIR}" "${TOOL_ENV_DIR}" "${TOOL_PYTHON_DIR}"
clone_or_update "${POLYBOT_DIR}" "${POLYBOT_REPO}" "${POLYBOT_REF}"
mkdir -p "$(dirname "${POLYBOT_CONFIG_PATH}")"

echo "info: syncing Polybot environment"
cd "${POLYBOT_DIR}"
UV_PYTHON_INSTALL_DIR="${TOOL_PYTHON_DIR}" uv sync
IN_CONTAINER
)

if [[ "${INSTALL_POLYBOT_CLI}" -eq 1 ]]; then
  echo "info: installing/updating Polybot operator tools"
  (
    cd "${ROOT_DIR}"
    "${COMPOSE_CMD[@]}" exec -T \
      --env "POLYBOT_DIR=${POLYBOT_DIR}" \
      --env "POLYX_PACKAGE=${POLYX_PACKAGE}" \
      --env "TOOL_BIN_DIR=${TOOL_BIN_DIR}" \
      --env "TOOL_ENV_DIR=${TOOL_ENV_DIR}" \
      --env "TOOL_PYTHON_DIR=${TOOL_PYTHON_DIR}" \
      --env "POLYBOT_CONFIG_PATH=${POLYBOT_CONFIG_PATH}" \
      "${SERVICE}" bash -lc '
        set -Eeuo pipefail
        mkdir -p "$TOOL_BIN_DIR" "$TOOL_ENV_DIR" "$TOOL_PYTHON_DIR" "$(dirname "$POLYBOT_CONFIG_PATH")"
        install_args=(tool install --editable "$POLYBOT_DIR")
        if [ -n "${POLYX_PACKAGE:-}" ]; then
          install_args+=(--with "$POLYX_PACKAGE")
        fi
        install_args+=(--force)
        UV_TOOL_BIN_DIR="$TOOL_BIN_DIR" UV_TOOL_DIR="$TOOL_ENV_DIR" UV_PYTHON_INSTALL_DIR="$TOOL_PYTHON_DIR" uv "${install_args[@]}"
        if [ -f "$POLYBOT_DIR/config.yaml" ]; then
          if [ ! -f "$POLYBOT_CONFIG_PATH" ]; then
            cp "$POLYBOT_DIR/config.yaml" "$POLYBOT_CONFIG_PATH"
          elif grep -Eq "scripts/[^\"[:space:]]+\\.(py|sh)" "$POLYBOT_CONFIG_PATH" && ! grep -Eq "src/polybot/scripts/" "$POLYBOT_CONFIG_PATH"; then
            backup_path="$POLYBOT_CONFIG_PATH.bak.$(date +%s)"
            cp "$POLYBOT_CONFIG_PATH" "$backup_path"
            cp "$POLYBOT_DIR/config.yaml" "$POLYBOT_CONFIG_PATH"
            echo "info: repaired stale polybot config -> $backup_path"
          fi
        fi
      '
  )
fi

if [[ "${INSTALL_POLYX_CLI}" -eq 1 ]]; then
  echo "info: installing/updating PolyX CLI tool"
  (
    cd "${ROOT_DIR}"
    "${COMPOSE_CMD[@]}" exec -T \
      --env "TOOL_BIN_DIR=${TOOL_BIN_DIR}" \
      --env "TOOL_ENV_DIR=${TOOL_ENV_DIR}" \
      --env "TOOL_PYTHON_DIR=${TOOL_PYTHON_DIR}" \
      --env "POLYX_PACKAGE=${POLYX_PACKAGE}" \
      "${SERVICE}" bash -lc '
        set -Eeuo pipefail
        mkdir -p "$TOOL_BIN_DIR" "$TOOL_ENV_DIR" "$TOOL_PYTHON_DIR"
        if [ -n "${POLYX_PACKAGE:-}" ]; then
          UV_TOOL_BIN_DIR="$TOOL_BIN_DIR" UV_TOOL_DIR="$TOOL_ENV_DIR" UV_PYTHON_INSTALL_DIR="$TOOL_PYTHON_DIR" uv tool install "$POLYX_PACKAGE" --force
        else
          echo "info: skipping PolyX CLI install because no package is configured"
        fi
      '
  )
fi

if [[ "${RESTART_SERVICE}" -eq 1 ]]; then
  echo "info: restarting service ${SERVICE}"
  (
    cd "${ROOT_DIR}"
    "${COMPOSE_CMD[@]}" restart "${SERVICE}"
  )
fi

echo "info: bootstrap/update completed successfully"
