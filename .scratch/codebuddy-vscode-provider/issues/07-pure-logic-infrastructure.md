# 07 — 纯逻辑层基础设施

**What to build:** 为代码审查修复建立可测试的纯逻辑层骨架:在协议逻辑目录下新增三个纯函数模块(空响应判定、错误码映射、part 分发提取)的类型与空实现骨架,以及共享的测试风格先例。本票只搭骨架与类型,不改变任何运行时行为(纯重构,可无感合并)。后续所有修复票的测试接缝都落在这里。

**Blocked by:** None — can start immediately

**Status:** claimed

- [ ] 空响应判定模块:声明判定函数的输入类型(流事件计数、文本字符数、工具调用数)与输出类型(是否视为空响应),含空实现与占位单测
- [ ] 错误码映射模块:声明错误类型(401/403、11217、404、其他)到错误类别的映射函数签名,含空实现与占位单测
- [ ] part 分发模块:声明 part 识别与文本提取的函数签名,含空实现与占位单测
- [ ] 现有 54 个测试全部保持通过,编译零错误

## Answer

已实现(resolved 2026-08-10)。三个纯函数模块落盘于 `src/codebuddy/`:
- `response-guard.ts` — isStreamEmpty / describeEmptyStream(空响应判定,覆盖空流/纯文本/纯工具/混合)
- `errors.ts` — mapCodeBuddyError(401/403、11217、404、其他 → kind+message),常量 `CODE_LOGIN_IN_PROGRESS`
- `parts.ts` — dispatchPart / flattenPartArray / renderPartForTokens(鸭子类型识别 + 文本提取)

全部零 vscode 依赖、无副作用。新增 25 个单测(共 79/79 通过),编译零错误。审查建议(thinking 显式用例、错误映射输入类型放宽、input typeof 校验)留给接线票 11/12 处理。
