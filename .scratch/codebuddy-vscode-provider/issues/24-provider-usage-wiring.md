# 24 — Provider 接线:捕获 usage → 记账 + 日志

**What to build:** 端到端闭环——每次对话请求后,扩展捕获响应顶层的真实 token 用量,解析后写入会话账本(Session Ledger),并在输出面板记录每次请求的 usage 明细(input/output/cached/reasoning)。架构保持纯 LanguageModelChatProvider,provider 仅做薄接线(捕获→解析→记账→日志),不引入 chat participant。

**Blocked by:** 20(Token Usage 解析模块)、21(Session Ledger 会话账本)、23(请求侧 include_usage 接线)

**Status:** ready-for-agent

- [ ] 流处理回调捕获顶层 usage 并解析
- [ ] 解析结果写入 Session Ledger
- [ ] 输出面板记录每次请求的 usage 明细
- [ ] 字段缺失时不报错,会话继续正常
- [ ] 全量测试无回归;F5 手动验证输出面板日志
