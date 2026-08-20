//
//  KeychainStore.swift
//  StudyBuddy
//
//  Created by Lisiur Day on 2026/8/19.
//

import Foundation
import Security

/// Thin wrapper around the generic-password Keychain API, scoped to one
/// `service` so unrelated subsystems never see each other's items.
struct KeychainStore: Sendable {
    let service: String

    init(service: String) {
        self.service = service
    }

    func read(account: String) -> Data? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    func write(_ value: Data?, account: String) {
        let query = baseQuery(account)
        SecItemDelete(query as CFDictionary)
        guard let value else { return }

        var attributes = query
        attributes[kSecValueData as String] = value
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        SecItemAdd(attributes as CFDictionary, nil)
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
