//
//  LocaleSettings.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

@MainActor
@Observable
final class LocaleSettings {
    static let shared = LocaleSettings()

    // Immutable constants, readable from nonisolated contexts (the widget's
    // `AppLanguage` resolution runs off the main actor).
    nonisolated static let systemIdentifier = "system"
    nonisolated static let supportedIdentifiers: [String] = [
        systemIdentifier,
        "en",
        "zh-Hans",
    ]

    nonisolated static let storageKey = "app.preferredLocale"

    private(set) var identifier: String

    init() {
        let stored = UserDefaults.standard.string(forKey: Self.storageKey)
        self.identifier = Self.supportedIdentifiers.contains(stored ?? "")
            ? stored!
            : Self.systemIdentifier
    }

    func set(identifier: String) {
        guard Self.supportedIdentifiers.contains(identifier) else { return }
        guard identifier != self.identifier else { return }
        self.identifier = identifier
        UserDefaults.standard.set(identifier, forKey: Self.storageKey)
        // Mirror into the shared suite so the widget extension (whose own
        // standard defaults are empty) renders in the chosen language too.
        WidgetAppGroup.defaults?.set(identifier, forKey: Self.storageKey)
    }

    /// The locale matching `identifier`, `.autoupdatingCurrent` when
    /// following system. Reading this in the scene content keeps the
    /// Observation dependency on `identifier`, so an in-app language switch
    /// re-injects `\.locale` without a relaunch.
    var preferredLocale: Locale {
        switch identifier {
        case Self.systemIdentifier: .autoupdatingCurrent
        default: Locale(identifier: identifier)
        }
    }
}
