# token 获取与配置流程

- Type: task
- Status: claimed
- Blocked by: 02

## Question

用户如何获得 CodeBuddy API token 并配置到扩展:

- 具体获取步骤(来源、登录方式、有效期、刷新机制)——答案取决于「CodeBuddy API 协议与认证事实」的结论
- 扩展的配置项定义(token 存哪个 setting,是否支持环境变量)
- 首次使用引导:未配置 token 时的错误提示
- 完成后记录:凭证位置、新 URL、后续票依赖的事实

## Answer

已实现(resolved 2026-08-10):

- **配置项**:`codebuddy.accessToken`(secret 存储,`markdownDescription` 已更新)+ `codebuddy.userId`(可选,缺失回退 `X-No-User-Id: 1`)
- **环境变量回退**:`CODEBUDDY_AUTH_TOKEN`(与 CodeBuddy CLI 同约定),设置在 `provider.ts` 的 `createClient`:`config || process.env || 报错`;错误提示同时指向设置与环境变量
- **获取指引**(README "Getting a token" 章节):① CodeBuddy console/backend 创建(推荐,用户实际来源);② 官方插件登录态(`%APPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`,v5.3.8+ 明文 JSON);③ CLI(`~/.codebuddy/` 或 `CODEBUDDY_AUTH_TOKEN`)。含敏感凭据警告
- **安全**:token 仅进 Authorization header,无日志泄漏路径
- 审查通过:优先级正确、env 在扩展宿主可用、README 与 research/02 一致;采纳建议(README 提示改 env 后需重启 VS Code)
- 86/86 测试通过,新包已生成(23.47 KB)

**后续依赖事实**:token 为 `ck_` 开头(用户后台创建);登录态文件路径为社区逆向结论,Windows 路径以本机实测为准。
