import SwiftUI

struct CreditLedgerView: View {
    let store: ProfileStore

    var body: some View {
        List {
            if store.isLoadingLedger, store.ledgerEntries.isEmpty {
                HStack {
                    Spacer()
                    ProgressView()
                        .controlSize(.small)
                    Spacer()
                }
                .padding(.vertical, 24)
            } else if store.ledgerEntries.isEmpty {
                ContentUnavailableView {
                    Label(
                        store.ledgerError == nil ? "No credit history" : "Failed to load",
                        systemImage: store.ledgerError == nil
                            ? "list.bullet.rectangle" : "exclamationmark.circle"
                    )
                } description: {
                    Text(store.ledgerError ?? "No records match the current filter.")
                } actions: {
                    if store.ledgerError != nil {
                        Button("Retry") {
                            Task { await store.loadLedger() }
                        }
                    }
                }
                .listRowBackground(Color.clear)
            } else {
                ForEach(store.ledgerEntries) { entry in
                    LedgerRow(entry: entry)
                }
                if store.hasMoreLedger {
                    HStack {
                        Spacer()
                        ProgressView()
                            .controlSize(.small)
                        Spacer()
                    }
                    .task(
                        id: "\(store.ledgerFilter.rawValue)-\(store.ledgerDateRange.rawValue)-\(store.ledgerEntries.count)"
                    ) {
                        await store.loadMoreLedger()
                    }
                }
            }
        }
        .navigationTitle("Credit history")
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Picker(
                    "Time",
                    selection: Binding(
                        get: { store.ledgerDateRange },
                        set: { store.ledgerDateRange = $0 }
                    )
                ) {
                    ForEach(CreditLedgerDateRange.allCases) { range in
                        Text(range.label).tag(range)
                    }
                }
                .pickerStyle(.menu)
            }
            ToolbarItem(placement: .primaryAction) {
                Picker(
                    "Item type",
                    selection: Binding(
                        get: { store.ledgerFilter },
                        set: { store.ledgerFilter = $0 }
                    )
                ) {
                    ForEach(CreditLedgerFilter.allCases) { filter in
                        Text(filter.label).tag(filter)
                    }
                }
                .pickerStyle(.menu)
            }
        }
        .refreshable {
            await store.loadLedger()
        }
        .task {
            if store.ledgerEntries.isEmpty {
                await store.loadLedger()
            }
        }
    }
}

private struct LedgerRow: View {
    let entry: CreditLedgerEntry

    private var typeLabel: String {
        switch entry.type {
        case "redeem": "Redeem points"
        case "ai_usage": "AI usage"
        case "seed": "System credit"
        default: entry.type
        }
    }

    private var typeIcon: String {
        switch entry.type {
        case "redeem": "giftcard.fill"
        case "ai_usage": "sparkles"
        case "seed": "leaf.fill"
        default: "circle"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: typeIcon)
                .foregroundStyle(Color.accentColor)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.description ?? typeLabel)
                    .font(.subheadline.weight(.medium))
                Text(
                    entry.createdAt.formatted(
                        .dateTime.year().month().day().hour().minute()
                    )
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(entry.amount > 0 ? "+\(entry.amount)" : "\(entry.amount)")
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(entry.amount >= 0 ? .green : .red)
                Text("Balance \(entry.balanceAfter)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    NavigationStack {
        CreditLedgerView(store: ProfileStore())
    }
}
