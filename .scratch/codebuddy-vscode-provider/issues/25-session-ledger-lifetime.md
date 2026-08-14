# 25 — Session Ledger 生命周期修复

**What to build:** 会话账本真正跨请求累计。当前 SessionLedger 实例被创建在每次请求处理函数内,导致每次请求都新建账本、跨请求累计失效(输出面板 requests 恒为 1)。本票将 SessionLedger 实例提升到 provider 注册级(与模型注册表同级),所有请求共享同一实例,使"跨请求累计 Token Usage"的领域语义(见 CONTEXT.md 词汇表)真实成立。端到端效果:多次对话后输出面板的 usage 日志随请求递增累计(requests 从 1 变为 N),用户能看到整个会话的累计消耗。

**Blocked by:** None — can start immediately

**Status:** done

- [x] SessionLedger 实例在 provider 注册级创建,所有请求共享
- [x] 多次请求后 output 面板 usage 日志累计递增(requests 正确反映请求数)
- [x] 全量测试无回归
