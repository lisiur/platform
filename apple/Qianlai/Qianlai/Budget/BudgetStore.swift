//
//  BudgetStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/15.
//

import Foundation
import Observation

/// The ledger budget's settings for ONE year — the year's monthly amount,
/// its single-month pins, and the excluded categories. The settings page
/// edits the current year (no year switcher). The dashboard's numbers live
/// on ReportStore; every write here returns the fresh settings (no reload
/// round-trip).
@MainActor
@Observable
final class BudgetStore {
    let client = APIClient.shared

    init() {
        #if DEBUG
        // Screenshot harness (`--ui-demo-budget-settings`): pre-seed
        // settings so the settings page renders amounts, a pinned month,
        // and an exclusion count offline (`load` is flag-guarded too — a
        // failed fetch would wipe this seed with `try?`).
        if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-budget-settings") {
            settings = BudgetSettings(
                year: YearMonth.current.year,
                cents: 300_000,
                carryOverCents: nil,
                months: [BudgetMonthOverride(month: 9, cents: 500_000)],
                excludedAccountIds: ["demo-dining", "demo-taxi"]
            )
        }
        #endif
    }

    private(set) var settings: BudgetSettings?
    private(set) var isLoading = false

    func load(ledgerId: String, year: Int) async {
        #if DEBUG
        // Screenshot harness: keep the seeded settings — the demo has no
        // backend, and this method's `try?` would wipe the seed on failure.
        if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-budget-settings") { return }
        #endif
        isLoading = true
        defer { isLoading = false }
        let query = ApiQuery.build([("year", String(year))])
        settings = try? await client.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/budget\(query)"
        )
    }

    /// Sets (or re-sets) the year's monthly budget.
    @discardableResult
    func setYear(ledgerId: String, year: Int, cents: Int) async throws -> BudgetSettings {
        let saved: BudgetSettings = try await client.request(
            "PUT",
            "bookkeeping/ledgers/\(ledgerId)/budget",
            body: SetYearBudgetBody(year: year, cents: cents)
        )
        settings = saved
        return saved
    }

    /// Pins a single month to its own amount (upsert; the year budget must
    /// exist — the settings page disables the section until it does).
    @discardableResult
    func setMonth(ledgerId: String, year: Int, month: Int, cents: Int) async throws -> BudgetSettings {
        let saved: BudgetSettings = try await client.request(
            "PUT",
            "bookkeeping/ledgers/\(ledgerId)/budget/month",
            body: SetMonthBudgetBody(year: year, month: month, cents: cents)
        )
        settings = saved
        return saved
    }

    /// Replaces the budget-excluded category list. Year-independent — the
    /// year query only shapes the settings payload the write returns.
    @discardableResult
    func setExcludedCategories(ledgerId: String, year: Int, accountIds: [String]) async throws -> BudgetSettings {
        let query = ApiQuery.build([("year", String(year))])
        let saved: BudgetSettings = try await client.request(
            "PUT",
            "bookkeeping/ledgers/\(ledgerId)/budget/excluded-categories\(query)",
            body: SetExcludedCategoriesBody(excludedAccountIds: accountIds)
        )
        settings = saved
        return saved
    }

    /// Closes the year — the only deletion. The year row and every
    /// single-month pin disappear; the card hides until a budget is set
    /// again.
    @discardableResult
    func closeYear(ledgerId: String, year: Int) async throws -> BudgetSettings {
        let query = ApiQuery.build([("year", String(year))])
        let saved: BudgetSettings = try await client.request(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/budget\(query)"
        )
        settings = saved
        return saved
    }
}
