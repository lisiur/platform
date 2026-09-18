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
struct MonthWindow: Equatable {
    var from: Date
    var to: Date
}