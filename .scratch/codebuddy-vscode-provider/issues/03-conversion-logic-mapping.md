# 代理转换逻辑到提供程序的映射

- Type: grilling
- Status: resolved
- Blocked by: 01, 02

## Question

现有代理(`腾讯CodeBuddy-proxy.js`)的 DTO 转换逻辑,在 provider 架构中哪些保留、哪些废弃:

- finish_reason / tool_calls / reasoning_content / extra_fields / refusal / function_call / logprobs / usage 的转换各自如何映射到 `LanguageModelChatResponse` 流
- 流式与非流式如何取舍(provider API 是流式的,非流式路径是否直接废弃)
- reasoning_content 的去留:丢弃、拼入 content,还是其他
- 哪些代码(如 `convertDelta`、`convertChoice`)值得搬迁进扩展,哪些重写

## Answer

在「最小可行提供程序原型」实现与排障过程中已实际回答(见 `research/01`、`research/02` 与 04 号票 Answer):

- **保留并迁移**:`convertDelta`/`convertChoice`/`convertResponse` 搬迁进 `src/codebuddy/dto.ts`;空值剥离(finish_reason ""→null、空 tool_calls、extra_fields/refusal/function_call)、usage 非空保留,全部复用
- **废弃**:非流式路径(CodeBuddy 拒绝非 stream,`code 11101`);HTTP 代理进程本身
- **reasoning_content**:stable provider API 无 thinking part → 保留在 DTO 层但被 provider 丢弃(不拼入 content,避免污染对话)
- **重写**:消息/工具转换(按 callId 配对 tool 结果、保序)、SSE 解析(跨 chunk 缓冲)、错误信封检测(流内 `{code,msg}`)
