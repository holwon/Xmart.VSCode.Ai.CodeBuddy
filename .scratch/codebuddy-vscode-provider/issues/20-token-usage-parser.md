# 20 — Token Usage 解析模块

**What to build:** 扩展能把 CodeBuddy 响应里的原始 token 用量解析为规范化结构。CodeBuddy 的 usage 字段兼有 OpenAI/Anthropic 两套命名(input_tokens/prompt_tokens、output_tokens/completion_tokens、input_tokens_details.cached_tokens、output_tokens_details.reasoning_tokens),解析器需兼容两种命名,输出统一的 { input, output, cached, reasoning } 结构;字段缺失或畸形时安全降级为零,不抛异常。纯逻辑、零 vscode 依赖,可独立单元测试。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 兼容双字段命名,正确映射为规范化结构
- [ ] cached/reasoning 细分字段正确解析
- [ ] 字段缺失/畸形/非对象输入安全降级为零
- [ ] 纯逻辑零 vscode 依赖,单测通过(沿用现有纯逻辑单测范例)
