# Stable GA Criteria

Octopus AgentOps reaches stable GA only when the release claim is backed by repeatable product evidence, not by prompt quality or local smoke checks alone.

## Release Scope

The first stable GA scope is the Octopus AgentOps platform substrate plus the production lifecycle governance product line:

- manifest, plugin, catalog, and generated distribution contracts
- Codex and Claude Code installation flows
- runtime-neutral `loopContract`
- Codex `/goal` adapter
- project profile runner
- production lifecycle release coverage matrix workflow
- final report artifacts and evidence discipline

Other agents may remain beta if the stable GA release notes identify them as non-GA components. A whole-platform stable GA requires every packaged agent and plugin to use `production-ready`.

The machine-readable scope is `docs/ga-scope.json`. `npm run release:check:ga` evaluates scoped GA from that file; it does not silently promote non-scoped beta agents.

## Required Evidence

Stable GA requires all public-beta checks plus these gates:

| Gate | Requirement |
| --- | --- |
| Lifecycle | GA-scoped agents and plugins are `production-ready`; whole-platform GA requires all packaged agents/plugins to be `production-ready`. |
| CI | GitHub Actions runs validation, generation drift checks, deterministic eval, public-beta release checks, and stable-GA checks. |
| Real project profiles | At least three `agent-octopus-project-profile/v1` release profiles exist and run through the release coverage matrix runner. |
| Final reports | Each release profile produces `final-report.md` and `final-report.json` with iteration target summaries and final target summary. |
| External boundaries | Release evidence uses real Git, validation commands, SCM/CI, runtime/LLM, product-native evidence, approval, rollback, and audit boundaries where applicable. |
| Distribution | Tagged releases include release-readiness output, changelog, install/upgrade notes, and compatibility notes. |
| Contract stability | Schemas have versioning policy, migration notes, and compatibility tests. |
| Operability | Failure modes, recovery, drift checks, and support matrix are documented. |

For the first GA candidate, the scoped project profiles are:

- `project-profiles/examples/octopus-agentops.public-beta.json`
- `project-profiles/examples/production-representative.local.json`
- `project-profiles/examples/evopilot.ga.json`

## Explicit Non-Goals

Stable GA does not mean Octopus AgentOps becomes:

- a graph runtime like LangGraph
- a general multi-agent framework like CrewAI or AutoGen
- a model SDK like OpenAI Agents SDK
- a hosted coding-agent application like OpenHands

Octopus AgentOps remains the release-governance, packaging, evidence, and install-drift layer for reusable engineering agents.

## Promotion Rule

An agent can move from `beta` to `production-ready` only after:

1. The public-beta release gate passes.
2. A stable-GA target run produces a machine-readable failed-or-passed result.
3. At least two real target projects and one production-representative profile exercise the agent's core workflow.
4. A final report shows coverage matrix rows, evidence map, repair policy, release decision, and decision chain.
5. The release notes identify any remaining non-GA components.

Do not mark an agent `production-ready` just because its manifest validates.
