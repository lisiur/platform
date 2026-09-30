# List 行侧滑菜单

## 基本形态

```swift
rowContent
    .swipeActions(edge: .trailing, allowsFullSwipe: false) { /* 删除/归档/离开 */ }
    .swipeActions(edge: .leading,  allowsFullSwipe: false) { /* 编辑/成员等中性动作 */ }
```

## 一律 `allowsFullSwipe: false`

full swipe 会在滑到位时**立即执行首个动作**，没有确认机会。删除、归档、移除等不可逆操作全部关掉 full swipe：动作只展开面板、等点按确认。视觉主次靠按钮顺序表达（首个声明最靠边缘）。

## 删除按钮禁用 `role: .destructive`（关键规则）

**适用前提：删除带二次确认**（点按钮 → 置 pending 状态 → 确认弹窗）。如果没有确认流、点按即删，`role: .destructive` 照常用——系统免费给红色样式和移除动画，是正解。

问题出在把两者组合：UIKit 对 destructive 的侧滑动作点按会**直接播放移除行动画**，而行此时还不该消失（确认弹窗还没答）——行先消失又弹回，观感是 bug。带确认流的写法 = 普通 Button + `.tint(.red)` 保住红色；行在确认后才由数据删除驱动消失。**红色靠 tint，移除动画靠数据，两者解耦。**

## 权限门

- 整组动作用权限条件包裹（如 `if canEdit { … }`）——无权限时连面板都不出现，而不是出现灰按钮。
- 分工惯例：trailing 放破坏性，leading 放中性；按角色/身份区分 trailing 内容（无权者只剩「离开」类动作）。
- 不可逆动作走「置 pending 状态 → 确认弹窗」流，不做即时副作用。

## 与 contextMenu 共享动作

长按菜单与侧滑面板是同一组动作的两张皮：动作构造器抽成命名方法，两处引用同一实现，权限门只写一遍。**不要在两处复制 onClick 实现。**

## 生效面检查

- 侧滑动作挂在**行内容本体**上；改行结构时确认 modifier 没留在被替换的容器上。
- 同一行组件被多个页面复用时，改一处全端生效——改前查全部挂载面。
