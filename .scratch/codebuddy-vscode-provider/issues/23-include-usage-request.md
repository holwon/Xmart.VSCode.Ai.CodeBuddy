# 23 — 请求侧 include_usage 接线

**What to build:** 扩展请求 CodeBuddy 时带上 stream_options.include_usage,与 VS Code BYOK 做法对齐,让 CodeBuddy 稳定返回 usage 数据。请求类型新增 stream_options 字段并随请求体发送;若 CodeBuddy 忽略该参数则无害(现有 usage chunk 仍可用)。网络层单测确认请求体包含该字段。

**Blocked by:** None — can start immediately

**Status:** done

- [x] 请求类型含 stream_options,发送 include_usage: true
- [x] 网络层单测确认请求体包含该字段(沿用现有网络 mock 范例)
- [x] 不改变既有请求行为(stream: true 等)
