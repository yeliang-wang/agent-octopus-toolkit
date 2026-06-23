# Codex Goal Runtime Adapter

Codex `/goal` is the outer objective runtime for Octopus AgentOps agents. The platform loop contract remains runtime-neutral; Codex only supplies a persistent goal driver for environments where the `goals` feature is enabled.

## Boundary

Use this adapter when a Codex project has installed `integrations/codex/agents/*.toml` into `.codex/agents/` and the user wants a long-running or repeated goal-driven workflow.

Do not treat `/goal` as a replacement for an agent's domain loop protocol. The outer Codex goal keeps the work moving; the selected agent still owns loop inputs, loop state, evidence requirements, stop policies, confirmation gates, and dangerous-action boundaries.

## Mapping

```text
Codex /goal
  -> outer objective runtime
  -> resume and continue pressure
  -> stop when the goal is complete or blocked

Octopus agent loopContract
  -> inner domain loop protocol
  -> loopCadence, goalWindow, coverageMatrix, repairPolicy, decisionChain
  -> stopPolicies, loopState, evidence
  -> confirmation gates and dangerous actions
```

## Required Runtime Checks

Before starting a Codex-goal run:

1. Check the project-scoped Codex install:

   ```bash
   npm run agents:codex-status -- --project-root /path/to/project
   ```

2. Check whether Codex goals are enabled. The status command reports this when `codex` is available.

3. Render the adapter plan:

   ```bash
   npm run agents:goal-plan -- --agent mcp-e2e-governor --project-id my-project "Prove the MCP onboarding journey"
   ```

4. Start `/goal` in Codex with the rendered outer goal, then run the selected installed agent as the inner loop protocol.

## State And Evidence

Every Codex-goal run must persist or report:

- Loop goal window: `finalGoal`, `phaseGoals`, `currentPhase`, `acceptanceCriteria`, `targetPlan`, `targetPlanConfirmation`, `reportCadence`, and `finalDecision`.
- Release coverage matrix: `coverageMatrix`, `iterationPlan`, `evidenceMap`, `blockerPolicy`, `repairPolicy`, and `releaseDecision` when the goal is release-focused or production-grade.
- Per-phase decision chain: `phase`, `evidence`, `rule`, `options`, `decision`, `rationale`, and `nextAction` printed in each phase report.
- `loop-state.json`: current loop state, blocker, stop policy, and next action.
- `current-status.md`: human-readable heartbeat for long-running loops.
- `evidence/`: command output, MCP responses, screenshots, logs, artifacts, or assertion reports.

Before the first loop action, the agent must present the provided or inferred `targetPlan` to the user as a confirmation proposal. Require explicit user confirmation before entering the loop. If the target plan is unconfirmed, stop as `BLOCKED: pending loop target plan confirmation`; do not start, resume, or continue loop execution until the user confirms or edits the plan.

If the agent cannot establish the loop goal window or write these artifacts in the target environment, it must report the same fields in chat and stop on missing evidence rather than claiming release readiness.

## Safety Rules

- Keep confirmation gates authoritative even when `/goal` is continuous.
- Require explicit user confirmation before entering the loop when a target plan has been provided, inferred, or discovered from product-native data.
- Stop on pending user confirmation, missing evidence, unsafe production action, or a domain blocker.
- Treat health checks, smoke checks, and process keepalive as connectivity evidence only; they are not release coverage by themselves.
- When the same blocker repeats, switch from rerun into diagnosis, productized repair, and verification, or stop as `BLOCKED` / `NO-GO`.
- Do not silently accept self-evolution candidates as new loop rules.
- Do not promote project-specific runtime facts into generic platform instructions.
