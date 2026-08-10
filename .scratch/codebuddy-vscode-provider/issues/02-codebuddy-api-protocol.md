# CodeBuddy API 协议与认证事实

- Type: research
- Status: resolved
- Blocked by:

## Question

CodeBuddy API(`copilot.tencent.com/v2/chat/completions`)的协议事实:

1. 完整请求格式:模型字段、messages 结构、tools/tool_choice、stream、temperature 等参数
2. SSE 流式响应格式,以及各 chunk 中 delta 的字段(delta.tool_calls、delta.reasoning_content、delta.extra_fields 等)
3. 认证方式:请求头要求(Authorization/Bearer 格式)、token 的获取途径(网页登录?开放平台?官方插件?)与有效期
4. 可用模型清单与 ID(如 DeepSeek 系列等),各自能力(工具调用、推理、上下文长度)
5. 工具调用在 CodeBuddy 协议中的表示方式与限制
6. 与 OpenAI 标准协议的全部差异——对照现有代理脚本 `腾讯CodeBuddy-proxy.js` 顶部注释中的差异表,核实并补充

## Answer

详见 `research/02-codebuddy-api-protocol.md`。要点:

- 端点确认 `POST https://copilot.tencent.com/v2/chat/completions`,OpenAI chat/completions 兼容;**必须 stream:true**(非流式被拒 `code 11101`)→ 代理非流式路径可废弃
- 认证:`Authorization: Bearer <accessToken>` + **`X-User-Id` 必需**;无开放平台 API key,token 来自官网账号 OAuth;错误信封 `{code, msg, data}`
- token 现成途径:官方 VS Code 扩展 `Tencent-Cloud.coding-copilot` 登录态——新版桌面端 v5.3.8+ 为明文 JSON(`%APPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`,路径需本机实测),旧版为 Electron safeStorage 加密 vscdb;另有 CLI 环境变量 `CODEBUDDY_AUTH_TOKEN`
- 模型清单(社区逆向,中可信):glm-5.2/5.1、glm-5v-turbo、kimi-k2.7、minimax-m3-pay、hy3/hy3-preview/hy3-preview-agent、deepseek-v4-pro/deepseek-v4-flash
- 工具调用:支持,OpenAI 格式兼容;差异表 12 项全部核实,新增:11101、X-User-Id、reasoning_effort 仅 high 生效
- 参考实现:lovingfish/workbuddy-cliproxy(Go)、zhangjianqiang123/hy3-proxy(JS)
