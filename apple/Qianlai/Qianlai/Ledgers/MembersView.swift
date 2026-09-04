//
//  MembersView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Members manager for one ledger (owner sees role controls, transfer,
/// and removal). Invites live in `LedgerInviteView`.
struct MembersView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var auth
    @Environment(ToastCenter.self) private var toast
    @Environment(LedgerStore.self) private var ledgerStore

    let ledger: QianlaiLedger

    @State private var store = MemberStore()
    @State private var memberPendingRemove: LedgerMember?
    @State private var memberPendingTransfer: LedgerMember?
    @State private var isAddingVirtualMember = false
    @State private var newVirtualMemberName = ""
    @State private var memberPendingRename: LedgerMember?
    @State private var renameMemberName = ""

    var body: some View {
        List {
            membersSection
        }
        .navigationTitle(Text("Members"))
        .inlineNavigationBarTitle()
        .toolbar {
            if canManageVirtualMembers {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        newVirtualMemberName = ""
                        isAddingVirtualMember = true
                    } label: {
                        Label(
                            L10n.string(
                                "ledgers.addVirtualMember",
                                defaultValue: "Add Virtual Member"
                            ),
                            systemImage: "person.badge.plus"
                        )
                    }
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
        .task {
            await store.load(ledgerId: ledger.id, myUserId: auth.currentUser?.id)
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
        .alert(
            L10n.string(
                "ledgers.addVirtualMember",
                defaultValue: "Add Virtual Member"
            ),
            isPresented: $isAddingVirtualMember
        ) {
            TextField(
                L10n.string(
                    "ledgers.virtualNamePlaceholder",
                    defaultValue: "Name"
                ),
                text: $newVirtualMemberName
            )
            Button(L10n.string("ledgers.add", defaultValue: "Add")) {
                addVirtualMember()
            }
            Button("Cancel", role: .cancel) { newVirtualMemberName = "" }
        } message: {
            Text(
                L10n.string(
                    "ledgers.virtualMemberMessage",
                    defaultValue: "No registration needed — they can be named as a payer or participant and count toward stats. A virtual member can never sign in."
                )
            )
        }
        .alert(
            L10n.string(
                "ledgers.renameMember",
                defaultValue: "Rename"
            ),
            isPresented: Binding(
                get: { memberPendingRename != nil },
                set: { if !$0 { memberPendingRename = nil } }
            )
        ) {
            TextField(
                L10n.string(
                    "ledgers.virtualNamePlaceholder",
                    defaultValue: "Name"
                ),
                text: $renameMemberName
            )
            Button("Save") { renameVirtualMember() }
            Button("Cancel", role: .cancel) {
                memberPendingRename = nil
                renameMemberName = ""
            }
        } message: {
            if let member = memberPendingRename {
                Text(member.displayName)
            }
        }
    }

    private func addVirtualMember() {
        let name = newVirtualMemberName.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        newVirtualMemberName = ""
        guard !name.isEmpty else { return }
        Task {
            do {
                try await store.addVirtualMember(name: name)
                toast.show(
                    L10n.string(
                        "ledgers.addVirtualMemberSuccess",
                        defaultValue: "Virtual member added"
                    )
                )
            } catch {
                toast.show(error.localizedDescription)
            }
        }
    }

    private func renameVirtualMember() {
        guard let member = memberPendingRename else { return }
        memberPendingRename = nil
        let name = renameMemberName.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        renameMemberName = ""
        guard !name.isEmpty else { return }
        Task {
            do {
                try await store.rename(member, to: name)
                toast.show(
                    L10n.string(
                        "ledgers.renameMemberSuccess",
                        defaultValue: "Member renamed"
                    )
                )
            } catch {
                toast.show(error.localizedDescription)
            }
        }
    }

    private var myUserId: String? {
        auth.currentUser?.id
    }

    private var myRole: LedgerRole? {
        store.members.first { $0.userId == myUserId }?.role
    }

    private var canManageVirtualMembers: Bool {
        guard let myRole else { return false }
        return LedgerPolicy.canManageVirtualMembers(myRole)
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
                    if member.isVirtual {
                        BadgeView(
                            text: L10n.string(
                                "ledgers.virtualBadge",
                                defaultValue: "Virtual"
                            ),
                            outlined: true
                        )
                    }
                    if member.userId == myUserId {
                        Text(L10n.string("ledgers.you", defaultValue: "(you)"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if store.isOwner, !member.isVirtual,
                    let email = member.user?.email {
                    Text(email)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            if LedgerPolicy.isOwner(member.role) {
                BadgeView(text: member.role.label, color: .orange)
            } else if member.isVirtual {
                // Virtual members can never sign in, so their viewer role is
                // a fixed fact — badge, not a control.
                BadgeView(text: member.role.label, outlined: true)
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
            if member.isVirtual, canManageVirtualMembers {
                Button {
                    renameMemberName = member.displayName
                    memberPendingRename = member
                } label: {
                    Label(
                        L10n.string(
                            "ledgers.renameMember",
                            defaultValue: "Rename"
                        ),
                        systemImage: "pencil"
                    )
                }
            }
            if store.isOwner, member.userId != myUserId, !member.isVirtual {
                Button {
                    memberPendingTransfer = member
                } label: {
                    Label("Transfer Ownership", systemImage: "crown")
                }
            }
            if store.isOwner, member.userId != myUserId {
                Button(role: .destructive) {
                    memberPendingRemove = member
                } label: {
                    Label("Remove", systemImage: "person.badge.minus")
                }
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if store.isOwner, member.userId != myUserId {
                Button(role: .destructive) {
                    memberPendingRemove = member
                } label: {
                    Label("Remove", systemImage: "person.badge.minus")
                }
                if !member.isVirtual {
                    Button {
                        memberPendingTransfer = member
                    } label: {
                        Label("Transfer", systemImage: "crown")
                    }
                    .tint(.orange)
                }
            }
            if member.isVirtual, canManageVirtualMembers {
                Button {
                    renameMemberName = member.displayName
                    memberPendingRename = member
                } label: {
                    Label(
                        L10n.string(
                            "ledgers.renameMember",
                            defaultValue: "Rename"
                        ),
                        systemImage: "pencil"
                    )
                }
                .tint(.blue)
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
}

