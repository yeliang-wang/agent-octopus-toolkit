# agent 八爪鱼工具包 Agent List

| Agent | File | Best For |
| --- | --- | --- |
| gitlab-sync | `agents/gitlab-sync.md` | 同步 GitLab 分支、提交本地变更、推送远程、处理分支歧义和冲突 |
| mcp-agent-e2e-designer | `agents/mcp-agent-e2e-designer.md` | 基于 DDD 读取 MCP 智能体项目代码，结合静态运行参数和动态业务参数设计、保存、执行、诊断和 code-fix E2E usecase |
| user-flow-debug | `agents/user-flow-debug.md` | 通过 Dashboard UI 模拟真实用户流，区分 attachment-driven/time-driven/chat-driven/hybrid，截图留证、校验角色与产物、定位和修复 agent 应用问题 |

## Shared Sandbox

Agents should use `bin/octopus-sandbox` for repeatable OS-sensitive diagnostics instead of creating temporary scripts in the target agent workspace.
