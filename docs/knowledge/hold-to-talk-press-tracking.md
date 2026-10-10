# 按住说话（hold-to-talk）：按压载体必须恒定不变

## 问题

按住开始、松开结束的交互，在 SwiftUI 里连换三种按压机制都在真机上丢「松开」事件：

- `LongPressGesture(minimumDuration:).sequenced(before: DragGesture(minimumDistance: 0))`：长按门限带来起录延迟；且按住完全不动时，序列里拖拽相位的收尾不可靠，`onEnded` 不触发。
- 裸 `DragGesture(minimumDistance: 0)`：触摸落下即 `onChanged` ✓，但回调里改状态导致**手势所挂视图的内容重建**时，手势节点被替换，**进行中手势的抬指事件丢失**。
- `ButtonStyle` 的 `onChange(of: configuration.isPressed)` 挂在 label 上——label 在按住期间重建（状态翻转让内容整体换分支）时同样丢。

共同症状：**松手不停，再点一次才停**——第二次触摸不引起内容变化，所以它的抬指能送达。这是识别此类 bug 的口诀。

## 方案：Button 标签做成空壳，动态内容全部 overlay

```swift
ZStack {
    Button {
        // tap action 留空——按压语义全走 style 回调；快速轻触由状态机守卫吸收
    } label: {
        CardShell { Color.clear }        // 恒定不变：按压缩听器生存期内永不重建
    }
    .buttonStyle(HoldToTalkStyle { pressed in
        pressed ? startTracking() : finishTracking()
    })
}
.overlay {
    CardShell {
        switch phase {                   // 转写文本/spinner 等全部动态视觉
        // ...
        }
    }
    .allowsHitTesting(false)             // 触摸全部落到底下的 Button
}
```

要点：

- **按压载体（被跟踪的视图）在按住期间零重建**是硬要求；动态视觉一律 overlay 化并关命中测试。`ButtonStyle(isPressed)` 本身不是银弹——它只是把按压识别交给系统管理，label 重建照样丢事件。
- 若结构稳定后仍丢事件，加事件探针（按下/松开/管线返回三个标记，`Text(verbatim:)` 上屏）分层定位；再往下就是 UIKit `UIButton`（TouchUpInside/TouchUpOutside/TouchCancel）。
- 实测（真机，2026-10-10）：稳定空壳结构下松开事件稳定送达；此前三版均在真机失败。
- a11y：Button 自带 button trait；补显式 accessibilityLabel/Hint 描述「按住说话」。

实现对照：`Journal/AIBookkeepingView.swift`（voiceCard）、`Journal/VoiceEntryModel.swift`（状态机：stage 触摸瞬间同步翻转、启动在途的松手挂起回收）。
