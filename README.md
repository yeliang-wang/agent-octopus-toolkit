# agent 八爪鱼工具包

面向 Claude Code / Codex 的可复用 agent 工作流工具包。

它把团队在 agent 项目开发中反复遇到的 Git 同步、CI/MR 流程、真实用户流调试、运行诊断、产物校验和跨 OS 命令差异，沉淀成可安装、可更新、可审查的 agent 与沙箱命令。

管理 agent 工作流，而不是在每个项目里反复临时拼脚本。

## What Is This?

`agent-octopus-toolkit` 是一组面向本地 AI Coding 工具的 agent 工作流模板和便携诊断工具。

它目前支持：

| Tool | Install Target | Scope |
| --- | --- | --- |
| Claude Code | `~/.claude/agents/` | 用户级 agents |
| Codex | `.codex/agents/` | 项目级 agents |

当前内置 agent：

| Agent | Purpose |
| --- | --- |
| `domainforge-fabric-evolution-lab` | DomainForge Fabric dev-stage 生产级闭环实验工具：投喂素材、vibe MCP 场景、每 15 分钟轮转 E2E、主动聊天反馈、维护状态面板并触发 self-evolution |
| `gitlab-sync` | GitLab 分支同步、提交、推送、MR/CI 边界和冲突处理 |
| `mcp-agent-e2e-designer` | MCP 智能体 E2E 生命周期治理：代码发现、用例设计、提示确认、执行诊断、受控 code-fix 和基于证据的自我进化建议门禁 |
| `production-soak-governor` | 通用 24h/长稳生产仿真治理：真实服务 readiness、数据清零、非 mock 预检、流量与生命周期挂起、30 分钟汇报、产品缺口阻断、代码升级/SCM/CI-CD 闭环和最终证据报告 |
| `user-flow-debug` | 通过 Dashboard UI 做真实用户流调试、截图留证、产物校验和受控修复 |

当前内置 plugin：

| Plugin | Agents |
| --- | --- |
| `git-workflow` | `gitlab-sync` |
| `mcp-e2e-governance` | `mcp-agent-e2e-designer`, `user-flow-debug` |
| `production-soak` | `production-soak-governor` |
| `domainforge-fabric-lab` | `domainforge-fabric-evolution-lab` |

## This Is For You If

- 你在多个项目里反复复制同一套 Claude Code / Codex agent 指令。
- 你希望 GitLab 同步、提交、推送、MR、CI 诊断有一致的安全边界。
- 你希望 user-flow 调试必须走真实 Dashboard UI，而不是绕过产品路径。
- 你遇到过不同 agent、不同 OS 环境下缺少 `rg`、`curl`、`lsof`、`netstat`、`ss` 等命令的问题。
- 你不希望每个目标项目里都临时创建 Python 诊断脚本。
- 你希望 toolkit 发布新版本后，可以明确更新已安装的 agents。

## Features

### Shared Agents

通用 agent 源文件放在 `agents/*.md`。Claude Code 直接安装 Markdown agents；Codex 安装由 `scripts/generate-distributions.py` 从 Markdown source 生成的 `integrations/codex/agents/*.toml` 分发版本。

产品级契约放在 `manifests/agents/*.json`。每个 agent 必须声明 source/distribution 路径、生命周期、输入、输出、证据、确认门禁、危险动作和校验规则。`scripts/validate-toolkit.py` 会校验 manifest、Markdown frontmatter、Codex TOML、README/AGENT-LIST 清单和关键章节，避免只更新提示词而没有可审查契约。

Plugin 契约放在 `plugins/<plugin>/plugin.json`，catalog 由 `scripts/generate-catalog.py` 生成到 `catalog/agents.json` 和 `catalog/plugins.json`。这让工具包可以按 plugin 搜索、安装和检查漂移。

`mcp-agent-e2e-designer` 保留历史名称作为兼容调用 id，但当前定位已经从单纯的 usecase designer 扩展为 MCP 智能体 E2E lifecycle governor。它不仅设计 E2E，还负责确认用户可见 prompt、从 MCP 边界执行、诊断失败、在允许时做最小 code-fix，并在每次 E2E 后基于过程和结果证据输出 self-evolution proposal report。进化建议必须等待用户确认后才可应用、持久化为 accepted，或上升为项目 profile / toolkit 规则。

### Portable Sandbox

OS 敏感操作集中到 `bin/octopus-sandbox` 和 `sandbox/octopus_sandbox.py`，agent 指令优先调用沙箱入口，避免在目标项目里临时构建脚本。

### GitLab Workflow Guardrails

`gitlab-sync` 借鉴 AICodingFlow 的流程边界，把 branch、sync、commit、push、MR、CI、conflict 分开处理，避免误推共享分支、混杂提交、跳过 hook 或直接 force push。

### Real User Flow Debugging

`user-flow-debug` 强制通过 Dashboard UI 模拟真实用户路径，覆盖附件上传、步骤选择、截图、产物下载、运行日志和修复策略。

它会先识别运行时交互类型，再选择测试策略：

| Flow Type | 测试策略 |
| --- | --- |
| `attachment-driven` | 只上传首个可见步骤或启动表单要求的附件，然后按 UI choice/review 推进 |
| `time-driven` | 等待服务端计划触发后的 Agent 消息，再按当前 step 要求上传附件、输入目录路径或提交文本 |
| `chat-driven` | 主要通过可见对话问题和输入框推进，不预设附件流程 |
| `hybrid` | 按每个 step 的可见输入要求组合附件、路径、文本和选择 |

time-driven 测试遵守生产边界：Dashboard UI 不应出现 tick/debug 控件。local-dev 需要加速验证时，优先使用服务端 scheduler、测试时间窗口和隔离的 output root；只有用户明确允许测试内部推进时，才可调用内部 tick API。

`user-flow-debug` 还会在支持 role profile 的聊天页面中校验每个 step 的显示说话人是否来自该 step 的 owner role；默认 assistant/colleague 只应出现在开场或无 step 消息中。

### Production Soak Governance

`production-soak-governor` 把 24h 生产仿真验证沉淀成通用 sub agent 流程。它不绑定某个产品，而是先发现当前项目的真实服务、接入系统、数据根、流量发生器、生命周期 runner、LLM、SCM 和 CI/CD 边界，再执行：

```text
readiness
  -> 数据清零
  -> 非 mock 预检
  -> 24h 长稳运行
  -> 每 30 分钟汇报
  -> 产品缺口阻断与补强
  -> 最终测试架构师视角报告
```

它的生产级规则是硬约束：当用户要求“产品生产级”“真实生产 E2E”“24h 生产仿真”时，验证链路不能使用 mock/fake/stub/simulator，也不能把 Codex/Claude 聊天中的人工修复当作生产运行能力。发现真实缺口时，必须停止或阻断长跑，先做产品化补强、补测试、清理污染数据，再从非 mock 预检重跑。

### Project-Scoped Codex Install

Codex agents 安装到目标项目的 `.codex/agents/`，不会覆盖 `.codex/skills/`。这让每个项目可以显式选择是否接入和何时更新。

### Lightweight Control Plane

`scripts/octopus-control.py` 提供当前阶段的轻量控制面：

```bash
npm run agents:list
npm run plugins:list
npm run agents:search -- mcp
npm run agents:install -- --plugin mcp-e2e-governance --project-root /path/to/your/project
npm run agents:codex-status -- --project-root /path/to/your/project
```

它会从 manifest/catalog 读取 agent 和 plugin 的版本、生命周期、能力、分发路径，并支持搜索、按 plugin 安装、列 proposal、检查目标项目 `.codex/agents/` 是否缺失或漂移。

## Problems It Solves

| Without Toolkit | With Toolkit |
| --- | --- |
| 每个项目手写或复制 agent 指令，版本不一致。 | agents 从 toolkit 安装，更新路径明确。 |
| agent 临时创建 Python 脚本，散落在目标项目里。 | 可复用诊断能力进入 `sandbox/`，目标项目保持干净。 |
| 不同 OS 缺少 `curl`、`lsof`、`netstat`、`ss` 等命令导致流程中断。 | 沙箱使用 Python 标准库提供 HTTP、端口、产物扫描等 fallback。 |
| Git 同步、提交、推送、MR、CI 被混成一个高风险动作。 | `gitlab-sync` 明确每一步的确认点和禁止动作。 |
| 用户流调试绕过 UI 或缺少截图证据。 | `user-flow-debug` 要求真实 Dashboard 操作和关键节点截图。 |
| 不同 plan 类型被套用同一种上传/触发流程。 | `user-flow-debug` 先分类 runtime flow，再选择 attachment-driven、time-driven、chat-driven 或 hybrid 策略。 |
| 历史 run 被 scheduler/tick 连带推进，污染 E2E 结论。 | local-dev E2E 优先使用独立 output root，并在报告中记录是否有无关 run 被推进。 |
| 多角色聊天页面只看产物，不校验说话人。 | `user-flow-debug` 记录 step 级角色矩阵，校验 owner role 与 UI speaker。 |
| 被安装项目修改了 agent，但没有 toolkit 仓库权限。 | 目标项目生成离线 proposal，toolkit 维护者 review 后显式 accept。 |

## What's Under The Hood

```text
agent-octopus-toolkit
├── agents/                         Claude Code 原生 Markdown agents
├── bin/octopus-sandbox             统一沙箱命令入口
├── integrations/
│   ├── claude-code/README.md        Claude Code 使用说明
│   └── codex/
│       ├── README.md                Codex 使用说明
│       └── agents/                  Codex TOML agents
├── catalog/                         生成的 agent/plugin catalog
├── manifests/agents/                agent 产品契约
├── plugins/                         plugin 产品契约
├── sandbox/octopus_sandbox.py       OS 敏感操作和可复用诊断实现
├── schemas/                         manifest / run / proposal schema
├── scripts/generate-catalog.py       catalog 生成器
├── scripts/generate-distributions.py Codex 分发生成器
├── scripts/install.sh               安装/更新脚本
├── scripts/octopus-control.py        轻量控制面 CLI
├── scripts/validate-toolkit.py       产品契约校验
└── AGENT-LIST.md                    agent 清单
```

沙箱命令：

```text
doctor             检查 OS、Python 和常用工具可用性
git-inspect        收集标准 Git 状态、远程、分支和最近提交
git-commit-check   收集提交前检查并标记 build/output 等候选文件
git-conflicts      列出当前 Git 冲突状态
health-check       用 Python 标准库检查 HTTP URL，避免依赖 curl
port-check         用 Python 标准库检查 TCP 端口，避免依赖 lsof/netstat/ss
find-artifacts     扫描 output/runs/<runId>/ 产物和 final/manifest.json
```

## What This Is Not

| Not | Meaning |
| --- | --- |
| 不是通用 agent framework | 它不规定模型、提示词系统或 agent runtime。 |
| 不是 GitLab 替代品 | 它只规范本地 GitLab 协作流程，不替代 GitLab MR/CI。 |
| 不是 Dashboard 测试框架 | `user-flow-debug` 是调试工作流，不是完整自动化测试平台。 |
| 不是一次性脚本集合 | 可复用逻辑应进入 `sandbox/`，并通过安装/更新分发。 |

## Quickstart

克隆或进入工具包目录：

```bash
cd /Users/wangyejing/github/agent-octopus-toolkit
```

建议设置工具包路径：

```bash
export AGENT_OCTOPUS_TOOLKIT_HOME=/Users/wangyejing/github/agent-octopus-toolkit
```

安装到 Claude Code：

```bash
./scripts/install.sh --tool claude-code
```

安装到当前项目的 Codex agents：

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex
```

无副作用预览安装结果：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --dry-run
```

只安装或更新单个 agent：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --agent mcp-agent-e2e-designer --update
```

也可以自动安装到检测到的工具：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh
```

验证沙箱：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/bin/octopus-sandbox doctor
```

验证产品契约：

```bash
cd /Users/wangyejing/github/agent-octopus-toolkit
npm run validate
```

查看 agent 控制面：

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

通用产品 24H 生产仿真：

```text
使用 production-soak-governor，基于当前项目发现真实服务、接入项目、流量发生器、LLM、GitLab/GitHub 和 Jenkins/CI 配置。请先做 readiness、数据清零和非 mock 预检，预检通过后启动 24h 长稳验证，并每 30 分钟汇报产品自身和每个接入项目的健康、流量、机会点、代码升级、SCM、CI/CD 和产品缺口。
```

time-driven 本地调试示例：

```text
使用 user-flow-debug，入口 UI 为 domain-chat.html，跑 local-dev Dashboard 用户流。请使用独立 output root，启用服务端 scheduler 或测试时间窗口，不要通过 UI 暴露 tick。截图到 /tmp/user-flow，策略 diagnose-only。
```

最终报告会包含入口 UI、实际打开 URL、runId、截图目录、final 产物、runtime flow type、output 隔离策略，以及每个 step 的输入模式、显示角色、artifact 数量和 pass/fail。

## Update Installed Agents

安装脚本是覆盖式复制。当 `agent-octopus-toolkit` 发布新版本后，先更新本工具包目录，再在对应目标位置重新运行脚本。

如果工具包是 Git checkout：

```bash
cd /Users/wangyejing/github/agent-octopus-toolkit
git pull
```

更新 Claude Code agents：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool claude-code --update
```

更新某个项目里的 Codex agents：

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --update
```

Codex agents 是项目级安装；每个已安装过 `.codex/agents/` 的项目都需要在该项目根目录执行一次更新。

## Propose Changes Back

被安装项目可以修改本地 agent，但这些修改不会自动回流到 `agent-octopus-toolkit`。回流使用离线提案包，避免要求业务项目拥有 GitLab/GitHub 权限，也避免未经确认的修改直接进入 toolkit。

流程：

```text
installed project edit
  -> propose-changes.py creates an offline proposal
  -> toolkit maintainer reviews diff
  -> apply-proposal.py --accept writes accepted files into toolkit
  -> maintainer commits and pushes toolkit
```

在安装了 Codex agents 的目标项目里生成提案：

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/propose-changes.py \
  --tool codex \
  --title "improve gitlab-sync for project X"
```

这会生成：

```text
.agent-octopus/proposals/proposal-YYYYMMDD-HHMMSS/
├── manifest.json
├── README.md
├── diffs/
└── files/
```

目标项目只需要把这个目录交给 toolkit 维护者；不需要 GitLab/GitHub push 权限。

维护者在 `agent-octopus-toolkit` 仓库里 review：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/apply-proposal.py \
  /path/to/proposal-YYYYMMDD-HHMMSS
```

确认接受后才写入 toolkit 源文件：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/apply-proposal.py \
  /path/to/proposal-YYYYMMDD-HHMMSS \
  --accept
```

也可以只接受某个文件：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/apply-proposal.py \
  /path/to/proposal-YYYYMMDD-HHMMSS \
  --file integrations/codex/agents/gitlab-sync.toml \
  --accept
```

接受后由 toolkit 维护者正常执行 `git diff`、测试、commit、push，再让目标项目通过 `install.sh --update` 获取新版本。

## Development

完整产品契约检查：

```bash
npm run check
```

重新生成分发和 catalog：

```bash
npm run generate
```

运行 deterministic agent eval：

```bash
npm run eval
```

检查安装脚本：

```bash
bash -n scripts/install.sh
```

检查沙箱脚本：

```bash
python3 -m py_compile sandbox/octopus_sandbox.py
bin/octopus-sandbox --help
bin/octopus-sandbox doctor
```

检查回流脚本：

```bash
python3 -m py_compile scripts/propose-changes.py scripts/apply-proposal.py
```

新增或修改 agent 时，必须同步维护：

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

完成后运行：

```bash
npm run validate
npm run eval
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --dry-run
```

新增可复用诊断能力时，优先放到 `sandbox/octopus_sandbox.py`，然后更新对应 agent 指令、Codex TOML 和 manifest。不要把重复诊断逻辑写进目标项目的临时脚本。

## License

Internal toolkit. Add a license before public distribution.
