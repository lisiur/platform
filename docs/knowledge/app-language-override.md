# 应用内语言切换方案（locale override）

有「app 内切语言（不重启）」功能时的完整方案。三条字符串链路的系统行为不同，方案的核心是**每条链路都显式接管**。实现在共享 target 的 `AppLanguage.swift` + `LocaleSettings.swift`，可整体移植。

## 三条链路的系统行为（方案动机）

| 链路 | 系统默认行为 | 方案要求 |
|---|---|---|
| SwiftUI `Text`（字符串字面量） | 跟随 `\.locale` 环境 | 环境注入 override locale |
| 程序化查找（`String(localized:)` / `NSLocalizedString`） | **跟设备语言，无视 `\.locale`** | 全部走 L10n 助手，从 override bundle 取串 |
| DateFormatter / .formatted / Calendar | 跟设备语言 | 显式传 override locale（见 [locale-formatting.md](locale-formatting.md)） |

任何一条没接管，那个面就静默跟着设备语言走。

## 存储层

- 选项 = `"system"`（跟随系统）+ 支持语言 identifier 列表；存 UserDefaults，非法存储值回落 `"system"`。
- **镜像进共享 suite**（App Group）：扩展/Widget 进程的 standard defaults 是空的——不镜像则扩展永远渲染设备语言。
- `@Observable` 的设置对象暴露 `preferredLocale`（`"system"` → `.autoupdatingCurrent`，否则 `Locale(identifier:)`）。

## Bundle 层

- `overrideBundle`：`Bundle.main.path(forResource: identifier, ofType: "lproj")` 构造对应 `.lproj` 子 Bundle，**缓存 + NSLock**（静态可变缓存过不了 Swift 6 检查，锁段内读写）。
- `"system"` 或非法值返回 nil → 回落 `Bundle.main`。

## 查找层：L10n 助手

```swift
L10n.string("key", defaultValue: "English copy", args…)   // printf 占位符
L10n.string(L10n.Entry("key", "English copy"))            // 分支文案成对携带
```

- `bundle.localizedString(forKey:value:table:)` —— value 传 defaultValue 兜底；插值走 `String(format:locale: nil, arguments:)`。
- **分支文案用 `(key, defaultValue)` 成对的 Entry**，key 与兜底串不会分别漂移。
- 助手 `nonisolated`（纯 bundle 解析），任意隔离可调，Widget 也能用。

## 注入层：无重启生效

场景根部 `.environment(\.locale, localeSettings.preferredLocale)`：读的是 `@Observable` 对象 → **Observation 依赖建在 identifier 上**，切换语言时环境重新注入，SwiftUI `Text` 自动重解析，不需要重启 app。

Widget 等 nonisolated 上下文不能碰 MainActor 设置对象 → 另给 `resolvedLocale`（纯 UserDefaults 读取 + `Locale` 构造）。

## 配套纪律

- **程序化字符串零散用 `String(localized:)` 是本方案最常见的破坏来源**：code review 将其视为禁用模式，一律 L10n 助手。
- 目录维护规则见 [l10n-xcstrings-sync.md](l10n-xcstrings-sync.md)；格式化的 locale 传递规则见 [locale-formatting.md](locale-formatting.md)。
