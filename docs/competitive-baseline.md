# Competitive Baseline

This project is compared against popular GitHub agent tools as a release-quality reference, not as a claim that it replaces them.

## Reference Tools

Snapshot date: 2026-06-19.

| Project | Primary Shape | What To Learn |
| --- | --- | --- |
| LangGraph | Agent graph and orchestration framework | Durable state, explicit control flow, production documentation |
| CrewAI | Multi-agent orchestration framework | Clear agent/team abstractions, examples, public packaging |
| AutoGen | Multi-agent application framework | Conversation patterns, extensibility, research-to-product bridge |
| OpenHands | Coding-agent application/platform | Full user workflow, runtime integration, issue/PR oriented operations |

## Octopus Positioning

Octopus AgentOps is narrower:

- It packages reusable engineering subagents.
- It declares product contracts for each agent.
- It generates installable Codex distributions.
- It checks drift in target projects.
- It adds Codex `/goal` loop plans without owning the model runtime.

This scope is intentional. The toolkit should be judged as a release-ready subagent operations package, not as a general agent framework.

## Release Parity Requirements

For public-beta parity with mainstream projects, this repo must provide:

| Requirement | Local Mechanism |
| --- | --- |
| Public license | `LICENSE` and `package.json` license |
| Repeatable install | `scripts/install.sh` and `npm run agents:install` |
| Generated distributions | `npm run generate -- --check` |
| Contract validation | `npm run validate` |
| Quality evidence | `npm run eval` |
| Release gate | `npm run release:check` |
| Runtime docs | `README.md`, `integrations/codex/README.md`, `integrations/codex/goal-adapter.md` |
| Agent catalog | `AGENT-LIST.md`, `catalog/agents.json`, `catalog/plugins.json` |

## Non-Goals

The toolkit does not aim to become:

- A graph runtime.
- A model API wrapper.
- A hosted coding-agent application.
- A full browser or MCP testing framework.

Those are integration surfaces. Octopus remains the contract, packaging, release, and loop-governance layer for reusable engineering agents.
