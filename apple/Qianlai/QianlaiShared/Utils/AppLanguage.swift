//
//  AppLanguage.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation

/// The in-app language override from `LocaleSettings`, resolved to the
/// matching `.lproj` bundle.
///
/// SwiftUI `Text` literals re-resolve through `\.locale`; plain
/// `String(localized:)` does not — it follows the device language. Route
/// programmatic lookups through `L10n.string` so both halves honor the
/// in-app setting.
/// Nonisolated — every member is UserDefaults/bundle lookup only, safe from
/// the widget's nonisolated query contexts; the one `LocaleSettings` touch
/// stays MainActor.
nonisolated enum AppLanguage {
    private static let lock = NSLock()
    /// Plain static storage would fail Swift 6 concurrency checks; every
    /// access is inside `overrideBundle`'s `lock` section.
    nonisolated(unsafe) private static var bundleCache: [String: Bundle] = [:]

    /// The locale matching the stored override, `.autoupdatingCurrent` when
    /// following system. Formatters and calendars must use this instead of
    /// the raw device locale, or their output ignores the in-app language.
    /// Delegates to the observable `LocaleSettings` so tracking still works;
    /// MainActor because `LocaleSettings` is.
    @MainActor
    static var preferredLocale: Locale {
        LocaleSettings.shared.preferredLocale
    }

    /// The stored language override: the process's standard defaults first
    /// (launch arguments included), then the shared App Group suite the app
    /// mirrors the setting into for the widget extension — whose standard
    /// defaults are empty.
    static var storedIdentifier: String? {
        if let stored = UserDefaults.standard.string(forKey: LocaleSettings.storageKey) {
            return stored
        }
        return WidgetAppGroup.defaults?.string(forKey: LocaleSettings.storageKey)
    }

    /// The override bundle for the stored identifier, or nil when following
    /// the system language.
    static var overrideBundle: Bundle? {
        let identifier = storedIdentifier ?? ""
        guard LocaleSettings.supportedIdentifiers.contains(identifier),
              identifier != LocaleSettings.systemIdentifier
        else { return nil }
        lock.lock()
        defer { lock.unlock() }
        if let cached = bundleCache[identifier] { return cached }
        guard let path = Bundle.main.path(forResource: identifier, ofType: "lproj"),
              let bundle = Bundle(path: path)
        else { return nil }
        bundleCache[identifier] = bundle
        return bundle
    }

    /// The stored override as a `Locale`, `.autoupdatingCurrent` when
    /// following system. Unlike `preferredLocale` this never touches the
    /// `LocaleSettings` instance, so it works in the widget process too.
    static var resolvedLocale: Locale {
        let identifier = storedIdentifier ?? LocaleSettings.systemIdentifier
        guard LocaleSettings.supportedIdentifiers.contains(identifier),
              identifier != LocaleSettings.systemIdentifier
        else { return .autoupdatingCurrent }
        return Locale(identifier: identifier)
    }
}

/// Localized-string lookup that honors the in-app language override.
/// Nonisolated — pure bundle resolution, callable from any isolation.
nonisolated enum L10n {
    /// Resolve `key` through the override bundle; otherwise through
    /// `Bundle.main` (device language), falling back to `defaultValue`.
    /// Pass printf-style placeholders in `defaultValue` and the values as
    /// `arguments` for interpolated strings.
    static func string(
        _ key: String,
        defaultValue: String,
        _ arguments: CVarArg...
    ) -> String {
        resolve(key, defaultValue: defaultValue, arguments)
    }

    /// A (key, defaultValue) pair kept together so branched copy can't
    /// drift between its catalog key and its fallback.
    struct Entry {
        let key: String
        let defaultValue: String

        init(_ key: String, _ defaultValue: String) {
            self.key = key
            self.defaultValue = defaultValue
        }
    }

    /// Resolve a branched entry, forwarding optional printf arguments.
    static func string(_ entry: Entry, _ arguments: CVarArg...) -> String {
        resolve(entry.key, defaultValue: entry.defaultValue, arguments)
    }

    private static func resolve(
        _ key: String,
        defaultValue: String,
        _ arguments: [CVarArg]
    ) -> String {
        let bundle = AppLanguage.overrideBundle ?? .main
        let format = bundle.localizedString(forKey: key, value: defaultValue, table: nil)
        guard !arguments.isEmpty else { return format }
        return String(format: format, locale: nil, arguments: arguments)
    }
}
