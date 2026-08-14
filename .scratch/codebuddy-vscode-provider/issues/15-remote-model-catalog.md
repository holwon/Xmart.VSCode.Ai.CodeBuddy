# 15 — 远程 Model Catalog 获取模块

**What to build:** 扩展能向远程目录端点发起 GET 请求,拉取服务端发布的模型元数据(Model Catalog),并解析出账号实际可用的子集(Model Availability):从响应信封取 models[] 全量元数据,取 agents[].name=="cli" 的白名单,求交集并过滤 disabled 模型。contextWindow/maxTokens 字段做防御解析(数字/字符串/对象三种形态,失败回退保守默认),网络失败与畸形响应抛可识别错误。复用既有错误信封工具。该模块为纯逻辑、零 vscode 依赖。

**Blocked by:** None — can start immediately

**Status:** done

- [x] 能对远程目录端点发起 GET,携带 Bearer 鉴权与必要的请求头
- [x] 正确解析 {code,msg,data} 信封;code!=0 抛可识别错误
- [x] Availability 过滤正确:仅保留 agents["cli"] 白名单 ∩ models[] 且 !disabled 的模型
- [x] contextWindow/maxTokens 兼容数字/字符串/对象三形态,解析失败回退保守默认
- [x] HTTP 错误/超时/畸形响应处理正确
- [x] 网络层单测通过(沿用现有 vi.mock('node:https') + FakeResponse 先例)
