# 图表选型与实现模式

## 选型结论

| 场景 | 选择 | 理由 |
|---|---|---|
| 数据标记（柱/线/donut/扇区） | **Swift Charts**（framework） | 声明式、与 SwiftUI/系统材质同生态、可访问性免费拿；避免三方库的依赖与样式维护成本 |
| 图上的排版覆盖层（引导线、标注、自绘轴标签） | **Canvas / `chartOverlay` + ChartProxy** | Charts 不擅长精准排版；覆盖层与图共享同一份数据重算几何，永不与图 disagree |
| 日历/热力网格（含文字排版 cell） | **自绘 LazyVGrid**（纯函数 + 测试） | 日历 cell 是排版问题不是数据标记问题，Charts 建模别扭 |

原则：**框架图表画数据，手绘只接管框架做不好的几何/排版**；手绘部分与框架部分共享同一份换算函数（角度、位置），单一事实来源。

## 时间序列卡模式（柱/线切换 + 按住 scrub + 粘性 tooltip）

实现在 `Stats/TrendChartCard.swift`，要点全部可迁移：

- **x 域钉死整个窗口**（`.chartXScale(domain:)` = 窗口首日 0 点 → 末日+1 天）：柱/线共用同一刻度，切换样式不跳位；无数据日读 0，scrub 域覆盖全窗口（手指与气泡永不落空）。数据按 `"yyyy-MM-dd"` 字符串键合入，**绝不用「几号」数字**（跨窗口载荷错配同号日）。
- **band-center 锚点（关键）**：unit-day `BarMark` 跨整天，视觉中心在正午 → 线点、`RuleMark` 细线、气泡、轴刻度全部必须画在 `date+12h`（Calendar 加法，DST 安全），否则整体左偏半格。
- **按住 scrub**：`chartXSelection(value:)` 给瞬态值（按下有值、松手 nil）；`onChange` 把每个非 nil 值抄进粘性 `activeDay`，**nil 不得覆盖粘性值**。未交互前 readout 带为空——无默认选中，气泡只在用户按/点后出现。
- **点选与 scrub 并存**：`SpatialTapGesture` 挂在**图外一层**用 `.simultaneousGesture`（挂 overlay 里会进 hit-test 路径、抢占 scrub 手势的事件），y 限制在 plot 带内；x→数据映射用捕获的 `plotRect` 做宽度分数 × 条目数（**带运算，不用秒数**，DST 日不偏移），写成纯函数可单测。
- **plotRect 捕获**：`chartOverlay` 内 `proxy.plotFrame` + GeometryReader 解析（ChartProxy 几何只在 overlay 可达；onAppear/onChange 双跟，旋转/动态字体不漂）。
- **气泡 = 图上方预留带**：`.padding(.top, bubbleBand)` 预留固定高度，plot 永不为气泡缩高、气泡永不盖柱/网格线；x 居中并钳在 plot 内。**固定 frame（宽×高）**，动态字体下文字缩小而不是气泡长高。气泡兼作下钻入口时，它在 scrub 手势区之外，命中不抢手势。
- **自绘 x 轴标签**：框架轴标签中心不对齐刻度（实测恒定前导偏移且随字宽变化）→ overlay 手绘：每标签精确居中于 band-center x，稀疏采样刻度，`allowsHitTesting(false)` 不吃手势，钳内边距。
- **y 轴**：`AxisMarks` 闭包必须绑 value；标签紧凑记数并显式 locale；**AxisMarks 标签不在视图树，全局格式化函数/遮罩够不到 → 内联第二检查点**。
- 语义色（哪个指标什么颜色、派生指标的符号色规则）集中在卡内一个 `color(for:)` 函数，与业务口径一处对齐。

## 构成卡模式（donut + callouts + 切片命中）

实现在 `Stats/CategoryBreakdownCard.swift`：

- `SectorMark(angle:, innerRadius/outerRadius: .fixed, angularInset: 1)` + `.cornerRadius(3)`；legend 隐藏，自绘图例行（色点 + 名称 + 数值 + 份额）。
- **引导线**：`Canvas` 叠在图上，从同一 rows 重算切片角度画 leader lines + 标签。
- **切片点按**：`.contentShape(.rect)` + `onTapGesture(coordinateSpace: .local)`，命中用纯函数换算：半径先过滤（环孔 = 中心读数的点按区，环外不算），角度走与 callouts 相同的区间表。
- **VoiceOver**：`accessibilityChildren` 每行一个元素 + `accessibilityAction` 激活即下钻（与视觉点按同一函数）。
- **数据整形放图外**：聚合档位（单一级别默认「全部」档、用户点选后钉住）在进入图表前定档，图表组件只吃已定档 rows。

## 交互下沉约定

统计卡抽成**任意窗口组件**（窗口由调用方传入，不内部推断）——仪表盘、统计页、Widget 快照共用一套；换窗口防抖、快照发布单源。图表交互（按住/点选 → 气泡 → 下钻）目的地用 **push 不用 sheet**（原因见 [navigation-caveats.md](navigation-caveats.md) 的 sheet remount 问题）。
