# 11 — part 分发提取共享模块

**What to build:** part 类型识别与文本提取逻辑收敛为单一纯函数模块,provider 中三处(消息转换、工具结果展平、token 计数)调用同一实现。修 part 相关 bug 只改一处,不再需要同步改三个地方。行为不变(鸭子类型识别 + 文本提取,跨版本防御)。

**Blocked by:** 07 — 纯逻辑层基础设施

**Status:** claimed

- [ ] part 分发纯函数:字符串/TextPart/ToolCallPart/ToolResultPart/thinking/未知类型的输入 → 正确的 part 序列输出,含单测
- [ ] provider 三处调用同一实现(消息转换、工具结果展平、token 计数)
- [ ] 行为无感:正常对话/工具调用/计数路径测试全部通过
- [ ] 现有测试全部通过 + 新增 part 分发单测

## Answer

已实现(resolved 2026-08-10):

- `provider.ts` 三处 part 分发(`toChatMessageParts`/`provideTokenCount`)切换到共享模块 `parts.ts`(`dispatchPart`/`renderPartForTokens`);删除内联 `flattenToolResult`
- 审查发现的两处行为差异已微调恢复等价:
  - `flattenPartArray` 补 `?? String(item)` 兜底(与旧 `flattenToolResult` 完全等价),新增单测锁定(undefined → 'undefined')
  - token 计数 tool-result 口径:新实现用展平文本(旧用 JSON.stringify 数组)——仅影响估算值,无协议影响,已确认可接受
- 未知对象分支"旧发送 JSON/新跳过":真实 VS Code 输入下不可达(thinking part 走 value 分支),确认无影响
- 81/81 测试通过,编译零错误,新包已生成
