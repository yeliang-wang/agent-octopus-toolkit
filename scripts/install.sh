#!/usr/bin/env bash
#
# Install or update agent 八爪鱼工具包 agents for Claude Code and Codex.
#
# Usage:
#   ./scripts/install.sh [--tool claude-code|codex|all] [--update] [--help]

set -euo pipefail

if [[ -t 1 ]]; then
  C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[1;33m'; C_RED=$'\033[0;31m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_BOLD=''; C_RESET=''
fi

ok() { printf "%s[OK]%s  %s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf "%s[!!]%s  %s\n" "$C_YELLOW" "$C_RESET" "$*"; }
err() { printf "%s[ERR]%s %s\n" "$C_RED" "$C_RESET" "$*" >&2; }
action_label() {
  if [[ "$ACTION" == "update" ]]; then
    printf "updated"
  else
    printf "installed"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOOL="all"
ACTION="install"

usage() {
  cat <<'EOF'
Install or update agent 八爪鱼工具包 agents for Claude Code and Codex.

Usage:
  ./scripts/install.sh [--tool claude-code|codex|all] [--update] [--help]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      [[ $# -ge 2 ]] || { err "--tool requires a value"; exit 1; }
      TOOL="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --update)
      ACTION="update"
      shift
      ;;
    *)
      err "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

install_claude_code() {
  local src="$REPO_ROOT/agents"
  local dest="${HOME}/.claude/agents"
  local count=0

  [[ -d "$src" ]] || { err "agents/ not found: $src"; return 1; }
  mkdir -p "$dest"

  local f
  while IFS= read -r -d '' f; do
    cp "$f" "$dest/"
    count=$((count + 1))
  done < <(find "$src" -maxdepth 1 -type f -name "*.md" -print0)

  ok "Claude Code: $count agents $(action_label) -> $dest"
  ok "Sandbox: $REPO_ROOT/bin/octopus-sandbox"
}

install_codex() {
  local src="$REPO_ROOT/integrations/codex/agents"
  local dest="${PWD}/.codex/agents"
  local count=0

  [[ -d "$src" ]] || { err "Codex agents not found: $src"; return 1; }
  mkdir -p "$dest"

  local f
  while IFS= read -r -d '' f; do
    cp "$f" "$dest/"
    count=$((count + 1))
  done < <(find "$src" -maxdepth 1 -type f -name "*.toml" -print0)

  ok "Codex: $count agents $(action_label) -> $dest"
  ok "Sandbox: $REPO_ROOT/bin/octopus-sandbox"
  warn "Codex install is project-scoped; run this command from the target project root."
}

detect_claude_code() { [[ -d "${HOME}/.claude" ]] || command -v claude >/dev/null 2>&1; }
detect_codex() { [[ -d "${HOME}/.codex" ]] || command -v codex >/dev/null 2>&1; }

case "$TOOL" in
  claude-code)
    install_claude_code
    ;;
  codex)
    install_codex
    ;;
  all)
    installed=0
    if detect_claude_code; then install_claude_code; installed=1; fi
    if detect_codex; then install_codex; installed=1; fi
    if [[ "$installed" -eq 0 ]]; then
      warn "No supported tools detected. Use --tool claude-code or --tool codex to install explicitly."
    fi
    ;;
  *)
    err "Unsupported tool: $TOOL"
    usage
    exit 1
    ;;
esac
