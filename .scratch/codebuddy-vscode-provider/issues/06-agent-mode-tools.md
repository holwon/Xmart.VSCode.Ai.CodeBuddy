# agent 模式工具调用接入

- Type: prototype
- Status: open
- Blocked by: 01, 04

## Question

在最小原型之上实现工具调用,让 Copilot agent 模式可用:

- 稳定 API 中**没有**独立的 `provideLanguageModelChatTools` 方法——工具列表经 `ProvideLanguageModelChatResponseOptions.tools`(含 `toolMode`)随每轮请求传入,provider 只需照常生成 `LanguageModelToolCallPart`
- 完整流转:VS Code 发起请求 → CodeBuddy 返回 tool_calls → 转成 `LanguageModelToolCallPart` → VS Code 执行工具 → 结果以 `LanguageModelToolResultPart` 放 User 消息回传 → provider 再次被调用
- 双向映射:VS Code 的 `LanguageModelChatTool`(name/description/inputSchema)↔ CodeBuddy 的 `tools: [{type:'function', function:{...}}]`;`ToolCallPart` ↔ `tool_calls`;`ToolResultPart` ↔ `role: "tool"` 消息
- 模型元信息须声明 `capabilities.toolCalling = true`,否则 agent 模式不可选
- 验证:agent 模式下能读写文件、执行命令
