#!/usr/bin/env bash
set -Eeuo pipefail

STRICT_MODE="${OPS_CLI_INSTALL_STRICT:-false}"
TOOLS_DIR="${OPS_TOOLING_DIR:-/opt/ops/tooling}"

CODEX_NPM_PACKAGE="${CODEX_NPM_PACKAGE:-@openai/codex@latest}"
CLAUDE_NPM_PACKAGE="${CLAUDE_NPM_PACKAGE:-@anthropic-ai/claude-code@latest}"
GEMINI_NPM_PACKAGE="${GEMINI_NPM_PACKAGE:-@google/gemini-cli@latest}"
SKILLS_CLI_NPM_PACKAGE="${SKILLS_CLI_NPM_PACKAGE:-}"

# Python tools (PyPI package specs, git+https:// URLs, or local checkout paths)
POLYX_UV_PACKAGE="${POLYX_UV_PACKAGE:-polyx-cli}"
POLYBOT_UV_PACKAGE="${POLYBOT_UV_PACKAGE:-}"
POLYBOT_UV_REF="${POLYBOT_UV_REF:-main}"
SCRAPLING_UV_PACKAGE="${SCRAPLING_UV_PACKAGE:-}"
POLYBOT_CONFIG_TARGET="${POLYBOT_CONFIG_TARGET:-${POLYBOT_CONFIG:-/var/lib/ops/state/polybot/config.yaml}}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${TOOLS_DIR}/playwright}"

mkdir -p "${TOOLS_DIR}"
mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"

declare -a INSTALLED_TOOLS=()
declare -a FAILED_TOOLS=()

record_installed() {
  INSTALLED_TOOLS+=("$1")
}

record_failed() {
  FAILED_TOOLS+=("$1")
}

join_csv() {
  if [ "$#" -eq 0 ]; then
    echo ""
    return 0
  fi

  local IFS=,
  echo "$*"
}

fail_or_warn() {
  local message="$1"
  if [ "${STRICT_MODE}" = "true" ]; then
    echo "error: ${message}" >&2
    exit 1
  fi
  echo "warn: ${message}" >&2
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

UV_RUNTIME_BIN_DIR="${OPS_RUNTIME_TOOL_BIN_DIR:-/usr/local/bin}"
UV_RUNTIME_TOOL_DIR="${OPS_RUNTIME_UV_TOOL_DIR:-/usr/local/lib/uv/tools}"
UV_RUNTIME_PYTHON_INSTALL_DIR="${OPS_RUNTIME_UV_PYTHON_INSTALL_DIR:-/usr/local/lib/uv/python}"

mkdir -p "${UV_RUNTIME_BIN_DIR}" "${UV_RUNTIME_TOOL_DIR}" "${UV_RUNTIME_PYTHON_INSTALL_DIR}" "$(dirname "${POLYBOT_CONFIG_TARGET}")"

# Inject GITHUB_TOKEN into github.com URLs for private repo access.
_authed_url() {
  local url="$1"
  local normalized="$url"
  local prefix=""

  if [ -z "${GITHUB_TOKEN}" ]; then
    echo "${url}"
    return
  fi

  if [[ "${normalized}" == git+https://* ]]; then
    prefix="git+"
    normalized="${normalized#git+}"
  fi

  if [[ "${normalized}" == https://github.com/* ]]; then
    echo "${prefix}https://x-access-token:${GITHUB_TOKEN}@github.com/${normalized#https://github.com/}"
    return
  fi

  if [[ "${normalized}" == git@github.com:* ]]; then
    echo "${prefix}https://x-access-token:${GITHUB_TOKEN}@github.com/${normalized#git@github.com:}"
    return
  fi

  echo "${url}"
}

sync_checkout() {
  local repo_url="$1"
  local ref="$2"
  local checkout_dir="$3"
  local label="$4"
  local clone_url

  clone_url="$(_authed_url "${repo_url}")"
  mkdir -p "$(dirname "${checkout_dir}")"

  if [ -d "${checkout_dir}/.git" ]; then
    if ! git -C "${checkout_dir}" fetch --depth 1 origin "${ref}"; then
      fail_or_warn "failed to update ${label} repo checkout."
      return 1
    fi
    if ! git -C "${checkout_dir}" checkout -B elyze-build-install FETCH_HEAD; then
      fail_or_warn "failed to checkout ${label} ref ${ref}."
      return 1
    fi
    return 0
  fi

  if ! git clone --depth 1 --branch "${ref}" "${clone_url}" "${checkout_dir}"; then
    fail_or_warn "failed to clone ${label} repo."
    return 1
  fi
}

# ── npm CLI installs ──

install_optional_npm_cli() {
  local label="$1"
  local package_name="$2"
  local command_name="$3"

  if has_command "${command_name}"; then
    record_installed "${label}:${command_name}"
    return 0
  fi

  if [ -z "${package_name}" ]; then
    return 0  # empty = not configured, silently skip
  fi

  echo "info: installing ${label} from npm package ${package_name}"
  if npm install -g "${package_name}"; then
    if has_command "${command_name}"; then
      record_installed "${label}:${command_name}"
      return 0
    fi

    fail_or_warn "${label} installed but command ${command_name} not found in PATH."
    record_failed "${label}:missing-command"
    return 0
  fi

  fail_or_warn "failed to install ${label} package ${package_name}."
  record_failed "${label}:install-failed"
  return 0
}

# ── Python tool installs via uv ──

install_optional_uv_tool() {
  local label="$1"
  local package_spec="$2"
  local command_name="$3"

  if has_command "${command_name}"; then
    record_installed "${label}:${command_name}"
    return 0
  fi

  if [ -z "${package_spec}" ]; then
    return 0  # empty = not configured, silently skip
  fi

  if ! has_command uv; then
    fail_or_warn "${label} requires uv but it's not installed."
    record_failed "${label}:no-uv"
    return 0
  fi

  local resolved_spec
  resolved_spec="$(_authed_url "${package_spec}")"

  echo "info: installing ${label} via uv tool install"
  if UV_TOOL_BIN_DIR="${UV_RUNTIME_BIN_DIR}" UV_TOOL_DIR="${UV_RUNTIME_TOOL_DIR}" UV_PYTHON_INSTALL_DIR="${UV_RUNTIME_PYTHON_INSTALL_DIR}" uv tool install "${resolved_spec}"; then
    if has_command "${command_name}"; then
      record_installed "${label}:${command_name}"
      return 0
    fi
    fail_or_warn "${label} installed but command ${command_name} not found."
    record_failed "${label}:missing-command"
    return 0
  fi

  fail_or_warn "failed to install ${label}."
  record_failed "${label}:install-failed"
  return 0
}

# Polybot needs clone + dashboard build + Python install.
install_polybot_suite() {
  local repo_url="$1"
  local ref="${2:-main}"
  local command_name="polybot"
  local daemon_command="polybot-daemon"
  local checkout_dir="${TOOLS_DIR}/vendor/Polybot"
  local polyx_package_spec="${POLYX_UV_PACKAGE:-polyx-cli}"
  local install_args=(tool install --editable "${checkout_dir}")

  if has_command "${command_name}"; then
    record_installed "polybot:${command_name}"
    if has_command "${daemon_command}"; then
      record_installed "polybot:${daemon_command}"
    fi
    return 0
  fi

  if [ -z "${repo_url}" ]; then
    return 0  # not configured
  fi

  if ! has_command uv; then
    fail_or_warn "polybot requires uv but it's not installed."
    record_failed "polybot:no-uv"
    return 0
  fi

  echo "info: installing polybot from ${repo_url} (ref: ${ref}) into ${checkout_dir}"
  if ! sync_checkout "${repo_url}" "${ref}" "${checkout_dir}" "polybot"; then
    record_failed "polybot:clone-failed"
    return 0
  fi

  if [ -n "${polyx_package_spec}" ]; then
    echo "info: layering companion PolyX package ${polyx_package_spec} into the Polybot tool environment"
    install_args+=(--with "${polyx_package_spec}")
  fi
  install_args+=(--force)

  # Build Vite dashboard if Node is available
  if has_command npm && [ -f "${checkout_dir}/src/polybot/dashboard/package.json" ]; then
    echo "info: building polybot dashboard"
    if ! (cd "${checkout_dir}/src/polybot/dashboard" && npm install --no-fund --no-audit && npm run build); then
      echo "warn: dashboard build failed, continuing without dashboard"
    fi
  fi

  # Copy config.yaml to a stable location outside the checkout for runtime mounts.
  if [ -f "${checkout_dir}/config.yaml" ]; then
    mkdir -p "$(dirname "${POLYBOT_CONFIG_TARGET}")"
    cp "${checkout_dir}/config.yaml" "${POLYBOT_CONFIG_TARGET}"
  fi

  # Use an editable install from the persistent checkout so the packaged
  # operator entrypoints can still resolve the checked-in shell wrappers.
  if UV_TOOL_BIN_DIR="${UV_RUNTIME_BIN_DIR}" UV_TOOL_DIR="${UV_RUNTIME_TOOL_DIR}" UV_PYTHON_INSTALL_DIR="${UV_RUNTIME_PYTHON_INSTALL_DIR}" uv "${install_args[@]}"; then
    if has_command "${command_name}"; then
      record_installed "polybot:${command_name}"
      if has_command "${daemon_command}"; then
        record_installed "polybot:${daemon_command}"
      fi
    else
      fail_or_warn "polybot installed but ${command_name} not found."
      record_failed "polybot:missing-command"
    fi
  else
    fail_or_warn "failed to install polybot."
    record_failed "polybot:install-failed"
  fi

  return 0
}

# ── Base tools check ──

declare -a base_tools=(node npm npx pnpm git curl wget jq rg)
for tool in "${base_tools[@]}"; do
  if has_command "${tool}"; then
    record_installed "base:${tool}"
  else
    fail_or_warn "base tool ${tool} is missing."
    record_failed "base:${tool}"
  fi
done

# ── Install npm CLIs ──

install_optional_npm_cli "codex" "${CODEX_NPM_PACKAGE}" "codex"
install_optional_npm_cli "claude" "${CLAUDE_NPM_PACKAGE}" "claude"
install_optional_npm_cli "gemini" "${GEMINI_NPM_PACKAGE}" "gemini"
install_optional_npm_cli "skills" "${SKILLS_CLI_NPM_PACKAGE}" "skills"

# ── Install Python tools ──

install_optional_uv_tool "polyx" "${POLYX_UV_PACKAGE}" "polyx"
install_polybot_suite "${POLYBOT_UV_PACKAGE}" "${POLYBOT_UV_REF}"
install_optional_uv_tool "scrapling" "${SCRAPLING_UV_PACKAGE}" "scrapling"

if has_command scrapling; then
  echo "info: bootstrapping scrapling browser dependencies"
  if scrapling install; then
    record_installed "scrapling:bootstrap"
  else
    fail_or_warn "failed to bootstrap scrapling browser dependencies."
    record_failed "scrapling:bootstrap-failed"
  fi
fi

# ── Summary ──

{
  echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "strict_mode=${STRICT_MODE}"
  if [ "${#INSTALLED_TOOLS[@]}" -eq 0 ]; then
    echo "installed_tools="
  else
    echo "installed_tools=$(join_csv "${INSTALLED_TOOLS[@]}")"
  fi
  if [ "${#FAILED_TOOLS[@]}" -eq 0 ]; then
    echo "failed_tools="
  else
    echo "failed_tools=$(join_csv "${FAILED_TOOLS[@]}")"
  fi
} > "${TOOLS_DIR}/tooling.env"

echo "info: tooling summary saved to ${TOOLS_DIR}/tooling.env"
