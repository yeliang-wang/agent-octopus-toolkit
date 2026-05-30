# agent 八爪鱼工具包 Agent List

| Agent | File | Best For |
| --- | --- | --- |
| gitlab-sync | `agents/gitlab-sync.md` | 同步 GitLab 分支、提交本地变更、推送远程、处理分支歧义和冲突 |
| mcp-agent-e2e-designer | `agents/mcp-agent-e2e-designer.md` | MCP 智能体 E2E 生命周期治理：基于 DDD 做代码发现、用例设计、prompt 确认、MCP 边界执行、诊断、受控 code-fix，并在每次 E2E 后生成需用户确认的自我进化建议报告 |
| user-flow-debug | `agents/user-flow-debug.md` | 通过 Dashboard UI 模拟真实用户流，区分 attachment-driven/time-driven/chat-driven/hybrid，截图留证、校验角色与产物、定位和修复 agent 应用问题 |

## Shared Sandbox

Agents should use `bin/octopus-sandbox` for repeatable OS-sensitive diagnostics instead of creating temporary scripts in the target agent workspace.
