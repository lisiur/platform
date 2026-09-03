//
//  JournalDetailView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/3.
//

import SwiftUI

/// Full record of one journal entry, pushed from any entry list row: the
/// standard row card (gross amounts — the accounting record, not the
/// viewer's share), the entry's metadata, and every double-entry line.
/// Editors and owners can edit (quick-entry sheet) or delete from the
/// toolbar, mirroring the list's swipe actions. The live copy resolves
/// through the enclosing context's `JournalStore`, so an edit made here
/// (or anywhere) re-renders the page; deleting pops back to the list.
struct JournalDetailView: View {
    @Environment(JournalStore.self) private var store
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ReportStore.self) private var reportStore
    @Environment(ToastCenter.self) private var toast
    @Environment(AuthManager.self) private var auth
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss

    /// The pushed snapshot; the freshest copy comes from the store below.
    let entry: JournalEntry

    @State private var isEditPresented = false
    @State private var isDeletePending = false

    /// The store's copy when present (edits from any surface land here);
    /// the pushed snapshot otherwise — e.g. right after a delete, while
    /// the pop animation runs.
    private var resolved: JournalEntry {
        store.entries.first { $0.id == entry.id } ?? entry
    }

    private var canPost: Bool {
        ledgerStore.activeLedger?.canPost == true
    }

    var body: some View {
        List {
            headerSection
            detailsSection
            sharesSection
            linesSection
        }
        .navigationTitle(Text(L10n.string("journal.detail.title", defaultValue: "Entry Details")))
        .inlineNavigationBarTitle()
        .toolbar {
            if canPost {
                ToolbarItem(placement: .primaryAction) {
                    menu
                }
            }
        }
        .sheet(isPresented: $isEditPresented) {
            NavigationStack {
                QuickEntryView(entry: resolved)
            }
            .interactiveDismissDisabled()
        }
        .alert(
            L10n.string("journal.delete", defaultValue: "Delete"),
            isPresented: $isDeletePending
        ) {
            Button("Delete", role: .destructive) {
                Task { await delete() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Delete entry #\(resolved.entryNo)? Reports will be recalculated.")
        }
    }

    // MARK: - Sections

    /// The row card, exactly as the list renders it — gross amounts here
    /// (the record), viewer-share context lives in the details rows.
    private var headerSection: some View {
        Section {
            EntryRow(
                entry: resolved,
                currency: ledgerStore.activeLedger?.currency ?? "",
                viewerUserId: auth.currentUser?.id,
                showsViewerShare: false
            )
            .listRowSeparator(.hidden)
        }
    }

    @ViewBuilder
    private var detailsSection: some View {
        Section {
            row(
                L10n.string("journal.detail.date", defaultValue: "Date"),
                value: AppDates.formatTimestamp(resolved.date)
            )
            if let creatorName = resolved.createdBy?.name, !creatorName.isEmpty {
                row(
                    L10n.string("journal.detail.creator", defaultValue: "Created By"),
                    value: creatorName
                )
            }
            if let project = resolved.project {
                row(
                    L10n.string("journal.detail.project", defaultValue: "Project"),
                    value: project.name
                )
            }
            if let location = resolved.location, let label = location.rowLabel {
                row(
                    L10n.string("journal.detail.location", defaultValue: "Location"),
                    value: label
                )
            }
            if !resolved.countsInLedger {
                row(
                    L10n.string("journal.notCounted", defaultValue: "Not counted in income & expense"),
                    value: ""
                )
            }
        } header: {
            Text(L10n.string("journal.detail.details", defaultValue: "Details"))
        }
    }

    /// Every tagged participant's equal share of the entry's value — the
    /// same split math as the server (deduped, sorted by userId, remainder
    /// cents to the earliest ids), signed by flow direction: owing renders
    /// "−", receiving "+". Hidden for untagged entries, whose value belongs
    /// to the creator alone.
    @ViewBuilder
    private var sharesSection: some View {
        let rows = shareRows
        if !rows.isEmpty {
            Section {
                ForEach(rows, id: \.userId) { share in
                    row(share.name, value: share.amount)
                }
            } header: {
                Text(L10n.string("journal.detail.shares", defaultValue: "Shares"))
            }
        }
    }

    private var shareRows: [(userId: String, name: String, amount: String)] {
        let tagged = resolved.participants ?? []
        guard !tagged.isEmpty else { return [] }
        let value = resolved.valueCents
        let splitUserIds = Array(Set(tagged.map(\.userId))).sorted()
        let base = JournalEntry.floorDiv(value, splitUserIds.count)
        let remainder = value - base * splitUserIds.count
        let currency = ledgerStore.activeLedger?.currency
        return splitUserIds.map { userId in
            let index = splitUserIds.firstIndex(of: userId) ?? 0
            let cents = base + (index < remainder ? 1 : 0)
            let name = tagged.first { $0.userId == userId }?.user?.name ?? userId
            let amount: String
            if cents == 0 {
                amount = Money.format(0, currency: currency)
            } else {
                amount = "\(cents < 0 ? "+" : "−")\(Money.format(abs(Double(cents) / 100), currency: currency))"
            }
            return (userId, name, amount)
        }
    }

    /// Every double-entry line, including seeded default-pocket lines the
    /// list rows hide — the detail page is the full record.
    @ViewBuilder
    private var linesSection: some View {
        Section {
            ForEach(resolved.lines) { line in
                lineRow(line)
            }
        } header: {
            Text(L10n.string("journal.detail.lines", defaultValue: "Lines"))
        }
    }

    private func lineRow(_ line: JournalLine) -> some View {
        HStack(spacing: 10) {
            lineBadge(line)
            VStack(alignment: .leading, spacing: 2) {
                Text(line.account.displayName)
                    .font(.subheadline)
                    .lineLimit(1)
                if let memo = line.memo, !memo.isEmpty {
                    Text(memo)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(lineAmount(line))
                .font(.callout.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private func lineBadge(_ line: JournalLine) -> some View {
        Group {
            if let icon = line.account.icon, !icon.isEmpty {
                Text(icon)
                    .font(.footnote)
            } else {
                Image(systemName: fallbackSymbol(for: line.account.type))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 28, height: 28)
        .background(Circle().fill(Color.primary.opacity(0.06)))
    }

    private func fallbackSymbol(for type: AccountType) -> String {
        switch type {
        case .expense: "arrow.down.circle.fill"
        case .income: "arrow.up.circle.fill"
        case .asset, .liability, .equity: "arrow.left.arrow.right.circle.fill"
        }
    }

    /// Debits read "+", credits read "−" — the direction money moved
    /// relative to the account, matching the web table's line amounts.
    private func lineAmount(_ line: JournalLine) -> String {
        if line.debit > 0 {
            return "+\(Money.format(line.debit, currency: ledgerStore.activeLedger?.currency))"
        }
        if line.credit > 0 {
            return "−\(Money.format(line.credit, currency: ledgerStore.activeLedger?.currency))"
        }
        return Money.format(0, currency: ledgerStore.activeLedger?.currency)
    }

    // MARK: - Rows & actions

    private func row(_ label: String, value: String) -> some View {
        LabeledContent {
            if !value.isEmpty {
                Text(value)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
            }
        } label: {
            Text(label)
                .foregroundStyle(.primary)
        }
    }

    private var menu: some View {
        Menu {
            Button {
                isEditPresented = true
            } label: {
                Label("Edit", systemImage: "pencil")
            }
            Button(role: .destructive) {
                isDeletePending = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
    }

    private func delete() async {
        do {
            try await store.delete(resolved)
            toast.show(L10n.string("journal.deleteSuccess", defaultValue: "Entry deleted"))
            Task { await reportStore.refreshAfterPosting() }
            dismiss()
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}
