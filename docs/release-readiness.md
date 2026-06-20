# Release Readiness

Octopus AgentOps uses a public-beta release bar. The toolkit can be released when its subagents are installable, loop-capable, drift-checkable, and auditable from the local checkout.

## Release Level

Current target: `public-beta`.

This means:

- Every packaged agent is at least `beta`.
- Every packaged plugin is at least `beta`.
- Every agent has a structured `loopContract`.
- Every agent has a `runtimeAdapters.codexGoal` plan.
- Generated Codex TOML and catalogs are current.
- Deterministic eval and install roundtrip pass.
- Package metadata and license are ready for public distribution.

It does not mean the toolkit is a general-purpose agent runtime or orchestration framework.

## Required Gate

Run:

```bash
npm run release:check
```

For machine-readable evidence:

```bash
npm run release:check -- --json
```

The gate runs or verifies:

| Area | Check |
| --- | --- |
| Package metadata | name, semver, public package flag, license, `LICENSE` file |
| Lifecycle | no `experimental` packaged agents or plugins |
| Loop plans | `loopContract`, required loop state fields, Codex goal adapter, artifact plan |
| Loop goal window | every packaged agent requires explicit final goal, phase goals, acceptance criteria, report cadence, and final decision |
| Release coverage matrix loop | every packaged agent requires coverage matrix, evidence map, blocker policy, repair policy, release decision, and per-phase decision chain |
| Production release rule | every packaged agent forbids mock/fake/stub/simulator/fixture-only/demo-only/smoke-only/chat-only release evidence |
| Docs | README release section and docs for release and competitive baseline |
| Commands | manifest validation, distribution check, catalog check, deterministic eval, whitespace check, Codex install drift |

## Loop Goal Window

Every loop-capable packaged subagent must establish a `Loop Goal Window` before starting or resuming a loop. The window is part of the release contract, not optional prompt guidance.

Required fields:

- `finalGoal`: the terminal objective for the loop.
- `phaseGoals`: staged objectives for the current release, validation, or evolution phase.
- `currentPhase`: the active phase being worked now.
- `acceptanceCriteria`: evidence-backed criteria needed before completion can be claimed.
- `reportCadence`: when the agent reports progress, blockers, and next actions.
- `finalDecision`: the explicit terminal decision such as `DONE`, `BLOCKED`, `NO-GO`, or `NOT_RELEASE_READY`.

The release gate requires these fields in `loopContract.goalWindow`, `loopContract.stateFields`, and loop inputs where user input is needed. Agents must stop or report `BLOCKED` instead of running indefinitely when the final goal, acceptance criteria, or final decision cannot be established.

## Release Coverage Matrix Loop

For release, release-readiness, GA, public-beta, production-grade, or long-running product lifecycle goals, every packaged subagent must convert the goal window into a `Release Coverage Matrix Loop` before running.

Required loop fields:

- `coverageMatrix`: rows for product capabilities, scenarios, connected projects or systems, required evidence, status, blocker, and next repair action.
- `iterationPlan`: the next phase sequence needed to move matrix rows from `NOT_RUN`, `FAIL`, or `BLOCKED` toward `PASS`.
- `evidenceMap`: the product-native command, API, UI, CI/CD, SCM, runtime, artifact, or decision source backing each matrix row.
- `blockerPolicy`: rules for when missing product boundaries, repeated failures, or non-production substitutes become `BLOCKED`, `NO-GO`, or not release-ready.
- `repairPolicy`: diagnosis, productized repair, verification, escalation, and stop rules for repeated blockers.
- `releaseDecision`: the current explicit decision, such as `GO`, `CONDITIONAL-GO`, `NO-GO`, `BLOCKED`, or `NOT_RELEASE_READY`.
- `decisionChain`: the 阶段决策链 printed for every phase.

Every phase report must print the decision chain that led to its conclusion:

```text
phase:
evidence:
rule:
options:
decision:
rationale:
nextAction:
```

Health checks, process keepalive, smoke checks, or repeating the same failed path do not count as release progress by themselves. If the same blocker repeats, the agent must switch from rerun mode into diagnosis, productized repair, and verification; if that cannot be done under the current permissions or product boundary, the loop must stop as `BLOCKED` or `NO-GO`.

## Toolkit-Wide Production Release Rule

For product-grade, production-like, release-candidate, GA, or release-readiness work, no packaged subagent may use mock, fake, stub, simulator, fixture-only, demo-only, smoke-only, or chat-only evidence as production release evidence.

- Smoke checks may prove connectivity only; they are not release validation.
- If a required runtime, model, SCM, CI/CD, data, approval, rollback, observability, or product API boundary is missing or replaced by a non-production substitute, the result must be `NO-GO`, `BLOCKED`, or not release-ready.
- Unit tests may still use controlled fakes, but release claims require real processes, real APIs, real credentials, real SCM, real CI/CD, real product data paths, and product-native release evidence where available.

## Promotion Rules

Use these lifecycle levels consistently:

| Lifecycle | Meaning |
| --- | --- |
| `experimental` | Not eligible for public release. Contract may still change materially. |
| `beta` | Eligible for public-beta release. Contract is explicit, validated, generated, and installable. |
| `production-ready` | Reserved for agents with repeated real-project evidence across supported runtimes. |

Promoting an agent to `beta` requires:

1. A manifest with explicit inputs, outputs, evidence, confirmation gates, dangerous actions, `loopContract`, and `runtimeAdapters.codexGoal`.
2. Canonical Markdown source with `Goal-Driven Loop Mode`.
3. Generated Codex TOML with `Codex Goal Runtime Adapter`.
4. `npm run validate`, `npm run eval`, and `npm run release:check` passing.
5. README and AGENT-LIST references.

## Codex Loop Evidence

Each Codex loop plan must define:

- Outer goal runtime: Codex `/goal`.
- Inner loop protocol: selected Octopus agent.
- Loop goal window: `finalGoal`, `phaseGoals`, `currentPhase`, `acceptanceCriteria`, `reportCadence`, and `finalDecision`.
- Release coverage matrix fields: `coverageMatrix`, `iterationPlan`, `evidenceMap`, `blockerPolicy`, `repairPolicy`, `releaseDecision`, and `decisionChain`.
- Per-phase decision chain: `phase`, `evidence`, `rule`, `options`, `decision`, `rationale`, and `nextAction`.
- `loopState` fields including `goal`, `blocker`, `nextAction`, and `stopCondition`.
- State artifact: `data/<agent-domain>/<projectId>/loop-state.json`.
- Status artifact: `data/<agent-domain>/<projectId>/current-status.md`.
- Evidence root: `data/<agent-domain>/<projectId>/evidence/`.

If the target project cannot persist these artifacts, the agent must report the same fields in chat and stop on missing evidence rather than claiming release readiness.

## Release Checklist

Before tagging or publishing:

```bash
npm run generate -- --check
npm run validate
npm run check
npm run eval
npm run agents:codex-status
npm run release:check
git diff --check
```

Then inspect:

```bash
git status --short --branch
git diff --stat
```

Do not claim a stable GA release while any packaged agent remains `beta`.
