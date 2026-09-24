//
//  RecognitionBudgetStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/23.
//

import Foundation
import Observation

/// The vision-input budget of the model the recognition agent resolves to,
/// fetched from `GET bookkeeping/recognition/config` and mirrored into
/// UserDefaults. The mirror exists for the same reason PreferenceStore's
/// does: the recognize cover can present and a pick can land before any
/// fetch returns, so the last-known budget — or `.shipped` on a fresh
/// install — tiles instead of whatever a mid-flight request would say. A
/// failed fetch keeps the current value: the fetch only corrects, it never
/// resets (the server's guard layer still catches anything the stale
/// budget lets through).
@MainActor
@Observable
final class RecognitionBudgetStore {
    let client = APIClient.shared

    private static let cachedBudgetKey = "qianlai.recognition.budget"

    private let defaults: UserDefaults

    private(set) var budget: RecognitionBudget

    private(set) var isLoading = false

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        // Seed before the first render; the mirror decode is tolerant —
        // absent or undecodable data falls back to `.shipped`.
        self.budget = Self.readCachedBudget(in: defaults) ?? .shipped
    }

    /// Fetch-once per presentation. Silent failure: the mirrored (or
    /// shipped) budget keeps recognition working offline; the next
    /// presentation retries.
    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        guard let response: RecognitionConfigResponse = try? await client.request(
            "GET", "bookkeeping/recognition/config"
        ) else {
            return
        }
        apply(response)
    }

    /// Maps the payload onto state and mirrors it. Internal so tests
    /// exercise the mapping without network.
    func apply(_ response: RecognitionConfigResponse) {
        guard let decoded = RecognitionBudget(response: response) else { return }
        budget = decoded
        if let data = try? JSONEncoder().encode(decoded) {
            defaults.set(data, forKey: Self.cachedBudgetKey)
        }
    }

    private static func readCachedBudget(in defaults: UserDefaults) -> RecognitionBudget? {
        guard let data = defaults.data(forKey: cachedBudgetKey) else { return nil }
        return try? JSONDecoder().decode(RecognitionBudget.self, from: data)
    }
}
