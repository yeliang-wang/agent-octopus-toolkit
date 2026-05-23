# agent 八爪鱼工具包 Agent List

| Agent | File | Best For |
| --- | --- | --- |
| gitlab-sync | `agents/gitlab-sync.md` | 同步 GitLab 分支、提交本地变更、推送远程、处理分支歧义和冲突 |
| user-flow-debug | `agents/user-flow-debug.md` | 通过 Dashboard UI 模拟真实用户流、截图留证、验证产物、定位和修复 agent 应用问题 |

## Shared Sandbox

Both agents should use `bin/octopus-sandbox` for repeatable OS-sensitive diagnostics instead of creating temporary scripts in the target agent workspace.
