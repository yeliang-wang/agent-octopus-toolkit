# Octopus AgentOps Agent Catalog

| Agent | File | Best For |
| --- | --- | --- |
| product-evolution-lab | `agents/product-evolution-lab.md` | Generic product evolution lab for material rotation, product E2E pressure, evidence submission, review closure, and improvement feedback. |
| scm-sync-governor | `agents/scm-sync-governor.md` | Safe SCM sync, commit, push, PR/MR/CI, branch ambiguity, and conflict handling. |
| mcp-e2e-governor | `agents/mcp-e2e-governor.md` | MCP intelligent-agent E2E lifecycle governance with code-first discovery, prompt confirmation, execution, diagnosis, controlled fixes, and self-evolution proposals. |
| production-lifecycle-governor | `agents/production-lifecycle-governor.md` | Generic full production lifecycle governance with readiness, cleanup, non-mock precheck, configurable-duration validation, evolution delivery, release evidence, scenario matrix, risk register, and GO/NO-GO decisions. |
| user-flow-debug | `agents/user-flow-debug.md` | Real Dashboard user-flow debugging with runtime-flow discovery, screenshots, artifact checks, role validation, diagnosis, and controlled fixes. |

## Product Contracts

Each agent must have a product contract:

| Agent | Manifest |
| --- | --- |
| product-evolution-lab | `manifests/agents/product-evolution-lab.json` |
| scm-sync-governor | `manifests/agents/scm-sync-governor.json` |
| mcp-e2e-governor | `manifests/agents/mcp-e2e-governor.json` |
| production-lifecycle-governor | `manifests/agents/production-lifecycle-governor.json` |
| user-flow-debug | `manifests/agents/user-flow-debug.json` |

Run `npm run validate` to check manifests, Markdown sources, Codex distributions, README/AGENT-LIST references, plugin assignments, generated catalogs, and required sections.

## Plugins

| Plugin | Manifest | Agents |
| --- | --- | --- |
| git-workflow | `plugins/git-workflow/plugin.json` | `scm-sync-governor` |
| mcp-e2e-governance | `plugins/mcp-e2e-governance/plugin.json` | `mcp-e2e-governor`, `user-flow-debug` |
| production-lifecycle | `plugins/production-lifecycle/plugin.json` | `production-lifecycle-governor` |
| product-evolution-lab | `plugins/product-evolution-lab/plugin.json` | `product-evolution-lab` |

Generated catalogs live in `catalog/agents.json` and `catalog/plugins.json`.

## Shared Sandbox

Agents should use `bin/octopus-sandbox` for repeatable OS-sensitive diagnostics instead of creating temporary scripts in the target agent workspace.
