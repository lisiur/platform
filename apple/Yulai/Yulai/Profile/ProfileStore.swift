import Foundation
import Observation
import SwiftUI

struct UserCredit: Decodable {
    let id: String
    let userId: String
    let balance: Int
    let frozen: Int
}

struct CreditLedgerEntry: Decodable, Identifiable {
    let id: String
    let userId: String
    let type: String
    let amount: Int
    let balanceBefore: Int
    let balanceAfter: Int
    let frozenBefore: Int
    let frozenAfter: Int
    let referenceType: String?
    let referenceId: String?
    let description: String?
    let createdAt: Date
}

private struct RedeemBody: Encodable {
    let code: String
}

private struct RedeemResponse: Decodable {
    let credit: Int
    let balance: Int
}

private struct CreditLedgerResponse: Decodable {
    let entries: [CreditLedgerEntry]
    let total: Int
}

enum CreditLedgerFilter: String, CaseIterable, Identifiable {
    case all
    case redeem
    case aiUsage = "ai_usage"
    case seed

    var id: String { rawValue }

    var label: LocalizedStringResource {
        switch self {
        case .all:
            LocalizedStringResource(
                "All types",
                defaultValue: "All types",
                comment: "Credit ledger filter: all types"
            )
        case .redeem:
            LocalizedStringResource(
                "Redeem points",
                defaultValue: "Redeem points",
                comment: "Credit ledger filter: redeem entries"
            )
        case .aiUsage:
            LocalizedStringResource(
                "AI usage",
                defaultValue: "AI usage",
                comment: "Credit ledger filter: AI usage entries"
            )
        case .seed:
            LocalizedStringResource(
                "System credit",
                defaultValue: "System credit",
                comment: "Credit ledger filter: system-issued credit"
            )
        }
    }
}

enum CreditLedgerDateRange: String, CaseIterable, Identifiable {
    case last7Days
    case last30Days
    case last90Days
    case all

    var id: String { rawValue }

    var label: LocalizedStringResource {
        switch self {
        case .last7Days:
            LocalizedStringResource(
                "Last 7 days",
                defaultValue: "Last 7 days",
                comment: "Credit ledger date range: last 7 days"
            )
        case .last30Days:
            LocalizedStringResource(
                "Last 30 days",
                defaultValue: "Last 30 days",
                comment: "Credit ledger date range: last 30 days"
            )
        case .last90Days:
            LocalizedStringResource(
                "Last 90 days",
                defaultValue: "Last 90 days",
                comment: "Credit ledger date range: last 90 days"
            )
        case .all:
            LocalizedStringResource(
                "All time",
                defaultValue: "All time",
                comment: "Credit ledger date range: all time"
            )
        }
    }

    /// Inclusive lower bound of the window; nil means unbounded.
    var startDate: Date? {
        let days: Int?
        switch self {
        case .last7Days: days = 7
        case .last30Days: days = 30
        case .last90Days: days = 90
        case .all: days = nil
        }
        return days.flatMap {
            Calendar.current.date(byAdding: .day, value: -$0, to: Date.now)
        }
    }
}

@MainActor
@Observable
final class ProfileStore {
    let client = APIClient.shared

    private(set) var credit: UserCredit?
    private(set) var isLoadingCredit = false

    private(set) var isRedeeming = false
    var redeemError: String?

    private(set) var ledgerEntries: [CreditLedgerEntry] = []
    private(set) var ledgerTotal = 0
    private(set) var isLoadingLedger = false
    private(set) var ledgerError: String?
    private var isLoadingMoreLedger = false
    private let ledgerPageSize = 50

    var ledgerFilter: CreditLedgerFilter = .all {
        didSet { Task { await loadLedger() } }
    }

    var ledgerDateRange: CreditLedgerDateRange = .last7Days {
        didSet { Task { await loadLedger() } }
    }

    var hasMoreLedger: Bool {
        ledgerEntries.count < ledgerTotal
    }

    /// Query string for the ledger endpoint under the current filters.
    private func ledgerPath(offset: Int) -> String {
        var path = "redeem-codes/me/credit/ledger?limit=\(ledgerPageSize)&offset=\(offset)"
        if ledgerFilter != .all {
            path += "&type=\(ledgerFilter.rawValue)"
        }
        if let start = ledgerDateRange.startDate {
            path += "&from=\(start.formatted(.iso8601))"
        }
        return path
    }

    func loadCredit() async {
        isLoadingCredit = true
        defer { isLoadingCredit = false }
        do {
            credit = try await client.request("GET", "redeem-codes/me/credit") as UserCredit
        } catch {
            credit = nil
        }
    }

    /// Redeems a code. Returns the new balance on success.
    func redeem(code: String) async -> Int? {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            redeemError = "Please enter a redemption code."
            return nil
        }
        isRedeeming = true
        defer { isRedeeming = false }
        do {
            let response: RedeemResponse = try await client.request(
                "POST",
                "redeem-codes/redeem",
                body: RedeemBody(code: trimmed)
            )
            redeemError = nil
            await loadCredit()
            return response.balance
        } catch {
            redeemError = error.localizedDescription
            return nil
        }
    }

    /// Reloads the ledger from the first page. Existing entries are replaced.
    func loadLedger() async {
        isLoadingLedger = true
        defer { isLoadingLedger = false }
        do {
            let response: CreditLedgerResponse = try await client.request(
                "GET",
                ledgerPath(offset: 0)
            )
            ledgerEntries = response.entries
            ledgerTotal = response.total
            ledgerError = nil
        } catch {
            ledgerEntries = []
            ledgerTotal = 0
            ledgerError = "Failed to load credit history. Please try again."
        }
    }

    /// Appends the next page, if any.
    func loadMoreLedger() async {
        guard hasMoreLedger, !isLoadingLedger, !isLoadingMoreLedger else { return }
        isLoadingMoreLedger = true
        defer { isLoadingMoreLedger = false }
        do {
            let response: CreditLedgerResponse = try await client.request(
                "GET",
                ledgerPath(offset: ledgerEntries.count)
            )
            ledgerEntries += response.entries
            ledgerTotal = response.total
        } catch {
            // Keep the entries loaded so far; the next appearance retries.
        }
    }
}
