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
| `gitlab-sync` | GitLab 分支同步、提交、推送、MR/CI 边界和冲突处理 |
| `user-flow-debug` | 通过 Dashboard UI 做真实用户流调试、截图留证、产物校验和受控修复 |

## This Is For You If

- 你在多个项目里反复复制同一套 Claude Code / Codex agent 指令。
- 你希望 GitLab 同步、提交、推送、MR、CI 诊断有一致的安全边界。
- 你希望 user-flow 调试必须走真实 Dashboard UI，而不是绕过产品路径。
- 你遇到过不同 agent、不同 OS 环境下缺少 `rg`、`curl`、`lsof`、`netstat`、`ss` 等命令的问题。
- 你不希望每个目标项目里都临时创建 Python 诊断脚本。
- 你希望 toolkit 发布新版本后，可以明确更新已安装的 agents。

## Features

### Shared Agents

一套源文件同时生成 Claude Code Markdown agents 和 Codex TOML agents。Claude Code 使用 `agents/*.md`，Codex 使用 `integrations/codex/agents/*.toml`。

### Portable Sandbox

OS 敏感操作集中到 `bin/octopus-sandbox` 和 `sandbox/octopus_sandbox.py`，agent 指令优先调用沙箱入口，避免在目标项目里临时构建脚本。

### GitLab Workflow Guardrails

`gitlab-sync` 借鉴 AICodingFlow 的流程边界，把 branch、sync、commit、push、MR、CI、conflict 分开处理，避免误推共享分支、混杂提交、跳过 hook 或直接 force push。

### Real User Flow Debugging

`user-flow-debug` 强制通过 Dashboard UI 模拟真实用户路径，覆盖附件上传、步骤选择、截图、产物下载、运行日志和修复策略。

### Project-Scoped Codex Install

Codex agents 安装到目标项目的 `.codex/agents/`，不会覆盖 `.codex/skills/`。这让每个项目可以显式选择是否接入和何时更新。

## Problems It Solves

| Without Toolkit | With Toolkit |
| --- | --- |
| 每个项目手写或复制 agent 指令，版本不一致。 | agents 从 toolkit 安装，更新路径明确。 |
| agent 临时创建 Python 脚本，散落在目标项目里。 | 可复用诊断能力进入 `sandbox/`，目标项目保持干净。 |
| 不同 OS 缺少 `curl`、`lsof`、`netstat`、`ss` 等命令导致流程中断。 | 沙箱使用 Python 标准库提供 HTTP、端口、产物扫描等 fallback。 |
| Git 同步、提交、推送、MR、CI 被混成一个高风险动作。 | `gitlab-sync` 明确每一步的确认点和禁止动作。 |
| 用户流调试绕过 UI 或缺少截图证据。 | `user-flow-debug` 要求真实 Dashboard 操作和关键节点截图。 |

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
├── sandbox/octopus_sandbox.py       OS 敏感操作和可复用诊断实现
├── scripts/install.sh               安装/更新脚本
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

也可以自动安装到检测到的工具：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh
```

验证沙箱：

```bash
/Users/wangyejing/github/agent-octopus-toolkit/bin/octopus-sandbox doctor
```

## Usage

GitLab 同步：

```text
使用 gitlab-sync，把本地 dev 和 origin/dev 同步，先检查状态，不要直接 push。
```

用户流调试：

```text
使用 user-flow-debug，跑 deployed 环境的目标场景，新 run，real JDBC，截图到 /tmp/user-flow，策略 diagnose-only。
```

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

## Development

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

新增可复用诊断能力时，优先放到 `sandbox/octopus_sandbox.py`，然后更新对应 agent 指令和 Codex TOML 版本。不要把重复诊断逻辑写进目标项目的临时脚本。

## License

Internal toolkit. Add a license before public distribution.
