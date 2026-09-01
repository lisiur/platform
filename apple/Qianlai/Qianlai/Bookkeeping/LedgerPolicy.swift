//
//  LedgerPolicy.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/1.
//

import Foundation

/// Central policy for what each `LedgerRole` may do. Mirrors the server's
/// bookkeeping access guards (owner: members/codes/ledger admin, editor:
/// accounts/projects, viewer: reports, guest: project-scoped expense
/// posting) and the `@repo/shared` ROLE_RANK table.
enum LedgerPolicy {
    private static let rank: [LedgerRole: Int] = [
        .guest: 0,
        .viewer: 1,
        .editor: 2,
        .owner: 3,
    ]

    static func atLeast(_ role: LedgerRole, _ minimum: LedgerRole) -> Bool {
        let roleRank = rank[role] ?? -1
        let minimumRank = rank[minimum] ?? 0
        return roleRank >= minimumRank
    }

    static func isOwner(_ role: LedgerRole) -> Bool {
        role == .owner
    }

    static func isGuest(_ role: LedgerRole) -> Bool {
        role == .guest
    }

    /// Editors and owners may post entries on active ledgers; guests post
    /// too — restricted server-side to expense records inside their
    /// projects.
    static func canPost(role: LedgerRole, ledgerActive: Bool) -> Bool {
        ledgerActive && (atLeast(role, .editor) || isGuest(role))
    }

    static func canManageProjects(role: LedgerRole, ledgerActive: Bool) -> Bool {
        ledgerActive && atLeast(role, .editor)
    }

    static func canManageAccounts(role: LedgerRole, ledgerActive: Bool) -> Bool {
        ledgerActive && atLeast(role, .editor)
    }

    static func canViewReports(_ role: LedgerRole) -> Bool {
        atLeast(role, .viewer)
    }

    static func canExportReports(_ role: LedgerRole) -> Bool {
        atLeast(role, .editor)
    }

    static func canManageMembers(_ role: LedgerRole) -> Bool {
        isOwner(role)
    }

    static func canEditLedger(_ role: LedgerRole) -> Bool {
        isOwner(role)
    }

    static func canArchiveLedger(_ role: LedgerRole) -> Bool {
        isOwner(role)
    }

    static func canDeleteLedger(_ role: LedgerRole) -> Bool {
        isOwner(role)
    }

    static func canTransferOwnership(_ role: LedgerRole) -> Bool {
        isOwner(role)
    }

    static func canCreateShareCode(_ role: LedgerRole) -> Bool {
        isOwner(role)
    }
}
