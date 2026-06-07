# Octopus AgentOps: Claude Code Integration

Claude Code can use the Markdown agents in `agents/` directly because they use YAML frontmatter plus Markdown instructions.

The product contract for each agent lives in `manifests/agents/<agent>.json`, and plugin packaging lives in `plugins/<plugin>/plugin.json`. Run `npm run validate` and `npm run eval` from the toolkit root before publishing updates.

## Install

```bash
cd /Users/wangyejing/github/agent-octopus-toolkit
./scripts/install.sh --tool claude-code
```

Manual install:

```bash
mkdir -p ~/.claude/agents
cp /Users/wangyejing/github/agent-octopus-toolkit/agents/*.md ~/.claude/agents/
```

## Use

```text
使用 gitlab-sync，检查当前仓库和 origin/dev 的同步状态。
```

```text
使用 user-flow-debug，跑 Dashboard 用户流并把截图保存在指定目录。
```

`user-flow-debug` 会先从 Dashboard 和运行时契约识别流程类型，再选择执行方式。附件驱动流程只上传当前 UI 要求的附件；时间驱动流程等待 Agent 主动发起 step 消息，再按该 step 要求上传附件、输入目录路径或提交文本。生产 UI 不应暴露 tick/debug 控件；local-dev 加速验证应优先使用服务端 scheduler、测试时间窗口和隔离 output root。

如果聊天页面支持 role profile，最终报告应包含 step 级角色矩阵：step ID、期望输入方式、页面显示说话人、artifact 数量和 pass/fail。

## Update

After Octopus AgentOps is updated or a new version is released, run:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool claude-code --update
```

The update overwrites toolkit agents in `~/.claude/agents/` with the latest files from `agents/`.
