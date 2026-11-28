//
//  LocalSeed.swift
//  Qianlai
//

import Foundation

/// The starter chart a new local ledger is born with — the same fixture
/// the server's `createLedger(seedStarterAccounts: true)` plants (C2):
/// identical codes, types, sort orders, icons, flags, and parentage. Only
/// the ids differ (client-generated cuid-free UUIDs — the transfer format
/// matches accounts by stable `code` on import, never by id).
///
/// Seeded accounts carry NO name: `code` is the permanent identity and the
/// client renders its localized label; a user rename sets `name` as an
/// override above the label.
nonisolated enum LocalSeed {
    struct StarterAccount {
        var code: String
        var type: AccountType
        var sortOrder: Int
        var icon: String
        var flags: [String]
        var parentCode: String? = nil
    }

    static let builtinFlag = "builtin"
    static let adjustmentOffsetFlag = "adjustmentOffset"
    static let defaultDebitFlag = "defaultDebit"
    static let defaultCreditFlag = "defaultCredit"

    /// Source of truth: `packages/service` `bookkeeping/domain.ts`
    /// `STARTER_ACCOUNTS`. Diff this list when the server fixture moves.
    static let accounts: [StarterAccount] = [
        StarterAccount(
            code: "defaultAccount", type: .asset, sortOrder: 5, icon: "👛",
            flags: [builtinFlag, defaultDebitFlag, defaultCreditFlag]
        ),
        StarterAccount(
            code: "openingBalance", type: .equity, sortOrder: 60, icon: "🧮",
            flags: [builtinFlag, adjustmentOffsetFlag]
        ),
        StarterAccount(code: "salary", type: .income, sortOrder: 70, icon: "💼", flags: []),
        StarterAccount(code: "bonus", type: .income, sortOrder: 80, icon: "🏆", flags: []),
        StarterAccount(code: "overtime", type: .income, sortOrder: 90, icon: "🌙", flags: []),
        StarterAccount(code: "benefits", type: .income, sortOrder: 100, icon: "🪙", flags: []),
        StarterAccount(code: "redPacket", type: .income, sortOrder: 110, icon: "🧧", flags: []),
        StarterAccount(code: "partTime", type: .income, sortOrder: 120, icon: "🧑‍💻", flags: []),
        StarterAccount(code: "sideBusiness", type: .income, sortOrder: 130, icon: "🚀", flags: []),
        StarterAccount(code: "taxRefund", type: .income, sortOrder: 140, icon: "🧾", flags: []),
        StarterAccount(code: "investment", type: .income, sortOrder: 150, icon: "📈", flags: []),
        StarterAccount(code: "windfall", type: .income, sortOrder: 160, icon: "🎉", flags: []),
        StarterAccount(code: "otherIncome", type: .income, sortOrder: 170, icon: "✨", flags: []),
        StarterAccount(code: "food", type: .expense, sortOrder: 200, icon: "🍜", flags: []),
        StarterAccount(code: "meals", type: .expense, sortOrder: 201, icon: "🍚", flags: [], parentCode: "food"),
        StarterAccount(code: "snacks", type: .expense, sortOrder: 202, icon: "🍿", flags: [], parentCode: "food"),
        StarterAccount(code: "fruit", type: .expense, sortOrder: 203, icon: "🍎", flags: [], parentCode: "food"),
        StarterAccount(code: "groceries", type: .expense, sortOrder: 204, icon: "🥬", flags: [], parentCode: "food"),
        StarterAccount(code: "apparel", type: .expense, sortOrder: 210, icon: "👕", flags: []),
        StarterAccount(code: "housing", type: .expense, sortOrder: 220, icon: "🏠", flags: []),
        StarterAccount(code: "transport", type: .expense, sortOrder: 230, icon: "🚌", flags: []),
        StarterAccount(code: "entertainment", type: .expense, sortOrder: 240, icon: "🎬", flags: []),
        StarterAccount(code: "medical", type: .expense, sortOrder: 250, icon: "🩺", flags: []),
        StarterAccount(code: "telecom", type: .expense, sortOrder: 260, icon: "📱", flags: []),
        StarterAccount(code: "education", type: .expense, sortOrder: 270, icon: "📚", flags: []),
        StarterAccount(code: "gifts", type: .expense, sortOrder: 280, icon: "🎊", flags: []),
        StarterAccount(code: "childcare", type: .expense, sortOrder: 290, icon: "🍼", flags: []),
        StarterAccount(code: "pets", type: .expense, sortOrder: 300, icon: "🐾", flags: []),
        StarterAccount(code: "travel", type: .expense, sortOrder: 310, icon: "✈️", flags: []),
    ]

    /// Builds the seed rows for a ledger. Ids are generated per call.
    /// Parents precede their children in the fixture order, so a child's
    /// parent id always resolves from the rows already built.
    static func accountRows(
        ledgerId: String,
        ownerId: String,
        now: Date
    ) -> [LocalBookAccountRow] {
        let createdAt = LocalValues.timestamp(from: now)
        var idByCode: [String: String] = [:]
        var rows: [LocalBookAccountRow] = []
        for starter in accounts {
            let id = UUID().uuidString
            rows.append(
                LocalBookAccountRow(
                    id: id,
                    ledgerId: ledgerId,
                    name: nil,
                    code: starter.code,
                    type: starter.type.rawValue,
                    sortOrder: starter.sortOrder,
                    parentId: starter.parentCode.flatMap { idByCode[$0] },
                    status: "active",
                    icon: starter.icon,
                    flags: LocalBookAccountRow.build(flags: starter.flags),
                    meta: nil,
                    realAccountId: nil,
                    createdAt: createdAt,
                    updatedAt: createdAt
                )
            )
            idByCode[starter.code] = id
        }
        return rows
    }
}
