//
//  MonthWindow.swift
//  QianlaiShared
//
//  Created by Lisiur Day on 2026/9/18.
//

import Foundation

/// One LOCAL month's first-day start through last-day end — the dashboard's
/// month-summary range, the journal's month tab, the drill-down sheet's
/// fixed window. Bundled so callers pass the same shape to the journal
/// store's `setWindow`, the report fetches' `from`/`to` query pairs, and
/// the widget's totals — a half-open API and the parse/`localEndOfDay` rules
/// stay with each caller; this is just the (from, to) tuple with a name.
/// Nonisolated: a value-type data holder (like `YearMonth`), so the
/// synthesized conformances and `singleMonth` stay callable from the
/// nonisolated `AppDates` formatters.
nonisolated struct MonthWindow: Hashable {
    var from: Date
    var to: Date
    /// The window's calendar year when it is exactly one LOCAL year —
    /// the category budget drill-down's window, whose page titles "2026年"
    /// instead of the from–to rendering. Default nil; only `AppDates
    /// .yearWindow(_:)` sets it.
    var singleYear: Int? = nil

    /// The window's `YearMonth` when it is exactly one natural LOCAL
    /// month — the stats component's calendar-card gate and the drill
    /// page's month title. nil for any wider, narrower, or shifted
    /// window (a week, a custom range, a day, a year).
    var singleMonth: YearMonth? {
        guard self == AppDates.monthWindow(containing: from) else { return nil }
        let components = Calendar.current.dateComponents([.year, .month], from: from)
        guard let year = components.year, let month = components.month else { return nil }
        return YearMonth(year: year, month: month)
    }
}