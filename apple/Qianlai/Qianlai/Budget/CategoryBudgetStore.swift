//
//  CategoryBudgetStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import Foundation
import Observation

/// The ledger's per-category ANNUAL budgets for ONE year — each budgeted
/// category's whole-year amount, plus the previous year's amounts as the
/// settings form's prefill. Fully isolated from the year/month budget
/// (BudgetStore): neither implies the other. The settings page edits the
/// current year (no year switcher). The dashboard's numbers live on
/// ReportStore; every write here returns the fresh settings (no reload
/// round-trip).
@MainActor
@Observable
final class CategoryBudgetStore {
    let client = APIClient.shared

    private(set) var settings: CategoryBudgetSettings?
    private(set) var isLoading = false

    func load(ledgerId: String, year: Int) async {
        isLoading = true
        defer { isLoading = false }
        // Local branch (C3): the settings read from the on-device store.
        if LocalStoreGateway.shared.isLocal(ledgerId),
           let reportRepository = LocalStoreGateway.shared.reportRepository {
            settings = try? await reportRepository.categoryBudgetSettings(ledgerId: ledgerId, year: year)
            return
        }
        let query = ApiQuery.build([("year", String(year))])
        settings = try? await client.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/category-budgets\(query)"
        )
    }

    /// Pins (or re-pins) one category's whole-year amount.
    @discardableResult
    func upsert(ledgerId: String, year: Int, accountId: String, cents: Int) async throws -> CategoryBudgetSettings {
        if let write = LocalStoreGateway.shared.settingsWrite(for: ledgerId),
           let reportRepository = LocalStoreGateway.shared.reportRepository {
            try await write.upsertCategoryBudget(ledgerId: ledgerId, year: year, accountId: accountId, cents: cents)
            let saved = try await reportRepository.categoryBudgetSettings(ledgerId: ledgerId, year: year)
            settings = saved
            return saved
        }
        let saved: CategoryBudgetSettings = try await client.request(
            "PUT",
            "bookkeeping/ledgers/\(ledgerId)/category-budgets",
            body: UpsertCategoryBudgetBody(year: year, accountId: accountId, cents: cents)
        )
        settings = saved
        return saved
    }

    /// Removes one category's budget row (the settings page's
    /// swipe-to-delete). Idempotent server-side.
    @discardableResult
    func delete(ledgerId: String, year: Int, accountId: String) async throws -> CategoryBudgetSettings {
        if let write = LocalStoreGateway.shared.settingsWrite(for: ledgerId),
           let reportRepository = LocalStoreGateway.shared.reportRepository {
            try await write.deleteCategoryBudget(ledgerId: ledgerId, year: year, accountId: accountId)
            let saved = try await reportRepository.categoryBudgetSettings(ledgerId: ledgerId, year: year)
            settings = saved
            return saved
        }
        let query = ApiQuery.build([
            ("year", String(year)),
            ("accountId", accountId),
        ])
        let saved: CategoryBudgetSettings = try await client.request(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/category-budgets\(query)"
        )
        settings = saved
        return saved
    }
}
