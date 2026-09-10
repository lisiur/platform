//
//  AppearanceSettings.swift
//  Qianlai
//

import SwiftUI

/// In-app appearance override: light, dark, or follow the system. Applied
/// via `preferredColorScheme` at the window root; stored on this device
/// only.
@MainActor @Observable
final class AppearanceSettings {
    private static let key = "app.appearance"

    private(set) var appearance: AppAppearance

    init() {
        appearance = AppAppearance(
            rawValue: UserDefaults.standard.string(forKey: Self.key) ?? ""
        ) ?? .system
    }

    func setAppearance(_ appearance: AppAppearance) {
        self.appearance = appearance
        UserDefaults.standard.set(appearance.rawValue, forKey: Self.key)
    }
}

enum AppAppearance: String, CaseIterable {
    case system
    case light
    case dark

    /// nil follows the system.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    var label: String {
        switch self {
        case .system:
            L10n.string(
                "profile.theme.appearance.system",
                defaultValue: "Follow System"
            )
        case .light:
            L10n.string(
                "profile.theme.appearance.light",
                defaultValue: "Light"
            )
        case .dark:
            L10n.string(
                "profile.theme.appearance.dark",
                defaultValue: "Dark"
            )
        }
    }
}
