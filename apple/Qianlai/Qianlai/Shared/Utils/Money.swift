//
//  Money.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation

/// Money and date formatting helpers for bookkeeping values. Amounts mirror
/// the webapp's `formatAmount`: always two fraction digits with grouping.
enum Money {
    /// NumberFormatter isn't Sendable, so build one per call (formatting is
    /// not hot) and stay callable from any isolation.
    nonisolated static func format(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.usesGroupingSeparator = true
        return formatter.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
    }
}

/// Entry dates are stored at UTC midnight, so window boundaries must be UTC
/// instants built from the picked day — local-timezone Dates skew the window
/// by up to a day for non-UTC users.
enum UTCDates {
    private static var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    static var utcNow: Date {
        utcCalendar.startOfDay(for: Date())
    }

    /// `yyyy-MM-dd` in UTC — the wire format the set-balance endpoint expects.
    static func utcDayString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func utcDayString(year: Int, month: Int, day: Int) -> String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    /// Midnight UTC of the given yyyy-MM-dd, else nil.
    static func date(fromUTCDayString day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        components.timeZone = TimeZone(identifier: "UTC")
        return utcCalendar.date(from: components)
    }

    /// Inclusive start instant (00:00:00.000Z) for query windows.
    static func startOfUTCDay(_ date: Date) -> Date {
        utcCalendar.startOfDay(for: date)
    }

    /// Inclusive end instant (23:59:59.999Z) for query windows.
    static func endOfUTCDay(_ date: Date) -> Date {
        guard let nextDay = utcCalendar.date(byAdding: .day, value: 1, to: startOfUTCDay(date)) else {
            return startOfUTCDay(date)
        }
        return nextDay.addingTimeInterval(-0.001)
    }

    /// Entry display: entry dates are UTC-midnight instants, so render the
    /// date part in a UTC calendar to avoid off-by-one drift.
    static func formatEntryDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    /// Timestamp display (createdAt etc.) in the viewer's local timezone.
    static func formatTimestamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

/// Builds percent-encoded query strings for `APIClient` paths, which accept
/// `path?key=value&…` and forward the raw query to URLComponents.
enum ApiQuery {
    static func encode(_ value: String) -> String {
        value.addingPercentEncoding(
            withAllowedCharacters: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        ) ?? value
    }

    static func build(_ pairs: [(String, String?)]) -> String {
        let parts = pairs.compactMap { pair -> String? in
            guard let value = pair.1, !value.isEmpty else { return nil }
            return "\(pair.0)=\(encode(value))"
        }
        return parts.isEmpty ? "" : "?" + parts.joined(separator: "&")
    }

    static func iso(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}
