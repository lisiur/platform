//
//  AccentSettings.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/10.
//

import SwiftUI

/// The app accent color, stored on this device only and mirrored into the
/// shared suite for the widget (whose own standard defaults are empty).
/// Applied via `.tint` at the window root, so every `Color.accentColor`
/// in the hierarchy follows without a relaunch. Defaults to red.
@MainActor @Observable
final class AccentSettings {
    nonisolated static let storageKey = "app.accent"

    private(set) var accent: AppAccent

    init() {
        accent = AppAccent.stored()
    }

    func set(_ accent: AppAccent) {
        guard accent != self.accent else { return }
        self.accent = accent
        UserDefaults.standard.set(accent.rawValue, forKey: Self.storageKey)
        // Mirror into the shared suite so the widget renders the same
        // accent on its next refresh.
        WidgetAppGroup.defaults?.set(accent.rawValue, forKey: Self.storageKey)
    }
}

/// The preset system colors offered as the accent. Nonisolated — the
/// widget's render context resolves the stored choice off the main actor.
nonisolated enum AppAccent: String, CaseIterable, Sendable {
    case red, orange, yellow, green, mint, teal, cyan, blue, indigo, purple, pink, brown

    static let fallback: AppAccent = .red

    /// VoiceOver label for the theme page's swatch row.
    var label: String {
        L10n.string("profile.theme.accent.\(rawValue)", defaultValue: labelDefault)
    }

    private var labelDefault: String {
        rawValue.capitalized
    }

    var color: Color {
        switch self {
        case .red: .red
        case .orange: .orange
        case .yellow: .yellow
        case .green: .green
        case .mint: .mint
        case .teal: .teal
        case .cyan: .cyan
        case .blue: .blue
        case .indigo: .indigo
        case .purple: .purple
        case .pink: .pink
        case .brown: .brown
        }
    }

    /// The stored choice: the process's standard defaults first (the app
    /// writes both), then the shared App Group suite the widget reads.
    static func stored() -> AppAccent {
        let raw = UserDefaults.standard.string(forKey: AccentSettings.storageKey)
            ?? WidgetAppGroup.defaults?.string(forKey: AccentSettings.storageKey)
        return raw.flatMap(AppAccent.init(rawValue:)) ?? fallback
    }
}
