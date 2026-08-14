# 0001 — 动态模型目录依赖社区端点，硬编码兜底

CodeBuddy 官方从未公开模型列表端点（官方文档明确"官方完整模型清单页面：未找到"，官方 SDK/CLI 亦无列模型命令），而模型会动态增删。为使 Model Registry 反映云端变化，我们决定调用社区实证的非官方端点 `GET /console/enterprises/personal/models` 拉取 Model Catalog，以官方公开的本地 models.json 作第二来源、硬编码清单作最低兜底，三层以 id 为主键字段级合并（远程 > 本地 > 硬编码）。

选择该端点而非等待官方 API：官方无公开清单接口，唯一实证来源是社区插件 Sliverkiss/cpa-plugin（生产环境运行，含缓存与分域处理）。代价是该端点无稳定性承诺，可能变更或封禁；因此必须内置失败回退链（远程失败 → 本地 + 硬编码；本地也失败 → 硬编码），保证核心聊天不因清单获取失败而中断，并在日志中记录降级。

**Status**: accepted

**Considered Options**
- 维持纯硬编码：零风险，但无法反映云端模型动态变化，新模型需等扩展发版
- 官方 models.json 本地合并（无远程端点）：官方公开、用户可控，但不是真动态，不反映云端新增
- 社区端点 + 本地 + 硬编码（本决策）：真动态，但依赖非官方端点，需回退

**Consequences**
- 依赖 `GET /console/enterprises/personal/models`，非官方端点可能变更/封禁，回退链保证不阻塞聊天
- Availability 过滤：仅注册 `agents["cli"]` 白名单 ∩ `models[]` 且 `!disabled`
- contextWindow/maxTokens 需防御解析（数字/字符串/对象三形态），结构未知
- 刷新频率可配置（TTL 默认 30 分钟）+ 单次 in-flight 复用，减少对非官方端点的请求压力
