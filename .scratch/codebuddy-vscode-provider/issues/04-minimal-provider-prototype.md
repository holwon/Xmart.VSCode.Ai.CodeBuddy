# 最小可行提供程序原型

- Type: prototype
- Status: resolved
- Blocked by: 01, 02

## Question

做一个最小 VS Code 扩展原型,验证目的地成立:

- 注册一个语言模型提供程序,Copilot Chat 模型选择器中出现 CodeBuddy 模型
- 发起一次对话,模型成功流式返回内容
- 原型作为资产链接到本票(原型代码放 `e:\OpenResources\Xmart.AiProxy\prototypes\` 或临时目录)
- 顺带验证:注册后无需重启 Copilot、模型选择器可见性、流式渲染

## Answer

验证通过(2026-08-10)。扩展已打包为 `codebuddy-provider-0.0.1.vsix` 并安装到 VS Code 1.132,在 Copilot Chat 中选择 CodeBuddy 模型可正常对话、工具调用正常。

**排障过程中定位并修复的三个 CodeBuddy 协议问题**:
1. **消息顺序**:VS Code 传的消息本就是正确顺序,原 `reverse()` 导致 `tool` 消息排到最前,被 CodeBuddy 以 `code 11133` 拒绝。→ 去掉 reverse 保序
2. **工具结果配对**:`tool-result` 与 `assistant` 工具调用并非严格 1:1 相邻,原实现无条件输出为 `role:tool` 产生非法序列。→ 按 `callId` 精确配对,无主的折叠进 user 文本
3. **part 识别**:生产构建可能混淆类名,`instanceof` 失效导致 thinking part 被 JSON 序列化污染。→ 增加鸭子类型识别

诊断脚本(`scripts/diagnose-*.mjs`,已删除)实测确认:`tool→assistant` 顺序返回 400/11133,`user→assistant→tool` 返回 200;工具数量(至 78 个)与大小(至 67KB)均非限制因素。
