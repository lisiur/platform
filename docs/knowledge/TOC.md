# Knowledge Base · SwiftUI / iOS 开发模式与注意事项

> 从本仓库一个 SwiftUI 应用（iOS 26+ / macOS / Widget / Swift Charts）的开发实战中提炼，已做通用化：不绑定任何业务，只保留可迁移到其他 SwiftUI 项目的知识。
>
> 约定：文中的代码指针是仓库内 app target 的相对路径，供对照实现；结论均经过模拟器探针或截像素实证，标注「实测」的条目推翻过书面规则。

## 架构与状态

| 文件 | 一句话 |
|---|---|
| [architecture-state-management.md](architecture-state-management.md) | @Observable store + environment 的装配模式；@State 默认值 + init 重赋值陷阱；状态所有权与重挂载边界 |
| [snapshot-cache-offline.md](snapshot-cache-offline.md) | last-known-good 快照层：hydrate → fetch → persist，版本化 envelope，渲染种子不是数据源 |
| [global-format-choke-point.md](global-format-choke-point.md) | 数值格式化单咽喉点（格式规则 + 全局遮罩一处收口）；自拼符号必须传 abs |
| [locale-formatting.md](locale-formatting.md) | DateFormatter/.formatted 跟设备语言走；locale 显式传递；日期键与 Calendar 运算的时区/DST 规则 |
| [deep-link-cold-start.md](deep-link-cold-start.md) | 冷启动深链早于数据落定：空 ≠ 无，先 load 再裁决；绑定式深链不污染全局作用域 |

## 界面模式

| 文件 | 一句话 |
|---|---|
| [bottom-add-pill-tab.md](bottom-add-pill-tab.md) | 动作型底部 Tab（单击弹模态/长按弹第二动作）：假 Tab + UIKit delegate 拦截 + 胶囊级长按手势，含版本分叉与方案演进记录 |
| [list-swipe-actions.md](list-swipe-actions.md) | 侧滑菜单统一 allowsFullSwipe: false；删除按钮禁用 role: .destructive（UIKit 会直接播移除动画） |
| [row-tap-navigation-without-chevron.md](row-tap-navigation-without-chevron.md) | 整行可点但隐藏系统 chevron：透明 NavigationLink 背景方案 |
| [custom-background-image.md](custom-background-image.md) | 全局背景图（壁纸）：双磁盘槽 + 系统材质毛玻璃（非高斯）；沉底挂载（栈外 Tab 内）才做得到 push 时屏幕固定 |

## 图表

| 文件 | 一句话 |
|---|---|
| [charts-selection.md](charts-selection.md) | 选型：Swift Charts 画数据、Canvas/chartOverlay 接管排版、日历网格自绘；趋势 scrub/donut 命中的实现模式 |
| [swift-charts-caveats.md](swift-charts-caveats.md) | Swift Charts 注意事项：Plottable、AxisMarks 绑 value、轴标签不在视图树、band-center 锚点等 |

## 系统行为注意事项（经验证）

| 文件 | 一句话 |
|---|---|
| [navigation-caveats.md](navigation-caveats.md) | navigationDestination 懒容器/push-替换、task pop-back 重跑、嵌套标题覆盖、sheet remount、toast 宿主位置 |
| [list-scroll-caveats.md](list-scroll-caveats.md) | List 行高闪跳、拖拽重排同数组铁律、滚动锚定不对称、隐式 section 圆角、LazyVGrid 行高估计失真 |
| [ios26-liquid-glass.md](ios26-liquid-glass.md) | 液态玻璃 toolbar 合并/ToolbarSpacer、safeAreaBar、搜索框激活刷白改不了、Button 重着色、More 折叠 |
| [swift6-isolation.md](swift6-isolation.md) | 默认 MainActor 下的 nonisolated 迁移模式；编译器假错「failed to produce diagnostic」 |
| [sf-symbols.md](sf-symbols.md) | variableValue 需 .symbolVariableValueMode(.draw)；AppKit 一行量符号固有宽度定图标列 |

## 工程化

| 文件 | 一句话 |
|---|---|
| [app-language-override.md](app-language-override.md) | 应用内语言切换（不重启）：Text 字面量 / 程序化查找 / 格式化三条链路各自接管的做法 |
| [l10n-xcstrings-sync.md](l10n-xcstrings-sync.md) | xcstrings 目录同步全规则：缺 key 静默回英文、空桩、插值隐藏 key、定点插入、孤儿判定 |
| [simulator-ui-verification.md](simulator-ui-verification.md) | 模拟器 UI 验证链路：启动参数 hook + simctl 截图；瞬态动画须 app 内抓帧 |
| [server-contract-sync.md](server-contract-sync.md) | 端云契约同步点：能力枚举双白名单、筛选口径三处一致、服务端回显不读回等 |
