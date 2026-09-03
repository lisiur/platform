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
    case guest

    var label: String {
        switch self {
        case .owner: L10n.string("role.owner", defaultValue: "Owner")
        case .editor: L10n.string("role.editor", defaultValue: "Editor")
        case .viewer: L10n.string("role.viewer", defaultValue: "Viewer")
        case .guest: L10n.string("role.guest", defaultValue: "Guest")
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

    /// Editors and owners may post entries / manage accounts on active
    /// ledgers; guests post too — restricted server-side to expense records
    /// inside their projects.
    var canPost: Bool { LedgerPolicy.canPost(role: myRole, ledgerActive: isActive) }
    /// True when the viewer is a project-scoped guest on this ledger: they
    /// only see entries of their projects and record expenses against them.
    var isGuest: Bool { LedgerPolicy.isGuest(myRole) }
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

/// A participant tag on a journal entry — anchored to the user (not the
/// ledger member) so the split survives the participant leaving the ledger.
struct EntryParticipant: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    var user: EntryUserRef?
}

/// The project an entry belongs to (nil = personal, not in any project).
struct EntryProjectRef: Codable, Hashable {
    let id: String
    var name: String
    var status: String
}

/// Where an entry was recorded, resolved on the client at capture time.
/// Any field may be nil when geocoding was partial; `nil` display picks
/// fall back through name → address.
struct EntryLocationRef: Codable, Hashable {
    var address: String?
    var addressName: String?
    var latitude: Double?
    var longitude: Double?

    /// The short label shown in rows (POI name, falling back to address).
    var displayName: String? {
        if let addressName, !addressName.isEmpty { return addressName }
        if let address, !address.isEmpty { return address }
        return nil
    }

    /// Row label with the coordinates fallback, so a place whose geocoding
    /// never resolved still shows something (name → address → lat/lng).
    var rowLabel: String? {
        if let displayName, !displayName.isEmpty { return displayName }
        if let latitude, let longitude {
            return String(format: "%.5f, %.5f", latitude, longitude)
        }
        return nil
    }
}

/// The location payload entries accept. All-optional: the server stores
/// whatever was captured. `nil` (omit) keeps the stored location on edit;
/// an empty object clears it.
struct EntryLocationBody: Encodable, Hashable {
    var address: String?
    var addressName: String?
    var latitude: Double?
    var longitude: Double?

    init(address: String? = nil, addressName: String? = nil, latitude: Double? = nil, longitude: Double? = nil) {
        self.address = address
        self.addressName = addressName
        self.latitude = latitude
        self.longitude = longitude
    }

    init(_ location: EntryLocationRef) {
        address = location.address
        addressName = location.addressName
        latitude = location.latitude
        longitude = location.longitude
    }

    /// The short label shown in rows (POI name, falling back to address).
    var displayName: String? {
        if let addressName, !addressName.isEmpty { return addressName }
        if let address, !address.isEmpty { return address }
        return nil
    }

    /// Row label with the coordinates fallback, so a place whose geocoding
    /// never resolved still shows something (name → address → lat/lng).
    var rowLabel: String? {
        if let displayName, !displayName.isEmpty { return displayName }
        if let latitude, let longitude {
            return String(format: "%.5f, %.5f", latitude, longitude)
        }
        return nil
    }
}

struct JournalEntry: Codable, Identifiable, Hashable {
    let id: String
    let ledgerId: String
    let entryNo: Int
    let date: Date
    var memo: String?
    var status: String
    /// Pure user intent: false = excluded from ledger-wide surfaces (journal,
    /// dashboard month, income statement) but still fully visible in its
    /// project and balances — e.g. a credit-card repayment already expensed
    /// at purchase time.
    var countsInLedger: Bool
    /// System rule, set once at posting: true when the creator was a guest.
    /// Guest posts stay out of ledger-wide surfaces regardless of
    /// `countsInLedger` — they settle inside their project's books.
    var guestCreated: Bool
    var createdById: String?
    var createdBy: EntryUserRef?
    var createdAt: Date
    var projectId: String?
    var project: EntryProjectRef?
    /// Where the entry was recorded; nil when captured without a place.
    var location: EntryLocationRef?
    var lines: [JournalLine]
    var participants: [EntryParticipant]?

    var amount: Double {
        lines.reduce(0) { $0 + $1.debit }
    }

    /// The entry's value in integer cents: expense portion minus income
    /// portion (balance-sheet lines don't count). Mirrors the server's
    /// `entryValueCents` so client displays reconcile with reports.
    var valueCents: Int {
        var value = 0
        for line in lines {
            let debit = Int((line.debit * 100).rounded())
            let credit = Int((line.credit * 100).rounded())
            switch line.account.type {
            case .expense: value += debit - credit
            case .income: value -= credit - debit
            case .asset, .liability, .equity: break
            }
        }
        return value
    }

    /// The viewer's share of this entry's value in cents, mirroring the
    /// server's `viewerShareCents` (report.service.ts): equal split across
    /// the deduped tagged participants — remainder cents to the earliest
    /// sorted user ids — full value when untagged (personal entries are
    /// borne by their creator alone), zero when the viewer is outside the
    /// split set.
    func viewerShareCents(viewerUserId: String) -> Int {
        let value = valueCents
        guard value != 0 else { return 0 }
        let tagged = (participants ?? []).compactMap(\.userId)
        let splitUserIds = tagged.isEmpty
            ? [createdById ?? viewerUserId]
            : Array(Set(tagged)).sorted()
        guard let index = splitUserIds.firstIndex(of: viewerUserId) else { return 0 }
        let count = splitUserIds.count
        let base = Self.floorDiv(value, count)
        let remainder = value - base * count
        return base + (index < remainder ? 1 : 0)
    }

    /// Floor division with JS `Math.floor` semantics — Swift `/` truncates
    /// toward zero, and negative values (income-heavy entries) must floor
    /// like the server does.
    static func floorDiv(_ a: Int, _ b: Int) -> Int {
        let q = a.quotientAndRemainder(dividingBy: b)
        return q.remainder != 0 && (q.remainder < 0) != (b < 0) ? q.quotient - 1 : q.quotient
    }
}

extension [JournalEntry] {
    /// Entries grouped by the viewer's LOCAL day, newest day first;
    /// within-group order is preserved so the store's date/entryNo ordering
    /// carries over.
    var groupedByDay: [(day: Date, entries: [JournalEntry])] {
        Dictionary(grouping: self) { Calendar.current.startOfDay(for: $0.date) }
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

/// A freshly minted invite. The `code` is a short-lived signed token —
/// nothing is stored server-side, so it cannot be listed or revoked; it
/// simply expires (`expiresAt`).
struct ShareCode: Codable, Hashable, Identifiable {
    let ledgerId: String
    let code: String
    var role: LedgerRole
    /// Set = project-scoped invite (grants guest access to that project).
    var projectId: String?
    var expiresAt: Date?
    var createdAt: Date

    var id: String { code }
}

// MARK: - Projects

struct ProjectMemberRow: Codable, Identifiable, Hashable {
    let id: String
    let projectId: String
    let userId: String
    var createdAt: Date
    var user: EntryUserRef?

    var displayName: String {
        user?.name ?? userId
    }
}

/// A sub-scope of a ledger that tags entries and scopes guest access; its
/// membership at posting time is snapshotted onto an entry as participants —
/// the settlement split set.
struct QianlaiProject: Codable, Identifiable, Hashable {
    let id: String
    let ledgerId: String
    var name: String
    var description: String?
    var status: String
    var startDate: Date?
    var endDate: Date?
    var createdAt: Date
    var updatedAt: Date
    var members: [ProjectMemberRow]
    var entryCount: Int

    var isActive: Bool { status == "active" }
    var isArchived: Bool { status == "archived" }
}

/// One member's equal-split settlement line: `paid` is what they fronted
/// (negative when they received group income), `share` their fair part of
/// every entry, `balance = paid − share` (positive = is owed).
struct ProjectSettlementRow: Codable, Identifiable, Hashable {
    let userId: String
    var name: String
    var avatar: String?
    var paid: Double
    var share: Double
    var balance: Double

    var id: String { userId }
}

struct ProjectReportInfo: Codable, Hashable {
    let id: String
    let ledgerId: String
    var name: String
    var status: String
    var startDate: Date?
    var endDate: Date?

    var isActive: Bool { status == "active" }
}

struct ProjectReportTotals: Codable, Hashable {
    var entries: Int
}

struct ProjectReport: Codable, Hashable {
    var project: ProjectReportInfo
    var statement: IncomeStatement
    var settlement: [ProjectSettlementRow]
    var totals: ProjectReportTotals
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

    static var current: YearMonth { AppDates.currentYearMonth }

    var previous: YearMonth {
        month > 1 ? YearMonth(year: year, month: month - 1) : YearMonth(year: year - 1, month: 12)
    }

    var next: YearMonth {
        month < 12 ? YearMonth(year: year, month: month + 1) : YearMonth(year: year + 1, month: 1)
    }

    /// LOCAL midnight of day 1 — anchors entry windows and title formatting.
    var start: Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: 1)) ?? .distantPast
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
    /// Primary key: the user. A departed member with historical tags still
    /// gets a row even though their LedgerMember row is gone.
    var userId: String
    /// Nil when the user is no longer a current member of this ledger.
    var ledgerMemberId: String?
    var name: String
    var avatar: String?
    var role: LedgerRole
    var entryCount: Int
    var turnover: Double

    var id: String { userId }
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

struct ProjectsResponse: Codable {
    var projects: [QianlaiProject]
}

struct RealAccountsResponse: Codable {
    var realAccounts: [RealAccount]
    var totals: RealAccountTotals
}

struct RedeemShareCodeResponse: Codable {
    var ledgerId: String
    var role: LedgerRole
    /// Set when the code was a project invite.
    var projectId: String?
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

/// The entry's location field on the wire. Three states the API
/// distinguishes: omitted (edit keeps the stored place), explicit `null`
/// (strips it), or an object (replaces it).
enum EntryLocationPayload: Encodable {
    case clear
    case capture(EntryLocationBody)

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .clear: try container.encodeNil()
        case .capture(let location): try container.encode(location)
        }
    }
}

struct CreateEntryBody: Encodable {
    var date: Date
    var memo: String?
    var lines: [JournalLineInput]
    /// The users this entry concerns — keyed by userId, so the split set
    /// survives a participant leaving the ledger.
    var participantUserIds: [String]?
    /// Project assignment; guests must target one of their projects.
    var projectId: String?
    /// nil counts in the ledger (server default); false opts out. Pure user
    /// intent — guest posts are excluded by the server's guestCreated rule,
    /// not by this flag.
    var countsInLedger: Bool?
    /// nil omits the field: no location on create, keep-on-edit.
    var location: EntryLocationPayload? = nil
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
    var projectId: String?
    /// False marks the entry as not counting in ledger-wide surfaces (e.g.
    /// a credit-card repayment already expensed at purchase time).
    var countsInLedger = true
    /// The captured place shown in the form; nil = no location row value.
    var location: EntryLocationBody? = nil
    /// Set when the user removes the entry's existing location during an
    /// edit — the body then sends an explicit null (otherwise omitted =
    /// keep the stored place).
    var isLocationCleared = false

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
            date: date,
            memo: memo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? nil
                : memo.trimmingCharacters(in: .whitespacesAndNewlines),
            lines: [
                JournalLineInput(accountId: debitAccountId, debit: amount, credit: 0, memo: nil),
                JournalLineInput(accountId: creditAccountId, debit: 0, credit: amount, memo: nil),
            ],
            participantUserIds: participants.isEmpty ? nil : Array(participants).sorted(),
            projectId: projectId,
            countsInLedger: countsInLedger,
            location: location.map(EntryLocationPayload.capture)
                ?? (isLocationCleared ? .clear : nil)
        )
    }
}

extension QuickEntryDraft {
    /// Prefills the draft from an existing entry for editing. The scenario
    /// is derived from the category lines; a counterparty line on the seeded
    /// default pocket becomes nil so the server re-applies the default on
    /// save. The date keeps the entry's stored instant, which the picker
    /// renders in the viewer's local calendar.
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
            date: entry.date,
            debitAccountId: debitAccountId,
            creditAccountId: creditAccountId,
            memo: entry.memo ?? "",
            participants: Set(entry.participants?.map(\.userId) ?? []),
            projectId: entry.projectId,
            countsInLedger: entry.countsInLedger,
            location: entry.location.map { EntryLocationBody($0) }
        )
    }
}

struct CreateShareCodeBody: Encodable {
    var role: LedgerRole
    /// Set = project invite (role is forced to .guest server-side).
    var projectId: String?
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
