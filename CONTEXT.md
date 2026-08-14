# CodeBuddy VS Code Provider

本仓库上下文：一个将腾讯 CodeBuddy 云端模型接入 VS Code 语言模型提供程序（Language Model Chat Provider）的扩展，复用 Copilot Chat / Agent 界面。

## Language

**Model Catalog**（模型目录）：
服务端发布的全部模型元数据（id、名称、能力、上下文窗口）。
_Avoid_: 模型列表、模型集合、模型字典

**Model Availability**（模型可用性）：
受账号权限与禁用标记约束的实际可用模型子集，由 CLI 白名单与 disabled 过滤得出。
_Avoid_: 可用模型、模型集合

**Model Registry**（注册清单）：
本扩展向 VS Code 注册的模型清单，由 Model Catalog + Model Availability 驱动，本地补丁覆盖，硬编码兜底。
_Avoid_: 模型列表、当前模型、模型缓存
