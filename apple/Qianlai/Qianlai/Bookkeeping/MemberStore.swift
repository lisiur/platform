//
//  MemberStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Members and share codes of one ledger. Used by the members manager and by
/// the journal filters / quick-entry participant picker.
@MainActor
@Observable
final class MemberStore {
    let client = APIClient.shared

    private(set) var members: [LedgerMember] = []
    private(set) var shareCodes: [ShareCode] = []
    private(set) var isLoading = false
    private(set) var loadError: String?

    private(set) var ledgerId: String?
    /// True when the caller is the ledger owner (may manage members + codes).
    private(set) var isOwner = false

    func load(ledgerId: String, myUserId: String?) async {
        guard self.ledgerId != ledgerId || members.isEmpty else { return }
        self.ledgerId = ledgerId
        isLoading = true
        defer { isLoading = false }
        do {
            let response: MembersResponse = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/members"
            )
            members = response.members
            isOwner = members.contains {
                $0.userId == myUserId && LedgerPolicy.isOwner($0.role)
            }
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    func loadShareCodes() async {
        guard let ledgerId, isOwner else { return }
        do {
            let response: ShareCodesResponse = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/share-codes"
            )
            shareCodes = response.codes
        } catch {
            shareCodes = []
        }
    }

    func updateRole(_ member: LedgerMember, role: LedgerRole) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(ledgerId)/members/\(member.userId)",
            body: UpdateMemberRoleBody(role: role)
        )
        await reloadAll()
    }

    func remove(_ member: LedgerMember) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/members/\(member.userId)"
        )
        await reloadAll()
    }

    func transferOwnership(to member: LedgerMember) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/transfer",
            body: TransferOwnershipBody(userId: member.userId)
        )
        await reloadAll()
    }

    func createShareCode(role: LedgerRole) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/share-codes",
            body: CreateShareCodeBody(role: role, expiresAt: nil, maxUses: nil)
        )
        await loadShareCodes()
    }

    func revokeShareCode(_ code: ShareCode) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/share-codes/\(code.id)"
        )
        await loadShareCodes()
    }

    func reloadAll() async {
        guard let ledgerId else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let membersResponse: MembersResponse = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/members"
            )
            members = membersResponse.members
            if isOwner {
                let codesResponse: ShareCodesResponse = try await client.request(
                    "GET",
                    "bookkeeping/ledgers/\(ledgerId)/share-codes"
                )
                shareCodes = codesResponse.codes
            }
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }
}
