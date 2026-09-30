# iOS 26 液态玻璃 chrome 行为与限制（经验证）

## Toolbar 合并行为

- 相邻 toolbar item 会**合并成一个玻璃胶囊**：`ToolbarSpacer(.fixed, placement:)` 拆成两个独立 pill；单个 `ToolbarItem` + HStack + 细 Divider = 单胶囊内分隔线。
- **macOS 不合并**，不要把 iOS 的 ToolbarSpacer/分组规则套用到 macOS。

## 自绘固定栏

- 自绘底部固定栏用 **`.safeAreaBar`**（iOS 26+）：内缩安全区 + 延伸滚动边缘效果；`automatic` 不是合同性 soft；overlay 都不参与安全区。

## 搜索框

- **搜索框激活刷白是 UISearchController 系统层**（灰 capsule → 近白 prominent 材质），应用代码零参与、改不了：材质对抗（opaque 画布/各色填充/blur/UIGlassEffect）全败——**布局解法赢过材质对抗**。
- searchable 之下的 cover + 子 sheet 有 remount 问题（见 [navigation-caveats.md](navigation-caveats.md)）。

## 按钮

- **iOS 26 Button（含 borderless）重着色 label**，保不住惰态自定义灰：需要精确控色的可点模块用 `contentShape + onTapGesture + isButton trait` 替代 Button（截图像素采样闭环验证过）。

## Tab 栏

- 底部 tab 超量折叠出的「More」是**系统行为**，不可定制：客户端封顶 tab 数 + 服务端白名单校验 + 存量非法配置**整包回落默认**。
- 动作型胶囊（加号）的完整方案见 [bottom-add-pill-tab.md](bottom-add-pill-tab.md)。

## 层级

- **ZStack 全屏兄弟居中陷阱**：某个兄弟 `.ignoresSafeArea` 会把整个 ZStack 居中基准改掉，上层内容整体上移——背景用 `.background` 挂，不做 ZStack 兄弟。
