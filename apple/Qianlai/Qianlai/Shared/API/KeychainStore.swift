//
//  KeychainStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import LocalAuthentication
import os
import Security

/// Thin wrapper around the generic-password Keychain API, scoped to one
/// `service` so unrelated subsystems never see each other's items.
struct KeychainStore: Sendable {
    let service: String

    private static let logger = Logger(subsystem: "top.hapaul.qianlai", category: "Keychain")

    init(service: String) {
        self.service = service
    }

    /// Reads item data. Pass an already-evaluated `LAContext` for items
    /// written with `requiresUserPresence` so the read reuses that
    /// evaluation instead of prompting again.
    func read(account: String, authenticationContext: LAContext? = nil) -> Data? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        if let authenticationContext {
            query[kSecUseAuthenticationContext as String] = authenticationContext
        }

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else {
            if status != errSecItemNotFound {
                Self.logger.error("read(\(account, privacy: .public)) failed with \(status, privacy: .public)")
            }
            return nil
        }
        return result as? Data
    }

    func write(_ value: Data?, account: String, requiresUserPresence: Bool = false) {
        let query = baseQuery(account)
        let deleteStatus = SecItemDelete(query as CFDictionary)
        if deleteStatus != errSecSuccess, deleteStatus != errSecItemNotFound {
            Self.logger.error("delete(\(account, privacy: .public)) failed with \(deleteStatus, privacy: .public)")
        }
        guard let value else { return }

        var attributes = query
        attributes[kSecValueData as String] = value
        if requiresUserPresence {
            var creationError: Unmanaged<CFError>?
            guard
                let accessControl = SecAccessControlCreateWithFlags(
                    nil,
                    kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                    .userPresence,
                    &creationError
                )
            else {
                Self.logger.error("access control for \(account, privacy: .public) failed: \(String(describing: creationError?.takeRetainedValue()), privacy: .public)")
                return
            }
            attributes[kSecAttrAccessControl as String] = accessControl
        } else {
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        }
        let addStatus = SecItemAdd(attributes as CFDictionary, nil)
        if addStatus != errSecSuccess {
            Self.logger.error("write(\(account, privacy: .public)) failed with \(addStatus, privacy: .public)")
        }
    }

    func readString(account: String) -> String? {
        read(account: account).flatMap { String(data: $0, encoding: .utf8) }
    }

    func writeString(_ value: String?, account: String) {
        write(value.map { Data($0.utf8) }, account: account)
    }

    private func baseQuery(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
