# agent 八爪鱼工具包：Codex Integration

Codex agents are installed as TOML files from `integrations/codex/agents/`.

The canonical reusable agent source lives under the toolkit `agents/` directory. The TOML files here are Codex install/distribution variants.

Each Codex agent must also be declared in `manifests/agents/<agent>.json`. Run `npm run validate` from the toolkit root before installing or updating downstream projects.

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

## mcp-agent-e2e-designer Notes

`mcp-agent-e2e-designer` keeps its historical install name for compatibility, but its current role is broader than design. Treat it as an MCP intelligent-agent E2E lifecycle governor:

- Discover the project profile from code/config before asking business questions.
- Draft the user-visible E2E prompt and require explicit confirmation before runtime or MCP execution.
- Execute from the MCP boundary first, then diagnose with HTTP/CLI/worker/filesystem only when the project profile allows it or when diagnosing an MCP-facing failure.
- Apply code fixes only after a reproduced failing assertion or compile/startup failure, and only in the smallest owning module.
- After each completed or failed E2E, produce a self-evolution proposal report from process/result evidence.
- Stop after printing the proposal report and ask the user which candidates may be applied. Pending proposals must not be treated as accepted profile, use-case, or toolkit rules.

## user-flow-debug Notes

`user-flow-debug` is intended for browser-level Dashboard validation, not API-only smoke testing. It discovers the runtime flow from the live Dashboard and loaded domain contract before acting:

- The caller must provide the Dashboard entry UI, such as `index.html`, `domain-chat.html`, `run-detail.html`, or a full entry URL. The agent must not infer or switch entry pages from domain/scenario names.
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

Dry-run a project-scoped update without writing files:

```bash
cd /path/to/your/project
/Users/wangyejing/github/agent-octopus-toolkit/scripts/install.sh --tool codex --update --dry-run
```
