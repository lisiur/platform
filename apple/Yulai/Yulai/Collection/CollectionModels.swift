import Foundation
import SwiftUI

enum CollectionItemType: String, Codable, CaseIterable, Identifiable {
    case word = "WORD"
    case phrase = "PHRASE"
    case sentence = "SENTENCE"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .word: "单词"
        case .phrase: "短语"
        case .sentence: "句子"
        }
    }

    var badgeColor: Color {
        switch self {
        case .word: .accentColor
        case .phrase: .purple
        case .sentence: .blue
        }
    }

    static let enrichmentKinds: [CollectionItemType: [EnrichmentKind]] = [
        .word: [.translation, .etymology, .examples, .synonyms],
        .phrase: [.translation, .examples],
        .sentence: [.translation, .grammar],
    ]

    static func detect(_ source: String) -> CollectionItemType {
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        let words = trimmed.split(whereSeparator: \.isWhitespace)
        if words.count <= 1 { return .word }
        let endsWithPunctuation = trimmed.last.map { ".!?…".contains($0) } ?? false
        if !endsWithPunctuation && words.count <= 5 { return .phrase }
        return .sentence
    }
}

enum CollectionItemStatus: String, Codable, CaseIterable, Identifiable {
    case active
    case learned
    case archived

    var id: String { rawValue }

    var label: String {
        switch self {
        case .active: "学习中"
        case .archived: "已归档"
        case .learned: "已学习"
        }
    }
}

enum EnrichStatus: String, Codable, Hashable {
    case none
    case pending
    case ok
    case failed
}

enum EnrichmentKind: String, CaseIterable, Identifiable {
    case translation
    case etymology
    case examples
    case synonyms
    case grammar

    var id: String { rawValue }

    var label: String {
        switch self {
        case .translation: "翻译"
        case .etymology: "词源"
        case .examples: "例句"
        case .synonyms: "同义词与反义词"
        case .grammar: "语法"
        }
    }
}

struct ItemEnrichment: Codable, Hashable, Identifiable {
    let id: String
    let kind: String
    let content: [String: EnrichValue]
    let model: String
    let generatedAt: Date
}

struct ItemAttachment: Codable, Hashable {
    let id: String
    let url: String
}

struct CollectionItem: Codable, Hashable, Identifiable {
    let id: String
    let type: CollectionItemType
    let source: String
    var url: String?
    var title: String?
    var note: String?
    var tags: [String]
    var status: String
    var enrichStatus: EnrichStatus
    var enrichError: String?
    var enrichmentsCount: Int?
    var createdAt: Date
    var updatedAt: Date
    var enrichments: [ItemEnrichment]?
    var attachments: [ItemAttachment]?
}

enum EnrichValue: Codable, Hashable {
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([EnrichValue])
    case object([String: EnrichValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([EnrichValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: EnrichValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Unsupported JSON value"
                )
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var arrayValue: [EnrichValue]? {
        if case .array(let value) = self { return value }
        return nil
    }

    var objectValue: [String: EnrichValue]? {
        if case .object(let value) = self { return value }
        return nil
    }
}

struct PendingImport {
    let fileName: String
    let count: Int
    let items: [EnrichValue]
}

struct UpdateItemBody: Encodable {
    var title: String
    var note: String
    var tags: [String]
    var status: String
    var url: String

    enum CodingKeys: String, CodingKey {
        case title
        case note
        case tags
        case status
        case url
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(
            title.isEmpty ? nil : title,
            forKey: .title
        )
        try container.encodeIfPresent(
            note.isEmpty ? nil : note,
            forKey: .note
        )
        try container.encode(tags, forKey: .tags)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(
            url.isEmpty ? nil : url,
            forKey: .url
        )
    }
}
