import SwiftUI

struct EnrichmentSectionView: View {
    let kind: EnrichmentKind
    let data: ItemEnrichment?
    let pending: Bool
    /// The collected term (`item.source`); occurrences inside example
    /// sentences are highlighted.
    var word: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(kind.label)
                .font(.subheadline.weight(.semibold))
            if let data {
                EnrichmentContentView(kind: kind, content: data.content, word: word)
            } else if pending {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Enrichments will be auto-generated after the item is added…")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            } else {
                Text("Not yet generated.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct EnrichmentContentView: View {
    let kind: EnrichmentKind
    let content: [String: EnrichValue]
    var word: String = ""

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
            highlighted(content["origin"]?.stringValue ?? "", base: .callout)
                .font(.callout)
        case .examples:
            VStack(alignment: .leading, spacing: 8) {
                ForEach(
                    Array((content["sentences"]?.arrayValue ?? []).enumerated()),
                    id: \.offset
                ) { _, sentence in
                    let object = sentence.objectValue ?? [:]
                    VStack(alignment: .leading, spacing: 2) {
                        highlighted(object["en"]?.stringValue ?? "", base: .callout)
                            .font(.callout)
                        highlighted(object["zh"]?.stringValue ?? "", base: .caption)
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
                    wordRow(label: "Synonyms", words: synonyms, outlined: false)
                }
                if !antonyms.isEmpty {
                    wordRow(label: "Antonyms", words: antonyms, outlined: true)
                }
            }
        case .grammar:
            VStack(alignment: .leading, spacing: 8) {
                highlighted(content["breakdown"]?.stringValue ?? "", base: .callout)
                    .font(.callout)
                let points = content["keyPoints"]?.arrayValue?
                    .compactMap(\.stringValue) ?? []
                if !points.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(points, id: \.self) { point in
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text("•")
                                highlighted(point, base: .callout)
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
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            WrapLayout(spacing: 5) {
                ForEach(words, id: \.self) { word in
                    BadgeView(text: word, outlined: outlined)
                }
            }
        }
    }

    /// The sentence with every occurrence of the collected term emphasized
    /// (semibold, accent color). Built as an AttributedString because
    /// `Text + Text` concatenation is deprecated as of macOS 26 / iOS 26;
    /// in-Text styling wins over the ambient `.foregroundStyle(.secondary)`
    /// on the zh line, keeping highlights visible in both languages.
    private func highlighted(_ sentence: String, base: Font) -> Text {
        var attributed = AttributedString(sentence)
        for range in termRanges(in: sentence) {
            guard
                let attributedRange = Range(
                    NSRange(range, in: sentence),
                    in: attributed
                )
            else { continue }
            attributed[attributedRange].swiftUI.foregroundColor = .accentColor
            attributed[attributedRange].swiftUI.font = base.weight(.semibold)
        }
        return Text(attributed)
    }

    /// Case-insensitive occurrences of the term in the sentence. Phrases
    /// match verbatim; single words also catch simple English inflections
    /// (tests / tested / testing) via word boundaries.
    private func termRanges(in sentence: String) -> [Range<String.Index>] {
        let term = word.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty, !sentence.isEmpty else { return [] }
        let pattern: String
        let escaped = NSRegularExpression.escapedPattern(for: term)
        if term.contains(where: \.isWhitespace) {
            pattern = "(?i)\(escaped)"
        } else {
            pattern = "(?i)\\b\(escaped)(?:es|s|ed|ing)?\\b"
        }
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return []
        }
        return regex
            .matches(in: sentence, range: NSRange(sentence.startIndex..., in: sentence))
            .compactMap { Range($0.range, in: sentence) }
    }
}
