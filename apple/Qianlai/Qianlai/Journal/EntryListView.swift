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
    @Environment(\.locale) private var locale

    let ledger: QianlaiLedger
    var emptyMessage: String
    /// Whether the "posting requires editor access" footnote renders.
    /// Statement drill-downs pass false — that page is read-only analysis.
    var showsPostHint = true
    /// Optional content rendered as the list's first row (the dashboard's
    /// month summary, the journal's range header) so it scrolls away with
    /// the records instead of staying pinned above them. Shown in every
    /// list state — loading, error, empty — like pinned chrome would be.
    var topContent: AnyView?
    /// Optional custom right-hand amount column for each row (settlement
    /// drill-downs: the member's share, the entry total, their paid line).
    /// Nil renders the standard headline.
    var amountSection: ((JournalEntry) -> EntryAmountSection?)?
    /// Project-surface switch: rows always name the payer ("由 X 付款"),
    /// even when they recorded the entry themselves. See `EntryRow`.
    var alwaysShowsPayer = false
    /// Ledger-wide switch: project entries carry the ledger members'
    /// combined share (分摊/分账) beneath their headline — the settlement
    /// drill-down's right-column look, with the figure the stat cards
    /// count. Project surfaces hide it (their settlement pages compute
    /// per-member shares among project members instead).
    var showsProjectShare = false

    @State private var entryPendingDelete: JournalEntry?
    @State private var entryPendingEdit: JournalEntry?

    init(
        ledger: QianlaiLedger,
        emptyMessage: String,
        showsPostHint: Bool = true,
        amountSection: ((JournalEntry) -> EntryAmountSection?)? = nil,
        alwaysShowsPayer: Bool = false,
        topContent: AnyView? = nil,
        showsProjectShare: Bool = false
    ) {
        self.ledger = ledger
        self.emptyMessage = emptyMessage
        self.showsPostHint = showsPostHint
        self.amountSection = amountSection
        self.alwaysShowsPayer = alwaysShowsPayer
        self.topContent = topContent
        self.showsProjectShare = showsProjectShare
    }

    var body: some View {
        List {
            // Scrolling header row (dashboard's month summary): chrome-free
            // row so it scrolls away with the records; rendered in every
            // state below, like pinned chrome was.
            if let topContent {
                topContent
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }
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
                .listRowBackground(Color.clear)
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
            } else if store.sort == .date {
                ForEach(store.entries.groupedByDay, id: \.day) { group in
                    // Default grouped style renders each Section as one
                    // rounded card with the date above it — same UI as the
                    // Me page.
                    Section {
                        ForEach(group.entries) { entry in
                            entryRow(entry)
                        }
                        .appCardRow()
                    } header: {
                        Text(AppDates.formatEntryDay(group.day, locale: locale))
                    }
                }
            } else {
                // Amount order crosses day boundaries, so the day cards are
                // dropped: one flat section renders the rows in sorted order.
                // The Section must be explicit — a bare ForEach merges with
                // the free-floating topContent row above, whose cleared
                // background swallows the card's top rounding.
                Section {
                    ForEach(store.entries) { entry in
                        entryRow(entry)
                    }
                    .appCardRow()
                }
            }
            if store.isLoadingMore {
                HStack {
                    Spacer()
                    ProgressView().controlSize(.small)
                    Spacer()
                }
                .listRowSeparator(.hidden)
                .appCardRow()
            }
            if showsPostHint, !ledger.canPost {
                Label(
                    L10n.string("journal.editorRequired", defaultValue: "Editor access or higher is required to post entries."),
                    systemImage: "lock"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .listRowSeparator(.hidden)
                .appCardRow()
            }
        }
        .appBackgroundCanvas()
        .alert(
            L10n.string("journal.delete", defaultValue: "Delete"),
            isPresented: Binding(
                get: { entryPendingDelete != nil },
                set: { if !$0 { entryPendingDelete = nil } }
            )
        ) {
            Button(L10n.string("common.delete", defaultValue: "Delete"), role: .destructive) {
                if let entry = entryPendingDelete {
                    delete(entry)
                }
                entryPendingDelete = nil
            }
            Button(L10n.string("common.cancel", defaultValue: "Cancel"), role: .cancel) { entryPendingDelete = nil }
        } message: {
            if let entry = entryPendingDelete {
                Text(L10n.string("journal.deleteEntryConfirm", defaultValue: "Delete entry #%lld? Reports will be recalculated.", entry.entryNo))
            }
        }
        .fullScreenCover(item: $entryPendingEdit) { entry in
            NavigationStack {
                QuickEntryView(entry: entry)
            }
            .interactiveDismissDisabled()
        }
    }

    /// One list row in both renderings (day-grouped and flat): the entry
    /// card, the hidden background NavigationLink for tap-to-detail, the
    /// swipe actions, and the last-row pagination trigger.
    private func entryRow(_ entry: JournalEntry) -> some View {
        // The row content stands alone — no disclosure chevron; navigation
        // hides an EmptyView-labeled NavigationLink in the background
        // (opacity-0 views still receive taps, and the card has no
        // interactive controls to swallow them).
        EntryRow(
            entry: entry,
            currency: ledger.currency,
            amountSection: amountSection?(entry),
            alwaysShowsPayer: alwaysShowsPayer,
            showsProjectShare: showsProjectShare
        )
            .background {
                NavigationLink {
                    JournalDetailView(entry: entry, showsProjectShare: showsProjectShare)
                } label: {
                    EmptyView()
                }
                .opacity(0)
                .accessibilityLabel(
                    L10n.string("journal.openEntry", defaultValue: "View entry details")
                )
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if ledger.canPost {
                    // Plain tinted button, not
                    // `role: .destructive`: UIKit plays
                    // the row-removal animation for a
                    // destructive swipe action on tap,
                    // so the row vanished and snapped
                    // back before the confirmation.
                    // Red tint keeps the look; the row
                    // only leaves after confirmation.
                    Button {
                        entryPendingDelete = entry
                    } label: {
                        Label(L10n.string("common.delete", defaultValue: "Delete"), systemImage: "trash")
                    }
                    .tint(.red)
                    Button {
                        entryPendingEdit = entry
                    } label: {
                        Label(L10n.string("common.edit", defaultValue: "Edit"), systemImage: "pencil")
                    }
                }
            }
            .onAppear {
                if entry == store.entries.last {
                    Task { await store.loadMore() }
                }
            }
    }

    /// Optimistic: the row leaves the list immediately and the success
    /// toast fires at once; the server sync runs in the background and the
    /// reports only refresh once it settles (so they never read the
    /// pre-delete totals). A failed sync restores the row and its error
    /// arrives through the store's callback. The local removal runs inside
    /// `withAnimation` so the row — or its whole day card, when the day
    /// empties — slides closed instead of vanishing.
    private func delete(_ entry: JournalEntry) {
        do {
            let sync = try withAnimation {
                try store.delete(entry) { message in
                    toast.show(message)
                }
            }
            toast.show(L10n.string("journal.deleteSuccess", defaultValue: "Entry deleted"))
            Task {
                await sync.value
                await reportStore.refreshAfterPosting()
            }
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Custom right-hand amount column for one entry row: a main colored
/// amount plus optional secondary captions beneath it (settlement
/// drill-downs: the gross spend, the member's share, their receivable or
/// payable line).
struct EntryAmountSection: Hashable {
    var headline: Headline
    var total: Caption?
    var paid: Caption?

    struct Headline: Hashable {
        var text: String
        var color: Color
    }

    /// One caption line under the headline. A nil color keeps the row's
    /// secondary tint; a semantic color overrides it.
    struct Caption: Hashable {
        var text: String
        var color: Color?
    }
}

/// One journal entry card: category icon + title with the memo trailing
/// inline ("服饰 · 外套"), HH:mm + creator (the enclosing day group header
/// carries the date), other account names, participants, location, and a
/// right-hand signed-amount column that also carries the not-counted flag.
/// Shared by the dashboard and journal list.
/// Lines posting against the seeded default pocket are hidden, and the
/// amount follows the money flow: expenses negative, income positive, each
/// prefixed with the ledger currency's symbol.
struct EntryRow: View {
    /// Dependency marker: an in-app language switch re-injects `\.locale`,
    /// which re-runs this row's body so `title` re-resolves through the
    /// override bundle. Without it the row keeps its first-render string.
    @Environment(\.locale) private var locale
    @Environment(AuthManager.self) private var auth

    let entry: JournalEntry
    let currency: String
    /// Custom right-hand column replacing the standard headline (settlement
    /// drill-downs); nil renders the entry's own amount.
    var amountSection: EntryAmountSection?
    /// Project-surface switch: always name the payer ("由 X 付款"), even
    /// when they recorded the entry themselves.
    var alwaysShowsPayer = false
    /// Ledger-wide switch: a project entry's amount column also carries the
    /// 分摊/分账 caption — the ledger members' combined share (what the
    /// stat cards count from this entry), rendered with the settlement
    /// drill-down's shared caption. Off on project surfaces, where the
    /// settlement math runs among project members instead.
    var showsProjectShare = false

    /// Fixed icon column for the meta rows (project, location,
    /// not-counted): the symbols' natural widths differ, so without it the
    /// labels after them don't line up. The participants row leads with its
    /// avatar circles instead.
    @ScaledMetric(relativeTo: .caption2)
    private var metaIconWidth: CGFloat = 16

    /// Participant avatar circles share the meta icon column's caption2
    /// scale so the row keeps its rhythm under dynamic type.
    @ScaledMetric(relativeTo: .caption2)
    private var participantAvatarSize: CGFloat = 16

    /// Avatar circles shown before the "+N" overflow label.
    private static let participantAvatarCap = 5

    var body: some View {
        HStack(spacing: 10) {
            categoryBadge
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                            .layoutPriority(1)
                        if let memo = entry.memo, !memo.isEmpty {
                            Text(verbatim: "·")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(memo)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(AppDates.formatEntryTime(entry.date))
                        if let payerCaption {
                            Text(verbatim: "·")
                            Text(payerCaption)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                        if let payAccount = payAccountNames {
                            Text(verbatim: "·")
                            Text(payAccount)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    if let project = entry.project {
                        HStack(spacing: 4) {
                            Image(systemName: "folder")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .frame(width: metaIconWidth, alignment: .leading)
                            Text(project.name)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .lineLimit(1)
                    }
                    if let participants = entry.participants, !participants.isEmpty {
                        participantAvatars(participants)
                    }
                    if let location = entry.location,
                       let label = location.displayName ?? coordinateLabel(location) {
                        HStack(spacing: 4) {
                            Image(systemName: "location")
                                .font(.caption2)
                                .frame(width: metaIconWidth, alignment: .leading)
                            Text(label)
                                .font(.caption2)
                        }
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 1) {
                    if let section = amountSection ?? projectShareSection {
                        Text(section.headline.text)
                            .font(.callout.weight(.semibold).monospacedDigit())
                            .foregroundStyle(section.headline.color)
                        let captions = [section.total, section.paid].compactMap { $0 }
                        ForEach(captions.indices, id: \.self) { index in
                            Text(captions[index].text)
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(captions[index].color ?? Color.secondary)
                                .lineLimit(1)
                        }
                    } else {
                        Text(headlineAmount.text)
                            .font(.callout.weight(.semibold).monospacedDigit())
                            .foregroundStyle(headlineAmount.color)
                    }
                    if !entry.countsInLedger {
                        HStack(spacing: 3) {
                            Image(systemName: "minus.circle")
                                .font(.caption2)
                            Text(L10n.string("journal.notCounted", defaultValue: "Not counted"))
                                .font(.caption2)
                                .lineLimit(1)
                        }
                        .foregroundStyle(.tertiary)
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

    /// The participants row's content: one small avatar circle per tagged
    /// member — the profile photo when it exists, else the initial on the
    /// accent circle (the members roster's fallback, miniaturized) — in
    /// place of the name list the row used to render; the detail page's
    /// Shares section still names them. Caps at `participantAvatarCap`
    /// circles with a "+N" label because a project entry without explicit
    /// tags snapshots the project's whole roster onto participants, and
    /// fixed-size circles can't truncate like the old text did. VoiceOver
    /// reads the names.
    private func participantAvatars(_ participants: [EntryParticipant]) -> some View {
        let shown = participants.prefix(Self.participantAvatarCap)
        return HStack(spacing: 3) {
            ForEach(shown) { participant in
                participantAvatar(participant)
            }
            if participants.count > Self.participantAvatarCap {
                Text("+\(participants.count - Self.participantAvatarCap)")
                    .font(.caption2.weight(.medium).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            participants.map { $0.user?.name ?? $0.userId }.joined(separator: ", ")
        )
    }

    @ViewBuilder
    private func participantAvatar(_ participant: EntryParticipant) -> some View {
        let name = participant.user?.name ?? participant.userId
        let initial = String(name.prefix(1)).uppercased()
        Group {
            if let url = ProfileStore.absoluteAvatarURL(
                participant.user?.avatar,
                baseURL: auth.apiBaseURL
            ) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Text(initial)
                    }
                }
            } else {
                Text(initial)
            }
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.white)
        .frame(width: participantAvatarSize, height: participantAvatarSize)
        .background(Circle().fill(Color.accentColor.opacity(0.85)))
        .clipShape(Circle())
    }

    /// The settlement drill-down's right-column look, synthesized for
    /// project entries on ledger-wide surfaces: the standard gross headline
    /// plus the 分摊/分账 caption — the ledger members' combined share the
    /// server attached, the exact figure the stat cards count from this
    /// entry (the settlement pages instead show one member's share, computed
    /// among project members). Reuses `SettlementAmountColumn.shareCaption`
    /// so the two captions never drift. Hidden for transfers (nothing to
    /// split), when the list didn't supply the figure, and on project
    /// surfaces (showsProjectShare off).
    private var projectShareSection: EntryAmountSection? {
        guard showsProjectShare,
              entry.project != nil,
              let cents = entry.memberSharesCents,
              entry.valueCents != 0
        else { return nil }
        return EntryAmountSection(
            headline: .init(text: headlineAmount.text, color: headlineAmount.color),
            total: SettlementAmountColumn.shareCaption(
                cents: cents,
                categoryType: categoryLine?.account.type,
                currency: currency
            ),
            paid: nil
        )
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

    /// The meta caption's person slot. Ledger surfaces name the payer only
    /// when they differ from the creator, else the plain creator name —
    /// project surfaces (`alwaysShowsPayer`) always call the person out,
    /// whoever recorded the entry: 由 X 付款 on expenses, 由 X 收款 on
    /// income (the money flows to them).
    private var payerCaption: String? {
        if alwaysShowsPayer {
            let format = categoryLine?.account.type == .income
                ? L10n.string("journal.receivedByFormat", defaultValue: "Received by %@")
                : L10n.string("journal.paidByFormat", defaultValue: "Paid by %@")
            if let payerName = entry.paidBy?.name ?? entry.createdBy?.name, !payerName.isEmpty {
                return String(format: format, payerName)
            }
            return nil
        }
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

    /// The headline amount carries the entry's money flow: an expense
    /// category line makes it negative, an income line positive; transfers
    /// (no category line) stay unsigned. The sign is prepended to the bare
    /// magnitude because `Money.format` emits its own leading minus for
    /// negatives, so feeding `abs` and prepending the symbol avoids the
    /// double-sign "+-¥12.00" rendering.
    private var headlineAmount: (text: String, color: Color) {
        let value = entry.amount
        if value == 0 {
            return (Money.format(0, currency: currency), .primary)
        }
        switch categoryLine?.account.type {
        case .expense:
            return ("−\(Money.format(abs(value), currency: currency))", .expense)
        case .income:
            return ("+\(Money.format(abs(value), currency: currency))", .income)
        default:
            return (Money.format(value, currency: currency), .primary)
        }
    }
}
