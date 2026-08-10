# agent 模式工具调用接入

- Type: prototype
- Status: claimed
- Blocked by: 01, 04

## Question

在最小原型之上实现工具调用,让 Copilot agent 模式可用:

- 稳定 API 中**没有**独立的 `provideLanguageModelChatTools` 方法——工具列表经 `ProvideLanguageModelChatResponseOptions.tools`(含 `toolMode`)随每轮请求传入,provider 只需照常生成 `LanguageModelToolCallPart`
- 完整流转:VS Code 发起请求 → CodeBuddy 返回 tool_calls → 转成 `LanguageModelToolCallPart` → VS Code 执行工具 → 结果以 `LanguageModelToolResultPart` 放 User 消息回传 → provider 再次被调用
- 双向映射:VS Code 的 `LanguageModelChatTool`(name/description/inputSchema)↔ CodeBuddy 的 `tools: [{type:'function', function:{...}}]`;`ToolCallPart` ↔ `tool_calls`;`ToolResultPart` ↔ `role: "tool"` 消息
- 模型元信息须声明 `capabilities.toolCalling = true`,否则 agent 模式不可选
- 验证:agent 模式下能读写文件、执行命令

## 衍生:思考深度(reasoning effort)

用户需求:让用户在 Copilot 里选思考深度(off/low/medium/high),映射为 CodeBuddy 的 `reasoning_effort`,所有模式可用、对话中可切换。

研究结论(见 `research/03-reasoning-effort.md`):
- VS Code 1.126+ 原生 Thinking Effort 选择器对第三方开放,经 `LanguageModelChatInformation.configurationSchema`(group:'navigation' + enum)声明,用户选择经 `options.modelConfiguration?.reasoningEffort` 传入
- 但 `configurationSchema`/`modelConfiguration` 是 **proposed API**,@types/vscode 无类型 → 需类型断言或本地 .d.ts
- CodeBuddy 支持 `reasoning_effort`,但 hy3 系只有 "high" 真正生效;DeepSeek 系经 reasoning_content 返回思考

已决策(grilling):**方案 A(原生选择器)**,先验证 proposed API 在 VS Code 1.132 可用性,再完整实现。

**Spec 已发布**:`spec-thinking-effort.md`(Status: ready-for-agent)。测试接缝:提取纯逻辑模块(reasoning 映射),provider 薄胶水;范围不含空响应 bug(独立处理)。
