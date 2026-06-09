# Octopus AgentOps

Production-oriented agent workflow platform for Claude Code and Codex.

Octopus AgentOps turns repeatable AI coding workflows into installable, versioned, and auditable agent plugins. It focuses on the work that must be dependable in real projects: Git/CI governance, MCP E2E lifecycle validation, real Dashboard user-flow debugging, production-like soak testing, evidence collection, and cross-OS diagnostics.

The product goal is simple: manage agent operations as reusable product assets, not as one-off prompts and temporary scripts scattered across projects.

## What Is This?

`agent-octopus-toolkit` is the source repository for Octopus AgentOps. It provides:

- Specialized subagents for Claude Code and Codex.
- Plugin manifests and generated catalogs for search and installation.
- Agent product contracts for inputs, outputs, evidence, confirmation gates, dangerous actions, and native runtime capabilities.
- Generated Codex distributions from canonical Markdown agent sources.
- Deterministic validation and eval scripts.
- A lightweight CLI control plane for listing, searching, installing, and checking drift.

| Tool | Install Target | Scope |
| --- | --- | --- |
| Claude Code | `~/.claude/agents/` | 用户级 agents |
| Codex | `.codex/agents/` | 项目级 agents |

## Agents

| Agent | Purpose |
| --- | --- |
| `domainforge-fabric-evolution-lab` | DomainForge Fabric production-closed-loop lab for rotating materials, MCP E2E pressure, review closure, and self-evolution evidence. |
| `gitlab-sync` | GitLab synchronization, commit, push, MR/CI boundaries, and conflict handling. |
| `mcp-agent-e2e-designer` | MCP intelligent-agent E2E lifecycle governor: discovery, prompt confirmation, execution, diagnosis, controlled code-fix, and evidence-backed self-evolution proposals. |
| `production-release-governor` | Production release readiness governance with real soak evidence, security, approval, rollback, observability, scenario matrix, risk register, and GO/NO-GO decisions. |
| `production-soak-governor` | Generic production-like configurable-duration validation with real readiness, non-mock prechecks, traffic, lifecycle runners, governance-gate enforcement, product-gap blocking, SCM, CI/CD, and final evidence. |
| `user-flow-debug` | Real Dashboard user-flow debugging with runtime-flow discovery, screenshots, artifacts, role validation, diagnosis, and controlled fixes. |

## Plugins

| Plugin | Agents |
| --- | --- |
| `git-workflow` | `gitlab-sync` |
| `mcp-e2e-governance` | `mcp-agent-e2e-designer`, `user-flow-debug` |
| `production-soak` | `production-soak-governor`, `production-release-governor` |
| `domainforge-fabric-lab` | `domainforge-fabric-evolution-lab` |

## Who It Is For

- Teams that reuse the same Claude Code / Codex workflows across multiple repositories.
- Agent product builders who need real MCP E2E validation, not only prompt-level demos.
- Developers who want Git, CI, MR/PR, and deployment-adjacent actions guarded by explicit confirmation and evidence.
- Product teams that require Dashboard-level user-flow proof instead of API-only smoke checks.
- Maintainers who want installed agents to be searchable, versioned, validated, evaluated, and drift-checked.

## Features

### Agent Plugins And Catalogs

Canonical agent sources live in `agents/*.md`. Claude Code installs the Markdown sources directly. Codex installs generated TOML distributions from `integrations/codex/agents/*.toml`.

Agent product contracts live in `manifests/agents/*.json`. Every agent declares its source/distribution paths, lifecycle, plugin, category, native capabilities, inputs, outputs, evidence, confirmation gates, dangerous actions, and validation rules.

Plugin contracts live in `plugins/<plugin>/plugin.json`. `scripts/generate-catalog.py` generates `catalog/agents.json` and `catalog/plugins.json`, enabling search, install, and drift checks by plugin.

### Generated Multi-Target Distributions

`scripts/generate-distributions.py` renders Codex TOML agents from canonical Markdown sources and manifest-native capability declarations. This keeps the agent body, product contract, and installed Codex distribution aligned.

### Deterministic Validation And Eval

`npm run check` validates source files, generated distributions, plugin/catalog consistency, and core scripts. `npm run eval` runs deterministic quality checks and a temporary Codex install round-trip.

### Portable Sandbox

OS-sensitive checks are centralized in `bin/octopus-sandbox` and `sandbox/octopus_sandbox.py`, so installed agents avoid project-local temporary scripts and optional command dependencies.

### Git And CI Guardrails

`gitlab-sync` separates branch selection, sync, commit, push, merge requests, CI diagnosis, and conflict handling so high-risk Git actions are explicit and auditable.

### Real User Flow Debugging

`user-flow-debug` drives real Dashboard UI paths, captures screenshots, validates artifacts, classifies runtime flow, and follows the selected fix policy.

| Flow Type | 测试策略 |
| --- | --- |
| `attachment-driven` | 只上传首个可见步骤或启动表单要求的附件，然后按 UI choice/review 推进 |
| `time-driven` | 等待服务端计划触发后的 Agent 消息，再按当前 step 要求上传附件、输入目录路径或提交文本 |
| `chat-driven` | 主要通过可见对话问题和输入框推进，不预设附件流程 |
| `hybrid` | 按每个 step 的可见输入要求组合附件、路径、文本和选择 |

time-driven 测试遵守生产边界：Dashboard UI 不应出现 tick/debug 控件。local-dev 需要加速验证时，优先使用服务端 scheduler、测试时间窗口和隔离的 output root；只有用户明确允许测试内部推进时，才可调用内部 tick API。

`user-flow-debug` 还会在支持 role profile 的聊天页面中校验每个 step 的显示说话人是否来自该 step 的 owner role；默认 assistant/colleague 只应出现在开场或无 step 消息中。

### MCP E2E And Production Soak Governance

`mcp-agent-e2e-designer` governs MCP product journeys from code-first discovery to prompt confirmation, execution, assertions, diagnosis, and self-evolution proposal gating.

`production-soak-governor` turns long-running production-like validation into a reusable agent workflow. It first discovers real services, connected systems, data roots, traffic generators, lifecycle runners, LLM, SCM, and CI/CD boundaries, then executes:

```text
readiness
  -> 数据清零
  -> 非 mock 预检
  -> 用户指定时长的长稳运行
  -> 每 30 分钟汇报
  -> 产品缺口阻断与补强
  -> 最终测试架构师视角报告
```

Its production rule is strict: product-grade validation cannot rely on mock/fake/stub/simulator links, and chat-agent manual repair is not counted as production runtime capability.

`production-release-governor` consumes soak reports and release evidence bundles to decide whether a candidate is ready for production. It checks source reproducibility, real-boundary evidence, security, approval gates, rollback, observability, data governance, multi-project isolation, and required failure scenarios before returning `GO`, `CONDITIONAL-GO`, or `NO-GO`.

### Project-Scoped Codex Install

Codex agents install into the target project's `.codex/agents/` directory and do not replace `.codex/skills/`. Each project can opt in and update explicitly.

### Lightweight Control Plane

`scripts/octopus-control.py` provides the current control-plane CLI:

```bash
npm run agents:list
npm run plugins:list
npm run agents:search -- mcp
npm run agents:install -- --plugin mcp-e2e-governance --project-root /path/to/your/project
npm run agents:codex-status -- --project-root /path/to/your/project
```

It reads agent and plugin metadata from manifest/catalog files, then supports search, plugin-scoped installs, proposal listing, and `.codex/agents/` drift checks.

## Problems It Solves

| Without Toolkit | With Toolkit |
| --- | --- |
| Agents are copied manually across projects and drift silently. | Agents are installed from versioned plugin/catalog definitions and checked for drift. |
| Agent instructions are edited without a contract. | Each agent has a manifest for inputs, outputs, evidence, gates, dangerous actions, and native capabilities. |
| Codex distributions are maintained by hand. | Codex TOML is generated from canonical Markdown sources and manifests. |
| Local diagnostics depend on OS-specific commands. | The sandbox provides portable HTTP, port, artifact, and Git checks. |
| Git sync, commit, push, MR, and CI actions blur into one risky operation. | `gitlab-sync` makes each step explicit and confirmation-bound. |
| User-flow validation bypasses the real UI. | `user-flow-debug` requires real Dashboard operation and screenshot evidence. |
| Production validation accidentally uses mock/demo paths. | `production-soak-governor` blocks product-grade claims unless real boundaries are proven. |
| Installed-project edits flow back without review. | Offline proposals are generated and accepted only by the toolkit maintainer. |

## What's Under The Hood

```text
agent-octopus-toolkit
├── agents/                         Canonical Claude Code Markdown agents
├── bin/octopus-sandbox             Portable diagnostics entrypoint
├── integrations/
│   ├── claude-code/README.md        Claude Code integration
│   └── codex/
│       ├── README.md                Codex integration
│       └── agents/                  Generated Codex TOML agents
├── catalog/                         Generated agent/plugin catalogs
├── manifests/agents/                Agent product contracts
├── plugins/                         Plugin product contracts
├── sandbox/octopus_sandbox.py       Portable diagnostics implementation
├── schemas/                         manifest / run / proposal schema
├── scripts/generate-catalog.py       Catalog generator
├── scripts/generate-distributions.py Codex distribution generator
├── scripts/install.sh               Install/update script
├── scripts/octopus-control.py        Control-plane CLI
├── scripts/validate-toolkit.py       Contract validator
└── AGENT-LIST.md                    Agent catalog summary
```

Sandbox commands:

```text
doctor             Inspect OS, Python, and common tool availability
git-inspect        Collect standard Git status, remotes, branch, and recent commits
git-commit-check   Run pre-commit inspection and flag generated/output candidates
git-conflicts      List current Git conflict state
health-check       Check HTTP URLs without relying on curl
port-check         Check TCP ports without relying on lsof/netstat/ss
find-artifacts     Inspect output/runs/<runId>/ artifacts and final/manifest.json
```

## Scope Boundaries

| Not | Meaning |
| --- | --- |
| Not a general agent framework | It does not own the model runtime or prompt-execution engine. |
| Not a GitLab replacement | It governs local GitLab collaboration workflows; GitLab remains the system of record. |
| Not a full browser testing framework | `user-flow-debug` is an evidence-driven debugging workflow, not a replacement for a full test suite. |
| Not a script dump | Reusable diagnostics belong in `sandbox/` and are distributed through install/update flows. |

## Quickstart

Clone or enter the toolkit checkout:

```bash
cd /Users/wangyejing/github/agent-octopus-toolkit
```

Set the toolkit path:

```bash
export AGENT_OCTOPUS_TOOLKIT_HOME=/Users/wangyejing/github/agent-octopus-toolkit
```

Install into Claude Code:

```bash
./scripts/install.sh --tool claude-code
```

Install into the current project's Codex agents:

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex
```

Preview install output without writing files:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --dry-run
```

Install or update one agent:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --agent mcp-agent-e2e-designer --update
```

Auto-install into detected tools:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh
```

Validate the sandbox:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/bin/octopus-sandbox doctor
```

Validate product contracts:

```bash
cd /Users/wangyejing/github/agent-octopus-toolkit
npm run validate
```

Use the control plane:

```bash
npm run agents:list
npm run plugins:list
npm run agents:search -- production
npm run agents:codex-status -- --project-root /path/to/your/project
```

## Usage

GitLab 同步：

```text
使用 gitlab-sync，把本地 dev 和 origin/dev 同步，先检查状态，不要直接 push。
```

用户流调试：

```text
使用 user-flow-debug，入口 UI 为 index.html，跑 deployed 环境的目标场景，新 run，real JDBC，截图到 /tmp/user-flow，策略 diagnose-only。
```

DomainForge Fabric 进化实验：

```text
使用 domainforge-fabric-evolution-lab，在 local-prodlike 环境下检查 domainforge-fabric 生产级闭环 readiness，然后基于我提供的素材目录和场景目标跑 MCP 生命周期 E2E，收集 evidence 并触发 self-evolution。GitLab MR 只在我明确允许时创建，不要 merge。
```

DomainForge Fabric 24H 常驻进化实验：

```text
使用 domainforge-fabric-evolution-lab，在 Codex Desktop 中启动 always-on 运行。请启动 toolkit 的 run-24h.sh，使用 preview-only 和 low-risk-only MR 策略，每 15 分钟轮转一次公开材料/场景目标并在聊天中主动反馈一次状态；同时维护 current-status.md、latest-run 和 continuous-always.log。
```

通用产品生产仿真：

```text
使用 production-soak-governor，基于当前项目发现真实服务、接入项目、流量发生器、LLM、GitLab/GitHub 和 Jenkins/CI 配置。请先做 readiness、数据清零和非 mock 预检，预检通过后按我指定的时长启动长稳验证，并每 30 分钟汇报产品自身和每个接入项目的健康、流量、机会点、代码升级、SCM、CI/CD、治理门禁是否真实阻断下游执行，以及产品缺口。
```

生产发布门禁：

```text
使用 production-release-governor，基于当前 release candidate、production-soak-governor 最终报告、release evidence bundle、GitLab/GitHub、Jenkins/CI、权限审批、回滚、审计和可观测性证据，输出 GO / CONDITIONAL-GO / NO-GO，并列出必须修复项、可灰度条件和发布风险。
```

time-driven 本地调试示例：

```text
使用 user-flow-debug，入口 UI 为 domain-chat.html，跑 local-dev Dashboard 用户流。请使用独立 output root，启用服务端 scheduler 或测试时间窗口，不要通过 UI 暴露 tick。截图到 /tmp/user-flow，策略 diagnose-only。
```

最终报告会包含入口 UI、实际打开 URL、runId、截图目录、final 产物、runtime flow type、output 隔离策略，以及每个 step 的输入模式、显示角色、artifact 数量和 pass/fail。

## Update Installed Agents

Install/update is copy-based. After `agent-octopus-toolkit` is updated, refresh this checkout first and then rerun the installer from each target location.

If this is a Git checkout:

```bash
cd /Users/wangyejing/github/agent-octopus-toolkit
git pull
```

Update Claude Code agents:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool claude-code --update
```

Update Codex agents in a project:

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --update
```

Codex agents are project-scoped. Every project that has installed `.codex/agents/` should be updated from that project root.

## Propose Changes Back

Installed projects may edit local agents, but those edits do not flow back automatically. Backflow uses offline proposal packages so business projects do not need repository permissions and unreviewed changes cannot enter the source repository.

Flow:

```text
installed project edit
  -> propose-changes.py creates an offline proposal
  -> toolkit maintainer reviews diff
  -> apply-proposal.py --accept writes accepted files into toolkit
  -> maintainer commits and pushes toolkit
```

Create a proposal from a project with installed Codex agents:

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/propose-changes.py \
  --tool codex \
  --title "improve gitlab-sync for project X"
```

This creates:

```text
.agent-octopus/proposals/proposal-YYYYMMDD-HHMMSS/
├── manifest.json
├── README.md
├── diffs/
└── files/
```

The target project only needs to hand this directory to the Octopus AgentOps maintainer; it does not need GitLab/GitHub push permissions.

Review from the source repository:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/apply-proposal.py \
  /path/to/proposal-YYYYMMDD-HHMMSS
```

Write into the source repository only after acceptance:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/apply-proposal.py \
  /path/to/proposal-YYYYMMDD-HHMMSS \
  --accept
```

Accept one file only:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/apply-proposal.py \
  /path/to/proposal-YYYYMMDD-HHMMSS \
  --file integrations/codex/agents/gitlab-sync.toml \
  --accept
```

After acceptance, the maintainer reviews `git diff`, runs validation, commits, pushes, and lets target projects consume the update through `install.sh --update`.

## Development

Run the full product contract check:

```bash
npm run check
```

Regenerate distributions and catalogs:

```bash
npm run generate
```

Run deterministic agent eval:

```bash
npm run eval
```

Check the installer:

```bash
bash -n scripts/install.sh
```

Check the sandbox:

```bash
python3 -m py_compile sandbox/octopus_sandbox.py
bin/octopus-sandbox --help
bin/octopus-sandbox doctor
```

Check proposal scripts:

```bash
python3 -m py_compile scripts/propose-changes.py scripts/apply-proposal.py
```

When adding or changing an agent, keep these files aligned:

```text
agents/<agent>.md
integrations/codex/agents/<agent>.toml
manifests/agents/<agent>.json
plugins/<plugin>/plugin.json
catalog/agents.json
catalog/plugins.json
AGENT-LIST.md
README.md
```

Then run:

```bash
npm run validate
npm run eval
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --dry-run
```

When adding reusable diagnostics, put them in `sandbox/octopus_sandbox.py`, then update the related agent instructions, generated Codex TOML, and manifest. Do not duplicate diagnostic scripts inside target projects.

## License

License TBD. Add an explicit license before public distribution.
