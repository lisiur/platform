//
//  LedgerCapabilityGate.swift
//  Qianlai
//

import Foundation

/// The one capability router (C7): login state + the active ledger's
/// storage class → which server-backed entries the UI may surface. Every
/// entry hide/degrade reads this gate — no view decides from
/// `isLoggedIn` alone, so the F9 rule set stays in one place:
///
/// - cloud ledgers own the server capabilities (AI 识图/语音, 成员/邀请/
///   角色, 服务端导出导入, 偏好云同步) and they need a signed-in account;
/// - local ledgers own none of them — their server endpoints are absent
///   by design (the ledger doesn't exist server-side), so the entries
///   hide outright;
/// - the upgrade entry is the local ledger's ONE server-facing surface
///   and it degrades, not hides: visible always,发起时未登录先引导登录
///   (AC9.3);
/// - signed out, the 「我的」 page gains the persistent login entry, and
///   a ledger-less home shows the create-local / create-cloud / sign-in
///   trio (AC9.5's shape is human-acceptance scope).
nonisolated enum LedgerCapabilityGate {
    struct Capabilities: Equatable {
        /// AI 识图 / 语音入口 (screenshot + voice recognition).
        var canRecognize: Bool
        /// 成员 / 邀请 / 角色入口 — the members roster and its tab.
        var canManageMembers: Bool
        /// 服务端导出 / 导入入口 (cloud transfer flows).
        var canUseServerTransfer: Bool
        /// 偏好云同步 (user-scope preferences riding the account).
        var canSyncPreferences: Bool
        /// 本地账本升级入口 — visible on local ledgers only.
        var showsUpgradeEntry: Bool
        /// 升级发起需先登录 (signed out + local ledger → login-first flow).
        var upgradeRequiresLogin: Bool
        /// 「我的」页常驻登录入口 (signed out only).
        var showsLoginEntry: Bool
        /// 活跃账本为空的首页空态给「创建本地 / 创建云账本 / 登录」落点。
        var showsSignedOutEmptyState: Bool

        static let cloudBaseline = Capabilities(
            canRecognize: true,
            canManageMembers: true,
            canUseServerTransfer: true,
            canSyncPreferences: true,
            showsUpgradeEntry: false,
            upgradeRequiresLogin: false,
            showsLoginEntry: false,
            showsSignedOutEmptyState: false
        )
    }

    /// The capabilities for the given session + active ledger. A nil
    /// ledger (no ledger yet) strips everything server-backed and keeps
    /// the structural entries (login, empty-state trio) shaped by login
    /// state.
    static func capabilities(isLoggedIn: Bool, ledger: QianlaiLedger?) -> Capabilities {
        // Logged-out: nothing server-backed anywhere; the login entry is
        // permanent and the empty state (when there is no ledger) offers
        // the trio.
        guard isLoggedIn else {
            return Capabilities(
                canRecognize: false,
                canManageMembers: false,
                canUseServerTransfer: false,
                canSyncPreferences: false,
                showsUpgradeEntry: ledger?.isLocal == true,
                upgradeRequiresLogin: true,
                showsLoginEntry: true,
                showsSignedOutEmptyState: ledger == nil
            )
        }
        guard let ledger else {
            // Signed in but ledger-less: full cloud capabilities once a
            // cloud ledger exists — nothing to gate yet.
            return Capabilities(
                canRecognize: false,
                canManageMembers: false,
                canUseServerTransfer: true,
                canSyncPreferences: true,
                showsUpgradeEntry: false,
                upgradeRequiresLogin: false,
                showsLoginEntry: false,
                showsSignedOutEmptyState: false
            )
        }
        if ledger.isLocal {
            // Local ledger: the server capabilities are absent for it by
            // construction (server-side endpoints all key on a ledgerId
            // the server doesn't know).
            return Capabilities(
                canRecognize: false,
                canManageMembers: false,
                canUseServerTransfer: false,
                canSyncPreferences: true,
                showsUpgradeEntry: true,
                upgradeRequiresLogin: false,
                showsLoginEntry: false,
                showsSignedOutEmptyState: false
            )
        }
        // Cloud ledger — the pre-local baseline, minus the guest rules the
        // ledger's own role field already carries (recognition hides for
        // guests there; members stay visible with role-gated actions).
        var capabilities = Capabilities.cloudBaseline
        capabilities.canRecognize = ledger.canRecognizeScreenshots
        return capabilities
    }
}
