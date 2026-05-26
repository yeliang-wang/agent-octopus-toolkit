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

## user-flow-debug Notes

`user-flow-debug` is intended for browser-level Dashboard validation, not API-only smoke testing. It discovers the runtime flow from the live Dashboard and loaded domain contract before acting:

- `attachment-driven`: upload only the attachments requested by the visible start form or first step.
- `time-driven`: wait for the agent's scheduled step message, then submit the required per-step attachment, path, or text.
- `chat-driven`: proceed through visible conversational prompts.
- `hybrid`: combine attachments, paths, text, and choices according to each visible step.

For time-driven local-dev runs, do not add or use tick controls in the UI. Prefer server-side scheduler plus a test schedule and isolated output root. Internal tick APIs may be used only when the user explicitly authorizes test-only advancement.

When the Dashboard renders role-based chat, the agent must record a step validation matrix containing step ID, expected input mode, displayed speaker/role, artifact count, and pass/fail.

## Update

After `agent-octopus-toolkit` is updated or a new version is released, run the installer again from each target project root:

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --update
```

The update is project-scoped and overwrites toolkit agents with the latest files from `integrations/codex/agents/`.
