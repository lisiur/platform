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
}
