# 离线快照：last-known-good 渲染层

目的：冷面（新 store 实例、新进程）先画「上次的正确内容」而不是闪空态；fetch 仍照常运行并静默纠偏。

## 模式

```
成功 fetch → 发布快照到缓存
冷启动面  → 先 hydrate（读快照）→ 再 fetch → 落定后 persist
```

## 关键设计（实现在 `Shared/Utils/SnapshotCache.swift`，可整体移植）

- **渲染种子，不是数据源**：缓存只负责让页面有东西可画；数据源仍是服务端，每次 fetch 纠偏 hydrate 值。
- **版本化 envelope**：`{ schema: Int, payload: P }`，schema 按 namespace 递增；schema 不匹配或解码失败**一律按 miss 处理**——模型漂移降级为普通冷加载而不是崩溃。
- **per-fetch merge**：一次 fetch 只合并它自己窗口的数据，防止跨窗口（别的月份/别的筛选）的载荷互相污染。
- **LRU 索引无条件写回**：清理走索引扫描；写路径哪怕只更新载荷也要碰索引，否则索引与数据漂移。
- **存储隔离**：app 进程与扩展/Widget 进程的 defaults suite 不同（扩展只见 App Group）——跨进程共享的键走 App Group，app 私有的走 standard，避免 suite 错位读不到。
- **清理边界明确**：所有缓存键带统一前缀，`clearAll` 只扫该前缀，不会触及同 suite 的其他键。

## 例外口径

读快照的正确性要求低于「不闪空态」：hydration 后立刻渲染的数字可以短暂陈旧，但**绝不能把缓存 miss 处理成错误**——miss 就是普通冷加载。
