//
//  LocalRows.swift
//  Qianlai
//

import Foundation
import GRDB

/// The storage-layer row structs — one per `qianlai_*` table, mirroring
/// the v1 columns. GRDB's `Codable` records bridge them in and out with
/// the snake_case column strategy; domain mapping (to the API structs the
/// stores already speak) lives in the repositories, never here.
///
/// Timestamps are the `LocalValues` TEXT encoding; money is INTEGER cents;
/// Postgres arrays / Json columns are JSON TEXT stored and read whole.
/// `Equatable` backs the sync mapping round-trip tests (a decoded record
/// must equal its source row, field for field).

nonisolated struct LocalLedgerRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_ledger"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var ownerId: String
    var name: String
    var description: String?
    var currency: String
    var status: String
    var isDefault: Bool
    var lastEntryNo: Int
    var budgetExcludedAccountIds: String
    var createdAt: String
    var updatedAt: String

    func budgetExcludedAccountIdsList() -> [String] {
        LocalValues.stringArray(fromJSON: budgetExcludedAccountIds)
    }

    static func build(excludedAccountIds: [String] = []) -> String {
        LocalValues.jsonArray(excludedAccountIds)
    }
}

nonisolated struct LocalLedgerMemberRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_ledger_member"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var ledgerId: String
    var userId: String
    var role: String
    var createdAt: String
}

nonisolated struct LocalBookAccountRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_book_account"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var ledgerId: String
    var name: String?
    var code: String?
    var type: String
    var sortOrder: Int
    var parentId: String?
    var status: String
    var icon: String?
    var flags: String
    var meta: String?
    var realAccountId: String?
    var createdAt: String
    var updatedAt: String

    var flagsList: [String] { LocalValues.stringArray(fromJSON: flags) }

    static func build(flags: [String]?) -> String {
        LocalValues.jsonArray(flags ?? [])
    }
}

nonisolated struct LocalRealAccountRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_real_account"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var ownerId: String
    var name: String
    var type: String
    var status: String
    var icon: String?
    var meta: String?
    var createdAt: String
    var updatedAt: String
}

nonisolated struct LocalJournalEntryRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_journal_entry"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var ledgerId: String
    var entryNo: Int
    var date: String
    var dateDayKey: String
    var memo: String?
    var status: String
    var countsInLedger: Bool
    var guestCreated: Bool
    var excludedFromBudget: Bool
    var createdById: String?
    var paidById: String?
    var projectId: String?
    var address: String?
    var addressName: String?
    var latitude: Double?
    var longitude: Double?
    var merchant: String?
    var createdAt: String
}

nonisolated struct LocalJournalLineRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_journal_line"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var entryId: String
    var accountId: String
    var debitCents: Int
    var creditCents: Int
    var memo: String?
}

nonisolated struct LocalEntryParticipantRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_journal_entry_participant"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var entryId: String
    var userId: String
    var createdAt: String
}

nonisolated struct LocalProjectRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_project"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var ledgerId: String
    var name: String
    var description: String?
    var status: String
    var startDate: String?
    var endDate: String?
    var createdAt: String
    var updatedAt: String
}

nonisolated struct LocalProjectMemberRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_project_member"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var projectId: String
    var userId: String
    var createdAt: String
}

nonisolated struct LocalBudgetYearRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_ledger_budget_year"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var ledgerId: String
    var year: Int
    var cents: Int
}

nonisolated struct LocalBudgetMonthOverrideRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_ledger_budget_month_override"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var budgetYearId: String
    var month: Int
    var cents: Int
}

nonisolated struct LocalCategoryBudgetRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_ledger_category_budget_year"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var ledgerId: String
    var accountId: String
    var year: Int
    var cents: Int
}

nonisolated struct LocalPreferenceRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_user_preference"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var userId: String
    var scopeType: String
    var scopeId: String
    var data: String
    var createdAt: String
    var updatedAt: String
}
