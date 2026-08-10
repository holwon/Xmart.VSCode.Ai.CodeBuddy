# agent 模式工具调用接入

- Type: prototype
- Status: resolved
- Blocked by: 01, 04

## Question

在最小原型之上实现工具调用,让 Copilot agent 模式可用:

- 稳定 API 中**没有**独立的 `provideLanguageModelChatTools` 方法——工具列表经 `ProvideLanguageModelChatResponseOptions.tools`(含 `toolMode`)随每轮请求传入,provider 只需照常生成 `LanguageModelToolCallPart`
- 完整流转:VS Code 发起请求 → CodeBuddy 返回 tool_calls → 转成 `LanguageModelToolCallPart` → VS Code 执行工具 → 结果以 `LanguageModelToolResultPart` 放 User 消息回传 → provider 再次被调用
- 双向映射:VS Code 的 `LanguageModelChatTool`(name/description/inputSchema)↔ CodeBuddy 的 `tools: [{type:'function', function:{...}}]`;`ToolCallPart` ↔ `tool_calls`;`ToolResultPart` ↔ `role: "tool"` 消息
- 模型元信息须声明 `capabilities.toolCalling = true`,否则 agent 模式不可选
- 验证:agent 模式下能读写文件、执行命令

## Answer

已实现(resolved 2026-08-10)。代码核对确认 7 项链路全部完整:

1. **工具经 `options.tools` 传入**:`toChatTool` + `toCodeBuddyTools`(provider.ts:117-122, 187;messages.ts:173-187)
2. **ToolCallPart 生成**:`ToolCallAccumulator` 跨 chunk 累积 `delta.tool_calls`,流结束时 `progress.report(new LanguageModelToolCallPart(...))`(provider.ts:202, 237-240, 263-265;toolcalls.ts)
3. **ToolResultPart 回传**:`dispatchPart` 鸭子识别 → `flattenPartArray` 展平 → `role:"tool"` 消息(parts.ts:59-62;messages.ts:145-158)
4. **callId 配对**:`pendingToolCallIds` 精确匹配,无主结果折叠进 user 文本(messages.ts:92, 135-137, 145-147, 159-166)
5. **capabilities.toolCalling**:全部 10 个模型 `toolCalling: true`(models.ts;provider.ts:77-80)
6. **toolMode**:`TOOL_MODE_AUTO/REQUIRED` 命名常量 → `tool_choice` 映射(messages.ts:199-210)
7. **测试覆盖**:messages.test.ts(工具消息转换)、toolcalls.test.ts(跨 chunk 累积/排序/丢弃/raw 包装)等

**运行时验证**(2026-08-10 日志):28 次真实请求中大量 `toolCalls=1/2`,agent 模式工具调用(读文件、执行命令等)真实运转,多轮工具调用中间轮次(contentChars=0, toolCalls=1)正常,最终轮次均成功返回文字。86/86 测试通过。

> 思考深度(reasoning effort)为独立 spec(`spec-thinking-effort.md`,ready-for-agent),代码已实现基础(configurationSchema + reasoning_effort 映射),UI 验证待用户反馈。

## 衍生:思考深度(reasoning effort)

用户需求:让用户在 Copilot 里选思考深度(off/low/medium/high),映射为 CodeBuddy 的 `reasoning_effort`,所有模式可用、对话中可切换。

研究结论(见 `research/03-reasoning-effort.md`):
- VS Code 1.126+ 原生 Thinking Effort 选择器对第三方开放,经 `LanguageModelChatInformation.configurationSchema`(group:'navigation' + enum)声明,用户选择经 `options.modelConfiguration?.reasoningEffort` 传入
- 但 `configurationSchema`/`modelConfiguration` 是 **proposed API**,@types/vscode 无类型 → 需类型断言或本地 .d.ts
- CodeBuddy 支持 `reasoning_effort`,但 hy3 系只有 "high" 真正生效;DeepSeek 系经 reasoning_content 返回思考

已决策(grilling):**方案 A(原生选择器)**,先验证 proposed API 在 VS Code 1.132 可用性,再完整实现。

**Spec 已发布**:`spec-thinking-effort.md`(Status: ready-for-agent)。测试接缝:提取纯逻辑模块(reasoning 映射),provider 薄胶水;范围不含空响应 bug(独立处理)。
