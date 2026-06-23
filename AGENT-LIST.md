# Octopus AgentOps Agent Catalog

| Agent | File | Best For |
| --- | --- | --- |
| product-evolution-lab | `agents/product-evolution-lab.md` | Generic product evolution lab for material rotation, product E2E pressure, evidence submission, review closure, and improvement feedback. |
| scm-sync-governor | `agents/scm-sync-governor.md` | Safe SCM sync, commit, push, PR/MR/CI, branch ambiguity, and conflict handling. |
| mcp-e2e-governor | `agents/mcp-e2e-governor.md` | MCP intelligent-agent E2E lifecycle governance with code-first discovery, prompt confirmation, execution, diagnosis, controlled fixes, and self-evolution proposals. |
| user-flow-debug | `agents/user-flow-debug.md` | Real Dashboard user-flow debugging with runtime-flow discovery, screenshots, artifact checks, role validation, diagnosis, and controlled fixes. |

## Product Contracts

Each agent must have a product contract:

| Agent | Manifest |
| --- | --- |
| product-evolution-lab | `manifests/agents/product-evolution-lab.json` |
| scm-sync-governor | `manifests/agents/scm-sync-governor.json` |
| mcp-e2e-governor | `manifests/agents/mcp-e2e-governor.json` |
| user-flow-debug | `manifests/agents/user-flow-debug.json` |

Run `npm run validate` to check manifests, Markdown sources, Codex distributions, README/AGENT-LIST references, plugin assignments, generated catalogs, and required sections.

Every manifest also declares a structured `loopContract` and `runtimeAdapters.codexGoal` plan. Release-focused loops must include a release coverage matrix, evidence map, repair policy, release decision, and printed per-phase decision chain. Use `npm run agents:goal-plan -- --agent <agent> --project-id <project> "<goal>"` to render the Codex `/goal` mapping without making Octopus AgentOps Codex-only.

All packaged agents can share the Production Representative Sandbox at `sandbox/production-representative/manifest.json` when a local release matrix needs representative connected projects before real customer production projects exist. The sandbox project set must still be registered through the target product and real SCM, CI/CD, LLM/runtime, and product-native evidence boundaries before it can count as release evidence.

Run `npm run release:check` before public distribution. The release gate requires package metadata, license, beta-or-better lifecycles, loop contracts, Codex goal plans, generated outputs, deterministic eval, and project-scoped Codex install drift to pass.

## Plugin Product Lines

Octopus AgentOps keeps agents in one platform repository while they share loop contracts, generated distributions, installation, sandbox, eval, and release-readiness gates. A plugin should become an independent repository only after it has its own user entrypoint, runtime, package, issue surface, and release cadence.

## Plugins

| Plugin | Manifest | Agents |
| --- | --- | --- |
| git-workflow | `plugins/git-workflow/plugin.json` | `scm-sync-governor` |
| mcp-e2e-governance | `plugins/mcp-e2e-governance/plugin.json` | `mcp-e2e-governor`, `user-flow-debug` |
| product-evolution-lab | `plugins/product-evolution-lab/plugin.json` | `product-evolution-lab` |

Generated catalogs live in `catalog/agents.json` and `catalog/plugins.json`.

## Shared Sandbox

Agents should use `bin/octopus-sandbox` for repeatable OS-sensitive diagnostics instead of creating temporary scripts in the target agent workspace.
