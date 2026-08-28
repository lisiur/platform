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

    /// The UTC instant carrying the same wall-clock date/time the user
    /// picked in their local calendar. Entry dates are stored and read back
    /// as UTC instants, so the picked clock must survive the local→UTC
    /// conversion instead of being re-anchored to the local timezone.
    static func utcWallClock(_ date: Date) -> Date {
        let picked = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: date
        )
        var components = DateComponents()
        components.year = picked.year
        components.month = picked.month
        components.day = picked.day
        components.hour = picked.hour
        components.minute = picked.minute
        components.timeZone = TimeZone(identifier: "UTC")
        return utcCalendar.date(from: components) ?? startOfUTCDay(date)
    }

    /// Entry display: entry dates are UTC instants, so render them in a UTC
    /// calendar to avoid off-by-one drift; the time part shows only when it
    /// was set, so legacy UTC-midnight entries stay date-only.
    static func formatEntryDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateStyle = .medium
        let clock = utcCalendar.dateComponents([.hour, .minute, .second], from: date)
        formatter.timeStyle =
            (clock.hour == 0 && clock.minute == 0 && clock.second == 0) ? .none : .short
        return formatter.string(from: date)
    }

    /// Entry card timestamps: HH:mm in the entry's UTC wall clock — the
    /// enclosing day-group header carries the date.
    static func formatEntryTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    /// Day-group headers: medium date without time (entry days are UTC days).
    static func formatEntryDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    /// First-to-last day of the UTC month containing `date`, for month-wide
    /// entry windows (the dashboard).
    static func monthWindow(containing date: Date = Date()) -> (from: Date, to: Date) {
        let components = utcCalendar.dateComponents([.year, .month], from: date)
        let start = utcCalendar.date(
            from: DateComponents(year: components.year, month: components.month, day: 1)
        ) ?? startOfUTCDay(date)
        guard let nextMonth = utcCalendar.date(byAdding: .month, value: 1, to: start),
              let lastDay = utcCalendar.date(byAdding: .day, value: -1, to: nextMonth)
        else { return (start, start) }
        return (start, lastDay)
    }

    /// Re-anchors a stored UTC instant to the viewer's timezone carrying the
    /// same wall clock — editing an entry shows the HH:mm it was stored with,
    /// so an untouched save round-trips instead of drifting by the timezone
    /// offset (the save re-applies `utcWallClock`).
    static func localFromUTCWallClock(_ date: Date) -> Date {
        let components = utcCalendar.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: date
        )
        return Calendar.current.date(from: components) ?? date
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
