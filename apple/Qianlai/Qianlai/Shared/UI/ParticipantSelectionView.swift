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
/// crowds the entry form.
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
            if pending.contains(member.id) {
                pending.remove(member.id)
            } else {
                pending.insert(member.id)
            }
        } label: {
            HStack {
                Text(member.displayName)
                    .foregroundStyle(.primary)
                Spacer()
                if pending.contains(member.id) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.accentColor)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
