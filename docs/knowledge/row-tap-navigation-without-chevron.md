# 整行可点但无 chevron 的推入跳转

## 问题

系统给 `NavigationLink` 自加的 chevron **无官方隐藏 API**；List 里直接放 `NavigationLink` 就会带箭头，破坏卡片式行设计。

## 方案：透明链接挂背景

```swift
rowContent
    .background {
        NavigationLink {
            DestinationView(item: item)
        } label: {
            EmptyView()
        }
        .opacity(0)
        .accessibilityLabel(localized("…openDetails"))
    }
```

- 透明链接仍收点击 → **整行任意处可跳**，行内没有可交互控件冲突。
- 无 chevron。
- `swipeActions` / `onAppear` 等 modifier 挂在 `rowContent` 上（不是链接上），照常工作。
- a11y：给链接补一个显式 accessibilityLabel（「查看详情」类），VoiceOver 用户有可理解的激活动作。

## 配套注意事项

- `navigationDestination` 的注册位置规则见 [navigation-caveats.md](navigation-caveats.md)（懒容器行内注册会被忽略；下方页注册的 destination 被推页触发 = 替换中间页）。
- 该方案的推入动画与普通 NavigationLink 一致；若行内同时有 Button 等真控件，注意它们的点击会优先于整行跳转（正常期望）。
