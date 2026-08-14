# Spec: Token Usage 反馈修复(Token Usage Feedback Fixes)

- Status: ready-for-agent
- Type: spec
- Feature: codebuddy-vscode-provider

## Problem Statement

`spec-usage-feedback.md` 实现经双轴 code-review 发现两处核心缺陷:

1. **Session Ledger 未真正跨请求累计**。`SessionLedger` 实例被创建在 `provideLanguageModelChatResponse` 函数体内,每次请求都新建实例,导致"跨请求累计真实 Token Usage"这一核心需求失效——输出面板的 `requests=` 恒为 1,无法感知会话上下文规模,与领域词汇表"Session Ledger(会话账本):本扩展自行维护的跨请求累计 token 记账"直接冲突。

2. **usage 重复累计无防御**。流处理回调中只要 `converted.usage !== undefined` 就调用 `ledger.record(...)`;若 CodeBuddy 在多个 chunk 重复携带非空 usage(非仅末尾 usage chunk 的场景),会重复累计,账本失真。

## Solution

将 `SessionLedger` 实例的生命周期提升到 provider 注册级,使其跨请求共享、真正累计会话 Token Usage;usage 记账从"每次事件触发"改为"每请求结束时一次性记账",避免重复累计。架构仍保持纯 LanguageModelChatProvider,provider 仅薄接线。

## User Stories

1. 作为用户,我希望会话账本跨请求累计真实用量,以便输出面板能看到整个会话的累计 input/output/cached/reasoning
2. 作为用户,我希望同一请求的 usage 即使出现在多个 chunk 也只记账一次,以便账本不被重复计数污染
3. 作为开发者,我希望 ledger 生命周期与 provider 注册一致,以便跨请求语义真实成立
4. 作为开发者,我希望记账去重逻辑是纯逻辑可测的,以便无需 mock vscode 即可验证
5. 作为用户,我希望修复不改变既有请求/响应行为,以便无回归
6. 作为开发者,我希望字段缺失时仍安全降级,以便会话继续正常

## Implementation Decisions

- **ledger 生命周期提升**:`SessionLedger` 实例从请求处理函数内上移到 provider 注册级(与模型注册表同级),所有请求共享同一实例
- **每请求一次性记账**:请求内先聚合该请求的 usage(取首个有效 usage 即可,因 include_usage 通常只在末尾返回一次;若多处出现则取最后/首个有效值),在请求结束(onDone)时一次性 `ledger.record()`,替代"每次事件 record"
- **去重语义**:单请求内即使 usage chunk 重复出现,也只在结束点记账一次
- **保持纯逻辑接缝**:`SessionLedger` 仍是唯一测试接缝;新增"单请求聚合"辅助逻辑为纯函数(输入多个 usage payload,输出该请求的规范化 TokenUsage),便于单测
- **范围排除(阶段二)**:估算对比日志、memoize 缓存上限、注释清理、冗余测试删除——均为可选优化,不在本次

## Testing Decisions

- **好测试的标准**:只测外部行为——给定多次请求,验证 ledger 跨请求累计正确;给定同请求多 chunk,验证只记账一次;不测 UI 渲染与网络细节
- **测试接缝**:沿用现有纯逻辑接缝——SessionLedger 单测;新增的"单请求聚合"纯函数单测;provider 薄接线不单独测
- **待测模块**:SessionLedger(跨请求累计)、单请求聚合函数(去重)
- **测试用例(SessionLedger)**:多次 record 累计、空 ledger、reset(已有,保留)
- **测试用例(聚合函数)**:单 chunk 带 usage、多 chunk 重复 usage 只取一次、无 usage 返回全零、畸形 usage 降级
- **先例**:现有 `session-ledger.test.ts`、`usage.test.ts` 纯逻辑单测范例

## Out of Scope

- usage 与本地估算对比日志
- memoize 缓存上限
- 文件头注释清理与冗余测试删除
- Chat 视图 usage 显示、auto-compact(阶段二)
- BYOK 式 chat participant 架构

## Further Notes

- 源于 code-review 双轴审查:Standards 轴(词汇表"跨请求累计"冲突、ledger 生命周期)与 Spec 轴(User Story 4/T21"跨请求累计"未达成、usage 重复累计)在"ledger 生命周期缺陷"上达成一致
- 词汇表沿用:Token Estimation / Token Usage / Session Ledger(见根 CONTEXT.md)
- 现有实现:T20 usage 解析、T21 SessionLedger、T22 token 优化、T23 include_usage、T24 provider 接线(需调整 ledger 生命周期与记账时机)
