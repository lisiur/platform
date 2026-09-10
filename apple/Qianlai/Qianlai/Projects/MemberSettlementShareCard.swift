//
//  MemberSettlementShareCard.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/10.
//

import SwiftUI

/// The off-screen card rendered into the member settlement share image:
/// the project + member header, the settlement summary, every entry with
/// the member's per-entry share and 应收/应付 line (day-grouped like the
/// journal), then the count/footer. Always rendered light — the image
/// travels to chats and albums where the app's current appearance
/// shouldn't leak in — so dark colors are never referenced through
/// dynamic lookup at render time beyond what the light scheme resolves.
///
/// Rendered through `ImageRenderer`, which snapshots synchronously:
/// `avatarImage` must be preloaded by the caller (AsyncImage never lands
/// in a render pass), and the caller applies the app accent, locale, and
/// light color scheme as environment overrides on the content.
struct MemberSettlementShareCard: View {
    @Environment(\.locale) private var locale

    let projectName: String
    let member: ProjectSettlementRow
    let ledger: QianlaiLedger
    let entries: [JournalEntry]
    let memberUserIds: [String]?
    /// Preloaded avatar bitmap; nil renders the initial-letter circle.
    let avatarImage: UIImage?
    /// Entries behind `entries` in total — larger means the image was
    /// truncated to the cap and the footer says so.
    let totalEntries: Int
    let generatedAt: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            summaryCard
            ForEach(dayGroups, id: \.day) { group in
                daySection(group)
            }
            footer
        }
        .padding(20)
        .frame(width: 375, alignment: .topLeading)
        .background(Color.groupedCanvas)
    }

    private var dayGroups: [(day: Date, entries: [JournalEntry])] {
        entries.groupedByDay
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(projectName)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text(L10n.string("projects.shareCard.title", defaultValue: "Settlement details"))
                .font(.title2.weight(.bold))
        }
    }

    // MARK: - Summary

    /// Mirrors SettlementSummaryLabel's anatomy (avatar + name + paid/share
    /// captions left, status caption + balance hero right) but draws its
    /// own card chrome and takes a preloaded bitmap instead of AsyncImage.
    private var summaryCard: some View {
        HStack(spacing: 10) {
            avatar
            VStack(alignment: .leading, spacing: 4) {
                Text(member.name)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L10n.string("projects.paid", defaultValue: "Paid"))
                        Text(Money.format(member.paid, currency: ledger.currency))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L10n.string("projects.share", defaultValue: "Share"))
                        Text(Money.format(member.share, currency: ledger.currency))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(balanceStatus)
                    .font(.caption)
                Text(Money.format(member.balance, currency: ledger.currency))
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .monospacedDigit()
            }
            .foregroundStyle(
                member.balance > 0 ? Color.income : member.balance < 0 ? Color.expense : Color.secondary
            )
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.cardSurface)
        )
    }

    private var balanceStatus: String {
        if member.balance > 0 { return L10n.string("projects.balanceReceives", defaultValue: "Receives") }
        if member.balance < 0 { return L10n.string("projects.balanceOwes", defaultValue: "Owes") }
        return L10n.string("projects.balanceSettled", defaultValue: "Settled up")
    }

    private var avatar: some View {
        let initial = String(member.name.prefix(1)).uppercased()
        return Group {
            if let avatarImage {
                Image(uiImage: avatarImage)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(initial)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color.accentColor.opacity(0.85)))
        .clipShape(Circle())
    }

    // MARK: - Entries

    private func daySection(_ group: (day: Date, entries: [JournalEntry])) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(AppDates.formatEntryDay(group.day, locale: locale))
                .font(.caption)
                .foregroundStyle(.secondary)
            VStack(spacing: 0) {
                ForEach(group.entries) { entry in
                    entryRow(entry)
                    if entry.id != group.entries.last?.id {
                        Divider()
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.cardSurface)
            )
        }
    }

    /// Compact mirror of EntryRow's leading column (badge, title with the
    /// memo riding inline, time + payer caption) with the settlement page's
    /// right-hand amount column — the same figures, via the same helper.
    private func entryRow(_ entry: JournalEntry) -> some View {
        HStack(spacing: 10) {
            categoryBadge(entry)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(title(of: entry))
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
                    if let payer = payerCaption(of: entry) {
                        Text(verbatim: "·")
                        Text(payer)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            let amounts = SettlementAmountColumn.make(
                for: entry,
                userId: member.userId,
                memberUserIds: memberUserIds,
                currency: ledger.currency
            )
            VStack(alignment: .trailing, spacing: 1) {
                Text(amounts.headline.text)
                    .font(.callout.weight(.semibold).monospacedDigit())
                    .foregroundStyle(amounts.headline.color)
                let captions = [amounts.total, amounts.paid].compactMap { $0 }
                ForEach(captions.indices, id: \.self) { index in
                    Text(captions[index].text)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(captions[index].color ?? Color.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 10)
    }

    private func categoryBadge(_ entry: JournalEntry) -> some View {
        Group {
            if let icon = categoryLine(of: entry)?.account.icon, !icon.isEmpty {
                Text(icon)
                    .font(.title3)
            } else {
                Image(systemName: fallbackSymbol(of: entry))
                    .font(.body.weight(.medium))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color.primary.opacity(0.06)))
    }

    private func fallbackSymbol(of entry: JournalEntry) -> String {
        switch categoryLine(of: entry)?.account.type {
        case .expense: "arrow.down.circle.fill"
        case .income: "arrow.up.circle.fill"
        default: "arrow.left.arrow.right.circle.fill"
        }
    }

    /// The entry's category line (expense wins over income); nil for
    /// pocket-to-pocket transfers. Mirrors EntryRow's private helper.
    private func categoryLine(of entry: JournalEntry) -> JournalLine? {
        entry.lines.first { $0.account.type == .expense }
            ?? entry.lines.first { $0.account.type == .income }
    }

    private func title(of entry: JournalEntry) -> String {
        categoryLine(of: entry)?.account.displayName
            ?? L10n.string("quick.kind.transfer", defaultValue: "Transfer")
    }

    /// Project surfaces always name the payer: 由 X 付款 on expenses, 由 X
    /// 收款 on income. Mirrors EntryRow's alwaysShowsPayer branch.
    private func payerCaption(of entry: JournalEntry) -> String? {
        let income = categoryLine(of: entry)?.account.type == .income
        let format = income
            ? L10n.string("journal.receivedByFormat", defaultValue: "Received by %@")
            : L10n.string("journal.paidByFormat", defaultValue: "Paid by %@")
        if let payerName = entry.paidBy?.name ?? entry.createdBy?.name, !payerName.isEmpty {
            return String(format: format, payerName)
        }
        return nil
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: 6) {
            if totalEntries > entries.count {
                Text(String(
                    format: L10n.string(
                        "projects.shareCard.entriesTruncated",
                        defaultValue: "Showing first %d entries"
                    ),
                    entries.count
                ))
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Text(String(
                format: L10n.string("projects.shareCard.entryCount", defaultValue: "%d entries"),
                totalEntries
            ))
            .font(.caption)
            .foregroundStyle(.secondary)
            Text(String(
                format: L10n.string("projects.shareCard.generatedAt", defaultValue: "Generated %@"),
                AppDates.formatTimestamp(generatedAt, locale: locale)
            ))
            .font(.caption2)
            .foregroundStyle(.tertiary)
            Text(verbatim: "钱来")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.accentColor)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }
}
