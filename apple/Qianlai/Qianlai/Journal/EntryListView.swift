//
//  EntryListView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/28.
//

import SwiftUI

/// The shared entry list surface: day-grouped sections (one rounded card
/// per day), swipe-to-delete with confirmation, incremental pagination, and
/// load-state rows. The Journal embeds it with every filter available; the
/// Dashboard mounts it with a month-window JournalStore so its entries
/// carry the same actions.
struct EntryListView: View {
    @Environment(JournalStore.self) private var store
    @Environment(ReportStore.self) private var reportStore
    @Environment(ToastCenter.self) private var toast
    @Environment(AuthManager.self) private var auth
    @Environment(\.locale) private var locale

    let ledger: QianlaiLedger
    var emptyMessage: String
    /// Whether the "posting requires editor access" footnote renders.
    /// Statement drill-downs pass false — that page is read-only analysis.
    var showsPostHint = true
    /// Optional custom right-hand amount column for each row (settlement
    /// drill-downs: the member's share, the entry total, their paid line).
    /// Nil renders the standard headline.
    var amountSection: ((JournalEntry) -> EntryAmountSection?)?
    /// Journal/dashboard switch: rows headline the viewer's own share of
    /// each entry — the real shared cost for me — instead of the gross
    /// total. Entries outside the viewer's split set read zero with the
    /// total captioned beneath. Drill-downs keep the gross.
    var showsViewerShare = false

    @State private var entryPendingDelete: JournalEntry?
    @State private var entryPendingEdit: JournalEntry?

    init(
        ledger: QianlaiLedger,
        emptyMessage: String,
        showsPostHint: Bool = true,
        amountSection: ((JournalEntry) -> EntryAmountSection?)? = nil,
        showsViewerShare: Bool = false
    ) {
        self.ledger = ledger
        self.emptyMessage = emptyMessage
        self.showsPostHint = showsPostHint
        self.amountSection = amountSection
        self.showsViewerShare = showsViewerShare
    }

    var body: some View {
        List {
            // Blocking spinner only before anything has ever loaded; later
            // refetches keep the current content (rows or empty state) until
            // the response replaces it atomically.
            if store.isLoading, store.entries.isEmpty, !store.hasLoadedOnce {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
            } else if let error = store.loadError, store.entries.isEmpty {
                ErrorRetryView(message: error) {
                    Task { await store.reload() }
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else if store.entries.isEmpty {
                EmptyStateView(message: emptyMessage, systemImage: "doc.text")
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(store.entries.groupedByDay, id: \.day) { group in
                    // Default grouped style renders each Section as one
                    // rounded card with the date above it — same UI as the
                    // Me page.
                    Section {
                        ForEach(group.entries) { entry in
                            NavigationLink {
                                JournalDetailView(entry: entry)
                            } label: {
                                EntryRow(
                                    entry: entry,
                                    currency: ledger.currency,
                                    amountSection: amountSection?(entry),
                                    viewerUserId: auth.currentUser?.id,
                                    showsViewerShare: showsViewerShare
                                )
                            }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if ledger.canPost {
                                        Button(role: .destructive) {
                                            entryPendingDelete = entry
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                        Button {
                                            entryPendingEdit = entry
                                        } label: {
                                            Label("Edit", systemImage: "pencil")
                                        }
                                    }
                                }
                                .onAppear {
                                    if entry == store.entries.last {
                                        Task { await store.loadMore() }
                                    }
                                }
                        }
                    } header: {
                        Text(AppDates.formatEntryDay(group.day, locale: locale))
                    }
                }
            }
            if store.isLoadingMore {
                HStack {
                    Spacer()
                    ProgressView().controlSize(.small)
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }
            if showsPostHint, !ledger.canPost {
                Label(
                    "Editor access or higher is required to post entries.",
                    systemImage: "lock"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .listRowSeparator(.hidden)
            }
        }
        .alert(
            L10n.string("journal.delete", defaultValue: "Delete"),
            isPresented: Binding(
                get: { entryPendingDelete != nil },
                set: { if !$0 { entryPendingDelete = nil } }
            )
        ) {
            Button("Delete", role: .destructive) {
                if let entry = entryPendingDelete {
                    Task { await delete(entry) }
                }
                entryPendingDelete = nil
            }
            Button("Cancel", role: .cancel) { entryPendingDelete = nil }
        } message: {
            if let entry = entryPendingDelete {
                Text("Delete entry #\(entry.entryNo)? Reports will be recalculated.")
            }
        }
        .sheet(item: $entryPendingEdit) { entry in
            NavigationStack {
                QuickEntryView(entry: entry)
            }
            .interactiveDismissDisabled()
        }
    }

    private func delete(_ entry: JournalEntry) async {
        do {
            try await store.delete(entry)
            toast.show(L10n.string("journal.deleteSuccess", defaultValue: "Entry deleted"))
            Task { await reportStore.refreshAfterPosting() }
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Custom right-hand amount column for one entry row: a main colored
/// amount plus optional secondary captions beneath it (settlement
/// drill-downs: the member's share, the entry total, their paid line).
struct EntryAmountSection: Hashable {
    var headline: Headline
    var total: String?
    var paid: String?

    struct Headline: Hashable {
        var text: String
        var color: Color
    }
}

/// One journal entry card: category icon + title, HH:mm + creator (the
/// enclosing day group header carries the date), memo, other account names,
/// participants, signed amount. Shared by the dashboard and journal list.
/// Lines posting against the seeded default pocket are hidden, and the
/// amount follows the money flow: expenses negative, income positive, each
/// prefixed with the ledger currency's symbol.
struct EntryRow: View {
    /// Dependency marker: an in-app language switch re-injects `\.locale`,
    /// which re-runs this row's body so `title` re-resolves through the
    /// override bundle. Without it the row keeps its first-render string.
    @Environment(\.locale) private var locale

    let entry: JournalEntry
    let currency: String
    /// Custom right-hand column replacing the standard headline (settlement
    /// drill-downs); nil renders the entry's own amount.
    var amountSection: EntryAmountSection?
    /// The signed-in viewer whose share the headline shows; nil keeps the
    /// gross total.
    var viewerUserId: String?
    /// Journal/dashboard switch: headline the viewer's own share instead
    /// of the gross total (see `EntryListView.showsViewerShare`).
    var showsViewerShare = false

    var body: some View {
        HStack(spacing: 10) {
            categoryBadge
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(AppDates.formatEntryTime(entry.date))
                        if let payerCaption {
                            Text("·")
                            Text(payerCaption)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                        if let payAccount = payAccountNames {
                            Text("·")
                            Text(payAccount)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    if let memo = entry.memo, !memo.isEmpty {
                        Text(memo)
                            .font(.caption)
                            .lineLimit(2)
                    }
                    if entry.project != nil
                        || !(entry.participants?.isEmpty ?? true)
                        || entry.location != nil {
                        HStack(spacing: 8) {
                            if let project = entry.project {
                                HStack(spacing: 4) {
                                    Image(systemName: "folder")
                                        .font(.caption2)
                                    Text(project.name)
                                        .font(.caption2)
                                }
                                .foregroundStyle(.tertiary)
                            }
                            if let location = entry.location,
                               let label = location.displayName ?? coordinateLabel(location) {
                                HStack(spacing: 4) {
                                    Image(systemName: "mappin.and.ellipse")
                                        .font(.caption2)
                                    Text(label)
                                        .font(.caption2)
                                }
                                .foregroundStyle(.tertiary)
                            }
                            if let participants = entry.participants, !participants.isEmpty {
                                HStack(spacing: 4) {
                                    Image(systemName: "person.2")
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                    Text(participants.map { $0.user?.name ?? $0.userId }.joined(separator: ", "))
                                        .font(.caption2.weight(.medium))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                        .truncationMode(.tail)
                                }
                            }
                        }
                        .lineLimit(1)
                    }
                    if !entry.countsInLedger {
                        HStack(spacing: 4) {
                            Image(systemName: "minus.circle")
                                .font(.caption2)
                            Text(L10n.string("journal.notCounted", defaultValue: "Not counted in income & expense"))
                                .font(.caption2)
                        }
                        .foregroundStyle(.tertiary)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 1) {
                    if let amountSection {
                        Text(amountSection.headline.text)
                            .font(.callout.weight(.semibold).monospacedDigit())
                            .foregroundStyle(amountSection.headline.color)
                        let captions = [amountSection.total, amountSection.paid].compactMap { $0 }
                        if !captions.isEmpty {
                            Text(captions.joined(separator: " · "))
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    } else {
                        Text(headlineAmount.text)
                            .font(.callout.weight(.semibold).monospacedDigit())
                            .foregroundStyle(headlineAmount.color)
                        if let sharedTotalCaption {
                            Text(sharedTotalCaption)
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    /// The entry's category line (expense wins over income); nil for
    /// pocket-to-pocket transfers.
    private var categoryLine: JournalLine? {
        entry.lines.first { $0.account.type == .expense }
            ?? entry.lines.first { $0.account.type == .income }
    }

    /// Coordinates-only fallback for a location whose geocoding never
    /// produced a name or address.
    private func coordinateLabel(_ location: EntryLocationRef) -> String? {
        guard let latitude = location.latitude, let longitude = location.longitude else {
            return nil
        }
        return String(format: "%.5f, %.5f", latitude, longitude)
    }

    /// Trailing meta text. Transfers (no category line) read
    /// "<output> → <input>" across their two pocket lines; other kinds
    /// list the pay-side account names besides the category and the seeded
    /// default pocket; nil when there is nothing to show.
    private var payAccountNames: String? {
        if categoryLine == nil {
            guard let output = entry.lines.first(where: { $0.credit > 0 }),
                  let input = entry.lines.first(where: { $0.debit > 0 })
            else { return nil }
            return "\(output.account.displayName) → \(input.account.displayName)"
        }
        let names = entry.lines
            .filter { !$0.account.isDefaultPocket && $0 != categoryLine }
            .map { $0.account.displayName }
        return names.isEmpty ? nil : names.joined(separator: " · ")
    }

    /// The meta caption's person slot. The row's caption historically showed
    /// the creator's plain name, but with explicit payers the interesting
    /// fact is who fronted the money: when someone other than the creator
    /// paid, the slot reads "Paid by ⟨payer⟩" instead.
    private var payerCaption: String? {
        if entry.paidById != entry.createdById,
           let paidByName = entry.paidBy?.name, !paidByName.isEmpty {
            return String(
                format: L10n.string("journal.paidByFormat", defaultValue: "Paid by %@"),
                paidByName
            )
        }
        if let creatorName = entry.createdBy?.name, !creatorName.isEmpty {
            return creatorName
        }
        return nil
    }

    private var title: String {
        // Read before any early return, or the category path skips the
        // dependency registration above.
        _ = locale
        return categoryLine?.account.displayName
            ?? L10n.string("quick.kind.transfer", defaultValue: "Transfer")
    }

    /// Leading badge showing the category account's emoji; falls back to a
    /// flow symbol when unset, or a transfer symbol without a category line.
    private var categoryBadge: some View {
        Group {
            if let icon = categoryLine?.account.icon, !icon.isEmpty {
                Text(icon)
                    .font(.title3)
            } else {
                Image(systemName: fallbackSymbol)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color.primary.opacity(0.06)))
    }

    private var fallbackSymbol: String {
        switch categoryLine?.account.type {
        case .expense: "arrow.down.circle.fill"
        case .income: "arrow.up.circle.fill"
        default: "arrow.left.arrow.right.circle.fill"
        }
    }

    /// When the headline shows the viewer's share and it differs from the
    /// gross total, caption the total underneath so the two reconcile.
    private var sharedTotalCaption: String? {
        guard showsViewerShare, categoryLine != nil, let viewerUserId else { return nil }
        let share = Double(entry.viewerShareCents(viewerUserId: viewerUserId)) / 100
        guard share != entry.amount else { return nil }
        let totalLabel = L10n.string("journal.totalAmount", defaultValue: "Total")
        return "\(totalLabel) \(Money.format(entry.amount, currency: currency))"
    }

    /// The headline value: the gross total normally; with
    /// `showsViewerShare`, the viewer's own share — zero outside the
    /// viewer's split set, gross kept for transfers (no shared cost) and
    /// when the viewer is unknown.
    private var displayAmount: Double {
        guard showsViewerShare, categoryLine != nil, let viewerUserId else {
            return entry.amount
        }
        return Double(entry.viewerShareCents(viewerUserId: viewerUserId)) / 100
    }

    /// The headline amount carries the entry's money flow: an expense
    /// category line makes it negative, an income line positive; transfers
    /// (no category line) stay unsigned. Zero shares render plain so a
    /// non-participant never sees "−¥0.00".
    private var headlineAmount: (text: String, color: Color) {
        let value = displayAmount
        if value == 0 {
            return (Money.format(0, currency: currency), .primary)
        }
        switch categoryLine?.account.type {
        case .expense:
            return ("−\(Money.format(value, currency: currency))", .expense)
        case .income:
            return ("+\(Money.format(value, currency: currency))", .income)
        default:
            return (Money.format(value, currency: currency), .primary)
        }
    }
}
