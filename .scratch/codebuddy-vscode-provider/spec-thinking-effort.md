# Spec:思考深度(Thinking Effort)控制

- Status: ready-for-agent
- Type: spec
- Feature: codebuddy-vscode-provider

## Problem Statement

CodeBuddy 的推理模型(DeepSeek 系)支持 `reasoning_effort` 请求参数控制思考深度,但当前扩展无法让用户调节思考强度——所有请求都走模型默认值。用户希望在 Copilot 里按需求选择思考深度:简单问题用低档位获得更快响应,复杂任务用高档位获得更深思考。

同时,不同模型对思考深度的支持不同(DeepSeek 系支持多档位,hy3 系只有 `"high"` 真正生效),用户需要一个清晰、符合模型能力的控制方式。

## Solution

利用 VS Code 1.126+ 的原生模型配置选择器(Thinking Effort):扩展在模型元信息中声明支持的思考深度档位(`configurationSchema`,proposed API),用户在 Copilot 模型选择器里直接选择,选择结果经 `options.modelConfiguration.reasoningEffort` 传入,扩展将其映射为 CodeBuddy 请求的 `reasoning_effort` 参数。用户无需离开 Copilot 界面即可按对话调节思考深度。

## User Stories

1. 作为使用 DeepSeek 系模型的用户,我想在模型选择器里看到 "Thinking Effort" 配置项,以便为当前对话选择思考深度
2. 作为用户,我想在 off/low/medium/high 四档之间切换思考深度,以便在响应速度与回答质量之间权衡
3. 作为用户,我想看到每个档位的可读标签(Off/Low/Medium/High)和说明,以便理解各档位的含义
4. 作为用户,我想在未手动选择时使用合理的默认思考深度(medium),以便开箱即用
5. 作为用户,我想让我的选择只影响当前模型,以便不同模型可以有不同的思考深度设置
6. 作为使用 hy3 系模型的用户,我不想看到它不支持的多档位选择(hy3 只有 high 生效),以便不被误导
7. 作为用户,当我选择 off 时,我希望请求不携带 `reasoning_effort` 参数(等价于关闭思考),以便获得最快响应
8. 作为用户,我希望思考深度在 ask/edit/agent 所有模式下都生效,以便任何场景都能控制
9. 作为开发者,我希望思考深度映射逻辑是可单元测试的纯函数,以便无需 mock vscode 即可验证
10. 作为用户,我希望在日志中看到当前请求使用的 reasoning_effort 值,以便排查问题
11. 作为用户,当模型不支持思考深度控制时,我不希望看到配置项,以便界面干净
12. 作为用户,我希望模型选择器里显示的档位与 CodeBuddy 实际支持的档位一致,以便选择有效档位

## Implementation Decisions

- **配置声明**:模型元信息中为支持思考深度的模型声明 `configurationSchema` 属性,含 `reasoningEffort` 属性(`group: 'navigation'`,枚举档位 + 可读标签 + 描述 + 默认值)
- **档位枚举**:`off | low | medium | high` 四档;`off` 表示不传 `reasoning_effort`(关闭思考),其余映射为 CodeBuddy 的 `reasoning_effort` 值
- **模型支持差异**:
  - DeepSeek V4 Pro/Flash:支持全部四档,默认 `medium`
  - hy3 系:只暴露 `['high']`(只有 high 真正生效),或不暴露配置项——以实测为准
  - 其他模型:不暴露配置项
- **读取与映射**:从 `options.modelConfiguration?.reasoningEffort` 读取用户选择;`off`/缺失 → 不发送 `reasoning_effort`;否则发送原值。逻辑提取为纯函数模块(零 vscode 依赖)
- **proposed API 处理**:`configurationSchema`/`modelConfiguration` 为 proposed API,通过本地模块增强声明类型;若实测发现 1.132 stable 不生效,降级为设置项方案(记录于票内)
- **日志**:请求日志输出 `reasoning_effort: <value|(default)>`,便于验证与排查

## Testing Decisions

- **好测试的标准**:只测外部行为——给定用户选择的档位与模型元信息,验证输出的 CodeBuddy 请求参数正确(含 off/缺失/非法值边界);不测 UI 渲染
- **待测模块**:新增纯逻辑模块(reasoning-effort 映射);provider 层只做薄胶水,不直接测
- **测试用例**:
  - 档位合法值 → 映射为对应 `reasoning_effort`
  - `off` → 不发送该参数
  - 缺失(用户未选)→ 不发送
  - 非法值(如 `'ultra'` 不在枚举中)→ 忽略或回退默认
  - 模型不支持(无 levels)→ 无配置项输出
- **先例**:现有 `src/test/messages.test.ts`、`toolcalls.test.ts` 是纯逻辑单测的范例,新模块测试沿用同样风格

## Out of Scope

- 空响应检测修复(`Response contained no choices`)——独立 bug,另行处理
- 思考过程的 UI 呈现(reasoning_content 渲染)——stable API 不可表达,已记录
- hy3 系之外的模型深度调优
- 每消息粒度的思考深度切换(仅每模型配置)
- 思考深度与上下文窗口配置的联动 UI

## Further Notes

- 前置研究:`research/03-reasoning-effort.md`(VS Code 透传机制)、`research/02-codebuddy-api-protocol.md`(CodeBuddy reasoning_effort 支持)
- 实现前提:proposed API 在 VS Code 1.132 stable 的可用性需先实测(用户反馈模型选择器是否出现 Thinking Effort)
- 若 proposed 不可用,降级方案 B(设置项)已在票内记录,本 spec 的实现决策以方案 A 为准
