# 17 — Model Registry:合并/缓存/刷新

**What to build:** 模型注册表将远程 Model Catalog、本地补丁、硬编码兜底三来源以模型 id 为主键做字段级合并,产生向 VS Code 注册的最终清单(Model Registry)。实现字段来源优先级(远程>本地>硬编码,各字段独立)、降级链(远程失败→本地+硬编码;本地也失败→硬编码)、TTL 缓存(默认 30 分钟,可配置)、单次 in-flight 复用(并发共享同一拉取,防重复请求)、手动强制刷新(绕过 TTL)、内容 JSON 对比(变化才触发变更事件)。模型信息结构扩展 supportsImages 与 provenance 来源标记。注册表通过依赖注入接收远程获取与本地解析两个依赖,全部行为在单一接缝测试覆盖。

**Blocked by:** 15(远程 Model Catalog 获取模块)、16(本地 models.json 解析模块)

**Status:** done

- [x] 三来源字段级合并正确,各字段优先级符合 spec
- [x] 降级链正确:远程失败→(本地+硬编码);本地也失败→硬编码
- [x] TTL 缓存:未过期返回缓存,过期触发刷新
- [x] 单次 in-flight 复用:并发调用共享同一拉取,不重复请求
- [x] 手动强制刷新绕过 TTL
- [x] 内容 JSON 对比,实际变化才触发变更事件
- [x] 每个模型记录 provenance 来源标记(remote/local/hardcoded)
- [x] ModelInfo 结构含 supportsImages 与 provenance
- [x] 注册表行为单测全绿(合并/过滤/降级/TTL/in-flight/事件/provenance)
