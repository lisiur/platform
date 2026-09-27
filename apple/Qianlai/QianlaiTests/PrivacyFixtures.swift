//
//  PrivacyFixtures.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/27.
//

import Foundation
@testable import Qianlai

/// Test fixture clearing the keys the privacy-mode fixtures touch. The
/// amount-mask pair lives in the standard suite (app process) AND the
/// App Group mirror (widget process) — both persist across runs on this
/// simulator, so both sides clear. Call `clearAmountMaskKeys()` in setUp
/// and tearDown.
enum PrivacyFixtures {
    static func clearAmountMaskKeys() {
        UserDefaults.standard.removeObject(forKey: PrivacySettings.hideAmountsKey)
        WidgetAppGroup.defaults?.removeObject(forKey: PrivacySettings.hideAmountsKey)
    }
}
