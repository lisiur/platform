//
//  ReportStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Ledger reports: dashboard cards, trial balance, income statement, and
/// member turnover, all scoped to the active ledger and an optional date
/// window (from/to). The dashboard ignores the window (always month-to-date).
@MainActor
@Observable
final class ReportStore {
    let client = APIClient.shared

    private(set) var dashboard: Dashboard?
    private(set) var isLoadingDashboard = false

    private(set) var trialBalance: TrialBalance?
    private(set) var isLoadingTrialBalance = false

    private(set) var incomeStatement: IncomeStatement?
    private(set) var isLoadingStatement = false

    private(set) var memberTurnover: MemberTurnover?
    private(set) var isLoadingTurnover = false

    private(set) var ledgerId: String?

    var fromDate: Date? { didSet { scheduleWindowedReload() } }
    var toDate: Date? { didSet { scheduleWindowedReload() } }

    /// Coalesces preset commits (both bounds write back-to-back) into one
    /// windowed refresh instead of two overlapping ones.
    private var reloadTask: Task<Void, Never>?

    private func scheduleWindowedReload() {
        reloadTask?.cancel()
        reloadTask = Task {
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            await reloadWindowed()
        }
    }

    func load(ledgerId: String) async {
        let ledgerChanged = self.ledgerId != ledgerId
        self.ledgerId = ledgerId
        async let dash: () = loadDashboard()
        if ledgerChanged {
            async let trial: () = loadTrialBalance()
            async let statement: () = loadIncomeStatement()
            async let turnover: () = loadMemberTurnover()
            _ = await (dash, trial, statement, turnover)
        } else {
            await dash
        }
    }

    func reloadWindowed() async {
        guard ledgerId != nil else { return }
        async let trial: () = loadTrialBalance()
        async let statement: () = loadIncomeStatement()
        async let turnover: () = loadMemberTurnover()
        _ = await (trial, statement, turnover)
    }

    /// Refreshes every surface a posting can change: the dashboard cards
    /// (always month-to-date) and the windowed reports.
    func refreshAfterPosting() async {
        async let dash: () = loadDashboard()
        async let windowed: () = reloadWindowed()
        _ = await (dash, windowed)
    }

    func loadDashboard() async {
        guard let ledgerId else { return }
        isLoadingDashboard = true
        defer { isLoadingDashboard = false }
        do {
            dashboard = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/reports/dashboard"
            )
        } catch {
            // Keep whatever was loaded; the retry button reloads.
        }
    }

    func loadTrialBalance() async {
        guard let ledgerId else { return }
        isLoadingTrialBalance = true
        defer { isLoadingTrialBalance = false }
        do {
            let query = ApiQuery.build([
                ("to", toDate.map { ApiQuery.iso(UTCDates.endOfUTCDay($0)) }),
            ])
            trialBalance = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/reports/trial-balance\(query)"
            )
        } catch {
            trialBalance = nil
        }
    }

    func loadIncomeStatement() async {
        guard let ledgerId else { return }
        isLoadingStatement = true
        defer { isLoadingStatement = false }
        do {
            let query = ApiQuery.build([
                ("from", fromDate.map { ApiQuery.iso(UTCDates.startOfUTCDay($0)) }),
                ("to", toDate.map { ApiQuery.iso(UTCDates.endOfUTCDay($0)) }),
            ])
            incomeStatement = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/reports/income-statement\(query)"
            )
        } catch {
            incomeStatement = nil
        }
    }

    func loadMemberTurnover() async {
        guard let ledgerId else { return }
        isLoadingTurnover = true
        defer { isLoadingTurnover = false }
        do {
            let query = ApiQuery.build([
                ("from", fromDate.map { ApiQuery.iso(UTCDates.startOfUTCDay($0)) }),
                ("to", toDate.map { ApiQuery.iso(UTCDates.endOfUTCDay($0)) }),
            ])
            memberTurnover = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/reports/member-turnover\(query)"
            )
        } catch {
            memberTurnover = nil
        }
    }
}
