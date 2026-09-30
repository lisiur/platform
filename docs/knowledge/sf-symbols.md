# SF Symbol 技法

## variableValue（可变占比渲染）

- `variableValue` 单独设置在符号上**静默无效**（图不变化、无报错）：必须配 `.symbolRenderingMode` 之外的 `.symbolVariableValueMode(.draw)`（iOS 18+）。
- AppKit 没有该配置——验证这类行为要起 SwiftUI 临时 target，不能在 AppKit 单测闭环。

## 符号宽度测量（macOS 一行搞定，无需模拟器）

```swift
let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)!
    .withSymbolConfiguration(.init(textStyle: .caption2))!
image.size   // 该 textStyle 下的固有宽度
```

用途：固定图标列宽以**最宽符号**定 `@ScaledMetric(relativeTo: .caption2)`（实测 `.caption2` 下 `person.2` = 16pt，比看起来宽的 `mappin.and.ellipse` 更宽）——**不要凭观感判断宽窄**，以测量为准。
