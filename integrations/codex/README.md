# Octopus AgentOps: Codex Integration

Codex agents are installed as TOML files from `integrations/codex/agents/`.

Canonical reusable agent sources live under `agents/`. The TOML files here are generated Codex distributions from those sources and `manifests/agents/*.json`.

Each Codex agent must be declared in `manifests/agents/<agent>.json` and assigned to a plugin in `plugins/<plugin>/plugin.json`. Run `npm run generate`, `npm run validate`, and `npm run eval` from the toolkit root before installing or updating downstream projects.

## Codex Goal Adapter

Codex `/goal` is supported as the outer runtime for installed Codex agents. It does not replace each agent's `Goal-Driven Loop Mode`; it keeps the objective active while the agent-owned loop contract controls cadence, state, evidence, stop policies, and confirmation gates.

For release, release-readiness, GA, public-beta, production-grade, or long-running product lifecycle goals, the installed agent must expand the user's goal into a release coverage matrix before running. The plan must include `targetPlan`, `targetPlanConfirmation`, `coverageMatrix`, `iterationPlan`, `evidenceMap`, `blockerPolicy`, `repairPolicy`, `releaseDecision`, and `decisionChain`; every phase report must print the 阶段决策链 with evidence, rule, options, decision, rationale, and next action.

Before starting or resuming the loop, the installed agent must present the provided or inferred target plan to the user as a confirmation proposal. Require explicit user confirmation before entering the loop. If the target plan is unconfirmed, stop as `BLOCKED: pending loop target plan confirmation`; do not run loop actions until the user confirms or edits the plan.

If the target project has no real customer production projects, installed agents may use the shared Production Representative Sandbox at `sandbox/production-representative/manifest.json`. Generated representative projects must still be registered through the target product and verified through real SCM, CI/CD, LLM/runtime, and product-native evidence boundaries before they count as release evidence.

Render the adapter plan for an agent:

```bash
npm run agents:goal-plan -- \
  --agent production-lifecycle-governor \
  --project-id your-project \
  "Take this project through a release coverage matrix loop toward public-beta readiness"
```

The generated Codex TOML files include a `Codex Goal Runtime Adapter` section from each agent manifest. The shared adapter guide is `integrations/codex/goal-adapter.md`.

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

## mcp-e2e-governor Notes

Treat `mcp-e2e-governor` as an MCP intelligent-agent E2E lifecycle governor:

- Discover the project profile from code/config before asking business questions.
- Draft the user-visible E2E prompt and require explicit confirmation before runtime or MCP execution.
- Execute from the MCP boundary first, then diagnose with HTTP/CLI/worker/filesystem only when the project profile allows it or when diagnosing an MCP-facing failure.
- Apply code fixes only after a reproduced failing assertion or compile/startup failure, and only in the smallest owning module.
- After each completed or failed E2E, produce a self-evolution proposal report from process/result evidence.
- Stop after printing the proposal report and ask the user which candidates may be applied. Pending proposals must not be treated as accepted profile, use-case, or toolkit rules.

## user-flow-debug Notes

`user-flow-debug` is intended for browser-level Dashboard validation, not API-only smoke testing. It discovers the runtime flow from the live Dashboard and loaded product contract before acting:

- The caller must provide the Dashboard entry UI, such as `index.html`, `domain-chat.html`, `run-detail.html`, or a full entry URL. The agent must not infer or switch entry pages from domain/scenario names.
- `attachment-driven`: upload only the attachments requested by the visible start form or first step.
- `time-driven`: wait for the agent's scheduled step message, then submit the required per-step attachment, path, or text.
- `chat-driven`: proceed through visible conversational prompts.
- `hybrid`: combine attachments, paths, text, and choices according to each visible step.

For time-driven local-dev runs, do not add or use tick controls in the UI. Prefer server-side scheduler plus a test schedule and isolated output root. Internal tick APIs may be used only when the user explicitly authorizes test-only advancement.

When the Dashboard renders role-based chat, the agent must record a step validation matrix containing step ID, expected input mode, displayed speaker/role, artifact count, and pass/fail.

## Update

After Octopus AgentOps is updated or a new version is released, run the installer again from each target project root:

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
