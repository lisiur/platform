# 动作型底部 Tab（单击 / 长按，"加号胶囊"）

需求形态：底部 tab 栏追加一个**永不选中**的动作项——单击弹一个模态（如快速录入），长按（0.5s）弹另一个模态（如相机/识别）。

代码指针：根视图（Tab 定义与降级链）+ `Shared/UI/TabBarDelegateProxy.swift`（拦截与手势）。

## 1. 总体思路：假 Tab + UIKit 拦截

```swift
Tab(actionTab.label, systemImage: "plus", value: .action, role: pillRole) {
    Color.clear   // 拦截成功的前提下永不挂载
}
```

单击与长按都在 UIKit 层截走，选中项从未离开原 tab —— **不需要**「选中假 tab 后 park、关闭模态后 resync」编排（那套方案状态分叉多，已废弃）。

## 2. role 的版本分叉（尾随胶囊归属，实测）

尾随独立胶囊是系统保留位，归属随 OS 变：

- **iOS 26**：`role: .search` —— 唯一能占住尾随胶囊、与主胶囊分离的角色。
- **iOS 27**：系统不再给 search tab 配胶囊（即使只有两个 tab 也合并进主胶囊），改用 27 新增的 `role: .prominent` 保持分离（2026-09-16 在 27.0 GM runtime 探明）。

```swift
private var pillRole: TabRole {
    if #available(iOS 27.0, *) { return .prominent }
    return .search
}
```

两条红线：
- 该页**不要挂 `.searchable`**——26 上 search 角色的点击 morph 会 latch 到抽屉搜索并在 sheet 关闭后滞留。
- 假页内容 `Color.clear` 即可，但不要依赖它不被挂载（降级链仍可能短暂选中它）。

## 3. 单击拦截：UITabBarControllerDelegate 代理

`QuickAddTabBarProxy`（NSObject，同时实现 `UITabBarControllerDelegate` + `UIGestureRecognizerDelegate`）：

- **为什么在 UIKit 层**：SwiftUI selection binding 层「拒不掉」选中——与 iOS 26 search 角色激活机制对抗会让 bar 状态脱钩。真正能**拒绝**选中的只有 delegate 的两个决策点：
  - `tabBarController(_:shouldSelect:)`（旧式 VC 形态）——iOS 27 上会回调但返回 `false` 被忽略；
  - `tabBarController(_:shouldSelectTab:)`（UITab API 形态，iOS 18+）——**27 上真正生效的裁决点**。
- 两个都实现、都对动作项返回 `false` 并触发 `pillTapped`；其余全部转发给 SwiftUI 原装 delegate（`responds(to:)` + `forwardingTarget(for:)` 组成纯转发器）。
- 识别动作项：恒追加在 tab 列表**末尾**（`viewControllers?.last` / `tabs.last`）。
- 代理对象必须与屏幕同生命周期（`@State` 持有）——tab bar controller 长持它为 delegate。

## 4. 长按：胶囊级手势 + 触摸级抑制

长按手势**直接挂在胶囊视图上**（`PillHoldGestureRecognizer : UILongPressGestureRecognizer`，`minimumPressDuration = 0.5`），绝不放 bar 层：

- **找胶囊**（`pillCapsuleView(in:)`）：
  - pre-26：`UITabBarButton` 子视图（最后一个）；
  - iOS 26+ liquid glass bar **没有 UITabBarButton**：胶囊 = 主 Platter 右侧的直接子视图（`minX ≥ platterMaxX-1` 且宽 < bar 宽，取最左）。找不到 Platter 锚点 → 返回 nil、**什么都不装**：点击仍走 delegate 拦截，只有长按静默失效——宁可降级不可误触。
- **去重按视图本身判**：检查胶囊自身的 `gestureRecognizers` 是否已含该手势类型，**不要按记住的引用判**——布局重排可能 A→B→A 归还同一视图，引用判重会装上第二对手势（重复触觉、双触发）。
- **触摸级抑制**（`touchesBegan`）：touchdown 时递归遍历 bar 子树，把胶囊子树之外、自身之外的所有 recognizer `isEnabled = false`（26+ 液态玻璃 bar 在 item 子视图上也挂着选中 recognizer，必须递归）。否则原生连续选中 recognizer 会在按住期间 begin，把长按 commit 成 tab 切换，单击动作泄漏进长按。
  - 多指批次**合并**而非替换（第二根手指不能把第一批挤出恢复名单）；
  - **恢复必须下一 runloop**（`reset()` 里 `DispatchQueue.main.async`）：同步恢复让收尾触摸流漏回刚复活的 recognizer，抬手瞬间 commit 出一次多余的选中（探针实证）。
- **点按兜底**：胶囊上另挂 `UITapGestureRecognizer`（`require(toFail: hold)`），兜「原生 commit 路径未来失效」的 OS 版本；两者互斥，app 层回调幂等，双发无害。
- 长按 `began` 时打触觉反馈（medium）。
- **短抬 = 单击**：抑制激活时原生 commit 在抬手时照常触发（它不在可抑制名单内，探针实证），照常落入 delegate 拦截。

## 5. 安装通道：introspection

隐藏零尺寸 `UIView`（UIViewRepresentable）放进任一 tab 页，`didMoveToWindow/Superview` + `layoutSubviews` 反复尝试：沿 responder 链上溯找 `UITabBarController`，把 delegate 换成代理（原 delegate 存进 `original`）。**必须幂等且反复重装**——SwiftUI 会在 tab 结构更新时把自己的 delegate 装回去；链上找不到时再从 window 根 DFS 一次。

## 6. SwiftUI 侧降级链（防御纵深）

selection binding 是拦截失效时的兜底：

- setter：值等于动作 tab → 触发单击动作且**绝不写入选中**；getter 恒校验选中是否在可见 tab 集合内，非法回落首页——空白页不能困住用户。
- 动作有权限门（当前作用域可写才弹）：不满足时先尝试 load 再裁决（冷启动语义，见 [deep-link-cold-start.md](deep-link-cold-start.md)），落定后拒绝 → alert。
- **长按永不死路**：长按目的地有独立权限门，不满足时**回落单击动作**。

## 7. macOS：自绘底栏

macOS `TabView` 只渲染成顶部 toolbar → 自绘底部 `HStack` + Button 栏。长按用 `highPriorityGesture(LongPressGesture(0.5))`——高优手势赢得按住，快速抬手判失败、普通 Button 点击照发。**macOS 不适用 iOS 26 的 toolbar 合并规则**（见 [ios26-liquid-glass.md](ios26-liquid-glass.md)）。

## 8. 历史方案与废弃原因

- **park/resync 方案**：真选中假 tab + 关闭时 park、回来 resync —— 弹出/关闭/深链各一套编排，已被 UIKit 拦截整体取代。
- **bar 级识别器 + bar 全域 `require(toFail:)`**：每个 tab 按压都被加号长按挡住，按压高亮直到抬手判失败才亮（截屏实证）；iOS 27 上同链再加 20–30ms 抬手延迟。教训：**手势作用域必须缩到目标视图，绝不放大到容器级**。
- 验证保留离线 harness（真 ContentView + 跳过会话恢复），见 [simulator-ui-verification.md](simulator-ui-verification.md)。
