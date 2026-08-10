# 08 — 空响应检测(最严重 bug)

**What to build:** 当 CodeBuddy 返回的流式响应结束时既无文本内容也无工具调用(空流、异常截断等),用户在 Copilot 里看到明确的错误提示(说明上游返回了空响应),而不是困惑的 "Response contained no choices"。正常对话与工具调用行为不受影响。

**Blocked by:** 07 — 纯逻辑层基础设施

**Status:** ready-for-agent

- [ ] 空响应判定纯函数:对"空流 / 纯文本流 / 纯工具调用流 / 文本+工具混合流"四种输入给出正确判定(仅空流判定为空响应)
- [ ] provider 在流结束时(onDone)调用该判定,命中时抛出明确的 `LanguageModelError`(携带"CodeBuddy 返回空响应"的说明)
- [ ] 空响应时不再静默完成,VS Code 侧显示可理解的错误
- [ ] 纯文本流、纯工具调用流、混合流的正常路径不改变(无感)
- [ ] 现有测试全部通过 + 新增判定单测
