//
//  PinnedLanguage.swift
//  QianlaiTests
//

import Foundation
@testable import Qianlai

/// Test fixture pinning the in-app language override around a test class.
/// With no override stored, `L10n` falls through standard defaults to the
/// shared App Group mirror (which may hold a stale value from earlier app
/// runs on this simulator) to `Bundle.main` — the DEVICE language — so
/// en-expecting catalog assertions would flip on a zh-Hans test device.
/// `pin()` in setUp, `restore()` in tearDown.
enum PinnedLanguage {
    private static var savedStandard: String?
    private static var savedMirror: String?
    private static var pinned = false

    static func pin(to identifier: String = LocaleSettings.englishIdentifier) {
        precondition(!pinned, "unbalanced PinnedLanguage.pin()")
        savedStandard = UserDefaults.standard.string(forKey: LocaleSettings.storageKey)
        savedMirror = WidgetAppGroup.defaults?.string(forKey: LocaleSettings.storageKey)
        pinned = true
        UserDefaults.standard.set(identifier, forKey: LocaleSettings.storageKey)
        WidgetAppGroup.defaults?.set(identifier, forKey: LocaleSettings.storageKey)
    }

    static func restore() {
        guard pinned else { return }
        if let savedStandard {
            UserDefaults.standard.set(savedStandard, forKey: LocaleSettings.storageKey)
        } else {
            UserDefaults.standard.removeObject(forKey: LocaleSettings.storageKey)
        }
        if let savedMirror {
            WidgetAppGroup.defaults?.set(savedMirror, forKey: LocaleSettings.storageKey)
        } else {
            WidgetAppGroup.defaults?.removeObject(forKey: LocaleSettings.storageKey)
        }
        savedStandard = nil
        savedMirror = nil
        pinned = false
    }
}
