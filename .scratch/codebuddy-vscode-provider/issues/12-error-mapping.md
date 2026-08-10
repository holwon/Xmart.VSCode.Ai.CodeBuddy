# 12 — 错误码映射精确化

**What to build:** 用户看到的错误提示与真实原因一致:当 CodeBuddy 返回"登录中"状态(11217)时,提示"CodeBuddy 登录中,请稍后重试",而不是误导性的"token 无效,请检查配置";401/403 保持"token 无效"提示;404 保持"模型不存在"。错误码→错误类型映射提取为纯函数,provider 薄胶水调用;同时合并相邻的重复条件判断。

**Blocked by:** 07 — 纯逻辑层基础设施

**Status:** claimed

- [ ] 错误码映射纯函数:401/403、11217、404、其他 → 对应的错误类型与文案,含单测
- [ ] provider 使用映射函数,相邻重复 `instanceof` 条件合并
- [ ] 11217 显示"登录中"文案,401/403 显示"token 无效"文案
- [ ] 现有测试全部通过 + 新增映射单测

## Answer

已实现(resolved 2026-08-10):

- `mapCodeBuddyError` 签名改为鸭子类型 `CodeBuddyErrorLike`(`code?/msg?/httpStatus?`,与 `CodeBuddyApiError` 结构兼容),使任何携带 code/httpStatus 的错误形状都可映射;删除不再需要的 `CodeBuddyApiError` import
- unknown 分支消息兜底增强:`msg || code || 'unknown error'`(空串 msg 也兜底)
- 模块注释同步修正(鸭子类型说明)
- 新增 5 个测试:11217+401 同现时登录中优先、鸭子类型输入、msg 缺失时 code 兜底、全空对象兜底、空串 msg 兜底(errors 共 10 用例)
- provider 包装层(`ErrorMapping` → `LanguageModelError`)保持薄胶水;catch 的重复条件合并已在 Ticket 08 完成
- 86/86 测试通过,编译零错误,新包已生成
