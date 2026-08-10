# 研究:VS Code 语言模型提供程序 API 事实

> 研究票:`issues/01-vscode-lm-provider-api.md` · 日期:2026-08-10 · 来源:VS Code 官方文档、microsoft/vscode 源码(`extHostLanguageModels.ts`、`mainThreadLanguageModels.ts`、`languageModels.ts`、`chatInputModelUtils.ts`)、Copilot 扩展源码、1.96–1.98 release notes

## 1. `contributes.languageModelChatProviders` Schema 与两种注册方式

贡献点字段(vendor 声明前置是硬约束):

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `vendor` | string | ✅ | 全局唯一 provider ID,即 `registerLanguageModelChatProvider` 的第一个参数 |
| `displayName` | string | ✅ | 模型选择器中显示的提供商名称 |
| `configuration` | object | ❌ | JSON Schema 描述配置项(如 API key);属性可标 `"secret": true` 安全存储。**官方推荐的配置方式** |
| `managementCommand` | string | ❌ | **已弃用(deprecated)**。用 `configuration` 替代 |
| `when` | string | ❌ | when 子句,控制 provider 是否出现在 "Manage Models" 列表 |
| `deprecation` | object | ❌ | `{ link?: string }`,渲染指向替代扩展的链接 |

> `id`/`label`/`version`/`family`/`description` 不属于贡献点字段,它们属于模型级接口 `LanguageModelChatInformation`(由 `provideLanguageModelChatInformation` 返回)。

- 声明式 + 编程式**必须配套**:未在 package.json 声明的 vendor 注册即抛错 `Chat model provider uses UNKNOWN vendor`。
- 无专用激活事件,需自行声明激活方式(如 `onStartupFinished` 或命令激活)。

## 2. `vscode.lm.registerLanguageModelChatProvider` 签名与 Provider 接口

```ts
registerLanguageModelChatProvider(
  vendor: string,  // 必须与 package.json 的 vendor 一致
  provider: LanguageModelChatProvider<LanguageModelChatInformation>
): Disposable
```

在 `activate()` 中注册。Provider 接口(稳定版,**无** `provideLanguageModelChatTools` 方法——工具改为随每轮请求经 `ProvideLanguageModelChatResponseOptions.tools` 传入):

```ts
interface LanguageModelChatProvider<T extends LanguageModelChatInformation = LanguageModelChatInformation> {
  onDidChangeLanguageModelChatInformation?: Event<void>;   // 可选

  provideLanguageModelChatInformation(
    options: PrepareLanguageModelChatModelOptions,          // { silent: boolean }
    token: CancellationToken
  ): ProviderResult<T[]>;                                    // 可用模型列表

  provideLanguageModelChatResponse(
    model: T,
    messages: readonly LanguageModelChatRequestMessage[],    // { role, content: readonly unknown[], name }
    options: ProvideLanguageModelChatResponseOptions,        // { toolMode, tools? }
    progress: Progress<LanguageModelResponsePart>,           // 唯一的流式输出通道
    token: CancellationToken
  ): Thenable<void>;

  provideTokenCount(model: T, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Thenable<number>;
}
```

关键类型:

- `LanguageModelChatInformation`: `id`(provider 内唯一)、`name`、`family`、`version`、`maxInputTokens`、`maxOutputTokens`、`tooltip?`、`detail?`、`capabilities: { imageInput?: boolean; toolCalling?: boolean | number }`(1.98+)
- `ProvideLanguageModelChatResponseOptions`: `modelOptions?`、`toolMode: LanguageModelChatToolMode`(Auto=1 / Required=2)、`tools?: LanguageModelChatTool[]`(`{ name, description, inputSchema? }`)
- `LanguageModelResponsePart` 联合类型: `LanguageModelTextPart` | `LanguageModelToolResultPart` | `LanguageModelToolCallPart` | `LanguageModelDataPart`

## 3. 模型如何进入 Copilot 选择器 / Agent 模式可用性

- 模型选择器与 Manage Models 是 **VS Code 内置组件**(`chatModelsViewModel.ts` 读取内置 `ILanguageModelsService`):所有 vendor 上报的模型都进入 Manage Models,选中后出现在聊天模型选择器。
- Chat UI 本体由 Copilot Chat 扩展提供 → 需要安装 Copilot Chat,但第三方 provider 不依赖其特定版本;依赖的是 VS Code ≥ 1.96。
- **Agent 模式硬门槛**(`suitableForAgentMode`):`capabilities.toolCalling === true` 且 `agentMode !== false`(缺省 agentMode 视为支持)。`toolCalling: false` 或无 capabilities 的模型在 agent 模式下会被自动重置回默认模型。Ask/Edit 模式任何模型可用;Editor Inline Chat 要求 `toolCalling`。
- 企业策略可通过 "Bring Your Own Language Model Key" 禁用该 API 提供的模型。

## 4. 工具调用数据流转

1. Provider 在 `provideLanguageModelChatResponse` 中 `progress.report(new LanguageModelToolCallPart(callId, name, input))`(`callId` 必须保留以关联结果)。
2. VS Code 分派执行:内置工具、扩展工具(`vscode.lm.registerTool` 的 `LanguageModelTool.invoke`,带 `prepareInvocation` 确认流程)、或 MCP 工具。模型本身从不执行工具。
3. 工具结果转成 `LanguageModelToolResultPart(callId, content)`(**只能放 User 消息**),追加历史,再次调用 `provideLanguageModelChatResponse`。
4. Provider 下一轮收到的消息形态(倒序):`[User(ToolResultPart)]` → `[Assistant(ToolCallPart)]` → `[User(原始请求)]`。
5. 迭代直到所有 tool call 解决,返回最终文本。
6. Provider 职责:自行把 `ToolCallPart`/`ToolResultPart` 转成上游 API 格式(CodeBuddy 的 `tool_calls` + `role: "tool"`)。

## 5. 最低版本与演进

- **最低 VS Code 1.96**(2024-12)。稳定时最大设计转折:独立 `provideLanguageModelChatTools` 方法在稳定前被移除,工具改为 request options 传入。
- 1.98: `capabilities`(toolCalling/agentMode/editTools)在 UI 展示与过滤。
- 1.99~1.10x: `deprecation.link`、`requiresAuthorization`、`isBYOK`、`configurationSchema` 等(多在 `chatProvider` proposed 中)。
- breaking 注意:旧 `LanguageModelChatUserMessage`/`LanguageModelChatAssistantMessage` 已 deprecated(用 `LanguageModelChatMessage.User/Assistant`);`managementCommand` deprecated。

## 6. 已知限制

- **流式是唯一输出通道**:必须 `progress.report()`;取消经 CancellationToken;错误经 `$reportResponseDone(error)`。
- **thinking/reasoning 在 stable API 不可表达**:`LanguageModelThinkingPart` 仅 proposed;standard 下 reasoning 内容只能拼进文本或 DataPart。
- **无 system 消息**(stable 角色仅 User/Assistant)。
- vendor 声明前置;重复注册同 vendor 抛错。
- 官方不承诺特定模型长期存在,需防御性处理 `LanguageModelError` 的 `NotFound`/`NoPermissions`/`Blocked`。

## 对项目的影响

- 核心只需:`contributes.languageModelChatProviders`(vendor + displayName + configuration)+ `registerLanguageModelChatProvider` 实现三个方法(信息/响应/token 计数)。
- 工具调用需做 `LanguageModelToolCallPart`/`LanguageModelToolResultPart` ↔ CodeBuddy `tool_calls`/`role:"tool"` 双向转换。
- agent 模式需要 `capabilities.toolCalling = true`。
- reasoning_content 无法作为独立 part 呈现(除非启用 proposal)。
