//
//  LedgerSwitcher.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Toolbar menu that shows the active ledger and switches between ledgers.
/// Archived ledgers stay selectable (read-only); "Manage Ledgers" opens the
/// full management sheet.
struct LedgerSwitcherMenu: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @State private var isShowingManage = false

    var body: some View {
        Menu {
            Section {
                ForEach(ledgerStore.activeLedgers) { ledger in
                    button(for: ledger)
                }
            }
            if !ledgerStore.archivedLedgers.isEmpty {
                Section {
                    ForEach(ledgerStore.archivedLedgers) { ledger in
                        button(for: ledger)
                    }
                }
            }
            Section {
                Button {
                    isShowingManage = true
                } label: {
                    Label("Manage Ledgers", systemImage: "folder")
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "book")
                Text(ledgerStore.activeLedger?.name ?? L10n.string("ledger.none", defaultValue: "No ledger"))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(.quaternary))
        }
        .sheet(isPresented: $isShowingManage) {
            NavigationStack {
                LedgersView()
            }
        }
    }

    private func button(for ledger: QianlaiLedger) -> some View {
        Button {
            ledgerStore.setActive(ledger.id)
        } label: {
            HStack {
                Text(ledger.name)
                if ledger.isDefault {
                    Image(systemName: "star.fill")
                }
                Text(ledger.myRole.label)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
