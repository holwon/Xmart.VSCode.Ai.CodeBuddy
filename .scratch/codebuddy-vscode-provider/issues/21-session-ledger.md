# 21 — Session Ledger 会话账本

**What to build:** 扩展能跨请求累计真实 token 用量,维护会话账本(Session Ledger)。该模块记录每次请求的 Token Usage(input/output/cached/reasoning),提供跨请求累计与汇总(如会话总消耗),供输出面板日志与未来会话自压缩决策使用。依赖注入 usage 解析结果;纯逻辑、零 vscode 依赖。

**Blocked by:** 20(Token Usage 解析模块)

**Status:** ready-for-agent

- [ ] record() 正确累计单次 Token Usage
- [ ] summary() 返回跨请求累计汇总(input/output/cached/reasoning 总量)
- [ ] 空 ledger 的摘要正确(全零)
- [ ] 纯逻辑零 vscode 依赖,单测通过
