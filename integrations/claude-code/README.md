# agent 八爪鱼工具包：Claude Code Integration

Claude Code can use the Markdown agents in `agents/` directly because they use YAML frontmatter plus Markdown instructions.

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

## Update

After `agent-octopus-toolkit` is updated or a new version is released, run:

```bash
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool claude-code --update
```

The update overwrites toolkit agents in `~/.claude/agents/` with the latest files from `agents/`.
