# Spec: 会话 token 用量反馈(Token Usage Feedback)

- Status: ready-for-agent
- Type: spec
- Feature: codebuddy-vscode-provider

## Problem Statement

当前扩展把 CodeBuddy 返回的真实 token 用量(usage)丢弃了:DTO 层透传了顶层 usage,但 provider 的流处理回调只消费 delta.content 与 delta.tool_calls,从不读取 usage。同时,VS Code 侧的上下文预算完全依赖 `provideTokenCount` 的本地粗估(CJK 1字/token、其他 4字/token),既不准确、也没有真实用量可供参照。用户无法感知每次会话实际消耗了多少 token、上下文接近满时的真实规模,也无法为"会话超长"做出数据驱动的判断。参考 `腾讯CodeBuddy-proxy.js` 的 usage 透传,以及 VS Code BYOK 用 `stream_options.include_usage` 请求真实用量的做法,本功能让扩展捕获、解析并记账真实 Token Usage,并优化 Token Estimation。

## Solution

扩展在请求侧带上 `stream_options.include_usage`(与 BYOK 对齐,让 CodeBuddy 稳定返回 usage chunk),在响应侧捕获顶层 usage 并解析为规范化结构,经 Session Ledger 跨请求累计记账,同时写入输出面板日志。`provideTokenCount` 的估算逻辑做明显误差修正 + 记忆化缓存,让 VS Code 的上下文裁剪更接近真实用量。架构保持纯 LanguageModelChatProvider 不变;usage 解析与记账做成干净纯逻辑模块,为未来架构升级预留复用。

## User Stories

1. 作为用户,我希望每次请求后能在输出面板看到真实的 token 用量(input/output/cached/reasoning),以便了解每次对话的真实消耗
2. 作为用户,我希望扩展请求时带上 include_usage,以便 CodeBuddy 稳定返回 usage 数据
3. 作为开发者,我希望 usage 解析是纯函数,以便无需 mock vscode 即可单元测试
4. 作为开发者,我希望 Session Ledger 能跨请求累计真实用量,以便感知会话上下文规模
5. 作为开发者,我希望 Token Estimation 对 JSON/代码块等结构有更合理的 token 权重,以便 VS Code 上下文裁剪更接近真实
6. 作为开发者,我希望重复的 token 估算被缓存,以便减少不必要的计算
7. 作为用户,我希望扩展保持纯 LanguageModelChatProvider 架构,以便不引入双架构维护成本
8. 作为开发者,我希望 usage 解析与记账与 provider 解耦,以便未来若改架构可复用
9. 作为用户,我希望日志里能看到 usage 与本地估算的对比,以便评估估算偏差
10. 作为用户,我希望扩展不因 usage 字段缺失或畸形而报错,以便保持稳定
11. 作为开发者,我希望 cached/reasoning 细分字段被正确解析,以便区分缓存命中与推理 token
12. 作为用户,我希望 Token Estimation 的优化不影响既有行为的正确性,以便不引入回归

## Implementation Decisions

- **请求侧**:chat 请求体新增 `stream_options: { include_usage: true }`(OpenAI 兼容,与 VS Code BYOK 一致;若 CodeBuddy 忽略则无害)
- **响应侧**:在流处理回调中读取 DTO 透传的顶层 usage,解析为规范化结构 `{ input, output, cached, reasoning }`
- **usage 解析模块(纯逻辑)**:兼容 CodeBuddy 的双命名(`input_tokens`/`prompt_tokens`、`output_tokens`/`completion_tokens`、`input_tokens_details.cached_tokens`、`output_tokens_details.reasoning_tokens`);字段缺失/畸形时安全降级为零
- **Session Ledger 模块(纯逻辑)**:跨请求累计真实用量,提供汇总;依赖注入 usage 解析器
- **日志**:输出面板记录每次请求的 usage 明细与(可选)估算对比
- **Token Estimation 优化**:对 JSON/代码块等结构化文本按更高 token 权重估算;新增记忆化缓存(同文本不重复计算);不引入模型族专属 tokenizer
- **架构**:保持纯 LanguageModelChatProvider;provider/client 仅做薄接线(捕获 usage→传 ledger、请求体加 stream_options)
- **范围排除**:不实现 provider 自行压缩(self-compact)、不实现 BYOK 式 chat participant 架构、不做模型族 tokenizer——均为阶段二

## Testing Decisions

- **好测试的标准**:只测外部行为——给定 payload/文本,验证解析出的 usage 正确、ledger 累计正确、token 估算符合预期;不测网络传输与 UI 渲染
- **测试接缝**:usage 解析与 Session Ledger 为纯逻辑模块,是唯一测试接缝(依赖注入);token 优化为纯函数 + 缓存包装;provider/client 薄接线不单独测
- **待测模块**:usage 解析、Session Ledger、token 估算(含缓存)
- **测试用例(usage 解析)**:双字段命名、字段缺失/畸形降级、cached/reasoning 细分、零值
- **测试用例(Session Ledger)**:跨请求累计、多请求汇总、空 ledger 摘要
- **测试用例(token)**:CJK/非 CJK 权重、JSON/代码块加权、记忆化缓存命中、缓存后结果一致
- **先例**:现有 `token.test.ts`、`dto.test.ts` 为纯逻辑单测范例;`client.test.ts` 网络 mock 可验证 stream_options 进入请求体

## Out of Scope

- Chat 视图显示 token 用量/上下文占用(纯 provider 无 usage 上报口,需 chat participant 架构——阶段二)
- 会话自动压缩(auto-compact,VS Code 不回调 provider——阶段二)
- BYOK 式 chat participant 双架构
- 模型族专属 tokenizer
- reasoning_content 的 UI 呈现(stable API 无 LanguageModelThinkingPart)

## Further Notes

- 前置调研:VS Code `LanguageModelChatProvider` 无 usage 上报口(progress 仅 Text/ToolCall/Data/Thinking;`ChatResponseStream.usage` 属 chat participant 侧 proposed API);BYOK 能显示 usage 是因为 Copilot Chat 作为 participant 内部直连调模型 + `stream_options.include_usage` + `ChatResponseStream.usage()` 上报
- CodeBuddy 流式响应天然携带 usage(dto.ts 已透传),`stream_options.include_usage` 支持无文档证据但 OpenAI 兼容端点大概率有效
- 词汇表:Token Estimation / Token Usage / Session Ledger 已写入根 CONTEXT.md
- 参考 `腾讯CodeBuddy-proxy.js` 的 usage 透传逻辑(dto.ts 已移植,两者一致);js 中 reasoning_content"可渲染"的说法不成立(stable API 无 thinking part),本次不处理
