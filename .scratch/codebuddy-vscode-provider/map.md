# Map: CodeBuddy → VS Code 模型提供程序

- Status: open
- Type: map

## Destination

一个本地自用的 VS Code 扩展,注册为语言模型提供程序(Language Model Provider),手动配置 token,复用 Copilot Chat / Agent 的全部界面与交互,接入 CodeBuddy 全部可用模型(含 agent 模式工具调用),取代现有 Node.js HTTP 代理服务(`腾讯CodeBuddy-proxy.js`)。

## Notes

- 领域:VS Code 扩展开发 + Language Model Provider API + CodeBuddy API 协议适配
- 技术栈:TypeScript、VS Code 扩展
- 每次会话先读:`docs/agents/issue-tracker.md`(本地 markdown tracker 约定)
- 技能:`/research`、`/prototype`、`/grilling`、`/domain-modeling`
- 方向性约束:不做 OpenAI 兼容层;不再维护 HTTP 代理进程;转换逻辑按需取舍

## Decisions so far

<!-- 已关闭 ticket 索引——每条: [<票名>](research/<文件>) — <一句话要点> -->

- [VS Code 语言模型提供程序 API 事实](issues/01-vscode-lm-provider-api.md) — 稳定 API 为 contributes.languageModelChatProviders + registerLanguageModelChatProvider 三方法(信息/响应/token 计数),工具随请求 options 传入,agent 模式要求 capabilities.toolCalling,最低 VS Code 1.96,reasoning 在 stable API 不可表达
- [CodeBuddy API 协议与认证事实](issues/02-codebuddy-api-protocol.md) — 端点 OpenAI 兼容但必须 stream:true(11101),认证 = Bearer token + X-User-Id,OAuth 无开放 API key,官方插件登录态明文文件可提取 token,工具调用 OpenAI 格式兼容,差异表 12 项核实
- [最小可行提供程序原型](issues/04-minimal-provider-prototype.md) — 已打包 .vsix 安装到 VS Code 1.132,Copilot Chat 中正常对话+工具调用;排障定位三个 CodeBuddy 协议坑(消息顺序保序、tool 结果按 callId 配对、part 鸭子类型识别),均已修复

## Not yet specified

- 各模型元信息(上下文窗口、最大输出)的精确值——以「CodeBuddy API 协议与认证事实」的逆向数据为基线,原型实测校准
- 旧代理服务的退役步骤——等 agent 模式跑通后
- 会话历史/上下文管理:原型已验证由 VS Code 托管,无需额外工作
- 思考深度(reasoning effort):已入 06 号票(方案 A 原生选择器),spec 已发布(`spec-thinking-effort.md`,ready-for-agent),先验证 proposed API 可用性
- 代码审查问题修复:spec 已发布(`spec-code-review-fixes.md`,ready-for-agent);已拆分为 tickets 07-13(07 基础设施 → 08 空响应 → 09 元数据 → 10 死代码 → 11 part 分发 → 12 错误映射 → 13 魔法数字)

## Out of scope

- 打包发布 .vsix 分发——目的地是本地自用
- CodeBuddy 官方插件的界面与功能——只要模型能力
- OpenAI 标准兼容层 / HTTP 代理——正被取代
- 多用户/团队共享配置
