#!/usr/bin/env bash
set -euo pipefail

TOOLKIT_ROOT="${TOOLKIT_ROOT:-/Users/wangyejing/github/agent-octopus-toolkit}"
PRODUCT_ROOT="${PRODUCT_EVOLUTION_LAB_PRODUCT_ROOT:-${PRODUCT_ROOT:-$(pwd)}}"
PRODUCT_ID="${PRODUCT_EVOLUTION_LAB_PRODUCT_ID:-$(basename "$PRODUCT_ROOT")}"
DATA_ROOT="${PRODUCT_EVOLUTION_LAB_DATA_ROOT:-$TOOLKIT_ROOT/data/product-evolution-lab}"
MATERIAL_ROOT="${PRODUCT_EVOLUTION_LAB_MATERIAL_ROOT:-$DATA_ROOT/materials}"
RUN_ROOT="$DATA_ROOT/runs"
LOG_ROOT="$DATA_ROOT/logs"
STATUS_FILE="$DATA_ROOT/current-status.md"
LATEST_RUN_LINK="$DATA_ROOT/latest-run"

DURATION_HOURS="${PRODUCT_EVOLUTION_LAB_DURATION_HOURS:-always}"
INTERVAL_SECONDS="${PRODUCT_EVOLUTION_LAB_INTERVAL_SECONDS:-900}"
GOAL="${PRODUCT_EVOLUTION_LAB_GOAL:-}"
STOP_CONDITION="${PRODUCT_EVOLUTION_LAB_STOP_CONDITION:-goal-proven-or-blocked}"

mkdir -p "$MATERIAL_ROOT" "$RUN_ROOT" "$LOG_ROOT"

status_now() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

write_status() {
  local phase="$1"
  local iteration="${2:-}"
  local run_dir="${3:-}"
  local result="${4:-}"
  local blocker="${5:-}"
  local next_run="${6:-}"
  cat > "$STATUS_FILE" <<EOF
# product-evolution-lab current status

- updatedAt: $(status_now)
- phase: $phase
- productId: $PRODUCT_ID
- productRoot: $PRODUCT_ROOT
- goal: $GOAL
- stopCondition: $STOP_CONDITION
- intervalSeconds: $INTERVAL_SECONDS
- durationHours: $DURATION_HOURS
- iteration: $iteration
- runDir: $run_dir
- result: $result
- blocker: $blocker
- nextRunAt: $next_run

## Stable Paths

- logRoot: $LOG_ROOT
- latestRun: $LATEST_RUN_LINK
- runRoot: $RUN_ROOT
- materialRoot: $MATERIAL_ROOT
EOF
}

require_profile() {
  if [ -z "$GOAL" ]; then
    write_status "BLOCKED_PROFILE_MISSING" "" "" "" "PRODUCT_EVOLUTION_LAB_GOAL is required" ""
    echo "BLOCKED: PRODUCT_EVOLUTION_LAB_GOAL is required" >&2
    return 1
  fi
  if [ -z "${PRODUCT_EVOLUTION_LAB_E2E_COMMAND:-}" ]; then
    write_status "BLOCKED_PROFILE_MISSING" "" "" "" "PRODUCT_EVOLUTION_LAB_E2E_COMMAND is required" ""
    cat >&2 <<'EOF'
BLOCKED: product profile is not ready

Set PRODUCT_EVOLUTION_LAB_E2E_COMMAND to a product-owned command that runs one evidence-producing E2E iteration.
Optional commands:
- PRODUCT_EVOLUTION_LAB_READINESS_COMMAND
- PRODUCT_EVOLUTION_LAB_SELF_EVOLUTION_COMMAND
- PRODUCT_EVOLUTION_LAB_REVIEW_COMMAND
EOF
    return 1
  fi
}

run_optional_command() {
  local label="$1"
  local command="$2"
  local run_dir="$3"
  if [ -z "$command" ]; then
    return 0
  fi
  echo "[INFO] $label"
  (
    cd "$PRODUCT_ROOT"
    eval "$command"
  ) > "$run_dir/$label.stdout.log" 2> "$run_dir/$label.stderr.log"
}

run_one_iteration() {
  local iteration="$1"
  local run_id
  run_id="$(date +%Y%m%dT%H%M%S)-$iteration"
  local run_dir="$RUN_ROOT/$run_id"
  mkdir -p "$run_dir"

  export PRODUCT_EVOLUTION_LAB_RUN_DIR="$run_dir"
  export PRODUCT_EVOLUTION_LAB_ITERATION="$iteration"
  export PRODUCT_EVOLUTION_LAB_PRODUCT_ROOT="$PRODUCT_ROOT"
  export PRODUCT_EVOLUTION_LAB_PRODUCT_ID="$PRODUCT_ID"
  export PRODUCT_EVOLUTION_LAB_GOAL="$GOAL"
  export PRODUCT_EVOLUTION_LAB_MATERIAL_ROOT="$MATERIAL_ROOT"

  run_optional_command "readiness" "${PRODUCT_EVOLUTION_LAB_READINESS_COMMAND:-}" "$run_dir"
  PRODUCT_EVOLUTION_LAB_RUN_DIR="$run_dir" \
    node "$TOOLKIT_ROOT/tools/product-evolution-lab/run-one.mjs" \
    > "$run_dir/lab.stdout.log" 2> "$run_dir/lab.stderr.log"
  run_optional_command "self-evolution" "${PRODUCT_EVOLUTION_LAB_SELF_EVOLUTION_COMMAND:-}" "$run_dir"
  run_optional_command "review" "${PRODUCT_EVOLUTION_LAB_REVIEW_COMMAND:-}" "$run_dir"

  ln -sfn "$run_dir" "$LATEST_RUN_LINK"
  printf '%s' "$run_dir"
}

main() {
  require_profile
  write_status "STARTING" "" "" "" "" ""

  local deadline
  if [ "$DURATION_HOURS" = "forever" ] || [ "$DURATION_HOURS" = "always" ]; then
    deadline=0
  else
    deadline=$(( $(date +%s) + DURATION_HOURS * 3600 ))
  fi

  local iteration=0
  while [ "$deadline" = "0" ] || [ "$(date +%s)" -lt "$deadline" ]; do
    write_status "RUNNING_ITERATION" "$iteration" "" "" "" ""
    local result="SUCCEEDED"
    local run_dir=""
    if run_dir="$(run_one_iteration "$iteration")"; then
      result="SUCCEEDED"
    else
      result="FAILED"
    fi
    local next_run
    next_run="$(date -r $(( $(date +%s) + INTERVAL_SECONDS )) '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S %Z')"
    write_status "WAITING_NEXT_ROUND" "$iteration" "$run_dir" "$result" "" "$next_run"
    if [ "$result" != "SUCCEEDED" ] && [ "${PRODUCT_EVOLUTION_LAB_STOP_ON_FAILURE:-true}" = "true" ]; then
      write_status "BLOCKED_ITERATION_FAILED" "$iteration" "$run_dir" "$result" "iteration failed" ""
      exit 1
    fi
    iteration=$((iteration + 1))
    sleep "$INTERVAL_SECONDS"
  done

  write_status "STOPPED_DURATION_REACHED" "$iteration" "" "" "" ""
}

main "$@"
