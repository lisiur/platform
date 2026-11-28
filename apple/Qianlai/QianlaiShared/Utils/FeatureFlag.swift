//
//  FeatureFlag.swift
//  Qianlai
//
//  Kill switch for the local-ledger stack (ISSUE-141): when off, every
//  local-store route deactivates and the app behaves exactly like the
//  pre-local-ledger build — cloud ledgers only, login-gated main UI.
//  The flag rides standard defaults (it gates process behavior, nothing
//  is shared cross-process) and can be flipped per-launch via launch
//  arguments for testing: `-QianlaiLocalLedgerEnabled NO`.
//

import Foundation

nonisolated enum FeatureFlag {
    /// The local-ledger stack (LocalStore + CloudSync + F9 未登录模式).
    /// Defaults ON — the feature is the product now; the flag exists so a
    /// discovered defect can ship a build that behaves like the old app
    /// without a code change.
    static var localLedgerEnabled: Bool {
        get {
            UserDefaults.standard.object(forKey: key) as? Bool ?? true
        }
        set {
            UserDefaults.standard.set(newValue, forKey: key)
        }
    }

    private static let key = "qianlai.featureFlag.localLedger"
}
