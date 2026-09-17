//
//  RimSettings.swift
//  Qianlai
//

import SwiftUI

/// 边框高光 (border highlight) strength for the self-drawn glass-rim
/// surfaces — the calculator's display and keys, the stat cards, the
/// budget card. One value drives every rim so the effect reads as one
/// material across the app. Zero turns it off. Stored on this device
/// only; changes take effect immediately.
@MainActor @Observable
final class RimSettings {
    static let key = "app.rim.intensity"
    /// 0 (off) … 0.3; 0.13 is the calibrated default (the calculator's
    /// shipped look).
    static let intensityRange: ClosedRange<Double> = 0...0.3
    static let defaultIntensity = 0.13

    private(set) var intensity: Double

    init() {
        let stored = UserDefaults.standard.object(forKey: Self.key) as? Double
        intensity = stored.map { min(max($0, Self.intensityRange.lowerBound), Self.intensityRange.upperBound) }
            ?? Self.defaultIntensity
    }

    func setIntensity(_ intensity: Double) {
        self.intensity = min(max(intensity, Self.intensityRange.lowerBound), Self.intensityRange.upperBound)
        UserDefaults.standard.set(self.intensity, forKey: Self.key)
    }
}
