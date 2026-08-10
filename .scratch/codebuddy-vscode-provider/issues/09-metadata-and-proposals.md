# 09 — 清单元数据与 proposed API 声明

**What to build:** 扩展的安装声明与实际能力一致:`engines.vscode` 改为 `>=1.98.0`(capabilities 消费版本,与 README 一致),避免用户在不支持的 VS Code 版本上"可安装但运行即坏";并在 manifest 中显式声明 proposed API 的启用状态(`enabledApiProposals: ["chatProvider"]`),使思考深度等功能不依赖隐式行为。若实测确认 1.132 stable 无需声明即生效,则删除本票中该决策并记录实测结论。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `engines.vscode` 改为 `>=1.98.0`,与 README 的 "1.98 or newer" 一致
- [ ] `enabledApiProposals` 声明或实测后明确记录结论(声明或弃用)
- [ ] 打包 .vsix 验证 manifest 正确
