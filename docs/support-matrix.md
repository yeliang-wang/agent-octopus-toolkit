# Support Matrix

This matrix defines what a stable GA release supports, what remains beta, and what is explicitly outside the product boundary.

## Runtime Support

| Runtime | Status | Notes |
| --- | --- | --- |
| Codex project-scoped agents | GA candidate | Installed under `.codex/agents/`; Codex `/goal` acts as the outer runtime when enabled. |
| Claude Code user-scoped agents | Public beta | Installed under `~/.claude/agents/`; stable GA requires repeated install/update evidence. |
| Shell release runner | GA candidate | `npm run release:runner -- --profile <profile>` is the current supported path. |
| Hosted service runtime | Not supported | Octopus AgentOps is not a hosted agent platform. |

## Operating Systems

| OS | Status | Notes |
| --- | --- | --- |
| macOS | GA candidate | Primary local development and validation environment. |
| Linux | Public beta | CI should cover Node and Python script checks. |
| Windows | Not yet GA | Requires explicit shell, path, and install-flow evidence. |

## Product Lines

| Product Line | Current Status | Stable GA Requirement |
| --- | --- | --- |
| Production lifecycle governance | Moved to ProofOps | Use https://github.com/yeliang-wang/ProofOps for release lifecycle governance. |
| MCP E2E governance | Beta | Needs standalone target profiles and repeated MCP boundary evidence. |
| SCM workflow governance | Beta | Needs hosted Git provider CI/PR evidence and destructive-action recovery docs. |
| Product evolution lab | Beta | Needs product profile compatibility and closed-loop evidence across targets. |
| Dashboard user-flow debugging | Beta | Needs browser evidence matrix and target UI contracts across products. |

## Compatibility Policy

- Manifest schema changes must be backward compatible inside a stable major version.
- Project profile changes require migration notes and fixture compatibility tests.
- Generated distributions must be regenerated from canonical Markdown sources.
- Installed Codex agents must match toolkit source hashes before release.
- Stable GA release notes must list any beta agents included in the package.

## Support Boundary

Supported:

- installation and drift checking
- manifest, plugin, catalog, and schema validation
- release coverage matrix runner behavior
- final report and evidence artifact format
- Codex project-scoped generated agent distributions

Not supported:

- replacing LangGraph, CrewAI, AutoGen, OpenHands, or model SDKs
- hosted multi-tenant execution
- production customer traffic generation
- fake release evidence as a substitute for product-native proof
- automatic merge, deploy, rollback, tag, or publish without explicit confirmation
