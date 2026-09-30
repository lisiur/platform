# 日期/数字格式化的 locale 强制传递

## 核心陷阱

`DateFormatter` 与 `.formatted(.dateTime)` 默认跟随**设备**语言，无视 app 内语言覆盖设置。凡有「app 内切换语言」功能的项目：

- 所有格式化调用点显式传 locale（环境 `\.locale` 或解析后的 locale 对象）。
- 关键格式化 API 把 locale 做成**必传参数**（编译器强制），而不是可选带默认——可选默认会静默回退到设备语言，引入不一致。
- 图表轴标签、百分比格式化同样要显式 locale（Swift Charts 不继承 SwiftUI 环境的 locale 语义，见 [swift-charts-caveats.md](swift-charts-caveats.md)）。

## 日期键与区间运算

- **数据按日聚合的键用本地日历分量拼 `"yyyy-MM-dd"` 字符串**（`Calendar.dateComponents` → format），不要用 UTC 时间戳往返——UTC 往返会把本地日漂移成另一个键。
- 键**绝不用「几号」数字**：跨窗口的 keep-previous 载荷会错配到同号日；字符串键天然带年月。
- 日期区间运算（加一天、算天数）用 `Calendar.date(byAdding:)`，不用秒数算术——DST 切换日会偏移一小时。
- 「一天的视觉中心」= 当日 0 点 + 12 小时（Calendar 加法）：unit-day 柱的跨度和线图的点必须共用这个锚点，见 [swift-charts-caveats.md](swift-charts-caveats.md) 的 band-center。

## 上游方案

「app 内切换语言」本身怎么实现（override bundle + L10n 助手 + 环境注入）见 [app-language-override.md](app-language-override.md)——本文是它的下游纪律：一旦方案存在，所有格式化调用点的 locale 传递规则。
