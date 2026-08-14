# 14 — 领域文档:Model Catalog / Availability / Registry 词汇表 + ADR

**What to build:** 仓库具备动态模型清单的领域词汇与架构决策记录。根级 CONTEXT.md 写入三个术语(模型目录 Model Catalog、模型可用性 Model Availability、注册清单 Model Registry)的精确定义与反义规避词;docs 下新增 ADR 文件(0001-dynamic-model-catalog.md),记录"依赖非官方远程目录端点 + 三层来源(远程/本地/硬编码)字段级合并优先级 + 失败回退策略"的决策与权衡。

**Blocked by:** None — can start immediately

**Status:** done

- [x] 根 CONTEXT.md 存在,含 Model Catalog / Model Availability / Model Registry 三个术语的定义与避免词
- [x] docs/adr/0001-dynamic-model-catalog.md 存在,记录非官方端点依赖、合并优先级、回退策略与权衡
- [x] 文档仅含领域词汇与决策,不含实现细节
