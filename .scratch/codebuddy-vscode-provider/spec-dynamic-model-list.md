# Spec: 动态模型列表(Dynamic Model List)

- Status: ready-for-agent
- Type: spec
- Feature: codebuddy-vscode-provider

## Problem Statement

当前扩展的模型清单 100% 硬编码在模型清单常量(10 个模型)中,启动时一次性提供给 VS Code。CodeBuddy 云端会新增/下线模型,但扩展无法反映这些变化——用户只能等模型被手工加入硬编码清单(依赖社区逆向)才能使用新模型,而下线/无权限的模型仍会出现在选择器中,导致选中后请求失败。同时,用户通过官方 `~/.codebuddy/models.json` 自定义的模型也无法被本扩展感知。

## Solution

将模型清单的来源从"单一硬编码"改为"三层来源、动态合并":扩展在启动时与 TTL 周期内调用远程目录端点获取可用模型(Model Catalog + Availability),合并官方本地 models.json 的自定义模型,以硬编码清单为兜底;合并结果通过 `onDidChangeLanguageModelChatInformation` 事件通知 VS Code 刷新模型选择器。用户无需等待扩展发版即可使用云端新增模型,也能用自己的 models.json 覆盖或新增模型。

## User Stories

1. 作为用户,我希望扩展启动后自动从云端拉取最新可用模型,以便新模型上线后无需重启或升级扩展即可使用
2. 作为用户,我希望模型清单会按周期自动刷新,以便云端模型变更(新增/下线)无需手动操作就能反映到模型选择器
3. 作为用户,我希望通过一条命令手动强制刷新模型清单,以便在云端模型变化后立即看到结果
4. 作为用户,我希望只有我账号实际可用的模型出现在选择器中(被禁用或无权限的模型不出现),以便不会选中后请求失败
5. 作为用户,当网络失败、token 缺失或远程端点不可用时,我希望扩展仍能提供一份可用的模型清单(回退),以便聊天功能不被中断
6. 作为用户,我通过官方 `~/.codebuddy/models.json` 自定义的模型能在本扩展中出现,以便沿用我的自定义配置
7. 作为用户,我在 models.json 中对某模型覆盖的字段(如上下文窗口、能力开关)能生效,以便精细控制
8. 作为用户,我希望模型选择器在云端模型清单变化时自动刷新,以便无需重启 VS Code 就能看到新模型
9. 作为开发者,我希望刷新逻辑在并发触发时不会重复请求(单次 in-flight),以便减少对非官方端点的请求压力
10. 作为开发者,我希望合并逻辑是字段级、以模型 id 为主键,以便本地自定义只补丁所需字段而不整体覆盖
11. 作为开发者,我希望每个模型的来源(远程/本地/硬编码)可追溯,以便排查"为什么这个模型的元数据是这样"
12. 作为用户,我希望远程提供图片能力的模型能正确声明图片输入能力,以便我可以向模型发送图片
13. 作为用户,我希望模型刷新频率可配置,以便在"更实时"与"更少请求"之间权衡
14. 作为开发者,我希望合并/缓存/刷新逻辑与具体网络、文件 IO 解耦(依赖注入),以便无需真实网络即可完整测试
15. 作为用户,我希望刷新失败不会打断正在进行的对话,以便使用体验稳定
16. 作为用户,当未配置 token 时,我希望扩展仍能基于本地来源提供模型清单,以便扩展不至于完全不可用
17. 作为开发者,我希望刷新与降级过程有日志输出,以便诊断"为什么模型列表是这个状态"
18. 作为用户,我希望模型清单刷新期间不影响模型选择器的正常使用,以便界面不闪断
19. 作为用户,我希望与我本地 models.json 中相同 id 的模型能被我的字段覆盖,以便我自定义的上下文窗口或能力开关生效
20. 作为开发者,我希望合并结果是可序列化、可对比的,以便通过内容对比判断是否需要通知 VS Code 刷新
21. 作为用户,我希望远程模型与硬编码模型的显示名、描述保持可读,以便模型选择器信息清晰
22. 作为用户,我希望每个模型的 thinking effort 档位(如支持)在动态合并后仍保留,以便不影响既有思考深度功能

## Implementation Decisions

- **远程目录端点(API contract)**:`GET https://copilot.tencent.com/console/enterprises/personal/models`;Bearer 鉴权(与对话端点相同 token);需携带 `Origin: https://www.codebuddy.cn`、`Referer: https://www.codebuddy.cn/`、`User-Agent: CLI/2.63.2 CodeBuddy/2.63.2` 请求头
- **响应信封**:`{code, msg, data}`;`data.models[]` 为全量模型元数据(id/name/description/supportsImages/supportsReasoning/contextWindow/maxTokens/disabled/isDefault/configurable/credits 等),`data.agents[]` 含 `name == "cli"` 的模型 id 白名单
- **Availability 过滤**:仅注册 `agents["cli"]` 白名单 ∩ `models[]` 且 `!disabled` 的模型;`isDefault`/`configurable` 本次不消费
- **防御解析**:`contextWindow`/`maxTokens` 兼容 number、string、`{value}` 对象三种形态,解析失败回退保守默认
- **合并优先级(以 id 为主键,字段级 merge)**:远程 > 本地 models.json > 硬编码
  - `name`/`detail`:远程 > 本地 > 硬编码
  - `family`/`version`:由 id 解析推导 > 本地 > 硬编码
  - `maxInputTokens`:远程 `contextWindow` > 本地 > 硬编码
  - `maxOutputTokens`:远程 `maxTokens` > 本地 > 硬编码
  - `toolCalling`:默认 true > 本地 `supportsToolCall` > 硬编码
  - `supportsImages`:远程 > 本地 > 硬编码(默认 false)
  - `reasoningEffortLevels`/默认档位:本地 > 硬编码(远程无此字段)
  - `provenance`(来源标记):`remote`/`local`/`hardcoded`,记录模型首次来源
- **降级链**:远程成功 → (远程 + 本地 + 硬编码);远程失败 → (本地 + 硬编码);本地也失败 → 硬编码
- **缓存与刷新**:可配置 TTL(默认 30 分钟);单次 in-flight 复用(并发共享同一 Promise,防 thundering herd);手动刷新绕过 TTL 强制拉取
- **VS Code 集成**:实现 `onDidChangeLanguageModelChatInformation` 事件;合并结果做 JSON 对比,内容实际变化才 fire,避免无谓刷新选择器
- **能力透传**:`supportsImages` → `capabilities.imageInput`(VS Code 1.98+);`toolCalling` 恒 true 维持 agent 模式可用
- **新配置项**:模型缓存 TTL(秒,默认 1800);**新命令**:刷新模型清单(手动强制)
- **本地 models.json 解析**:读用户级(`~/.codebuddy/models.json`)与项目级(`.codebuddy/models.json`)配置,字段级补丁;BYOK 字段(`url`/`apiKey`/`vendor`/`temperature`/`relatedModels`)本次忽略
- **新模块(纯逻辑,零 vscode 依赖)**:远程目录获取、本地 models.json 解析、模型注册表(合并 + 缓存 + 刷新,依赖注入);复用既有错误信封与 JSON 解析工具

## Testing Decisions

- **好测试的标准**:只测外部行为——给定远程/本地/硬编码输入,验证合并输出的模型信息正确(字段优先级、过滤、降级、缓存、事件触发);不测网络传输细节与 UI 渲染
- **单一测试接缝**:模型注册表通过依赖注入接收"远程目录获取"与"本地 models.json 解析"两个依赖;测试注入假实现,一个接缝覆盖全部合并/缓存/刷新逻辑
- **网络/文件层薄测**:远程获取的网络层沿用现有 `client.test.ts` 的 `vi.mock('node:https')` + FakeResponse 先例;本地解析的 fs 层 mock 文件读取
- **待测模块**:模型注册表(核心)、远程获取(网络层薄测)、本地解析(fs 层薄测)
- **测试用例(注册表)**:合并优先级、字段级 merge、Availability 过滤、降级链、TTL 命中/过期、in-flight 复用、手动刷新绕过 TTL、内容变化才 fire 事件、provenance 标记
- **测试用例(远程获取)**:成功解析、HTTP 错误、畸形响应、disabled 过滤、白名单交集、`contextWindow`/`maxTokens` 数字/字符串/对象三形态
- **测试用例(本地解析)**:文件缺失、JSON 畸形、字段缺省、用户级/项目级路径解析
- **先例**:现有 `src/test/messages.test.ts`、`toolcalls.test.ts` 为纯逻辑单测范例;`client.test.ts` 为网络 mock 范例

## Out of Scope

- 国际版 Global(workbuddy.ai)域名支持
- BYOK 自定义模型(`url`/`apiKey`/`vendor`/`temperature`/`relatedModels` 字段的完整支持)
- 本地 models.json 热重载(1 秒防抖)
- 按 family 推断 reasoning effort 的推断表
- `isDefault`/`configurable` 字段的消费
- 模型下线后的历史会话处理
- UI/选择器层面的视觉改动(依赖 VS Code 原生)

## Further Notes

- 前置研究:`research/02-codebuddy-api-protocol.md`(对话端点与协议)、`research/01-vscode-lm-provider-api.md`(`onDidChangeLanguageModelChatInformation` 为 stable API 可选字段)
- 远程端点唯一实证来源:社区项目 Sliverkiss/cpa-plugin(生产环境运行,含缓存与 CN/Global 分域);非官方端点,无稳定性承诺,可能变更或封禁,回退链保证不阻塞核心聊天
- 词汇表:Model Catalog(服务端元数据)/ Model Availability(账号可用子集)/ Model Registry(向 VS Code 注册的清单)——写入根 `CONTEXT.md`
- ADR:依赖非官方端点 + 三来源合并决策,记入 `docs/adr/0001-dynamic-model-catalog.md`
