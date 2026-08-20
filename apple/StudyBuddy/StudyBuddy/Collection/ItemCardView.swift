import SwiftUI

struct ItemCardView: View {
    let item: CollectionItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                BadgeView(text: item.type.label, color: item.type.badgeColor)
                if item.enrichStatus == .pending {
                    HStack(spacing: 4) {
                        ProgressView().controlSize(.small)
                        Text("生成中…")
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.primary.opacity(0.06)))
                }
                if item.enrichStatus == .failed {
                    BadgeView(text: "生成释义失败", color: .red)
                }
                if let count = item.enrichmentsCount, count > 0 {
                    BadgeView(text: "\(count) 条释义", outlined: true)
                }
                Spacer(minLength: 0)
                Text(CollectionTime.relative(item.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            Text(item.title ?? item.source)
                .font(.subheadline.weight(.medium))
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let note = item.note, !note.isEmpty {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if item.type == .link {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.up.right.square")
                    Text(item.url ?? item.source)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            if !item.tags.isEmpty {
                WrapLayout(spacing: 5) {
                    ForEach(Array(item.tags.prefix(4)), id: \.self) { tag in
                        BadgeView(text: tag, outlined: true)
                    }
                    if item.tags.count > 4 {
                        Text("+\(item.tags.count - 4)")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 2)
                    }
                }
            }
        }
        .padding(14)
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
