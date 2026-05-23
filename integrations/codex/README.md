# agent 八爪鱼工具包：Codex Integration

Codex agents are provided as TOML files in `integrations/codex/agents/`.

Install them into a project-scoped `.codex/agents/` directory:

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex
```

Manual install:

```bash
mkdir -p /path/to/your/project/.codex/agents
cp /Users/wangyejing/github/agent-octopus-toolkit/integrations/codex/agents/*.toml \
  /path/to/your/project/.codex/agents/
```

This does not replace existing Codex skills under `.codex/skills/`; it adds project-scoped agents under `.codex/agents/`.

## Update

After `agent-octopus-toolkit` is updated or a new version is released, run the installer again from each target project root:

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --update
```

The update is project-scoped and overwrites toolkit agents with the latest files from `integrations/codex/agents/`.
