# 22 — Token Estimation 优化

**What to build:** VS Code 的上下文预算更接近真实。优化 token 预估逻辑:对 JSON/代码块等结构化文本按更高 token 权重估算(修正当前"其他字符一律 4 字/token"的低估),并新增记忆化缓存,相同文本不重复计算。保持纯函数可测、估算语义与现有保持一致(不引入模型族专属 tokenizer)。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] JSON/代码块等结构化文本的 token 权重更合理
- [ ] 记忆化缓存:相同文本只计算一次,缓存后结果一致
- [ ] CJK/非 CJK 基础估算行为不回归
- [ ] 纯函数单测通过
