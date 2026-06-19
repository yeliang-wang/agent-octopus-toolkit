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
| Docs | README release section and docs for release and competitive baseline |
| Commands | manifest validation, distribution check, catalog check, deterministic eval, whitespace check, Codex install drift |

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
