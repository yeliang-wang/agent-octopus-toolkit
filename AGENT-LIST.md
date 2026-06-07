# agent 八爪鱼工具包 Agent List

| Agent | File | Best For |
| --- | --- | --- |
| domainforge-fabric-evolution-lab | `agents/domainforge-fabric-evolution-lab.md` | 在 dev 阶段驱动 domainforge-fabric 生产级闭环实验：投喂素材、vibe MCP 场景、每 15 分钟轮转 E2E、主动聊天反馈、维护状态面板并触发 self-evolution |
| gitlab-sync | `agents/gitlab-sync.md` | 同步 GitLab 分支、提交本地变更、推送远程、处理分支歧义和冲突 |
| mcp-agent-e2e-designer | `agents/mcp-agent-e2e-designer.md` | MCP 智能体 E2E 生命周期治理：基于 DDD 做代码发现、用例设计、prompt 确认、MCP 边界执行、诊断、受控 code-fix，并在每次 E2E 后生成需用户确认的自我进化建议报告 |
| production-soak-governor | `agents/production-soak-governor.md` | 通用 24h/长稳生产仿真治理：真实服务 readiness、数据清零、非 mock 预检、流量与生命周期挂起、30 分钟汇报、产品缺口阻断、代码升级/SCM/CI-CD 闭环和最终证据报告 |
| user-flow-debug | `agents/user-flow-debug.md` | 通过 Dashboard UI 模拟真实用户流，区分 attachment-driven/time-driven/chat-driven/hybrid，截图留证、校验角色与产物、定位和修复 agent 应用问题 |

## Product Contracts

每个 agent 都必须有对应的产品契约：

| Agent | Manifest |
| --- | --- |
| domainforge-fabric-evolution-lab | `manifests/agents/domainforge-fabric-evolution-lab.json` |
| gitlab-sync | `manifests/agents/gitlab-sync.json` |
| mcp-agent-e2e-designer | `manifests/agents/mcp-agent-e2e-designer.json` |
| production-soak-governor | `manifests/agents/production-soak-governor.json` |
| user-flow-debug | `manifests/agents/user-flow-debug.json` |

运行 `npm run validate` 会校验 manifest、Markdown source、Codex distribution、README/AGENT-LIST 清单和关键章节。

## Shared Sandbox

Agents should use `bin/octopus-sandbox` for repeatable OS-sensitive diagnostics instead of creating temporary scripts in the target agent workspace.
