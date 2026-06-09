# Octopus AgentOps Agent Catalog

| Agent | File | Best For |
| --- | --- | --- |
| domainforge-fabric-evolution-lab | `agents/domainforge-fabric-evolution-lab.md` | DomainForge Fabric production-closed-loop lab for material rotation, MCP E2E pressure, evidence submission, review closure, and self-evolution feedback. |
| gitlab-sync | `agents/gitlab-sync.md` | Safe GitLab sync, commit, push, MR/CI, branch ambiguity, and conflict handling. |
| mcp-agent-e2e-designer | `agents/mcp-agent-e2e-designer.md` | MCP intelligent-agent E2E lifecycle governance with code-first discovery, prompt confirmation, execution, diagnosis, controlled fixes, and self-evolution proposals. |
| production-release-governor | `agents/production-release-governor.md` | Production release readiness governance with real soak evidence, security, approval, rollback, observability, scenario matrix, risk register, and GO/NO-GO decisions. |
| production-soak-governor | `agents/production-soak-governor.md` | Generic production-like configurable-duration validation with real readiness, non-mock prechecks, traffic, lifecycle runners, governance-gate enforcement, product-gap blocking, SCM, CI/CD, and final evidence. |
| user-flow-debug | `agents/user-flow-debug.md` | Real Dashboard user-flow debugging with runtime-flow discovery, screenshots, artifact checks, role validation, diagnosis, and controlled fixes. |

## Product Contracts

Each agent must have a product contract:

| Agent | Manifest |
| --- | --- |
| domainforge-fabric-evolution-lab | `manifests/agents/domainforge-fabric-evolution-lab.json` |
| gitlab-sync | `manifests/agents/gitlab-sync.json` |
| mcp-agent-e2e-designer | `manifests/agents/mcp-agent-e2e-designer.json` |
| production-release-governor | `manifests/agents/production-release-governor.json` |
| production-soak-governor | `manifests/agents/production-soak-governor.json` |
| user-flow-debug | `manifests/agents/user-flow-debug.json` |

Run `npm run validate` to check manifests, Markdown sources, Codex distributions, README/AGENT-LIST references, plugin assignments, generated catalogs, and required sections.

## Plugins

| Plugin | Manifest | Agents |
| --- | --- | --- |
| git-workflow | `plugins/git-workflow/plugin.json` | `gitlab-sync` |
| mcp-e2e-governance | `plugins/mcp-e2e-governance/plugin.json` | `mcp-agent-e2e-designer`, `user-flow-debug` |
| production-soak | `plugins/production-soak/plugin.json` | `production-soak-governor`, `production-release-governor` |
| domainforge-fabric-lab | `plugins/domainforge-fabric-lab/plugin.json` | `domainforge-fabric-evolution-lab` |

Generated catalogs live in `catalog/agents.json` and `catalog/plugins.json`.

## Shared Sandbox

Agents should use `bin/octopus-sandbox` for repeatable OS-sensitive diagnostics instead of creating temporary scripts in the target agent workspace.
