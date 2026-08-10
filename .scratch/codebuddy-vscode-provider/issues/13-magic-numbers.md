# 13 — 魔法数字命名

**What to build:** 代码自解释:工具选择模式(Required/Auto)从裸数字改为命名常量,消除魔法数字 `2`。Auto/Required 到 CodeBuddy `tool_choice` 的映射保持正确,含单测。

**Blocked by:** 07 — 纯逻辑层基础设施

**Status:** claimed

- [ ] Required/Auto 工具模式的命名常量定义(替代裸数字)
- [ ] `toCodeBuddyToolChoice` 使用命名常量,映射行为不变
- [ ] Auto → 省略 `tool_choice`、Required → `"required"` 的单测
- [ ] 现有测试全部通过

## Answer

已实现(resolved 2026-08-10):

- `messages.ts` 新增 `TOOL_MODE_AUTO = 1` / `TOOL_MODE_REQUIRED = 2` 命名常量(JSDoc 注明镜像 VS Code `LanguageModelChatToolMode` 枚举),`toCodeBuddyToolChoice` 用常量替代裸数字 `2`
- 测试改用命名常量,覆盖 Required/Auto/undefined 三态
- 审查确认:provider.ts 无其他裸 toolMode 比较;行为零变化
- 86/86 测试通过,编译零错误
