# 代理转换逻辑到提供程序的映射

- Type: grilling
- Status: open
- Blocked by: 01, 02

## Question

现有代理(`腾讯CodeBuddy-proxy.js`)的 DTO 转换逻辑,在 provider 架构中哪些保留、哪些废弃:

- finish_reason / tool_calls / reasoning_content / extra_fields / refusal / function_call / logprobs / usage 的转换各自如何映射到 `LanguageModelChatResponse` 流
- 流式与非流式如何取舍(provider API 是流式的,非流式路径是否直接废弃)
- reasoning_content 的去留:丢弃、拼入 content,还是其他
- 哪些代码(如 `convertDelta`、`convertChoice`)值得搬迁进扩展,哪些重写
