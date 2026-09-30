# 导航注意事项（NavigationStack / sheet / overlay）

## navigationDestination 注册位置

- **不挂 lazy 容器行内**（List 行内注册被忽略，iOS 26 实测警告）：行内控件只置 `@Binding`，注册点迁到**页面级**（List 外、栈内）。
- **下方页注册的 destination 从被推页触发 = 替换中间页**，不是压栈；被推页面必须**自持注册**。
- 换回行内 `NavigationLink` 会连带整行可点 + chevron 重新出现（见 [row-tap-navigation-without-chevron.md](row-tap-navigation-without-chevron.md)）。

## `.task` 在 pop-back 时重跑（实测）

推入详情再返回，`.task` 会**重新执行**（与 `id` 无关）。推论：

- 重入逻辑要幂等；
- store 过滤器的 `didSet` 加**同值守卫**——否则返回时同值赋值触发防抖 reload，页面丢滚动位置；
- 数据没动时 List 原生保持滚动位置，别手写恢复。

## 嵌套 navigationTitle 覆盖

同栈**最深层** `navigationTitle` 恒赢（`Text("")` 也覆盖）。要让外层标题透传：标题与 inline 模式**都别设**；条件省略只能 `@ViewBuilder if/else` 拆成两个具体类型——线性修饰链做不到。

## iOS 26 sheet remount（实测）

`searchable` sheet 之下有 cover + 子 sheet 时：**子 sheet 每次呈现触发 cover 内容重建**（自关 + 状态重载）。需要二级详情一律**改 push**，别用嵌套 sheet。

## Toast / overlay 宿主位置

overlay 宿主挂在 **NavigationStack 容器层**而非根页面：push 会把根页（及其 overlay）移出 appeared 子树，挂在根页的 toast 在推入页触发时要等下次切 tab 才出现。容器层自身永不因 push 消失，胶囊立即显示。sheet 呈现不触发底层 `onDisappear`，是同一根因的另一面。

## 深链

见 [deep-link-cold-start.md](deep-link-cold-start.md)。
