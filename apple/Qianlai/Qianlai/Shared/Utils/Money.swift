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

/// Date helpers. Entry dates are true UTC instants — exactly what the user
/// picked, converted once at the client boundary and stored verbatim. Day
/// grouping, month windows, and filters all follow the viewer's LOCAL
/// calendar, so an entry renders and searches under the same day it was
/// entered, on any device.
enum AppDates {
    /// The LOCAL year/month containing now — the dashboard's default month.
    static var currentYearMonth: YearMonth {
        let components = Calendar.current.dateComponents([.year, .month], from: Date())
        return YearMonth(year: components.year ?? 1970, month: components.month ?? 1)
    }

    /// Inclusive end of the LOCAL day containing `date` (23:59:59.999) —
    /// the `to` bound for "on this day" windows.
    static func localEndOfDay(_ date: Date) -> Date {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: date)
        guard let nextDay = calendar.date(byAdding: .day, value: 1, to: start) else {
            return start
        }
        return nextDay.addingTimeInterval(-0.001)
    }

    /// Entry card timestamps: HH:mm in the viewer's local calendar — the
    /// enclosing day-group header carries the date.
    static func formatEntryTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    /// Day-group headers: medium date without time in the viewer's local
    /// calendar. `locale` comes from the environment `\.locale` so the
    /// header follows the in-app language override, not the device language.
    static func formatEntryDay(_ date: Date, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = locale
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    /// Dashboard month title, localized per the given locale ("Aug 2026",
    /// "2026年8月") — dashboard months are the viewer's local months.
    static func formatMonthTitle(_ month: YearMonth, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("yMMM")
        return formatter.string(from: month.start)
    }

    /// First-to-last day of the LOCAL month containing `date`, for
    /// month-wide entry windows (the dashboard).
    static func monthWindow(containing date: Date = Date()) -> (from: Date, to: Date) {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .month, for: date) else {
            let start = calendar.startOfDay(for: date)
            return (start, start)
        }
        return (interval.start, interval.end.addingTimeInterval(-0.001))
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
