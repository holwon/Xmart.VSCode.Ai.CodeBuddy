# 10 — 死代码清理与注释修正

**What to build:** 代码库不再积累死数据与误导性注释:删除从未被读取的模型字段与未引用常量;把与实现不符的注释修正为真实行为(或让实现符合注释)。具体:删除 `supportsReasoning` 字段与 `REASONING_EFFORT_LEVELS` 常量(或真正接入思考深度逻辑——以思考深度 spec 的落地方案为准);修正 `dto.ts` 中 `reasoning_content` 的处理注释(provider 不消费、显式丢弃);修正鸭子类型回退注释的依据(跨版本防御,而非 minify——vscode 类在扩展宿主中不参与压缩)。

**Blocked by:** None — can start immediately

**Status:** claimed

- [ ] 删除未读取的 `supportsReasoning` 字段与 `REASONING_EFFORT_LEVELS` 常量(或接入思考深度后保留并说明)
- [ ] `dto.ts` 的 `reasoning_content` 注释与实现一致(显式丢弃)
- [ ] 鸭子类型回退注释改为"跨版本防御"的真实依据
- [ ] 编译零错误,现有测试通过

## Answer

已实现(resolved 2026-08-10):

- **死代码删除**:`supportsReasoning` 字段(接口 + 全部 10 个模型条目)与未引用的 `REASONING_EFFORT_LEVELS` 常量已删除;`src/**` 零残留引用,编译通过
- **注释修正**:
  - `dto.ts`:reasoning_content 顶部文档与行内注释改为"DTO 透传但 provider 不消费(stable API 无 thinking part)"
  - `provider.ts`/`parts.ts`:鸭子类型注释改为"跨版本防御(API churn),非 minify"
- 审查确认:思考深度逻辑不受影响(`reasoningEffortLevels` 驱动选择器,`supportsReasoning` 本就无人读取);`detail` 字段非死代码(作 tooltip)
- 80/80 测试通过,编译零错误
