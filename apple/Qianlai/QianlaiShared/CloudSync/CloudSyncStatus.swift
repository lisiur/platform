//
//  CloudSyncStatus.swift
//  Qianlai
//

import Foundation

/// The sync engine's observable status surface (C6): five states, read-only
/// to the UI, never gating the local read/write paths (Q2③ — 本地读写任何
/// 情况下不因 iCloud 状态受阻). The presentation copy per state:
/// - `idle`「已同步」: the engine is live with no work in flight;
/// - `syncing`: send/fetch round-trips running;
/// - `icloudUnavailable`: no iCloud account (or the container is
///   unavailable) —「未在同步」, local data untouched, signing in resumes;
/// - `quotaExceeded`: text data still syncs, photo receipts stay pending
///   (Q2② — 空间不足提示 + iCloud 管理入口);
/// - `error`: a retryable engine error (transport, record too large…).
nonisolated enum CloudSyncState: Equatable {
    case idle
    case syncing
    case icloudUnavailable
    case quotaExceeded
    case error
}

/// The observable holder the UI reads (T4.2 wires the surfaces; the state
/// machine itself lives in `CloudSyncEngine`).
@MainActor
@Observable
final class CloudSyncStatus {
    private(set) var state: CloudSyncState = .idle
    /// The last failure's reason when `state == .error` (diagnostics only;
    /// surfaces are free to ignore it).
    private(set) var lastErrorMessage: String?

    func update(_ state: CloudSyncState, message: String? = nil) {
        self.state = state
        if state == .error {
            lastErrorMessage = message ?? lastErrorMessage
        } else {
            lastErrorMessage = nil
        }
    }
}
