# Spec:代码审查问题修复

- Status: ready-for-agent
- Type: spec
- Feature: codebuddy-vscode-provider

## Problem Statement

代码审查(`git diff d2fe3b5...f18b252`)发现 14 项问题。其中一项会直接破坏稳定性:当 CodeBuddy 返回的流中没有任何 `choices` 内容(空流或仅工具调用异常时),provider 会**静默完成**而不产生任何输出,VS Code 侧报出令人困惑的 `Response contained no choices` 错误(该错误已在审查期间两次真实触发)。其余问题涉及清单元数据矛盾、proposed API 声明缺失、死代码、重复逻辑与魔法数字,影响可维护性与可靠性。

## Solution

- 空响应不再是静默成功:当一次流式请求结束时既无文本内容也无工具调用,provider 抛出明确的 `LanguageModelError`,用户看到可理解的错误而非 "Response contained no choices"
- 清单元数据与 README/实际行为一致;proposed API 正确声明
- 死代码清理;重复逻辑提取;魔法数字命名;错误语义精确

## User Stories

1. 作为用户,当 CodeBuddy 返回空响应(无内容无工具调用)时,我想看到明确的错误提示,以便知道是上游问题而非我的操作错误
2. 作为用户,我不想在 CodeBuddy 偶发空流时看到 "Response contained no choices" 这种无意义报错,以便理解真实原因
3. 作为用户,我想让扩展安装版本与实际能力匹配(engines 声明),以便不在不支持的 VS Code 版本上运行即坏
4. 作为开发者,我想让 proposed API 的启用状态被显式声明或明确弃用,以便不依赖隐式行为
5. 作为开发者,我不想维护从未被读取的字段(如 supportsReasoning、REASONING_EFFORT_LEVELS 常量),以便代码库不积累死数据
6. 作为开发者,我想让注释与实现一致(dto.ts 的 reasoning_content 处理),以便不误导后续维护者
7. 作为开发者,我想让 part 分发逻辑只存在一处,以便修 bug 时不用同步改三处
8. 作为开发者,我想让相邻重复条件合并,以便代码更简洁
9. 作为用户,当 token 处于"登录中"状态(11217)时,我想看到与"token 无效"不同的错误提示,以便不被误导去改配置
10. 作为开发者,我想让 Required 工具模式使用命名常量而非裸数字 2,以便代码自解释
11. 作为开发者,我想让鸭子类型回退的注释反映真实依据(跨版本防御而非 minify),以便不传播错误认知
12. 作为用户,我希望这些修复不改变正常对话/工具调用的行为,以便无感升级
13. 作为开发者,我希望所有可测逻辑(空响应检测、错误映射、part 分发)是纯函数,以便无需 mock vscode 即可单测

## Implementation Decisions

- **空响应检测**:在流结束(`onDone`)时检测 `eventCount === 0` 或(无 content 且无 tool_calls)→ 抛 `LanguageModelError`(携带说明,如 Blocked/说明上游返回空)。提取为纯逻辑判定(可单测),provider 薄胶水调用
- **engines 对齐**:`engines.vscode` 改为 `>=1.98.0`(capabilities 消费版本),与 README 一致
- **proposed API 声明**:`package.json` 增加 `enabledApiProposals: ["chatProvider"]`(若 1.132 仍要求);若实测无需声明,删除该决策并记录
- **死代码清理**:删除未读取的 `supportsReasoning` 字段与 `REASONING_EFFORT_LEVELS` 常量(或真正接入思考深度逻辑——以 06 号票/思考深度 spec 的落地方案为准)
- **注释修正**:`dto.ts` 的 `reasoning_content` 处理注释改为与实现一致(provider 不消费,显式丢弃)
- **part 分发提取**:`toChatMessageParts`/`flattenToolResult`/`provideTokenCount` 的 part 类型分发提取为共享纯函数模块(鸭子类型识别 + 文本提取),三处调用同一实现
- **错误映射精确化**:`mapErrorCode` 中 11217("login ing")与 401/403 分开展示不同文案("CodeBuddy 登录中,请稍后重试" vs "token 无效,请检查配置"),提取为纯函数
- **魔法数字**:`toCodeBuddyToolChoice` 的 `2`(Required)改为命名常量
- **注释依据修正**:鸭子类型回退注释改为"跨版本防御"(vscode 类在扩展宿主中不参与 minify)
- 所有提取的纯函数位于 `src/codebuddy/`(零 vscode 依赖),provider 仅做适配

## Testing Decisions

- **好测试的标准**:只测外部行为——给定输入(流事件序列、错误对象、part 数组),验证输出的判定/映射正确;不测 UI 或 vscode 内部
- **待测模块**:
  - 空响应检测(纯函数):空流、纯文本流、纯工具调用流、文本+工具流四种输入的判定
  - 错误码映射(纯函数):401/403、11217、404、其他 → 对应的错误类型与文案
  - part 分发(纯函数):字符串/TextPart/ToolCallPart/ToolResultPart/thinking/未知 → 输出的 part 序列
  - 工具选择常量:Required/Auto 映射
- **先例**:现有 `src/test/messages.test.ts`、`dto.test.ts`、`client.test.ts` 是纯逻辑/网络 mock 单测的范例
- **回归保护**:现有 54 个测试必须全部保持通过;provider 层改动后重新编译打包

## Out of Scope

- 思考深度功能的实现本身(见 `spec-thinking-effort.md`,独立 spec)
- 空响应检测之外的上游稳定性处理(如重试/退避)
- 审查发现的文档矛盾(研究 01 §4 消息顺序描述)的修订——顺带可做,不作为验收项
- 新增 provider 层集成测试基础设施(mock vscode)——本 spec 以提取纯逻辑为接缝,不建新设施

## Further Notes

- 源自 2026-08-10 代码审查(Standards 轴 11 项 + Spec 轴 3 项,汇总于会话记录)
- 最严重项(空响应静默完成)已在审查期间真实触发两次(Spec 子代理失败),属用户可见问题
- 修复顺序建议:空响应检测 → engines/enabledApiProposals → 死代码 → 重复逻辑 → 错误映射 → 魔法数字/注释
- 完成后重新跑 54 个测试 + 打包 .vsix 验证
