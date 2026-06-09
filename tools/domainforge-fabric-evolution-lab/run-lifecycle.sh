#!/usr/bin/env bash
set -euo pipefail

TOOLKIT_ROOT="${TOOLKIT_ROOT:-/Users/wangyejing/github/agent-octopus-toolkit}"
DOMAINFORGE_ROOT="${DOMAINFORGE_ROOT:-/Users/wangyejing/project/domainforge-fabric}"
DATA_ROOT="${DOMAINFORGE_EVOLUTION_LAB_DATA_ROOT:-$TOOLKIT_ROOT/data/domainforge-fabric-evolution-lab}"
MATERIAL_ROOT="$DATA_ROOT/materials/public-vibes"
RUN_ROOT="$DATA_ROOT/runs"
LOG_ROOT="$DATA_ROOT/logs"
STATUS_FILE="$DATA_ROOT/current-status.md"
LATEST_RUN_LINK="$DATA_ROOT/latest-run"
USED_SOURCES="$DATA_ROOT/used-public-sources.json"

DURATION_HOURS="${DOMAINFORGE_EVOLUTION_LAB_DURATION_HOURS:-always}"
INTERVAL_SECONDS="${DOMAINFORGE_EVOLUTION_LAB_INTERVAL_SECONDS:-900}"
DOMAIN_ID="${DOMAINFORGE_EVOLUTION_LAB_DOMAIN_ID:-jsnx}"
SERVICE_PORT="${DOMAINFORGE_FABRIC_SERVICE_PORT:-18083}"
MCP_PORT="${DOMAINFORGE_FABRIC_MCP_PORT:-19728}"
SELF_EVOLUTION_PORT="${DOMAINFORGE_SELF_EVOLUTION_PORT:-18182}"
EXECUTION_PORT="${DOMAINFORGE_EXECUTION_PORT:-19528}"
GITLAB_DEFAULT_BRANCH="${DOMAINFORGE_GITLAB_DEFAULT_BRANCH:-dev_prod}"

mkdir -p "$MATERIAL_ROOT" "$RUN_ROOT" "$LOG_ROOT"

status_now() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

write_status() {
  local phase="$1"
  local iteration="${2:-}"
  local material="${3:-}"
  local goal="${4:-}"
  local run_dir="${5:-}"
  local result="${6:-}"
  local next_run="${7:-}"
  cat > "$STATUS_FILE" <<EOF
# domainforge-fabric-evolution-lab 当前状态

- 更新时间：$(status_now)
- 状态：$phase
- screen：domainforge-evolution-lab-always
- 间隔：$INTERVAL_SECONDS 秒
- 运行时长：$DURATION_HOURS
- 当前轮次：$iteration
- 当前素材：$material
- 当前目标：$goal
- 本轮目录：$run_dir
- 本轮结果：$result
- 下一轮时间：$next_run

## 固定位置

- 持续日志：$LOG_ROOT/continuous-always.log
- 最新批次：$LATEST_RUN_LINK
- 批次目录：$RUN_ROOT
- 素材池：$MATERIAL_ROOT

## 服务入口

- fabric-service：http://127.0.0.1:$SERVICE_PORT/health
- MCP：http://127.0.0.1:$MCP_PORT/health
- self-evolution：http://127.0.0.1:$SELF_EVOLUTION_PORT/health
EOF
}

write_public_materials() {
  cat > "$MATERIAL_ROOT/credit-smart-risk-platform.md" <<'EOF'
# 公开材料 Vibe：信贷智能风控平台

来源：
- 山东省农村信用社联合社信贷智能风控平台项目招标公告
  https://www.sdnxs.com/sdnxs/374215/374223/374008/2023121919423812309/index.html
- 九江银行信用风险监测预警系统需求说明书
  https://www.jjccb.com/portal/zh_CN/upload/Attachment/20200228143128012.pdf

公开材料要点归纳：
- 建设信贷智能风控平台，通过风险预警模型、非现场监测模型和大数据分析支撑贷后风险识别与监测。
- 风险预警体系需要覆盖法人客户、自然人客户、集团客户、产品、行业、区域、机构等对象。
- 数据源包括行内账户交易、征信、工商、税务、司法、舆情、押品和外部环境信息。
- 预警信号应覆盖信用行为、经营管理、财务风险、公司治理、关联风险、押品风险、外部环境等。
- 目标不是替代人工审批，而是形成预警、排查、跟踪和解除的贷后监测闭环。

Vibe 目标：
形成“贷后风险预警信号 -> 风险类型 -> 增/持/减/退候选建议 -> 人工复核边界”的候选映射。
EOF

  cat > "$MATERIAL_ROOT/post-loan-call-collection.md" <<'EOF'
# 公开材料 Vibe：贷后电核及催收风险预警处理

来源：
- 中国邮政储蓄银行黑龙江省分行零售信贷作业中心录入、贷后电核及催收业务处理外包服务采购项目招标公告
  https://www.chinapost.com.cn/html1/report/2302/2877-1.htm

公开材料要点归纳：
- 贷后电核及催收服务包括对系统推送风险预警业务进行电话核实及记录。
- 需要检查风险预警处理，并对系统推送业务进行非现场催收。
- 该类业务强调系统预警、人工核实、记录留痕和后续处理闭环。

Vibe 目标：
进化贷后预警核实记录、非现场催收触发、风险预警处理状态与人工复核闭环。
EOF

  cat > "$MATERIAL_ROOT/full-cycle-risk-control.md" <<'EOF'
# 公开材料 Vibe：全流程智能风险管控平台

来源：
- 山西农商联合银行智能风险管控平台建设项目招标公告
  https://www.sxnx.com/sxrcb/2024-02/08/article_2024071615110269461.html

公开材料要点归纳：
- 建立全行级智能风险管控平台，搭建统一风控模型及预警指标体系。
- 覆盖贷前、贷中、贷后各流程环节的风控决策支持。
- 通过平台数据分析、规则筛选、模型匹配加强客户甄别，减少人工干预。
- 贷后侧重点是差异化管理，而不是自动做最终处置。

Vibe 目标：
进化全流程风险指标到贷后差异化管理候选动作的映射，并保留人工确认门禁。
EOF

  cat > "$MATERIAL_ROOT/credit-risk-warning-system.md" <<'EOF'
# 公开材料 Vibe：信用风险预警系统开发

来源：
- 中原银行股份有限公司新信用风险预警系统开发项目公开招标公告
  https://www.365trade.com.cn/zfwzb/692016.jhtml

公开材料要点归纳：
- 构建覆盖全客户、全周期、全场景的立体预警网络体系。
- 实现风险事件智能识别、精准传导和高效处置的闭环管理。
- 功能范围包括风险视图、组合预警管理、风险预警信号监控、预警信号库、规则配置、黑名单管理、预警任务管理、批处理等。
- 招标要求提到源代码拥有权和独立设计研发能力，这与通过 GitLab 源码分析进行产品自进化的理念一致。

Vibe 目标：
进化风险预警信号库、规则配置、预警任务闭环和源码影响分析证据。
EOF
}

fetch_public_material() {
  local goal="$1"
  local iteration="$2"
  DOMAINFORGE_EVOLUTION_LAB_MATERIAL_ROOT="$MATERIAL_ROOT" \
  DOMAINFORGE_EVOLUTION_LAB_USED_SOURCES="$USED_SOURCES" \
  DOMAINFORGE_EVOLUTION_LAB_GOAL="$goal" \
  DOMAINFORGE_EVOLUTION_LAB_ITERATION="$iteration" \
  node "$TOOLKIT_ROOT/tools/domainforge-fabric-evolution-lab/fetch-public-material.mjs"
}

wait_http() {
  local url="$1"
  local name="$2"
  for _ in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[INFO] $name UP: $url"
      return 0
    fi
    sleep 1
  done
  echo "[ERROR] $name not healthy: $url"
  return 1
}

ensure_stack() {
  cd "$DOMAINFORGE_ROOT"

  DOMAINFORGE_FABRIC_MODE=prod \
  "$DOMAINFORGE_ROOT/runtimes/domainforge-fabric-execution/bin/run.sh" prod daemon "port=$EXECUTION_PORT" >/dev/null || true

  DOMAINFORGE_FABRIC_SERVICE_PORT="$SERVICE_PORT" \
  DOMAINFORGE_FABRIC_SERVICE_DAEMON_DRIVER=auto \
  DOMAINFORGE_DATA_ROOT="$DOMAINFORGE_ROOT/data/lab-prodlike/fabric-data" \
  JAVA_TOOL_OPTIONS="-Xint -Ddomainforge.execution.host=127.0.0.1 -Ddomainforge.execution.port=$EXECUTION_PORT" \
  "$DOMAINFORGE_ROOT/services/domainforge-fabric-service/bin/run.sh" prod daemon
  wait_http "http://127.0.0.1:$SERVICE_PORT/health" "fabric-service"

  (cd "$DOMAINFORGE_ROOT/gateways/domainforge-fabric-mcp" && npm run build >/dev/null)
  if ! curl -fsS "http://127.0.0.1:$MCP_PORT/health" >/dev/null 2>&1; then
    screen -S "domainforge-fabric-mcp-$MCP_PORT" -X quit >/dev/null 2>&1 || true
    screen -dmS "domainforge-fabric-mcp-$MCP_PORT" zsh -lc "cd '$DOMAINFORGE_ROOT/gateways/domainforge-fabric-mcp' && DOMAINFORGE_FABRIC_MODE=prod DOMAINFORGE_FABRIC_MCP_TRANSPORT=http DOMAINFORGE_FABRIC_MCP_HOST=127.0.0.1 DOMAINFORGE_FABRIC_MCP_PORT='$MCP_PORT' DOMAINFORGE_FABRIC_MCP_ENDPOINT=/mcp DOMAINFORGE_FABRIC_SERVICE_URL='http://127.0.0.1:$SERVICE_PORT' DOMAINFORGE_FABRIC_ROOT='$DOMAINFORGE_ROOT' '$DOMAINFORGE_ROOT/gateways/domainforge-fabric-mcp/bin/run.sh' prod http"
  fi
  wait_http "http://127.0.0.1:$MCP_PORT/health" "mcp-gateway"

  if ! curl -fsS "http://127.0.0.1:$SELF_EVOLUTION_PORT/health" >/dev/null 2>&1; then
    screen -S "domainforge-fabric-self-evolution-$SELF_EVOLUTION_PORT" -X quit >/dev/null 2>&1 || true
    screen -dmS "domainforge-fabric-self-evolution-$SELF_EVOLUTION_PORT" zsh -lc "cd '$DOMAINFORGE_ROOT' && DOMAINFORGE_SELF_EVOLUTION_DATA_ROOT='$DOMAINFORGE_ROOT/data/lab-prodlike/self-evolution' DOMAINFORGE_SELF_EVOLUTION_PORT='$SELF_EVOLUTION_PORT' DOMAINFORGE_GITLAB_URL='${DOMAINFORGE_GITLAB_URL:-https://gitlab.transwarp.io}' DOMAINFORGE_GITLAB_PROJECT_ID='${DOMAINFORGE_GITLAB_PROJECT_ID:-domainforge-fabric/domainforge-fabric}' DOMAINFORGE_GITLAB_DEFAULT_BRANCH='$GITLAB_DEFAULT_BRANCH' DOMAINFORGE_GITLAB_TOKEN='${DOMAINFORGE_GITLAB_TOKEN:-}' node engines/domainforge-fabric-self-evolution/dist/src/server.js"
  fi
  wait_http "http://127.0.0.1:$SELF_EVOLUTION_PORT/health" "self-evolution"
}

run_one_iteration() {
  local material="$1"
  local goal="$2"
  local run_id
  run_id="$(date +%Y%m%dT%H%M%S)"
  local run_dir="$RUN_ROOT/$run_id"
  LAST_RUN_DIR="$run_dir"
  mkdir -p "$run_dir"

  export DOMAINFORGE_FABRIC_SERVICE_URL="http://127.0.0.1:$SERVICE_PORT"
  export DOMAINFORGE_LAB_RUN_DIR="$run_dir"
  export DOMAINFORGE_LAB_MATERIAL="$material"
  export DOMAINFORGE_LAB_GOAL="$goal"
  export DOMAINFORGE_LAB_DOMAIN_ID="$DOMAIN_ID"
  export DOMAINFORGE_LAB_BRANCH="$GITLAB_DEFAULT_BRANCH"
  export DOMAINFORGE_ROOT
  export SELF_EVOLUTION_PORT

  node "$TOOLKIT_ROOT/tools/domainforge-fabric-evolution-lab/run-one.mjs" \
    > "$run_dir/stdout.log" 2> "$run_dir/stderr.log"
}

main() {
  write_public_materials
  write_status "STARTING" "" "" "" "" "" ""
  ensure_stack

  local deadline
  if [ "$DURATION_HOURS" = "forever" ] || [ "$DURATION_HOURS" = "always" ]; then
    deadline=0
  else
    deadline=$(( $(date +%s) + DURATION_HOURS * 3600 ))
  fi
  local materials=("$MATERIAL_ROOT"/*.md)
  local goals=(
    "进化贷后风险预警信号到增/持/减/退候选映射"
    "进化贷后预警核实记录与非现场催收处理闭环"
    "进化全流程风控指标到贷后差异化管理候选动作"
    "进化信用风险预警信号库、规则配置与预警任务闭环"
  )
  local index=0
  while [ "$deadline" = "0" ] || [ "$(date +%s)" -lt "$deadline" ]; do
    ensure_stack
    local goal="${goals[$(( index % ${#goals[@]} ))]}"
    local fetch_result
    fetch_result="$(fetch_public_material "$goal" "$index")"
    local material
    material="$(printf '%s' "$fetch_result" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>console.log(JSON.parse(s).materialPath));')"
    echo "[INFO] iteration=$index material=$material goal=$goal"
    write_status "RUNNING_E2E" "$index" "$material" "$goal" "" "" ""
    local result="SUCCEEDED"
    run_one_iteration "$material" "$goal" || result="FAILED"
    if [ -n "${LAST_RUN_DIR:-}" ]; then
      ln -sfn "$LAST_RUN_DIR" "$LATEST_RUN_LINK"
    fi
    local next_run
    next_run="$(date -r $(( $(date +%s) + INTERVAL_SECONDS )) '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S %Z')"
    write_status "WAITING_NEXT_ROUND" "$index" "$material" "$goal" "${LAST_RUN_DIR:-}" "$result" "$next_run"
    index=$((index + 1))
    sleep "$INTERVAL_SECONDS"
  done
  write_status "STOPPED_DURATION_REACHED" "$index" "" "" "" "" ""
}

main "$@"
