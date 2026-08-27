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
enum AppLanguage {
    private static let lock = NSLock()
    private static var bundleCache: [String: Bundle] = [:]

    /// The locale matching the stored override, `.autoupdatingCurrent` when
    /// following system. Formatters and calendars must use this instead of
    /// the raw device locale, or their output ignores the in-app language.
    /// Delegates to the observable `LocaleSettings` so tracking still works;
    /// MainActor because `LocaleSettings` is.
    @MainActor
    static var preferredLocale: Locale {
        LocaleSettings.shared.preferredLocale
    }

    /// The override bundle for the stored identifier, or nil when following
    /// the system language.
    static var overrideBundle: Bundle? {
        let identifier = UserDefaults.standard.string(forKey: LocaleSettings.storageKey) ?? ""
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
}

/// Localized-string lookup that honors the in-app language override.
enum L10n {
    /// Resolve `key` through the override bundle; otherwise through
    /// `Bundle.main` (device language), falling back to `defaultValue`.
    /// Pass printf-style placeholders in `defaultValue` and the values as
    /// `arguments` for interpolated strings.
    static func string(
        _ key: String,
        defaultValue: String,
        _ arguments: CVarArg...
    ) -> String {
        let bundle = AppLanguage.overrideBundle ?? .main
        let format = bundle.localizedString(forKey: key, value: defaultValue, table: nil)
        guard !arguments.isEmpty else { return format }
        return String(format: format, locale: nil, arguments: arguments)
    }
}
