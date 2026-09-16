//
//  ParticipantSelectionView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/28.
//

import SwiftUI

/// Someone who can be tagged on an entry or picked in a filter: a ledger
/// member, or a project outsider whose only membership is the project row
/// (their share of a project entry is a real consumption fact). Selection
/// is keyed by **userId** — the API tags participants by user, not by
/// ledger membership — so `id` IS the userId.
struct EntryPerson: Identifiable, Hashable {
    let userId: String
    let displayName: String
    /// The member's avatar attachment path, resolved to a URL against the
    /// API origin by each rendering surface (they hold the auth store).
    let avatar: String?

    var id: String { userId }

    /// The fallback monogram letter, matching the uppercase-first initial
    /// every other avatar surface derives.
    var avatarInitial: String {
        String(displayName.prefix(1)).uppercased()
    }
}

extension LedgerMember {
    var entryPerson: EntryPerson {
        EntryPerson(userId: userId, displayName: displayName, avatar: user?.avatar)
    }
}

extension ProjectMemberRow {
    var entryPerson: EntryPerson {
        EntryPerson(userId: userId, displayName: displayName, avatar: user?.avatar)
    }
}

/// Multi-select member sheet behind quick entry's Participants row: toggles
/// apply to a local copy and only land in `selection` on the confirmation
/// button, so Cancel really discards. The full member list no longer
/// crowds the entry form.
struct ParticipantSelectionView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var auth

    let members: [EntryPerson]
    @Binding var selection: Set<String>

    @State private var pending: Set<String>

    init(members: [EntryPerson], selection: Binding<Set<String>>) {
        self.members = members
        _selection = selection
        _pending = State(initialValue: selection.wrappedValue)
    }

    var body: some View {
        NavigationStack {
            List(members) { member in
                row(for: member)
            }
            .navigationTitle(Text(L10n.string("quick.participants", defaultValue: "Participants")))
            .inlineNavigationBarTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.string("common.done", defaultValue: "Done")) {
                        selection = pending
                        dismiss()
                    }
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }

    private func row(for member: EntryPerson) -> some View {
        Button {
            if pending.contains(member.userId) {
                pending.remove(member.userId)
            } else {
                pending.insert(member.userId)
            }
        } label: {
            HStack(spacing: 12) {
                avatar(for: member)
                Text(member.displayName)
                    .foregroundStyle(.primary)
                Spacer()
                if pending.contains(member.userId) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.accentColor)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// The roster-row avatar, the MembersView look (36pt accent circle,
    /// white initial fallback) — this sheet is a person picker.
    private func avatar(for member: EntryPerson) -> some View {
        CachedAvatarImage(
            url: ProfileStore.absoluteAvatarURL(member.avatar, baseURL: auth.apiBaseURL),
            initial: member.avatarInitial
        )
        .font(.caption.weight(.semibold))
        .foregroundStyle(.white)
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color.accentColor.opacity(0.85)))
        .clipShape(Circle())
    }
}
