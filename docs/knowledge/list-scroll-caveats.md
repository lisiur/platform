# List / 滚动注意事项（iOS 26 经验证为主）

## 行高与结构

- **行自尺寸重排导致内容闪跳**（跳动根因）：offset/动画治不了，终态是**改结构**（该行改独立 push 页）。
- **List 行内 LazyVGrid 首开空白**：行高估计失真（单列 930pt 猜测）→ **固定 HStack 分行**。
- **零高度视图仍吃 VStack spacing**（headless 挂载铁律）：哨兵/探针视图用 `overlay` 挂，别进视觉流。
- `defaultScrollAnchor(.bottom)` 对异步长 List 无效（异步内容后到，锚定不回头）——需要时临时隐藏上方 section 验证。

## 拖拽重排

- **iOS 26 无需编辑模式**，List + `onMove` 直接长按拖拽重排（实测推翻 iOS≤18 书面规则）；`EditButton` 仅剩手柄可见性提示，可判冗余。
- **`onMove` 的 perform 必须修改 ForEach 迭代的同一数组**——常量数据源 = 拖拽弹回、落库与显示脱节。
- 服务端排序接口的合成 `Encodable` 注意：**丢 nil 键**会让 zod 必填键报 400——手写 `encodeNil` 显式带出 null。

## 滚动锚定

- 删视口上方行**自动补偿**滚动、插行**永不补偿**——结构体赋值落点不精。
- `scrollPosition(id:)` iOS 17 失效用 iOS 18 `ScrollPosition`；结构体 `scrollTo` 落点不精，`ScrollViewReader` 精确。

## 分组样式

- **隐式 section 圆角**：inset-grouped List 里裸 `ForEach` 与顶层行同落一个隐式 section，卡片顶圆角算在透明行上、首条记录变直角 → 显式 `Section` 包住。
- **零 inset 首卡被 section 圆角裁切**（玻璃 rim 顶角截断，像素剖面实证）：`.padding(.vertical, 8)` 或改 ScrollView 挂载即可解决。
- `.refreshable` 别挂 sheet 内列表。
- grouped Form 卡片边距实测恰 16pt：`.listRowInsets(EdgeInsets())` 让行内容撑满卡片边到边，与 `.padding(.horizontal, 16)` 的兄弟视图逐像素对齐。
