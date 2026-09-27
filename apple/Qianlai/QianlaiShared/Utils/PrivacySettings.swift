//
//  PrivacySettings.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/26.
//

import Foundation
import Observation

/// Privacy-mode switches, stored on this device only — nothing syncs to
/// the server.
///
/// `hideAmounts` mirrors into the shared App Group suite because the mask
/// is applied inside `Money.format` (see `AmountPrivacy`), and the widget
/// renders through that same code from its own process, whose standard
/// defaults are empty. App lock stays in the standard suite: it gates the
/// app process, and the widget has nothing to lock.
@MainActor @Observable
final class PrivacySettings {
    nonisolated static let hideAmountsKey = "app.privacy.hideAmounts"
    nonisolated static let appLockKey = "app.privacy.appLock"

    private(set) var hideAmounts: Bool
    private(set) var appLockEnabled: Bool

    init(defaults: UserDefaults = .standard) {
        // hideAmounts deliberately seeds from the process-global
        // `AmountPrivacy` (standard + App Group + screenshot flag) — the
        // exact source `Money.format` consults — so the settings toggle
        // and the formatter can never disagree, and the widget process
        // (whose standard defaults are empty) lands on the same value.
        // The injected defaults therefore only backs `appLockEnabled`,
        // which no other process reads.
        hideAmounts = AmountPrivacy.isHidden
        appLockEnabled = defaults.bool(forKey: Self.appLockKey)
    }

    func setHideAmounts(_ enabled: Bool) {
        guard enabled != hideAmounts else { return }
        hideAmounts = enabled
        // Write both suites like AccentSettings: the app reads the standard
        // one, the widget process can only see the App Group.
        UserDefaults.standard.set(enabled, forKey: Self.hideAmountsKey)
        WidgetAppGroup.defaults?.set(enabled, forKey: Self.hideAmountsKey)
    }

    func setAppLockEnabled(_ enabled: Bool) {
        guard enabled != appLockEnabled else { return }
        appLockEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: Self.appLockKey)
    }
}

/// The mask check every amount formatter consults, callable from any
/// isolation and either process (app + widget). The per-call defaults read
/// stays cheap — UserDefaults caches in process, and formatting itself
/// already builds a NumberFormatter per call.
nonisolated enum AmountPrivacy {
    /// The mask body every masked surface shares: `Money.format` composes
    /// "¥***" around the currency symbol; the two deliberate formatter
    /// bypasses (calendar cells, chart axis labels) emit it bare.
    nonisolated static let mask = "***"

    static var isHidden: Bool {
        UserDefaults.standard.bool(forKey: PrivacySettings.hideAmountsKey)
            || WidgetAppGroup.defaults?.bool(forKey: PrivacySettings.hideAmountsKey) == true
            // Screenshot harness (`--privacy-hide-amounts`): force the mask
            // for one launch without touching the stored switch. Never set
            // in the widget process — system-launched, empty arguments.
            || ProcessInfo.processInfo.arguments.contains("--privacy-hide-amounts")
    }
}
