# 09 — 清单元数据与 proposed API 声明

**What to build:** 扩展的安装声明与实际能力一致:`engines.vscode` 改为 `>=1.98.0`(capabilities 消费版本,与 README 一致),避免用户在不支持的 VS Code 版本上"可安装但运行即坏";并在 manifest 中显式声明 proposed API 的启用状态(`enabledApiProposals: ["chatProvider"]`),使思考深度等功能不依赖隐式行为。若实测确认 1.132 stable 无需声明即生效,则删除本票中该决策并记录实测结论。

**Blocked by:** None — can start immediately

**Status:** claimed

- [ ] `engines.vscode` 改为 `>=1.98.0`,与 README 的 "1.98 or newer" 一致
- [ ] `enabledApiProposals` 声明或实测后明确记录结论(声明或弃用)
- [ ] 打包 .vsix 验证 manifest 正确

## Answer

已实现(resolved 2026-08-10):

- `engines.vscode` 改为 `>=1.125.0`(与 `@types/vscode` 版本一致,满足 vsce 一致性校验;README 同步为 "1.125 or newer",并注明 model-configuration picker 需 1.126+)
- `enabledApiProposals: ["chatProvider"]` 已声明;vsce 3.9.2 打包无任何报错/警告
- **实测结论**:`chatProvider` 主体(`registerLanguageModelChatProvider`/`LanguageModelChatProvider`)在 @types/vscode 1.125 的 stable 声明中已存在(扩展已在 VS Code 1.132 stable 正常运行);`configurationSchema`/`modelConfiguration` 仍属 proposed,经 `src/proposed-vscode.d.ts` 模块增强使用。README 提示:若 Thinking Effort 选择器不出现,需 `--enable-proposed-api=local.codebuddy-provider` 启动
- package-lock.json 根元数据已同步
