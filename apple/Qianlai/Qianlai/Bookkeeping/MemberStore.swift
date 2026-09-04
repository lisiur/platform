//
//  MemberStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Members of one ledger plus on-demand invite minting. Used by the members
/// manager and by the journal filters / quick-entry participant picker.
/// Invites are stateless short-lived JWTs — there is nothing to list or
/// revoke, so the store only exposes `mintInvite`.
@MainActor
@Observable
final class MemberStore {
    let client = APIClient.shared

    private(set) var members: [LedgerMember] = []
    private(set) var isLoading = false
    private(set) var loadError: String?

    private(set) var ledgerId: String?
    /// True when the caller is the ledger owner (may manage members +
    /// mint invites).
    private(set) var isOwner = false

    func load(ledgerId: String, myUserId: String?, force: Bool = false) async {
        guard force || self.ledgerId != ledgerId || members.isEmpty else { return }
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

    func updateRole(_ member: LedgerMember, role: LedgerRole) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(ledgerId)/members/\(member.userId)",
            body: UpdateMemberRoleBody(role: role)
        )
        await reloadAll()
    }

    /// Adds a member directly, without an invitation: the person (a child,
    /// or someone who won't install the app) never registers. Server-side
    /// the member is a flagged user row that can never sign in, created as
    /// a viewer. Roster consumers (payer/participant pickers, settlement)
    /// pick it up like any member. Takes the ledger explicitly — a
    /// project-scope members page calls this without ever having loaded
    /// the ledger roster, so the store's own `ledgerId` can't be relied on.
    /// The cached roster refreshes only when it actually displays this
    /// ledger; a project-scope caller refreshes the project instead.
    @discardableResult
    func addVirtualMember(ledgerId: String, name: String) async throws -> LedgerMember {
        let member: LedgerMember = try await client.request(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/members",
            body: CreateVirtualMemberBody(name: name)
        )
        if ledgerId == self.ledgerId {
            await reloadAll()
        }
        return member
    }

    /// Renames a virtual member — the server refuses renames of real users.
    func rename(_ member: LedgerMember, to name: String) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(ledgerId)/members/\(member.userId)",
            body: RenameMemberBody(name: name)
        )
        await reloadAll()
    }

    /// Project-scope rename — the caller has the target's `userId` (from
    /// `ProjectMemberRow`) but no `LedgerMember`, and in project scope the
    /// cached ledger roster may not be loaded (a guest can never load it,
    /// and the rename gate is editor+ on the ledger either way, so the
    /// lookup isn't reliable). Takes the ledger explicitly so the PATCH
    /// reaches the right ledger; refreshes the project instead of the
    /// ledger roster, mirroring `addVirtualMember(ledgerId:name:)`.
    func renameVirtualMember(ledgerId: String, userId: String, to name: String) async throws {
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(ledgerId)/members/\(userId)",
            body: RenameMemberBody(name: name)
        )
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

    /// Mints a fresh invite code for the ledger. Codes expire server-side
    /// after a minute — callers showing a QR should re-mint on a timer (see
    /// `LiveInviteQR`).
    func mintInvite(role: LedgerRole) async throws -> ShareCode {
        guard let ledgerId else { throw APIError.invalidResponse }
        return try await client.request(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/share-codes",
            body: CreateShareCodeBody(role: role)
        )
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
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }
}
