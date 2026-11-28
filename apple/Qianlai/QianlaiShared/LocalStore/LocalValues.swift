//
//  LocalValues.swift
//  Qianlai
//

import Foundation

/// The storage-layer conversion rules shared by every repository row
/// mapping (C2): UTC ISO8601 timestamps with fractional seconds, and
/// cents↔yuan at the server's exact rounding.
nonisolated enum LocalValues {
    /// Timestamps as TEXT: UTC ISO8601 with fractional seconds. Built per
    /// call — DateFormatter subclasses aren't thread-safe and the reads
    /// run on GRDB's reader threads; personal-scale row counts make the
    /// construction cost irrelevant. A no-fraction fallback parses older
    /// strings written without the milliseconds.
    private static func makeTimestampFormatter(fractional: Bool) -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        var options: ISO8601DateFormatter.Options = [.withInternetDateTime, .withTimeZone]
        if fractional {
            options.insert(.withFractionalSeconds)
        }
        formatter.formatOptions = options
        formatter.timeZone = TimeZone(identifier: "UTC") ?? .current
        return formatter
    }

    static func timestamp(from date: Date) -> String {
        makeTimestampFormatter(fractional: true).string(from: date)
    }

    static func date(fromTimestamp string: String) -> Date? {
        makeTimestampFormatter(fractional: true).date(from: string)
            ?? makeTimestampFormatter(fractional: false).date(from: string)
    }

    /// `Decimal(12,2)` → INTEGER cents. The rounding must match the
    /// server's `Math.round(Number(x) * 100)` (report.service `lineFlowCents`)
    /// and the client's `entryValueCents`, or the double-computation
    /// comparison fixtures can't hold.
    static func cents(fromYuan value: Double) -> Int {
        Int((value * 100).rounded())
    }

    /// INTEGER cents → yuan (exact at 2 fraction digits).
    static func yuan(fromCents cents: Int) -> Double {
        Double(cents) / 100
    }

    /// `Decimal(9,6)` coordinates → REAL (direct).
    static func coordinate(fromDouble value: Double) -> Double {
        value
    }

    /// JSON-array column encoding (`flags`, `budgetExcludedAccountIds`) —
    /// stored and read whole, never queried by element.
    static func jsonArray(_ values: [String]) -> String {
        guard let data = try? JSONEncoder().encode(values) else { return "[]" }
        return String(data: data, encoding: .utf8) ?? "[]"
    }

    static func stringArray(fromJSON json: String?) -> [String] {
        guard let json, let data = json.data(using: .utf8),
              let values = try? JSONDecoder().decode([String].self, from: data)
        else { return [] }
        return values
    }

    /// Optional JSON-object column encoding (`meta`).
    static func jsonObject(_ meta: [String: JSONValue]?) -> String? {
        guard let meta else { return nil }
        guard let data = try? JSONEncoder().encode(meta) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func metaDictionary(fromJSON json: String?) -> [String: JSONValue]? {
        guard let json, let data = json.data(using: .utf8),
              let meta = try? JSONDecoder().decode([String: JSONValue].self, from: data)
        else { return nil }
        return meta
    }
}
