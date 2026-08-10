# VS Code 语言模型提供程序 API 事实

- Type: research
- Status: resolved
- Blocked by:

## Question

VS Code 的 Language Model Provider API 的精确事实:

1. `package.json` 中 `contributes.languageModelChatProviders` 的完整 schema(字段、必填项)
2. `vscode.lm.registerLanguageModelChatProvider` 的签名与注册时机(activate 生命周期)
3. 提供程序必须实现的接口:响应流(`provideLanguageModelChatResponse`)、模型信息(`provideLanguageModelChatInformation`)、工具(`provideLanguageModelChatTools`)
4. 注册后模型如何出现在 Copilot Chat / Agent 的模型选择器中,是否需要 Copilot 扩展配合
5. 工具调用的数据流转:VS Code 如何把工具调用结果回传给模型,下一次请求的形态
6. 最低 VS Code 版本要求,以及 1.96 之后该 API 的演进(新字段、breaking changes)
7. 已知限制(如不支持的能力、流式要求、并发模型)

## Answer

详见 `research/01-vscode-lm-provider-api.md`。要点:

- 声明式 `contributes.languageModelChatProviders`(vendor + displayName 必填,`configuration` schema 可安全存 token)+ 编程式 `registerLanguageModelChatProvider(vendor, provider)` 在 activate() 中配套使用
- Provider 稳定接口:`provideLanguageModelChatInformation` / `provideLanguageModelChatResponse`(progress.report 流式)/ `provideTokenCount`;**无独立 provideLanguageModelChatTools 方法**——工具随每轮请求经 `ProvideLanguageModelChatResponseOptions.tools` 传入
- Agent 模式硬门槛:`capabilities.toolCalling === true`(且 agentMode 不显式 false)
- 工具流转:provider 发 `LanguageModelToolCallPart` → VS Code 执行(内置/扩展/MCP)→ 结果 `LanguageModelToolResultPart` 放 User 消息回传 → 再次调用 provider
- 最低 VS Code 1.96;模型进入 Copilot 选择器无需 Copilot 扩展特定版本(选择器是内置组件)
- 限制:流式唯一输出通道;thinking/reasoning 在 stable API 不可表达(仅 proposed `LanguageModelThinkingPart`);无 system 消息;vendor 未声明即注册会抛错
