# 研究:思考深度(reasoning effort)在 VS Code 的透传机制

> 研究票:由「agent 模式工具调用」衍生 · 日期:2026-08-10
> 来源:microsoft/vscode main 分支源码(modelPickerConfiguration.ts、languageModels.ts、extHostLanguageModels.ts、vscode.proposed.chatProvider.d.ts)、Copilot 扩展源码(byok/*、languageModelAccess.ts)、release notes 1.126~1.132

## 结论速览

- VS Code 1.126 起的「统一模型定制选择器」(Thinking Effort + Context Size)对**第三方 provider 开放**,不限于 Copilot
- 第三方声明 `LanguageModelChatInformation.configurationSchema`(含 `group:'navigation'` + `enum` 的 `reasoningEffort` 属性)即可让用户在下拉里选思考深度
- 用户选择经 **`options.modelConfiguration?.reasoningEffort`** 传给 provider 的 `provideLanguageModelChatResponse`
- provider 自行映射成上游 `reasoning_effort`(VS Code 核心不代劳)
- **最大限制**:`registerLanguageModelChatProvider` 与 `configurationSchema`/`modelConfiguration` 是 **proposed API**(`vscode.proposed.chatProvider`),@types/vscode(DefinitelyTyped)**不包含** proposed 类型 → 需用 `.d.ts` 扩展或类型断言

## 详细事实

### 1. 选择器对第三方开放
- `modelPickerConfiguration.ts` 按模型的 `configurationSchema` 渲染,注释明确:"configuration schemas can also come from third-party extensions via the LM API"
- `group:'navigation'` → Thinking Effort 下拉;`group:'tokens'` → Context Size

### 2. 取值枚举
- 内部:`'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'`(`src/vs/platform/agentHost/common/reasoningEffort.ts`),**没有 'off'**
- 各 provider 只暴露子集(如 Codex: minimal/low/medium/high)

### 3. 传给 provider 的字段:`modelConfiguration`,不是 modelOptions
- `ProvideLanguageModelChatResponseOptions.modelConfiguration?: { [key:string]: any }`(proposed)
- 链路:用户选档 → `setModelConfiguration` → `sendChatRequest` 合并进 `options.configuration` → `extHostLanguageModels.$startChatRequest` 映射为 `modelConfiguration` → provider 读 `options.modelConfiguration?.reasoningEffort`

### 4. 第三方能读到
- 能。`options.modelConfiguration?.reasoningEffort` 可读;映射成上游 `reasoning_effort` 是 provider 职责

### 5. 声明支持哪些档位
- `LanguageModelChatInformation.configurationSchema.properties.reasoningEffort`(含 `enum`、`group:'navigation'`),proposed API

## 对 CodeBuddy provider 的影响

- CodeBuddy 支持 `reasoning_effort` 请求参数;hy3 系只有 `"high"` 真正生效(其余被忽略);DeepSeek 系通过 `delta.reasoning_content` 返回思考过程
- 实现方案:
  - **方案 A(原生)**:provider 返回 `configurationSchema`,用户在下拉选,读 `modelConfiguration.reasoningEffort` 映射 `reasoning_effort`。**需 proposed API**,且扩展需在 `package.json` 启用 `enabledApiProposals`(若 1.132 仍要求)
  - **方案 B(设置项)**:用 `codebuddy.reasoningEffort` 设置(全局/每模型),读 `getConfiguration()`。不依赖 proposed,但无法在模型选择器/对话中按消息粒度切换
  - **方案 C(每模型默认)**:在模型元信息里声明各模型的默认 effort,请求时带上

## 风险
- proposed API 在 stable 的可用性需实测(@types/vscode 无 proposed 类型,需用类型断言或本地 .d.ts)
- `off` 不是标准枚举值,需自定义
- 上游形态(chat-completions 用顶层 `reasoning_effort`)由 provider 负责
