import SwiftUI

struct EnrichmentSectionView: View {
    let kind: EnrichmentKind
    let data: ItemEnrichment?
    let pending: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(kind.label)
                    .font(.subheadline.weight(.semibold))
                Text(kind.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let data {
                EnrichmentContentView(kind: kind, content: data.content)
                Text("\(data.model) · \(CollectionTime.full(data.generatedAt))")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            } else if pending {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("条目添加后将自动生成全部释义…")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            } else {
                Text("尚未生成。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.primary.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08))
        )
    }
}

struct EnrichmentContentView: View {
    let kind: EnrichmentKind
    let content: [String: EnrichValue]

    var body: some View {
        switch kind {
        case .translation:
            VStack(alignment: .leading, spacing: 4) {
                Text(content["translation"]?.stringValue ?? "—")
                    .font(.title3.weight(.medium))
                let partOfSpeech = content["partOfSpeech"]?.stringValue
                let pronunciation = content["pronunciation"]?.stringValue
                if partOfSpeech != nil || pronunciation != nil {
                    HStack(spacing: 8) {
                        if let partOfSpeech {
                            Text(partOfSpeech)
                        }
                        if let pronunciation {
                            Text(pronunciation)
                                .font(.system(.callout, design: .monospaced))
                        }
                    }
                    .font(.callout)
                    .foregroundStyle(.secondary)
                }
            }
        case .etymology:
            Text(content["origin"]?.stringValue ?? "")
                .font(.callout)
        case .examples:
            VStack(alignment: .leading, spacing: 8) {
                ForEach(
                    Array((content["sentences"]?.arrayValue ?? []).enumerated()),
                    id: \.offset
                ) { _, sentence in
                    let object = sentence.objectValue ?? [:]
                    VStack(alignment: .leading, spacing: 2) {
                        Text(object["en"]?.stringValue ?? "")
                            .font(.callout)
                        Text(object["zh"]?.stringValue ?? "")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        case .synonyms:
            VStack(alignment: .leading, spacing: 8) {
                let synonyms = content["synonyms"]?.arrayValue?
                    .compactMap(\.stringValue) ?? []
                let antonyms = content["antonyms"]?.arrayValue?
                    .compactMap(\.stringValue) ?? []
                if !synonyms.isEmpty {
                    wordRow(label: "同义词", words: synonyms, outlined: false)
                }
                if !antonyms.isEmpty {
                    wordRow(label: "反义词", words: antonyms, outlined: true)
                }
            }
        case .grammar:
            VStack(alignment: .leading, spacing: 8) {
                Text(content["breakdown"]?.stringValue ?? "")
                    .font(.callout)
                let points = content["keyPoints"]?.arrayValue?
                    .compactMap(\.stringValue) ?? []
                if !points.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(points, id: \.self) { point in
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text("•")
                                Text(point)
                                    .font(.callout)
                            }
                        }
                    }
                }
            }
        }
    }

    private func wordRow(label: String, words: [String], outlined: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(label)：")
                .font(.caption)
                .foregroundStyle(.secondary)
            WrapLayout(spacing: 5) {
                ForEach(words, id: \.self) { word in
                    BadgeView(text: word, outlined: outlined)
                }
            }
        }
    }
}
