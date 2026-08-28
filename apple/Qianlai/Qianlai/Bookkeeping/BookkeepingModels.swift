//
//  BookkeepingModels.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation

// MARK: - Roles & flags

enum LedgerRole: String, Codable, Hashable {
    case owner
    case editor
    case viewer

    /// Mirrors @repo/shared ROLE_RANK: owner 3 > editor 2 > viewer 1.
    var rank: Int {
        switch self {
        case .owner: 3
        case .editor: 2
        case .viewer: 1
        }
    }

    func atLeast(_ minimum: LedgerRole) -> Bool {
        rank >= minimum.rank
    }

    var label: String {
        switch self {
        case .owner: L10n.string("role.owner", defaultValue: "Owner")
        case .editor: L10n.string("role.editor", defaultValue: "Editor")
        case .viewer: L10n.string("role.viewer", defaultValue: "Viewer")
        }
    }
}

enum AccountFlags {
    static let builtin = "builtin"
    static let adjustmentOffset = "adjustmentOffset"
    static let defaultDebit = "defaultDebit"
    static let defaultCredit = "defaultCredit"

    static func contains(_ flags: [String]?, _ flag: String) -> Bool {
        flags?.contains(flag) ?? false
    }
}

enum AccountType: String, Codable, Hashable, CaseIterable {
    case asset
    case liability
    case equity
    case income
    case expense

    var label: String {
        switch self {
        case .asset: L10n.string("account.type.asset", defaultValue: "Asset")
        case .liability: L10n.string("account.type.liability", defaultValue: "Liability")
        case .equity: L10n.string("account.type.equity", defaultValue: "Equity")
        case .income: L10n.string("account.type.income", defaultValue: "Income")
        case .expense: L10n.string("account.type.expense", defaultValue: "Expense")
        }
    }
}

// MARK: - Ledger

struct QianlaiLedger: Codable, Identifiable, Hashable {
    let id: String
    let ownerId: String
    var name: String
    var description: String?
    var currency: String
    var status: String
    var isDefault: Bool
    var createdAt: Date
    var updatedAt: Date
    var myRole: LedgerRole
    var membersCount: Int
    var shared: Bool

    var isActive: Bool { status == "active" }
    var isArchived: Bool { status == "archived" }

    /// Editors and owners may post entries / manage accounts on active ledgers.
    var canPost: Bool { isActive && myRole.atLeast(.editor) }
}

// MARK: - Accounts

/// Arbitrary JSON value, for the free-form `meta` maps on accounts.
enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    /// Renders the value as editable text — objects/arrays compact to JSON.
    var editableString: String {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            return value == value.rounded() && abs(value) < 1e15
                ? String(format: "%.0f", value)
                : String(value)
        case .bool(let value):
            return value ? "true" : "false"
        case .null:
            return ""
        case .array, .object:
            guard let data = try? JSONEncoder().encode(self) else { return "" }
            return String(data: data, encoding: .utf8) ?? ""
        }
    }
}

struct BookAccount: Codable, Identifiable, Hashable {
    let id: String
    let ledgerId: String
    /// Custom display-name override; nil renders the code's localized label.
    var name: String?
    /// i18n key for seeded accounts; nil for user-created accounts.
    var code: String?
    var type: AccountType
    var sortOrder: Int
    var parentId: String?
    var status: String
    var icon: String?
    var flags: [String]?
    var meta: [String: JSONValue]?
    var createdAt: Date

    var isArchived: Bool { status == "archived" }
    var isBuiltin: Bool { AccountFlags.contains(flags, AccountFlags.builtin) }
    /// The seeded default pocket: hidden from user-facing lists, used only as
    /// the implicit pocket fallback when posting quick entries.
    var isDefaultPocket: Bool {
        AccountFlags.contains(flags, AccountFlags.defaultDebit)
            || AccountFlags.contains(flags, AccountFlags.defaultCredit)
    }
    var isAssetLike: Bool { type == .asset || type == .liability }

    /// Display name: a user-set name overrides the label; otherwise the
    /// stable i18n `code` is rendered; user-created accounts carry their name.
    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let code {
            return L10n.string("account.name.\(code)", defaultValue: code)
        }
        return name ?? "—"
    }
}

/// A pickable account flattened into select order with its nesting depth —
/// parents first, children indented after them; orphans become roots.
struct AccountTreeEntry: Identifiable, Hashable {
    let account: BookAccount
    let depth: Int

    var id: String { account.id }

    static func build(
        _ accounts: [BookAccount],
        includeArchived: Bool = false
    ) -> [AccountTreeEntry] {
        let pool = includeArchived ? accounts : accounts.filter { !$0.isArchived }
        let byId = Dictionary(uniqueKeysWithValues: pool.map { ($0.id, $0) })
        func depth(of account: BookAccount) -> Int {
            var depth = 0
            var parent = account.parentId.flatMap { byId[$0] }
            while let current = parent {
                depth += 1
                parent = current.parentId.flatMap { byId[$0] }
            }
            return depth
        }
        var entries: [AccountTreeEntry] = []
        func visit(_ list: [BookAccount]) {
            for account in list {
                entries.append(AccountTreeEntry(account: account, depth: depth(of: account)))
                visit(pool.filter { $0.parentId == account.id })
            }
        }
        visit(pool.filter { account in
            guard let parentId = account.parentId else { return true }
            return byId[parentId] == nil
        })
        return entries
    }
}

// MARK: - Journal entries

struct EntryUserRef: Codable, Hashable {
    let id: String
    var name: String
    var email: String?
    var avatar: String?
}

struct JournalLineAccountRef: Codable, Hashable {
    let id: String
    var name: String?
    var code: String?
    var type: AccountType
    var sortOrder: Int
    var icon: String?
    var flags: [String]?

    /// The seeded default pocket: a prefill-only system account, hidden from
    /// entry rows so implicit quick-entry lines don't add noise.
    var isDefaultPocket: Bool {
        AccountFlags.contains(flags, AccountFlags.defaultDebit)
            || AccountFlags.contains(flags, AccountFlags.defaultCredit)
    }

    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let code {
            return L10n.string("account.name.\(code)", defaultValue: code)
        }
        return "—"
    }
}

struct JournalLine: Codable, Identifiable, Hashable {
    let id: String
    let accountId: String
    var account: JournalLineAccountRef
    var debit: Double
    var credit: Double
    var memo: String?
}

struct EntryParticipant: Codable, Identifiable, Hashable {
    let id: String
    let ledgerMemberId: String
    var user: EntryUserRef?
}

struct JournalEntry: Codable, Identifiable, Hashable {
    let id: String
    let ledgerId: String
    let entryNo: Int
    let date: Date
    var memo: String?
    var status: String
    var createdById: String?
    var createdBy: EntryUserRef?
    var createdAt: Date
    var lines: [JournalLine]
    var participants: [EntryParticipant]?

    var amount: Double {
        lines.reduce(0) { $0 + $1.debit }
    }
}

extension [JournalEntry] {
    /// Entries grouped by UTC day, newest day first; within-group order is
    /// preserved so the store's date/entryNo ordering carries over.
    var groupedByDay: [(day: Date, entries: [JournalEntry])] {
        Dictionary(grouping: self) { UTCDates.startOfUTCDay($0.date) }
            .map { (day: $0.key, entries: $0.value) }
            .sorted { $0.day > $1.day }
    }
}

// MARK: - Members & share codes

struct LedgerMember: Codable, Identifiable, Hashable {
    let id: String
    let ledgerId: String
    let userId: String
    var role: LedgerRole
    var createdAt: Date
    var user: EntryUserRef?

    var displayName: String {
        user?.name ?? userId
    }
}

struct ShareCodeCreator: Codable, Hashable {
    let id: String
    var name: String
    var email: String?
}

struct ShareCode: Codable, Identifiable, Hashable {
    let id: String
    let ledgerId: String
    let code: String
    var role: LedgerRole
    var status: String
    var expiresAt: Date?
    var maxUses: Int?
    var usesCount: Int
    var createdBy: ShareCodeCreator?
    var createdAt: Date

    var isActive: Bool { status == "active" }
}

// MARK: - Real accounts

struct RealAccountPocket: Codable, Identifiable, Hashable {
    let id: String
    let ledgerId: String
    var ledgerName: String
    var ledgerStatus: String
    var name: String?
    var code: String?
    var type: AccountType
    var status: String
    var icon: String?
    var balance: Double

    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let code {
            return L10n.string("account.name.\(code)", defaultValue: code)
        }
        return "—"
    }
}

struct RealAccount: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var type: AccountType
    var status: String
    var icon: String?
    var meta: [String: JSONValue]?
    var createdAt: Date
    var updatedAt: Date
    /// Cross-ledger sum over membership-visible pockets.
    var balance: Double
    var pockets: [RealAccountPocket]

    var isArchived: Bool { status == "archived" }
}

struct RealAccountTotals: Codable, Hashable {
    var assets: Double
    var liabilities: Double
    var netWorth: Double
}

// MARK: - Reports

struct StatementRow: Codable, Identifiable, Hashable {
    let id: String
    var name: String?
    var code: String?
    var type: AccountType
    var sortOrder: Int
    var balance: Double

    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let code {
            return L10n.string("account.name.\(code)", defaultValue: code)
        }
        return "—"
    }
}

/// A calendar month key (UTC) selecting which month a report covers — the
/// dashboard cards and their month-window entry list.
struct YearMonth: Hashable, Comparable {
    var year: Int
    var month: Int

    static var current: YearMonth { UTCDates.currentYearMonth }

    var previous: YearMonth {
        month > 1 ? YearMonth(year: year, month: month - 1) : YearMonth(year: year - 1, month: 12)
    }

    var next: YearMonth {
        month < 12 ? YearMonth(year: year, month: month + 1) : YearMonth(year: year + 1, month: 1)
    }

    /// UTC midnight of day 1 — anchors entry windows and title formatting.
    var start: Date {
        UTCDates.date(fromUTCDayString: String(format: "%04d-%02d-01", year, month)) ?? .distantPast
    }

    static func < (lhs: YearMonth, rhs: YearMonth) -> Bool {
        (lhs.year, lhs.month) < (rhs.year, rhs.month)
    }
}

struct DashboardMonth: Codable, Hashable {
    var year: Int
    var month: Int
    var income: [StatementRow]
    var expense: [StatementRow]
    var totalIncome: Double
    var totalExpense: Double
    var net: Double
}

struct Dashboard: Codable, Hashable {
    var assets: Double
    var liabilities: Double
    var netWorth: Double
    var month: DashboardMonth
    var recentEntries: [JournalEntry]
}

struct TrialBalanceTotals: Codable, Hashable {
    var debit: Double
    var credit: Double
}

struct TrialBalanceRow: Codable, Identifiable, Hashable {
    let id: String
    var name: String?
    var code: String?
    var type: AccountType
    var sortOrder: Int
    var totalDebit: Double
    var totalCredit: Double
    var balance: Double

    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let code {
            return L10n.string("account.name.\(code)", defaultValue: code)
        }
        return "—"
    }
}

struct TrialBalance: Codable, Hashable {
    var accounts: [TrialBalanceRow]
    var totals: TrialBalanceTotals
}

struct IncomeStatement: Codable, Hashable {
    var income: [StatementRow]
    var expense: [StatementRow]
    var totalIncome: Double
    var totalExpense: Double
    var net: Double
}

struct MemberTurnoverRow: Codable, Identifiable, Hashable {
    var ledgerMemberId: String
    var userId: String
    var name: String
    var avatar: String?
    var role: LedgerRole
    var entryCount: Int
    var turnover: Double

    var id: String { ledgerMemberId }
}

struct MemberTurnoverTotals: Codable, Hashable {
    var entries: Int
    var turnover: Double
}

struct MemberTurnover: Codable, Hashable {
    var members: [MemberTurnoverRow]
    var totals: MemberTurnoverTotals
}

// MARK: - Response wrappers

struct LedgersResponse: Codable {
    var ledgers: [QianlaiLedger]
}

struct AccountsResponse: Codable {
    var accounts: [BookAccount]
}

struct EntriesResponse: Codable {
    var entries: [JournalEntry]
    var total: Int
}

struct MembersResponse: Codable {
    var members: [LedgerMember]
}

struct ShareCodesResponse: Codable {
    var codes: [ShareCode]
}

struct RealAccountsResponse: Codable {
    var realAccounts: [RealAccount]
    var totals: RealAccountTotals
}

struct RedeemShareCodeResponse: Codable {
    var ledgerId: String
    var role: LedgerRole
}

struct SetBalanceResponse: Codable {
    var adjusted: Bool
    var entry: JournalEntry?
}

struct UploadAvatarResponse: Codable {
    var url: String
    var attachmentId: String
}

// MARK: - Request bodies

struct CreateLedgerBody: Encodable {
    var name: String
    var description: String?
    var currency: String?
    var seedStarterAccounts: Bool?
}

/// Manual encoding: `description` must be able to travel as JSON null (to
/// clear) versus being omitted (untouched).
struct UpdateLedgerBody: Encodable {
    var name: String?
    var description: String?
    var clearDescription: Bool
    var currency: String?
    var status: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        if clearDescription {
            try container.encodeNil(forKey: .description)
        } else {
            try container.encodeIfPresent(description, forKey: .description)
        }
        try container.encodeIfPresent(currency, forKey: .currency)
        try container.encodeIfPresent(status, forKey: .status)
    }

    private enum CodingKeys: String, CodingKey {
        case name
        case description
        case currency
        case status
    }
}

/// Manual encoding: `realAccountId` must be able to travel as JSON null (to
/// unlink) versus being omitted (untouched).
struct CreateAccountBody: Encodable {
    var name: String
    var type: AccountType
    var parentId: String?
    var icon: String?
    var meta: [String: JSONValue]?
    var realAccountId: String?
    var linkRealAccount: Bool

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(parentId, forKey: .parentId)
        try container.encodeIfPresent(icon, forKey: .icon)
        try container.encodeIfPresent(meta, forKey: .meta)
        if linkRealAccount {
            if let realAccountId {
                try container.encode(realAccountId, forKey: .realAccountId)
            } else {
                try container.encodeNil(forKey: .realAccountId)
            }
        }
    }

    private enum CodingKeys: String, CodingKey {
        case name
        case type
        case parentId
        case icon
        case meta
        case realAccountId
    }
}

struct UpdateAccountBody: Encodable {
    var name: String?
    var icon: String?
    var meta: [String: JSONValue]?
    var status: String?
    var realAccountId: String?
    var linkRealAccount: Bool

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(icon, forKey: .icon)
        try container.encodeIfPresent(meta, forKey: .meta)
        try container.encodeIfPresent(status, forKey: .status)
        if linkRealAccount {
            if let realAccountId {
                try container.encode(realAccountId, forKey: .realAccountId)
            } else {
                try container.encodeNil(forKey: .realAccountId)
            }
        }
    }

    private enum CodingKeys: String, CodingKey {
        case name
        case icon
        case meta
        case status
        case realAccountId
    }
}

struct ReorderAccountItem: Encodable {
    var id: String
    var parentId: String?
    var sortOrder: Int
}

struct ReorderAccountsBody: Encodable {
    var items: [ReorderAccountItem]
}

struct SetBalanceBody: Encodable {
    var balance: Double
    var date: String?
    var memo: String?
}

struct JournalLineInput: Encodable {
    /// Omitted or nil defers to the ledger's default pocket for this line's
    /// side (defaultCredit pays, defaultDebit receives).
    var accountId: String?
    var debit: Double
    var credit: Double
    var memo: String?
}

struct CreateEntryBody: Encodable {
    var date: Date
    var memo: String?
    var lines: [JournalLineInput]
    var participantMemberIds: [String]?
}

/// One-click income/expense/transfer scenario the user picks in the quick
/// entry form.
enum QuickEntryKind: String, CaseIterable, Identifiable {
    case expense
    case income
    case transfer

    var id: String { rawValue }

    var label: String {
        switch self {
        case .expense: L10n.string("quick.kind.expense", defaultValue: "Expense")
        case .income: L10n.string("quick.kind.income", defaultValue: "Income")
        case .transfer: L10n.string("quick.kind.transfer", defaultValue: "Transfer")
        }
    }

    var icon: String {
        switch self {
        case .expense: "arrow.down.circle.fill"
        case .income: "arrow.up.circle.fill"
        case .transfer: "arrow.left.arrow.right.circle.fill"
        }
    }
}

/// Expands a quick entry into the balanced two-line double entry the API
/// expects. Mirrors the webapp's quick-entry dialog exactly:
/// - expense: debit = expense category (required), credit = paying pocket
///   (optional → default pocket)
/// - income: debit = receiving pocket (optional → default pocket),
///   credit = income category (required)
/// - transfer: both pockets required and distinct.
struct QuickEntryDraft: Equatable {
    var kind: QuickEntryKind = .expense
    var amount: Double = 0
    var date: Date = Date()
    var debitAccountId: String?
    var creditAccountId: String?
    var memo: String = ""
    var participants: Set<String> = []

    var isSameAccount: Bool {
        kind == .transfer
            && debitAccountId != nil
            && debitAccountId == creditAccountId
    }

    /// True when the draft satisfies the kind's required sides.
    var isValid: Bool {
        guard amount > 0, !isSameAccount else { return false }
        switch kind {
        case .expense: return debitAccountId != nil
        case .income: return creditAccountId != nil
        case .transfer: return debitAccountId != nil && creditAccountId != nil
        }
    }

    var body: CreateEntryBody {
        CreateEntryBody(
            date: UTCDates.utcWallClock(date),
            memo: memo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? nil
                : memo.trimmingCharacters(in: .whitespacesAndNewlines),
            lines: [
                JournalLineInput(accountId: debitAccountId, debit: amount, credit: 0, memo: nil),
                JournalLineInput(accountId: creditAccountId, debit: 0, credit: amount, memo: nil),
            ],
            participantMemberIds: participants.isEmpty ? nil : Array(participants).sorted()
        )
    }
}

extension QuickEntryDraft {
    /// Prefills the draft from an existing entry for editing. The scenario
    /// is derived from the category lines; a counterparty line on the seeded
    /// default pocket becomes nil so the server re-applies the default on
    /// save. The date keeps the entry's stored UTC wall clock.
    init(entry: JournalEntry) {
        let expenseLine = entry.lines.first { $0.account.type == .expense }
        let incomeLine = entry.lines.first { $0.account.type == .income }
        let debitLine = entry.lines.first { $0.debit > 0 }
        let creditLine = entry.lines.first { $0.credit > 0 }
        let kind: QuickEntryKind
        let debitAccountId: String?
        let creditAccountId: String?
        if let expenseLine {
            kind = .expense
            debitAccountId = expenseLine.accountId
            creditAccountId = creditLine?.account.isDefaultPocket == true
                ? nil : creditLine?.accountId
        } else if let incomeLine {
            kind = .income
            creditAccountId = incomeLine.accountId
            debitAccountId = debitLine?.account.isDefaultPocket == true
                ? nil : debitLine?.accountId
        } else {
            kind = .transfer
            debitAccountId = debitLine?.accountId
            creditAccountId = creditLine?.accountId
        }
        self.init(
            kind: kind,
            amount: entry.amount,
            date: UTCDates.localFromUTCWallClock(entry.date),
            debitAccountId: debitAccountId,
            creditAccountId: creditAccountId,
            memo: entry.memo ?? "",
            participants: Set(entry.participants?.map(\.ledgerMemberId) ?? [])
        )
    }
}

struct CreateShareCodeBody: Encodable {
    var role: LedgerRole
    var expiresAt: Date?
    var maxUses: Int?
}

struct RedeemCodeBody: Encodable {
    var code: String
}

struct UpdateMemberRoleBody: Encodable {
    var role: LedgerRole
}

struct TransferOwnershipBody: Encodable {
    var userId: String
}

struct CreateRealAccountBody: Encodable {
    var name: String
    var type: AccountType
    var icon: String?
    var meta: [String: JSONValue]?
}

struct UpdateRealAccountBody: Encodable {
    var name: String?
    var status: String?
    var icon: String?
    var meta: [String: JSONValue]?
}

struct CreateTokenBody: Encodable {
    var name: String
    var scopes: [String]
    var expiresAt: Date?
}

struct ToggleTokenBody: Encodable {
    var enabled: Bool
}

struct ChangePasswordBody: Encodable {
    var currentPassword: String
    var newPassword: String
}

struct UpdateUserBody: Encodable {
    var name: String
}
