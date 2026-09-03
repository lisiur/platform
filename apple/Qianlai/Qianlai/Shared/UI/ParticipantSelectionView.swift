//
//  ParticipantSelectionView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/28.
//

import SwiftUI

/// Multi-select member sheet behind quick entry's Participants row: toggles
/// apply to a local copy and only land in `selection` on the confirmation
/// button, so Cancel really discards. The full member list no longer
/// crowds the entry form. Selection is keyed by the member's **userId** —
/// the API tags participants by user, not by ledger membership.
struct ParticipantSelectionView: View {
    @Environment(\.dismiss) private var dismiss

    let members: [LedgerMember]
    @Binding var selection: Set<String>

    @State private var pending: Set<String>

    init(members: [LedgerMember], selection: Binding<Set<String>>) {
        self.members = members
        _selection = selection
        _pending = State(initialValue: selection.wrappedValue)
    }

    var body: some View {
        NavigationStack {
            List(members) { member in
                row(for: member)
            }
            .navigationTitle(Text("Participants"))
            .inlineNavigationBarTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
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

    private func row(for member: LedgerMember) -> some View {
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
