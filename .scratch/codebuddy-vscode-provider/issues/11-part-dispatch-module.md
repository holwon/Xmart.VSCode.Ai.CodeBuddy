# 11 — part 分发提取共享模块

**What to build:** part 类型识别与文本提取逻辑收敛为单一纯函数模块,provider 中三处(消息转换、工具结果展平、token 计数)调用同一实现。修 part 相关 bug 只改一处,不再需要同步改三个地方。行为不变(鸭子类型识别 + 文本提取,跨版本防御)。

**Blocked by:** 07 — 纯逻辑层基础设施

**Status:** ready-for-agent

- [ ] part 分发纯函数:字符串/TextPart/ToolCallPart/ToolResultPart/thinking/未知类型的输入 → 正确的 part 序列输出,含单测
- [ ] provider 三处调用同一实现(消息转换、工具结果展平、token 计数)
- [ ] 行为无感:正常对话/工具调用/计数路径测试全部通过
- [ ] 现有测试全部通过 + 新增 part 分发单测
