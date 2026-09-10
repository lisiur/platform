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

    var id: String { userId }
}

extension LedgerMember {
    var entryPerson: EntryPerson {
        EntryPerson(userId: userId, displayName: displayName)
    }
}

extension ProjectMemberRow {
    var entryPerson: EntryPerson {
        EntryPerson(userId: userId, displayName: displayName)
    }
}

/// Multi-select member sheet behind quick entry's Participants row: toggles
/// apply to a local copy and only land in `selection` on the confirmation
/// button, so Cancel really discards. The full member list no longer
/// crowds the entry form.
struct ParticipantSelectionView: View {
    @Environment(\.dismiss) private var dismiss

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
            HStack {
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
}
