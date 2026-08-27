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

    static let systemIdentifier = "system"
    static let supportedIdentifiers: [String] = [
        systemIdentifier,
        "en",
        "zh-Hans",
    ]

    static let storageKey = "app.preferredLocale"

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
