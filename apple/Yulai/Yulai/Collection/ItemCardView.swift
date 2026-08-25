import SwiftUI

struct ItemCardView: View {
    let item: CollectionItem

    /// macOS text styles run much smaller than their iOS counterparts
    /// (e.g. callout is 12pt vs 16pt), so the card's fonts are bumped
    /// there to keep the grid comfortably readable.
    private enum CardFonts {
        static var badge: Font {
            #if os(macOS)
            .subheadline.weight(.medium)
            #else
            .caption2.weight(.medium)
            #endif
        }

        static var title: Font {
            #if os(macOS)
            .title3.weight(.semibold)
            #else
            .callout.weight(.semibold)
            #endif
        }

        static var note: Font {
            #if os(macOS)
            .subheadline
            #else
            .caption
            #endif
        }

        static var timestamp: Font {
            #if os(macOS)
            .subheadline
            #else
            .caption2
            #endif
        }
    }

    private var statusBadge: some View {
        switch item.status {
        case "learned": BadgeView(text: "已学习", color: .green, font: CardFonts.badge)
        case "archived": BadgeView(text: "已归档", outlined: true, font: CardFonts.badge)
        default: BadgeView(text: "学习中", color: .orange, font: CardFonts.badge)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if item.enrichStatus == .pending {
                    HStack(spacing: 4) {
                        ProgressView().controlSize(.small)
                        Text("生成中…")
                    }
                    .font(CardFonts.badge)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.primary.opacity(0.06)))
                }
                if item.enrichStatus == .failed {
                    BadgeView(text: "生成释义失败", color: .red, font: CardFonts.badge)
                }
            }
            Text(item.title ?? item.source)
                .font(CardFonts.title)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let note = item.note, !note.isEmpty {
                Text(note)
                    .font(CardFonts.note)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if !item.tags.isEmpty {
                WrapLayout(spacing: 5) {
                    ForEach(Array(item.tags.prefix(4)), id: \.self) { tag in
                        BadgeView(text: tag, outlined: true, font: CardFonts.badge)
                    }
                    if item.tags.count > 4 {
                        Text("+\(item.tags.count - 4)")
                            .font(CardFonts.badge)
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 2)
                    }
                }
            }
            HStack {
                statusBadge
                Spacer(minLength: 0)
                Text(CollectionTime.relative(item.createdAt))
                    .font(CardFonts.timestamp)
                    .foregroundStyle(.tertiary)
            }
        }
        #if os(macOS)
        .padding(16)
        #else
        .padding(14)
        #endif
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.primary.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08))
        )
    }
}
