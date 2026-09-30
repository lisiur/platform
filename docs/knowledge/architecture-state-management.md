# 状态层架构：@Observable store + environment

## 总体形态

- `@main` App 根部创建全部全局 store（`@State` 持有），`.environment()` 一次性下发；页面用 `@Environment` 读取。用 Observation 框架的 `@Observable`（而非 `ObservableObject`）。
- store 分两类：**全局共享**（作用域跨页面、跨 tab 的数据）与**页面私有**（只属于一个页面的数据面）。

## @State 默认值 + init 重赋值陷阱（实测）

需要依赖初始化的对象，**必须在 init 里显式构造一次、多处共享**，不要写 `@State private var x = X()` 再在 App 的 init 里重新赋值：SwiftUI 会保留「默认值那次构造」的临时实例在运行时——曾导致一个独立 UIWindow 观察的控制器与全 app 实际使用的不是同一个对象（功能静默失效）。正确形态：

```swift
init() {
    let controller = SomeController()      // let 一次
    self.controller = controller
    #if os(iOS)
    shieldWindow = ShieldWindow(controller: controller)  // 同一实例
    #endif
}
```

## 状态所有权裁决

- **行为隔离**：一个页面对列表的操作（编辑、删除、筛选）只应作用于它自己的列表。当同一数据在多处呈现且行为面不同时，给每处开同类型 store 的**独立实例**，而不是全局共享一个——共享会让 A 页的局部状态泄漏进 B 页。
- **状态提升**：任何会重挂载子树的机制（`.id()` 切换、tab 重建）都会把路径以下的 `@State` 清掉。可能被重挂载波及的状态（store、筛选、选中项）要**提升到边界之上**；提升不了时，让 store 自己持有已加载数据，重挂载从数据重画而不是闪空态。

## `.id()` 重挂载 = 强制重求值手段

- 已挂载的 Text **不会**因为 UserDefaults/环境值变化而重新求值格式化函数。低频全局开关（如「隐藏金额」遮罩）翻转时，用 `.id(condition)` 重挂载整个子树，让每个格式化调用点重算。
- **豁免不承载开关内容的页面**：某页面根视图没有金额、带金额的推入页在开关可达时必然未挂载 → 重挂载只丢滚动位置、零收益，明确豁免。
- 这是「低频全局开关」专用手段；高频状态绝不用重挂载。

## 纯函数下沉

几何换算、键映射、命中判定等逻辑写成 `nonisolated static` 纯函数（不依赖实例状态），视图层只做装配——这类函数全部可单元测试（见图表卡的 `tappedDayIndex` 模式）。

## 相关

- 全局开关的求值收口见 [global-format-choke-point.md](global-format-choke-point.md)。
- 离线渲染层见 [snapshot-cache-offline.md](snapshot-cache-offline.md)。
