# Swift Charts 注意事项（跨项目）

1. **String 原始值枚举作 x/y 值必须显式 `Plottable`**，否则编译期报错指向莫名位置。
2. **`AxisMarks` 闭包必须绑 `value`**（`if let number = value.as(Double.self)`）——不绑编译过但内容不渲染。
3. **轴标签/百分比显式 `locale`**：图表格式化不继承 app 内语言覆盖，跟设备语言走。
4. **自动日期刻度落在天边界**（band 左缘），标签悬在两柱之间——想居中就自绘或手动取 band-center（`date + 12h`，Calendar 加法）。
5. **框架轴标签不居中于刻度**（恒定前导偏移、随字宽变化）——需要像素级对齐时在 `chartOverlay` 接管绘制。
6. **轴标签不在视图树**：全局格式化函数 / 遮罩单点够不到 AxisMarks 标签与 Canvas 内容——这些面需内联第二检查点。
7. **unit-day BarMark 的视觉中心在正午**：一切叠加元素（线点、RuleMark、气泡、刻度）必须用同一 band-center 锚点，否则左偏半格（经实测确认：bar↔line 切换后错位）。
8. **点击手势不挂在 overlay**：overlay 里的可命中视图会进 hit-test 路径、抢占 scrub 手势的事件；tap 选择挂在图外一层用 `.simultaneousGesture`，靠 y 域判断落点。
9. **x→数据映射用带运算**（宽度分数 × 条目数），不用时间秒数——DST 日不偏移；写成纯函数可单测。
