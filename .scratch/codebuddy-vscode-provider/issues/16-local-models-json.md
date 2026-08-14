# 16 — 本地 models.json 解析模块

**What to build:** 扩展能读取官方本地模型配置文件(用户级与项目级),解析为字段级补丁结构,供注册表与远程数据合并。支持按官方字段映射为补丁(id/name/supportsToolCall/supportsImages/supportsReasoning/maxInputTokens/maxOutputTokens);BYOK 字段(url/apiKey/vendor/temperature/relatedModels)忽略。文件缺失或 JSON 畸形时安全返回空补丁,不抛未处理异常。

**Blocked by:** None — can start immediately

**Status:** done

- [x] 能解析用户级与项目级两个路径的模型配置文件,项目级优先(或按 spec 定义合并)
- [x] 字段映射正确,忽略 BYOK 字段
- [x] 文件缺失 / JSON 畸形 / 字段缺省时安全降级为空补丁
- [x] 纯逻辑、零 vscode 依赖;fs 层单测通过(mock 文件读取)
