//
//  ChipCustomizationView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/8.
//

import SwiftUI

/// Quick-entry chip personalization for one scope (the pinned project, else
/// the ledger): the chip-capable fields as one reorderable list where the
/// toggle decides chip visibility and the row order IS the chip order.
/// Hidden fields stay reachable in the more sheet's form. Every change
/// persists immediately through `PreferenceStore` (optimistic, toast on
/// failure).
struct ChipCustomizationView: View {
    /// The recording ledger; holds the config when no project is pinned.
    let ledgerId: String
    /// The pinned project, whose config wins over the ledger's.
    let projectId: String?

    @Environment(PreferenceStore.self) private var preferenceStore
    @Environment(ToastCenter.self) private var toast
    @Environment(\.dismiss) private var dismiss

    /// The fields a chip may ever represent — identical to the server's
    /// enum. paidBy/project/countsInLedger have no chip builders and always
    /// live in the more sheet.
    private static let chipCapable: [QuickEntryField] = [
        .account, .memo, .time, .participants, .location,
    ]

    /// Row display order — every chip-capable field, shown ones first.
    @State private var order: [QuickEntryField] = ChipCustomizationView.chipCapable
    /// Fields currently rendered as chips.
    @State private var shown: Set<QuickEntryField> = []

    private var visibleFields: [QuickEntryField] {
        order.filter { shown.contains($0) }
    }

    var body: some View {
        List {
            Section {
                ForEach(order) { field in
                    row(field)
                }
                .onMove(perform: move)
            } footer: {
                Text(L10n.string(
                    "preferences.chips.footer",
                    defaultValue: "Drag to reorder; hidden fields stay in the More menu."
                ))
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(L10n.string("preferences.restoreDefaults", defaultValue: "Reset")) {
                    restoreDefaults()
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.string("common.done", defaultValue: "Done")) { dismiss() }
            }
        }
        .navigationTitle(Text(L10n.string("preferences.chips.title", defaultValue: "Customize Chips")))
        .inlineNavigationBarTitle()
        .task { syncFromStore() }
    }

    // MARK: - Rows

    private func row(_ field: QuickEntryField) -> some View {
        let isShown = shown.contains(field)
        return Toggle(isOn: Binding(
            get: { self.shown.contains(field) },
            set: { setShow(field, $0) }
        )) {
            Label {
                Text(field.label)
            } icon: {
                Image(systemName: field.icon)
            }
            .opacity(isShown ? 1 : 0.45)
        }
    }

    // MARK: - Mutations

    private func setShow(_ field: QuickEntryField, _ isOn: Bool) {
        if isOn {
            shown.insert(field)
        } else {
            shown.remove(field)
        }
        persist(visibleFields)
    }

    private func move(from source: IndexSet, to destination: Int) {
        order.move(fromOffsets: source, toOffset: destination)
        persist(visibleFields)
    }

    /// Drops the stored arrangement — the layout resolves back to
    /// `.standard` (all five chips, canonical order).
    private func restoreDefaults() {
        Task {
            do {
                try await preferenceStore.restoreChipFields(ledgerId: ledgerId, projectId: projectId)
                syncFromStore()
            } catch {
                toast.show(error.localizedDescription)
            }
        }
    }

    private func persist(_ fields: [QuickEntryField]) {
        Task {
            do {
                try await preferenceStore.setChipFields(ledgerId: ledgerId, projectId: projectId, fields)
            } catch {
                toast.show(error.localizedDescription)
                syncFromStore()
            }
        }
    }

    /// Re-derives the working copy: the saved chip order first, any
    /// never-shown fields after in canonical order.
    private func syncFromStore() {
        let saved = preferenceStore
            .quickEntryLayout(ledgerId: ledgerId, projectId: projectId)
            .chipFields
            .filter { Self.chipCapable.contains($0) }
        order = saved + Self.chipCapable.filter { !saved.contains($0) }
        shown = Set(saved)
    }
}
