//
//  SummaryWidget.swift
//  QianlaiWidget
//
//  Created by Lisiur Day on 2026/9/5.
//

import WidgetKit
import SwiftUI

/// The summary widget: when the app's ledger switcher has a project claiming
/// scope, it shows that project's statement totals; otherwise the guest-free
/// active ledger's dashboard. Data comes from the same endpoints the app
/// uses, resolved against the scope the app mirrors into the shared App
/// Group suite.
struct SummaryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "QianlaiSummary", provider: SummaryProvider()) { entry in
            SummaryEntryView(entry: entry)
        }
        .configurationDisplayName(L10n.string("widget.displayName", defaultValue: "Ledger Summary"))
        .description(L10n.string("widget.description", defaultValue: "Month expense, balances, and recent entries."))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Presentation

/// Everything the three layouts render, flattened from whichever scope is
/// active — a ledger (net-worth headline, month window) or the scoped
/// project (net headline, whole-project statement).
nonisolated struct SummaryPresentation {
    let scopeName: String?
    let isProjectScope: Bool
    let currency: String?
    /// nil for project scopes: their statement is not month-windowed.
    let monthTitle: String?
    let totalExpense: Double
    let totalIncome: Double
    let net: Double
    /// The small widget's bottom line and the medium widget's third stat:
    /// net worth for ledgers, net for projects.
    let headlineLabel: String
    let headlineValue: Double
    let recentEntries: [WidgetRecentEntry]
    let generatedAt: Date
    /// True when the scoped project belongs to a ledger the viewer is only
    /// a guest of — selects the person-badged folder glyph.
    let isGuestScope: Bool

    static func ledger(
        _ snapshot: WidgetSnapshot,
        ledgerName: String?,
        currency: String?
    ) -> SummaryPresentation {
        SummaryPresentation(
            scopeName: ledgerName,
            isProjectScope: false,
            currency: currency,
            monthTitle: AppDates.formatMonthTitle(snapshot.month, locale: AppLanguage.resolvedLocale),
            totalExpense: snapshot.totalExpense,
            totalIncome: snapshot.totalIncome,
            net: snapshot.net,
            headlineLabel: L10n.string("common.netWorth", defaultValue: "Net Worth"),
            headlineValue: snapshot.netWorth,
            recentEntries: snapshot.recentEntries,
            generatedAt: snapshot.generatedAt,
            isGuestScope: false
        )
    }

    static func project(_ snapshot: WidgetProjectSnapshot, isGuest: Bool) -> SummaryPresentation {
        SummaryPresentation(
            scopeName: snapshot.name,
            isProjectScope: true,
            currency: nil,
            monthTitle: nil,
            totalExpense: snapshot.totalExpense,
            totalIncome: snapshot.totalIncome,
            net: snapshot.net,
            headlineLabel: L10n.string("common.net", defaultValue: "Net"),
            headlineValue: snapshot.net,
            recentEntries: snapshot.recentEntries,
            generatedAt: snapshot.generatedAt,
            isGuestScope: isGuest
        )
    }

    /// The folder glyph marking a project scope, person-badged when it is a
    /// shared (guest) project.
    var scopeSymbol: String {
        isGuestScope ? "folder.badge.person.crop" : "folder"
    }
}

// MARK: - Timeline

nonisolated struct SummaryEntry: TimelineEntry {
    /// What the timeline entry renders.
    enum Content {
        case data(SummaryPresentation)
        /// The last good numbers, rendered when a refresh failed.
        case offline(SummaryPresentation)
        case signedOut
        case unavailable

        /// Gallery/placeholder sample data — never fetched.
        static let sample: Content = .data(
            .ledger(
                WidgetSnapshot(
                    ledgerId: "sample",
                    assets: 32800,
                    liabilities: 4300,
                    netWorth: 28500,
                    monthYear: 2026,
                    monthMonth: 9,
                    totalIncome: 12000,
                    totalExpense: 3456.78,
                    net: 8543.22,
                    recentEntries: [
                        WidgetRecentEntry(id: "1", date: Date(timeIntervalSince1970: 1_787_000_000), title: "三餐", icon: "🍜", flow: .expense, value: 45),
                        WidgetRecentEntry(id: "2", date: Date(timeIntervalSince1970: 1_786_900_000), title: "工资", icon: "💼", flow: .income, value: 12000),
                    ],
                    generatedAt: Date(timeIntervalSince1970: 1_787_000_000)
                ),
                ledgerName: "我的账本",
                currency: "CNY"
            )
        )
    }

    let date: Date
    let content: Content
}

struct SummaryProvider: TimelineProvider {
    nonisolated func placeholder(in context: Context) -> SummaryEntry {
        SummaryEntry(date: Date(), content: .sample)
    }

    nonisolated func getSnapshot(in context: Context, completion: @escaping (SummaryEntry) -> Void) {
        // Gallery previews get the sample data without a network walk;
        // real placements fetch.
        guard !context.isPreview else {
            completion(SummaryEntry(date: Date(), content: .sample))
            return
        }
        fetch(completion: completion)
    }

    nonisolated func getTimeline(in context: Context, completion: @escaping (Timeline<SummaryEntry>) -> Void) {
        fetch { entry in
            completion(Timeline(entries: [entry], policy: .after(WidgetRefresh.nextHour())))
        }
    }

    private nonisolated func fetch(completion: @escaping (SummaryEntry) -> Void) {
        Task {
            completion(await Self.loadEntry())
        }
    }

    private static func loadEntry(now: Date = Date()) async -> SummaryEntry {
        guard APIClient.shared.sessionToken != nil else {
            return SummaryEntry(date: now, content: .signedOut)
        }
        // A project claiming scope in the switcher is the active surface —
        // the widget summarizes its statement. Guests land here too: their
        // invited project is the one scope they may see.
        if let scoped = WidgetDataStore.loadScopedProject() {
            do {
                let report: ProjectReport = try await APIClient.shared.request(
                    "GET",
                    "bookkeeping/ledgers/\(scoped.ledgerId)/projects/\(scoped.id)/report"
                )
                let entries = (try? await fetchProjectEntries(
                    ledgerId: scoped.ledgerId,
                    projectId: scoped.id
                )) ?? []
                let snapshot = WidgetProjectSnapshot(
                    project: scoped,
                    statement: report.statement,
                    recentEntries: entries
                )
                WidgetDataStore.saveProjectSnapshot(snapshot)
                return SummaryEntry(
                    date: now,
                    content: .data(.project(snapshot, isGuest: WidgetDataStore.loadAppActiveLedgerIsGuest()))
                )
            } catch {
                if let cached = WidgetDataStore.loadProjectSnapshot() {
                    return SummaryEntry(
                        date: now,
                        content: .offline(.project(cached, isGuest: WidgetDataStore.loadAppActiveLedgerIsGuest()))
                    )
                }
                return SummaryEntry(date: now, content: .unavailable)
            }
        }
        do {
            // The app mirrors the guest-free active ledger into the shared
            // suite, so the common case resolves name and currency with no
            // request; without a mirror fall back to the same chain —
            // guest ledgers are excluded, their stats are invisible to the
            // invited member.
            let ledger: QianlaiLedger
            if let mirrored = WidgetDataStore.loadActiveLedger() {
                ledger = mirrored
            } else {
                let response: LedgersResponse = try await APIClient.shared.request("GET", "bookkeeping/ledgers")
                guard
                    let resolved = WidgetDataStore.resolveWidgetLedger(
                        from: response.ledgers,
                        storedId: WidgetDataStore.loadActiveLedgerId()
                    )
                else {
                    return SummaryEntry(date: now, content: .unavailable)
                }
                ledger = resolved
            }
            let dashboard: Dashboard = try await APIClient.shared.request(
                "GET",
                "bookkeeping/ledgers/\(ledger.id)/reports/dashboard"
            )
            let snapshot = WidgetSnapshot(ledgerId: ledger.id, dashboard: dashboard)
            WidgetDataStore.saveSnapshot(snapshot)
            return SummaryEntry(
                date: now,
                content: .data(.ledger(snapshot, ledgerName: ledger.name, currency: ledger.currency))
            )
        } catch {
            // The cached snapshot renders only while it still belongs to the
            // mirrored ledger — after a switch, A's numbers must never wear
            // B's name.
            let ledger = WidgetDataStore.loadActiveLedger()
            if let snapshot = WidgetDataStore.loadSnapshot(), snapshot.ledgerId == ledger?.id {
                return SummaryEntry(
                    date: now,
                    content: .offline(
                        .ledger(snapshot, ledgerName: ledger?.name, currency: ledger?.currency)
                    )
                )
            }
            return SummaryEntry(date: now, content: .unavailable)
        }
    }

    private static func fetchProjectEntries(ledgerId: String, projectId: String) async throws -> [WidgetRecentEntry] {
        let query = ApiQuery.build([
            ("project", projectId),
            ("limit", "5"),
        ])
        let response: EntriesResponse = try await APIClient.shared.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/entries\(query)"
        )
        return response.entries.prefix(5).map(WidgetRecentEntry.init(entry:))
    }
}

// MARK: - Views

/// Chinese finance money-direction colors, mirroring the app's
/// `Color.income` / `Color.expense`: inflows render red, outflows green.
private extension Color {
    static let widgetIncome = Color.red
    static let widgetExpense = Color.green
}

nonisolated enum WidgetLinks {
    static let quickEntry = URL(string: "qianlai://quick-entry")!
    static let dashboard = URL(string: "qianlai://dashboard")!
}

/// Shared refresh scheduling: the top of the next local hour. The app
/// additionally reloads timelines after every posting, scope switch, and
/// sign-out; the hourly walk is the self-healing backstop.
nonisolated enum WidgetRefresh {
    static func nextHour() -> Date {
        Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(minute: 0),
            matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600)
    }
}

struct SummaryEntryView: View {
    @Environment(\.widgetFamily) private var family

    let entry: SummaryEntry

    var body: some View {
        Group {
            switch entry.content {
            case let .data(presentation):
                content(presentation: presentation, offline: nil)
            case let .offline(presentation):
                content(presentation: presentation, offline: presentation.generatedAt)
            case .signedOut:
                placeholder(
                    icon: "person.crop.circle",
                    title: L10n.string("widget.signedOutTitle", defaultValue: "Not Signed In"),
                    message: L10n.string("widget.signedOutMessage", defaultValue: "Open Qianlai to see your balances.")
                )
            case .unavailable:
                placeholder(
                    icon: "arrow.clockwise",
                    title: L10n.string("widget.unavailableTitle", defaultValue: "Can't Refresh"),
                    message: L10n.string("widget.unavailableMessage", defaultValue: "Open Qianlai and try again.")
                )
            }
        }
        // The widget renders in its own process; read the app's mirrored
        // accent choice so Color.accentColor resolves the same as in-app.
        .tint(AppAccent.stored().color)
    }

    private func content(presentation: SummaryPresentation, offline: Date?) -> some View {
        Group {
            switch family {
            case .systemSmall:
                smallContent(presentation: presentation, offline: offline)
            case .systemMedium:
                mediumContent(presentation: presentation, offline: offline)
            default:
                largeContent(presentation: presentation, offline: offline)
            }
        }
        .containerBackground(for: .widget) {
            ZStack {
                Color(.systemBackground)
                if offline != nil {
                    LinearGradient(
                        colors: [Color.secondary.opacity(0.08), .clear],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
            }
        }
        // Small widgets put the tap on the quickest action; the larger
        // families open the dashboard, with the header chip going straight
        // to quick entry.
        .widgetURL(family == .systemSmall ? WidgetLinks.quickEntry : WidgetLinks.dashboard)
    }

    // MARK: Small — scope, month expense, headline

    private func smallContent(presentation: SummaryPresentation, offline: Date?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                scopeTitle(presentation)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(caption(presentation, offline: offline))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.string("account.type.expense", defaultValue: "Expense"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(Money.format(presentation.totalExpense, currency: presentation.currency))
                    .font(.title3.weight(.semibold).monospacedDigit())
                    .foregroundStyle(Color.widgetExpense)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            Spacer(minLength: 0)
            HStack(alignment: .firstTextBaseline) {
                Text(presentation.headlineLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                Text(Money.format(presentation.headlineValue, currency: presentation.currency))
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
        }
    }

    // MARK: Medium — stats beside two recent entries

    private func mediumContent(presentation: SummaryPresentation, offline: Date?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            header(presentation: presentation, offline: offline)
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    stat(
                        label: L10n.string("account.type.expense", defaultValue: "Expense"),
                        value: Money.format(presentation.totalExpense, currency: presentation.currency),
                        color: .widgetExpense
                    )
                    stat(
                        label: L10n.string("account.type.income", defaultValue: "Income"),
                        value: Money.format(presentation.totalIncome, currency: presentation.currency),
                        color: .widgetIncome
                    )
                    stat(
                        label: presentation.headlineLabel,
                        value: Money.format(presentation.headlineValue, currency: presentation.currency),
                        color: .primary
                    )
                }
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    Text(L10n.string("widget.recentEntries", defaultValue: "Recent Entries"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if presentation.recentEntries.isEmpty {
                        Text(verbatim: "—")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    } else {
                        ForEach(presentation.recentEntries.prefix(2)) { item in
                            recentRow(item, currency: presentation.currency)
                        }
                    }
                }
            }
        }
    }

    // MARK: Large — header, stat row, recent list filling the full height

    private func largeContent(presentation: SummaryPresentation, offline: Date?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            header(presentation: presentation, offline: offline)
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                stat(
                    label: L10n.string("account.type.expense", defaultValue: "Expense"),
                    value: Money.format(presentation.totalExpense, currency: presentation.currency),
                    color: .widgetExpense
                )
                stat(
                    label: L10n.string("account.type.income", defaultValue: "Income"),
                    value: Money.format(presentation.totalIncome, currency: presentation.currency),
                    color: .widgetIncome
                )
                stat(
                    label: L10n.string("common.net", defaultValue: "Net"),
                    value: Money.format(presentation.net, currency: presentation.currency),
                    color: .primary
                )
                Spacer(minLength: 0)
            }
            Divider()
            Text(L10n.string("widget.recentEntries", defaultValue: "Recent Entries"))
                .font(.caption2)
                .foregroundStyle(.secondary)
            // Stretches to the widget's full height: spare vertical space
            // is distributed evenly between rows (≥10pt each) so the large
            // size never leaves dead space above or below the content.
            VStack(alignment: .leading, spacing: 0) {
                let entries = Array(presentation.recentEntries.prefix(5))
                if entries.isEmpty {
                    Text(verbatim: "—")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                } else {
                    ForEach(entries.indices, id: \.self) { index in
                        if index > 0 {
                            Spacer(minLength: 10)
                        }
                        recentRow(entries[index], currency: presentation.currency)
                    }
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: Pieces

    /// The scope name with its kind marker: a folder tag for a project
    /// scope, plain text for a ledger.
    @ViewBuilder
    private func scopeTitle(_ presentation: SummaryPresentation) -> some View {
        if presentation.isProjectScope {
            HStack(spacing: 3) {
                Image(systemName: presentation.scopeSymbol)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Text(presentation.scopeName ?? "—")
            }
        } else {
            Text(presentation.scopeName ?? "—")
        }
    }

    private func header(presentation: SummaryPresentation, offline: Date?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    if presentation.isProjectScope {
                        Image(systemName: presentation.scopeSymbol)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    Text(presentation.scopeName ?? "—")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                }
                if !caption(presentation, offline: offline).isEmpty {
                    Text(caption(presentation, offline: offline))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            Link(destination: WidgetLinks.quickEntry) {
                Image(systemName: "plus")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color.accentColor.opacity(0.12)))
            }
            .accessibilityLabel(Text(L10n.string("tab.add", defaultValue: "Add")))
        }
    }

    private func stat(label: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.callout.weight(.semibold).monospacedDigit())
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private func recentRow(_ item: WidgetRecentEntry, currency: String?) -> some View {
        HStack(spacing: 8) {
            Group {
                if let icon = item.icon, !icon.isEmpty {
                    Text(icon)
                        .font(.caption)
                } else {
                    Image(systemName: fallbackSymbol(item.flow))
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 22, height: 22)
            .background(Circle().fill(Color.primary.opacity(0.06)))
            VStack(alignment: .leading, spacing: 0) {
                Text(item.title)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                Text(AppDates.formatEntryTime(item.date))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(signedAmount(item, currency: currency))
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(amountColor(item.flow))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private func placeholder(icon: String, title: String, message: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.secondary)
            Text(title)
                .font(.subheadline.weight(.semibold))
            Text(message)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .containerBackground(for: .widget) {
            Color(.systemBackground)
        }
    }

    // MARK: Helpers

    /// The secondary caption: the scope's month title — project statements
    /// are not month-windowed, so they have none — or, when the numbers are
    /// stale, when they were last updated.
    private func caption(_ presentation: SummaryPresentation, offline: Date?) -> String {
        if let offline {
            return String(
                format: L10n.string("widget.offlineFormat", defaultValue: "Updated %@"),
                AppDates.formatTimestamp(offline, locale: AppLanguage.resolvedLocale)
            )
        }
        return presentation.monthTitle ?? ""
    }

    private func fallbackSymbol(_ flow: WidgetRecentEntry.Flow) -> String {
        switch flow {
        case .expense: "arrow.down.circle.fill"
        case .income: "arrow.up.circle.fill"
        case .transfer: "arrow.left.arrow.right.circle.fill"
        }
    }

    /// Entry-row signing: outflows lead with a minus, inflows with a plus;
    /// transfers stay unsigned.
    private func signedAmount(_ item: WidgetRecentEntry, currency: String?) -> String {
        let formatted = Money.format(item.value, currency: currency)
        switch item.flow {
        case .expense: return "−\(formatted)"
        case .income: return "+\(formatted)"
        case .transfer: return formatted
        }
    }

    private func amountColor(_ flow: WidgetRecentEntry.Flow) -> Color {
        switch flow {
        case .expense: .widgetExpense
        case .income: .widgetIncome
        case .transfer: .primary
        }
    }
}
