//
//  QuickAddWidget.swift
//  QianlaiWidget
//
//  Created by Lisiur Day on 2026/9/6.
//

import WidgetKit
import SwiftUI

/// Standalone quick-add tile: one tap opens the app's quick-entry sheet via
/// the `qianlai://quick-entry` deep link. The header names the target the
/// same way the app resolves it — the active ledger, or the project claiming
/// quick-entry scope (explicit selection, auto-picked first project on guest
/// ledgers) — read from the App Group mirror the app keeps fresh. Denial
/// cases (no ledger, guest without project) are handled by the app's own
/// alert on the deep-link path.
struct QuickAddWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "QianlaiQuickAdd", provider: QuickAddProvider()) { entry in
            QuickAddEntryView(entry: entry)
        }
        .configurationDisplayName(L10n.string("widget.quickAdd.displayName", defaultValue: "Quick Add"))
        .description(L10n.string("widget.quickAdd.description", defaultValue: "One tap to record a new entry."))
        .supportedFamilies([.systemSmall])
    }
}

nonisolated struct QuickAddEntry: TimelineEntry {
    let date: Date
    let ledgerName: String?
    /// The project claiming quick-entry scope; nil = ledger-wide.
    let scopedProjectName: String?
    /// Whether that project belongs to a guest ledger (person-badged glyph).
    let scopedProjectIsGuest: Bool
}

struct QuickAddProvider: TimelineProvider {
    nonisolated func placeholder(in context: Context) -> QuickAddEntry {
        Self.loadEntry()
    }

    nonisolated func getSnapshot(in context: Context, completion: @escaping (QuickAddEntry) -> Void) {
        completion(Self.loadEntry())
    }

    nonisolated func getTimeline(in context: Context, completion: @escaping (Timeline<QuickAddEntry>) -> Void) {
        // Mirror reads only — the hourly walk is a self-healing backstop,
        // the app drives real refreshes on every scope change.
        completion(Timeline(entries: [Self.loadEntry()], policy: .after(WidgetRefresh.nextHour())))
    }

    private nonisolated static func loadEntry(now: Date = Date()) -> QuickAddEntry {
        QuickAddEntry(
            date: now,
            ledgerName: WidgetDataStore.loadActiveLedger()?.name,
            scopedProjectName: WidgetDataStore.loadScopedProject()?.name,
            scopedProjectIsGuest: WidgetDataStore.loadAppActiveLedgerIsGuest()
        )
    }
}

struct QuickAddEntryView: View {
    let entry: QuickAddEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            scopeLine
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 62, height: 62)
                    .background(Circle().fill(Color.accentColor.opacity(0.12)))
                Text(L10n.string("tab.add", defaultValue: "Add"))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            // Full-width frame re-centers the button group horizontally
            // while the outer topLeading frame keeps the scope name pinned
            // to the left edge.
            .frame(maxWidth: .infinity)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) {
            Color(.systemBackground)
        }
        .widgetURL(WidgetLinks.quickEntry)
    }

    /// Top-left scope header, styled like the summary widget's ledger name
    /// (caption semibold, primary): a folder-tagged project name when a
    /// project claims scope, otherwise the active ledger; the app display
    /// name when nothing is mirrored (signed out, no ledger yet).
    @ViewBuilder
    private var scopeLine: some View {
        if let project = entry.scopedProjectName {
            HStack(spacing: 3) {
                Image(systemName: entry.scopedProjectIsGuest ? "folder.badge.person.crop" : "folder")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Text(project)
                    .font(.caption.weight(.semibold))
            }
        } else {
            Text(entry.ledgerName ?? defaultScopeName)
                .font(.caption.weight(.semibold))
        }
    }

    private var defaultScopeName: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String) ?? "Qianlai"
    }
}
