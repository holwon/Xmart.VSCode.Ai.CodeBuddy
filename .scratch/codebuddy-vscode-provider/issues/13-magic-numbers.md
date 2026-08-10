# 13 — 魔法数字命名

**What to build:** 代码自解释:工具选择模式(Required/Auto)从裸数字改为命名常量,消除魔法数字 `2`。Auto/Required 到 CodeBuddy `tool_choice` 的映射保持正确,含单测。

**Blocked by:** 07 — 纯逻辑层基础设施

**Status:** ready-for-agent

- [ ] Required/Auto 工具模式的命名常量定义(替代裸数字)
- [ ] `toCodeBuddyToolChoice` 使用命名常量,映射行为不变
- [ ] Auto → 省略 `tool_choice`、Required → `"required"` 的单测
- [ ] 现有测试全部通过
