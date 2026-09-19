//
//  ReportPaths.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/19.
//

import Foundation

/// The report endpoints' path shaping — the one place a windowed report
/// query's from/to pairs are built, shared by every surface that fetches
/// the same report (the stats component's payloads and the posting path's
/// widget snapshot refresh), so one report can't encode its window two
/// different ways.
@MainActor
enum ReportPaths {
    /// The [from, to] pairs every windowed report path carries.
    static func windowPairs(_ window: MonthWindow) -> [(String, String?)] {
        [
            ("from", ApiQuery.iso(window.from)),
            ("to", ApiQuery.iso(window.to)),
        ]
    }

    /// The dashboard report's path for a window — the overview totals the
    /// stats component's stat block summarizes and the snapshot refresh
    /// republishes.
    static func dashboard(ledgerId: String, window: MonthWindow) -> String {
        "bookkeeping/ledgers/\(ledgerId)/reports/dashboard"
            + ApiQuery.build(windowPairs(window))
    }
}
