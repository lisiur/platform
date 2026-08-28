//
//  MembersView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Members + share codes manager for one ledger (owner sees role controls,
/// transfer, removal, and share-code issuing).
struct MembersView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var auth
    @Environment(ToastCenter.self) private var toast
    @Environment(LedgerStore.self) private var ledgerStore

    let ledger: QianlaiLedger

    @State private var store = MemberStore()
    @State private var shareRole: LedgerRole = .editor
    @State private var memberPendingRemove: LedgerMember?
    @State private var memberPendingTransfer: LedgerMember?

    var body: some View {
        List {
            membersSection
            if store.isOwner {
                shareCodesSection
            }
        }
        .navigationTitle(Text("Members"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
        .task {
            await store.load(ledgerId: ledger.id, myUserId: auth.currentUser?.id)
            await store.loadShareCodes()
        }
        .alert(
            L10n.string("ledgers.removeMember", defaultValue: "Remove Member"),
            isPresented: Binding(
                get: { memberPendingRemove != nil },
                set: { if !$0 { memberPendingRemove = nil } }
            )
        ) {
            Button(L10n.string("ledgers.removeMember", defaultValue: "Remove"), role: .destructive) {
                if let member = memberPendingRemove {
                    Task {
                        do {
                            try await store.remove(member)
                            toast.show(L10n.string("ledgers.removeMemberSuccess", defaultValue: "Member removed"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                memberPendingRemove = nil
            }
            Button("Cancel", role: .cancel) { memberPendingRemove = nil }
        } message: {
            if let member = memberPendingRemove {
                Text("Remove \(member.displayName) from this ledger?")
            }
        }
        .alert(
            L10n.string("ledgers.transferOwnership", defaultValue: "Transfer Ownership"),
            isPresented: Binding(
                get: { memberPendingTransfer != nil },
                set: { if !$0 { memberPendingTransfer = nil } }
            )
        ) {
            Button(L10n.string("ledgers.transferOwnership", defaultValue: "Transfer Ownership"), role: .destructive) {
                if let member = memberPendingTransfer {
                    Task {
                        do {
                            try await store.transferOwnership(to: member)
                            toast.show(L10n.string("ledgers.transferSuccess", defaultValue: "Ownership transferred"))
                            await ledgerStore.load()
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                memberPendingTransfer = nil
            }
            Button("Cancel", role: .cancel) { memberPendingTransfer = nil }
        } message: {
            if let member = memberPendingTransfer {
                Text("Transfer ownership to \(member.displayName)? You become an editor.")
            }
        }
    }

    private var myUserId: String? {
        auth.currentUser?.id
    }

    @ViewBuilder
    private var membersSection: some View {
        Section {
            if store.isLoading, store.members.isEmpty {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
            } else if store.members.isEmpty {
                Text("No other members")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.members) { member in
                    memberRow(member)
                }
            }
        } header: {
            Text("Members")
        } footer: {
            Text("Editors can post entries; viewers can only browse.")
        }
    }

    private func memberRow(_ member: LedgerMember) -> some View {
        HStack(spacing: 10) {
            avatar(member)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(member.displayName)
                        .font(.body.weight(.medium))
                    if member.userId == myUserId {
                        Text(L10n.string("ledgers.you", defaultValue: "(you)"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if store.isOwner, let email = member.user?.email {
                    Text(email)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            if member.role == .owner {
                BadgeView(text: member.role.label, color: .orange)
            } else if store.isOwner, member.userId != myUserId {
                Menu {
                    Button {
                        Task {
                            do {
                                try await store.updateRole(member, role: .editor)
                                toast.show(L10n.string("ledgers.roleUpdated", defaultValue: "Role updated"))
                            } catch {
                                toast.show(error.localizedDescription)
                            }
                        }
                    } label: {
                        if member.role == .editor {
                            Label("Editor", systemImage: "checkmark")
                        } else {
                            Text("Editor")
                        }
                    }
                    Button {
                        Task {
                            do {
                                try await store.updateRole(member, role: .viewer)
                                toast.show(L10n.string("ledgers.roleUpdated", defaultValue: "Role updated"))
                            } catch {
                                toast.show(error.localizedDescription)
                            }
                        }
                    } label: {
                        if member.role == .viewer {
                            Label("Viewer", systemImage: "checkmark")
                        } else {
                            Text("Viewer")
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(member.role.label)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption2)
                    }
                }
            } else {
                BadgeView(text: member.role.label, outlined: true)
            }
        }
        .contextMenu {
            if store.isOwner, member.userId != myUserId {
                Button {
                    memberPendingTransfer = member
                } label: {
                    Label("Transfer Ownership", systemImage: "crown")
                }
                Button(role: .destructive) {
                    memberPendingRemove = member
                } label: {
                    Label("Remove", systemImage: "person.badge.minus")
                }
            }
        }
    }

    private func avatar(_ member: LedgerMember) -> some View {
        let initial = String(member.displayName.prefix(1)).uppercased()
        return Group {
            if let url = ProfileStore.absoluteAvatarURL(
                member.user?.avatar,
                baseURL: auth.apiBaseURL
            ) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Text(initial)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                    }
                }
            } else {
                Text(initial)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color.accentColor.opacity(0.85)))
        .clipShape(Circle())
    }

    @ViewBuilder
    private var shareCodesSection: some View {
        Section {
            HStack {
                Picker("Role", selection: $shareRole) {
                    Text(LedgerRole.editor.label).tag(LedgerRole.editor)
                    Text(LedgerRole.viewer.label).tag(LedgerRole.viewer)
                }
                .pickerStyle(.segmented)
                Button {
                    Task {
                        do {
                            try await store.createShareCode(role: shareRole)
                            toast.show(L10n.string("ledgers.shareCodeCreated", defaultValue: "Share code created"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                } label: {
                    Label("Create", systemImage: "plus")
                }
                .buttonStyle(.bordered)
            }
            if store.shareCodes.isEmpty {
                Text("No share codes")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.shareCodes) { code in
                    shareCodeRow(code)
                }
            }
        } header: {
            Text("Share Codes")
        } footer: {
            Text("Share codes let others join this ledger. Editors can post entries; viewers can only browse.")
        }
    }

    private func shareCodeRow(_ code: ShareCode) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(code.code)
                    .font(.body.monospaced().weight(.medium))
                    .textSelection(.enabled)
                Spacer()
                BadgeView(text: code.role.label, outlined: true)
                if code.isActive {
                    BadgeView(text: L10n.string("status.active", defaultValue: "Active"))
                } else {
                    BadgeView(text: L10n.string("ledgers.revoked", defaultValue: "Revoked"), color: .red)
                }
            }
            HStack {
                Label("\(code.usesCount)\(code.maxUses.map { " / \($0)" } ?? "")", systemImage: "person.crop.circle.badge.checkmark")
                if let createdAt = code.createdBy?.name {
                    Text("·")
                    Text(createdAt)
                }
                Spacer()
            }
            .font(.caption)
            .foregroundStyle(.tertiary)
        }
        .contextMenu {
            if code.isActive {
                Button {
                    Clipboard.copy(code.code)
                    toast.show(L10n.string("common.copied", defaultValue: "Copied"))
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                Button(role: .destructive) {
                    Task {
                        do {
                            try await store.revokeShareCode(code)
                            toast.show(L10n.string("ledgers.revokeSuccess", defaultValue: "Share code revoked"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                } label: {
                    Label("Revoke", systemImage: "minus.circle")
                }
            }
        }
    }
}

