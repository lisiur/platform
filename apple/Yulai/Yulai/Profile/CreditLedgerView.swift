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
                        store.ledgerError == nil ? "暂无积分明细" : "加载失败",
                        systemImage: store.ledgerError == nil
                            ? "list.bullet.rectangle" : "exclamationmark.circle"
                    )
                } description: {
                    Text(store.ledgerError ?? "当前筛选条件下暂无记录。")
                } actions: {
                    if store.ledgerError != nil {
                        Button("重试") {
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
        .navigationTitle("积分明细")
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Picker(
                    "时间",
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
                    "类型",
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
        case "redeem": "兑换积分"
        case "ai_usage": "AI 使用"
        case "seed": "系统发放"
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
                Text("余额 \(entry.balanceAfter)")
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
