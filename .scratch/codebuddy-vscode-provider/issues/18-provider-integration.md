# 18 — Provider 动态化接线:模型信息 + 变更事件 + 图片能力

**What to build:** 模型选择器显示动态合并后的清单:提供程序启动时从注册表取模型信息,注册表刷新后通过 onDidChangeLanguageModelChatInformation 事件通知 VS Code 刷新选择器;supportsImages 透传为 capabilities.imageInput(toolCalling 恒 true 维持 agent 模式)。

**Blocked by:** 17(Model Registry)

**Status:** done

- [x] 模型选择器显示注册表动态合并后的清单
- [x] 注册表内容变化时触发 onDidChangeLanguageModelChatInformation,VS Code 刷新选择器
- [x] supportsImages → capabilities.imageInput 透传;toolCalling 保持 true
- [x] 既有测试不回归;F5 手动验证通过
