# iOS Widget for Qianlai — Implementation Plan

**Decisions taken (recommended defaults; adjust anytime):** one widget in small/medium/large sizes; **live fetch** (widget calls the dashboard API itself, with an offline snapshot fallback); widget **follows the app's active ledger**; iOS-only target (covers iPhone + iPad; macOS/visionOS unaffected).

Key facts this builds on: `GET bookkeeping/ledgers/{id}/reports/dashboard` already returns the exact widget payload (netWorth, assets/liabilities, month income/expense/net, `recentEntries`). No App Group or keychain access group exists today; the session token is Keychain `ThisDeviceOnly` under service `top.hapaul.qianlai.auth`. Project uses Xcode 26 synchronized folders (objectVersion 77), deployment target 26.5, bundle id `top.hapaul.qianlai`, team `V45ATZDSXQ`.

---

## 1. Create `QianlaiShared/` synchronized folder (sources both targets compile)

New sibling folder `apple/Qianlai/QianlaiShared/`; `git mv` the Foundation-only, widget-relevant files into it:

- `Bookkeeping/BookkeepingModels.swift` (pure Codable models, already uses `L10n`)
- `Shared/API/APIClient.swift`, `APIConfig.swift`, `APIError.swift`, `KeychainStore.swift`
- `Shared/Utils/Money.swift` (`Money` + `AppDates`, all `nonisolated`), `AppLanguage.swift`, `LocaleSettings.swift`
- `Localizable.xcstrings` (as a resource it lands in both targets' bundles automatically)

Register one new `PBXFileSystemSynchronizedRootGroup` in `project.pbxproj` and add it to the **app target's** `fileSystemSynchronizedGroups` (same-module move → zero app-side code changes).

Small tweaks in moved files (widget process has no access to the app's `UserDefaults.standard`):

- `APIConfig`: base-URL dev override (`api.baseURL`) reads `standard` first, then the shared suite.
- `AppLanguage`: language-override key likewise falls back to the shared suite.
- `KeychainStore`: optional `accessGroup` parameter on read/write (`kSecAttrAccessGroup`), keeping current behavior when nil.

## 2. Entitlements + session-token sharing

- App Group **`group.top.hapaul.qianlai`** and `keychain-access-groups` = `$(AppIdentifierPrefix)top.hapaul.qianlai.shared` added to `Qianlai.iOS.entitlements`.
- New `QianlaiWidget/QianlaiWidget.entitlements` with the same two entries (no Sign in with Apple).
- `AuthManager`: when the session token is written/restored, rewrite the Keychain item with the access group (delete+add is already how `KeychainStore.write` works — idempotent migration on launch); on logout, clear the shared container and `WidgetCenter.shared.reloadAllTimelines()`.

## 3. Add the `QianlaiWidget` target (hand-edit `project.pbxproj`)

- New native target, product type `com.apple.product-type.app-extension`; its `fileSystemSynchronizedGroups` = the new `QianlaiWidget/` folder **plus** `QianlaiShared/` (the same group object may appear in multiple targets).
- Build configs (Debug/Release) mirroring the app: deployment target 26.5, `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, `SWIFT_APPROACHABLE_CONCURRENCY = YES`, `APPLICATION_EXTENSION_API_ONLY = YES`, bundle id **`top.hapaul.qianlai.widget`**, `TARGETED_DEVICE_FAMILY = 1`, platforms iphoneos/iphonesimulator only, `GENERATE_INFOPLIST_FILE = YES` with `INFOPLIST_KEY_NSExtension_NSExtensionPointIdentifier = com.apple.widgetkit-extension` and display name 钱来.
- `PBXContainerItemProxy` + `PBXTargetDependency` on the app; **Embed App Extensions** CopyFiles phase (dstSubfolderSpec 13) with `platformFilter = ios` on the build-file entry so macOS/visionOS builds don't try to embed an iOS appex.
- Minimal `QianlaiWidget/Assets.xcassets` containing the app's `AccentColor` colorset copied verbatim (widgets must ship their own accent — respects the "accent color, not kind tints" rule).

## 4. Widget data layer (shared file `QianlaiShared/WidgetData.swift`)

- `WidgetSnapshot: Codable` — ledger id/name/currency, netWorth/assets/liabilities, month totalIncome/totalExpense/net + month label, top 5 recent entries, `generatedAt`.
- `WidgetDataStore` — stateless enum in the `RecentCategoryStore` style (injectable `UserDefaults = UserDefaults(suiteName: "group.top.hapaul.qianlai")`): active-ledger-id mirror, last-good snapshot cache.
- App-side hooks (one line each): `ReportStore` after a successful dashboard load → write snapshot + reload timelines; `LedgerStore.setActive` → mirror id + reload; `LocaleSettings` change → reload (language mirror is read live from the shared suite).

## 5. Widget UI (`QianlaiWidget/`)

- `QianlaiWidgetBundle` (@main) + `SummaryWidget` with `StaticConfiguration`, families small/medium/large.
- `TimelineProvider`: resolve ledger (shared active id → default → first active, same fallback as `LedgerStore`), then `GET reports/dashboard` with `AppDates.monthWindow()`; build one entry with `.after` next local hour boundary. On failure or signed-out/guest-403: render the cached snapshot (marked as of-time) or a neutral "open 钱来 to sign in" placeholder timeline — never a crash/empty cell.
- Layout reuses app patterns: `Money.format(_:currency:)`, `AppDates` formatters, accent-colored numbers, container background, SF Symbols only. Small = month expense + net worth; medium = adds income/net row; large = adds recent-entry rows (one fact per line, entry-card conventions).
- Taps: small widget → `qianlai://quick-entry`; medium/large → `qianlai://dashboard` with a small plus `Link` → `qianlai://quick-entry`.
- L10n: new namespaced keys (`widget.monthExpense`, `widget.netWorth`, `widget.signInPrompt`, …) added to `Localizable.xcstrings` by targeted text insertion, en + zh-Hans.

## 6. App-side deep links

- Add `CFBundleURLTypes` (scheme `qianlai`) to `Qianlai/Info.plist` and reference that plist for iOS too (`INFOPLIST_FILE` merges with `GENERATE_INFOPLIST_FILE`; if the location-usage key duplicates an `INFOPLIST_KEY`, drop the redundant one).
- `QianlaiApp`: `.onOpenURL` routing — `quick-entry` presents `QuickEntryView` the same way the tab-bar pill does; `dashboard` selects the Dashboard tab.

## 7. Tests + verification

- `QianlaiTests/WidgetDataStoreTests.swift` (synchronized folder → just drop the file): snapshot encode/decode roundtrip, store read/write on an injected suite, ledger fallback ordering (explicit id → default → first).
- `xcodebuild build` + `xcodebuild test` for the Qianlai scheme on an iPhone 17 / iOS 26.5 simulator (per established practice; server never started — the widget hits the production API by default).
- L10n audit: grep widget code keys vs catalog diff (missing key = silently English).

## Risks / notes

- **pbxproj hand-editing** is the riskiest step; the QianlaiTests target is the in-repo template for synchronized groups, validated via `plutil -lint` + `xcodebuild -list` before building.
- **Signing**: simulator needs nothing; device/Archive builds will auto-register the App Group + keychain group via automatic signing — if you ever switch to manual profiles, both targets' profiles must be regenerated with the new capabilities.
- **Refresh budget**: hourly timeline + app-driven reloads after post/delete/ledger-switch/logout keep the widget fresh without burning WidgetKit's daily reload budget.
- **macOS/visionOS**: widget target is iOS-only; `platformFilter = ios` on the embed step keeps the other platforms exactly as they are today.
