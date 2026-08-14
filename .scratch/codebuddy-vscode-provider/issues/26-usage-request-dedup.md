# 26 — usage 单请求聚合去重

**What to build:** 同一请求即使多个 chunk 重复携带 usage 也只记账一次。新增"单请求聚合"纯函数:输入同一请求的多个 usage payload,输出该请求的规范化 Token Usage(取首个/最后有效值),请求结束时一次性写入 Session Ledger,替代当前"每次事件都 record"。避免多 chunk 重复携带 usage 导致的重复累计。纯逻辑、零 vscode 依赖,可独立单元测试。

**Blocked by:** None — can start immediately

**Status:** done

- [x] 单请求聚合函数:多 chunk 重复 usage 只归一为一份
- [x] 无 usage chunk 时返回全零,畸形 payload 安全降级
- [x] 请求结束点一次性记账,替代每次事件 record
- [x] 聚合函数单测通过(单 chunk/多 chunk 去重/无 usage/畸形)
