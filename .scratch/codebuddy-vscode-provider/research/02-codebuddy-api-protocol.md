# 研究:CodeBuddy API 协议与认证事实

> 研究票:`issues/02-codebuddy-api-protocol.md` · 日期:2026-08-10
> 来源:官方文档(codebuddy.cn/docs、cnb.cool/codebuddy/codebuddy-code)、社区逆向项目(lovingfish/workbuddy-cliproxy(Go)、zhangjianqiang123/hy3-proxy(JS)、Sliverkiss/cpa-plugin)、本仓库 `腾讯CodeBuddy-proxy.js` 实测差异记录。可信度已逐条标注。

## 1. 端点与请求格式

- **端点**:`POST https://copilot.tencent.com/v2/chat/completions`(三个独立来源一致,高可信)
- **请求体**:OpenAI `chat/completions` 兼容格式。接受字段:`model`、`messages`(role: system/developer/user/assistant/tool)、`stream`、`temperature`、`top_p`、`max_tokens`/`max_output_tokens`、`tools`、`tool_choice`、`reasoning_effort`、`response_format`。
- **⚠️ 必须 `stream: true`**:非流式请求被上游直接拒绝,错误码 `code 11101`(两个社区项目一致,高可信)。→ **现有代理的非流式路径本就不可用,可废弃**
- **模型清单**(社区逆向,可信度中;deepseek 系被官方 models.json 文档交叉印证):

| model id | 名称 | 上下文长度 |
|---|---|---|
| `glm-5.2` | GLM-5.2 | 1,000,000 |
| `glm-5.1` | GLM-5.1 | 131,072 |
| `glm-5v-turbo` | GLM-5V Turbo | 131,072 |
| `kimi-k2.7` | Kimi K2.7 | 262,144 |
| `minimax-m3-pay` | MiniMax M3 | 204,800 |
| `hy3` / `hy3-preview` / `hy3-preview-agent` | 混元 3 系列 | 262,144 |
| `deepseek-v4-pro` / `deepseek-v4-flash` | DeepSeek V4 | 1,000,000 |

- 输出上限:`maxCompletionTokens` 8192(社区逆向,中可信)
- 官方完整模型清单页面:未找到。官方文档只有 `~/.codebuddy/models.json` 自定义模型指南(支持 `supportsToolCall`/`supportsReasoning`/`supportsImages` 等字段)

## 2. SSE 流式响应格式

- 标准 SSE,每行 `data: {json}`,结束标记 `[DONE]`
- chunk 顶层:`id`、`created`、`model`、`choices[]`、`usage`(仅部分 chunk 携带)
- choice:`index`、`delta`、`finish_reason`、`logprobs`(可能 null)
- delta 内字段:
  - `role`(仅首个 chunk:"assistant")、`content`(流式递增)
  - `reasoning_content`(DeepSeek 系思考过程,流式递增)
  - `tool_calls`(调用工具时:元素含 `index`/`id`/`type:"function"`/`function:{name, arguments}`,arguments 跨 chunk 拼接)
  - **恒出现的空值字段**:`function_call: null`、`tool_calls: []`(未调用时)、`refusal`、`extra_fields`、`logprobs: null` —— 严格客户端需剥离
- `finish_reason`:可为**空字符串 `""`**(进行中);终止值 `stop`、`content_filter`、`length`
- `usage` 结构:`input_tokens`/`prompt_tokens`、`output_tokens`/`completion_tokens`、`input_tokens_details.cached_tokens`、`output_tokens_details.reasoning_tokens`
- 思考模式:hy3 系只有 `reasoning_effort: "high"` 真正开启深度思考(其余值被忽略)

## 3. 认证方式

- 请求头(必需):
  - `Authorization: Bearer <accessToken>`
  - `X-User-Id: <uid>`(uid 缺失时社区用 `X-No-User-Id: 1` 占位)
  - 可选:`X-Enterprise-Id`(企业版)、`X-Refresh-Token`、`X-Product: SaaS`、`Origin/Referer: https://www.codebuddy.cn/`
- **没有开放平台 API key 机制**——认证就是官网账号(微信扫码/手机号/企业 SSO)的 OAuth token
- 登录流程(端点 `/v2/plugin/*`):
  1. `POST /v2/plugin/auth/state?platform=CLI` → `{state, authUrl}`
  2. 浏览器打开 `authUrl` 完成扫码/登录
  3. 轮询 `GET /v2/plugin/auth/token?state=<state>` → 登录中返回 `code 11217`("login ing");完成返回 `{accessToken, refreshToken, expiresIn, refreshExpiresIn, domain}`
  4. `GET /v2/plugin/login/account?state=<state>` → `{uid, enterpriseId, nickname}`
  5. 刷新:`POST /v2/plugin/auth/token/refresh`(带 `X-Refresh-Token`)
- token 有效期:未公开;社区实测 401 后需重新登录(中可信)
- 错误统一为 `{code, msg, data}` 信封,`code != 0` 即失败

### 官方 VS Code 插件登录态存储(拿 token 的现成途径)

VS Code 市场「腾讯云代码助手 CodeBuddy」publisher `Tencent-Cloud`,扩展 id **`Tencent-Cloud.coding-copilot`**。

**① 新版桌面端(v5.3.8+,2026-07-30 发布)——明文 JSON,纯 Node 可读:**
- Windows:`%APPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`(注:有社区来源写 `%LOCALAPPDATA%`,**两处都检查,以本机实测为准**)
- macOS:`~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/workbuddy-desktop.info`(已实测命中)
- Linux:`~/.config/CodeBuddyExtension/Data/Public/auth/workbuddy-desktop.info`
- 结构:`{"account":{"uid","nickname"},"auth":{"accessToken","refreshToken","expiresAt","lastRefreshTime"},"accounts":[...]}`;桌面端临近过期自动刷新

**② 旧版(≤ v5.3.7)——Electron safeStorage 加密 `state.vscdb`(回退):**
- `%APPDATA%\{WorkBuddy,CodeBuddy}\User\globalStorage\state.vscdb`
- SQLite `ItemTable`,key:`secret://{"extensionId":"tencent-cloud.coding-copilot","key":"planning-genie.new.accessTokencn"}`
- 需 Electron 运行时 `safeStorage.decryptString()` 解密(Windows DPAPI)

**③ CLI 侧**:`~/.codebuddy/`(`local_storage/` 下内容哈希命名的 `.info` 文件),支持环境变量 `CODEBUDDY_AUTH_TOKEN`。

> ⚠️ accessToken 等同账号密码级别敏感凭据,勿入库/进日志。自用遵守 CodeBuddy 服务条款。

## 4. 工具调用

- **支持,且与 OpenAI 格式兼容**(高可信):请求侧标准 `tools: [{type:'function', function:{name, description, parameters}}]` + `tool_choice`(auto/none/required/指定函数);响应侧 `delta.tool_calls` 即 OpenAI 形状。
- 注意:不调用工具时仍带 `tool_calls: []` + `function_call: null`,需忽略空值。

## 5. 官方/非官方 SDK

- 官方 CLI:`@tencent-ai/codebuddy-code`(npm,闭源;原生安装器 `https://copilot.tencent.com/cli/install.sh`)
- 官方 JS/TS SDK:`@tencent-ai/agent-sdk`(MIT)——但是 **Agent 级 SDK**(`query({prompt, options})`),不是 OpenAI chat/completions 风格 HTTP SDK
- 官方本地 HTTP API(Beta):`codebuddy --serve` 本地网关(`/api/v1/*` + ACP),是 CLI 本地控制面,不是云端模型 API
- 非官方参考:`zhangjianqiang123/hy3-proxy`(JS,OpenAI/Responses 双协议)、`lovingfish/workbuddy-cliproxy`(Go,完整登录+刷新+转发,最佳协议参考)
- 面向第三方直接调 `v2/chat/completions` 的官方 OpenAI 风格 SDK:未找到

## 6. 与 OpenAI 标准的全部差异(对照现有代理差异表核实)

| # | 差异 | 结论 |
|---|---|---|
| 1 | 非流式请求被拒(`code 11101`),必须 `stream: true` | 代理的非流式路径废弃 |
| 2 | `finish_reason` 返回空字符串 `""`(进行中),非 null | 保留转换:进行中 → null,结束 → "stop" |
| 3 | `delta.tool_calls` 恒为 `[]`(未调用时)+ `function_call: null` | 剥离空值 |
| 4 | `delta.reasoning_content`(DeepSeek 扩展) | 与 stable provider API 冲突(见研究 01:不可作为独立 part) |
| 5 | `delta.extra_fields: null` | 剥离 |
| 6 | `delta.refusal: ""`、`logprobs: null`、`usage: null` | 剥离 |
| 7 | 错误响应 `{code, msg, data}` 信封,非 OpenAI `error` 对象 | 需转换;`code 11217` = 登录中 |
| 8 | 额外认证头 `X-User-Id`(必需) | provider 需带 |
| 9 | `reasoning_effort` 仅 `"high"` 生效(hy3 系) | 请求构造注意 |
| 10 | 内容审核为逐字精确匹配黑名单(Claude 系统提示模板句) | 行为注意 |
| 11 | 模型 id 为 CodeBuddy 私有 id;usage 字段名兼有 OpenAI/Anthropic 两种命名 | 元信息用 CodeBuddy id |
| 12 | token 来自官网账号 OAuth(非 API key),需配合 X-User-Id;有独立 refresh 流程 | token 获取见上文 |

## 对项目的影响

- 现有代理的**非流式路径可整个废弃**;SSE 解析与空值剥离逻辑可迁移进扩展
- token 方案:手动配置可行——用户可从官方插件登录态文件(明文 JSON)或 CLI 环境变量提取;扩展可考虑自动读取 `workbuddy-desktop.info`(需本机实测路径)
- 模型注册:`capabilities.toolCalling = true` 才能用 agent 模式;推理模型(reasoning_content)在 stable API 中只能拼文本或丢弃
