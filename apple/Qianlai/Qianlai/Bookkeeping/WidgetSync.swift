//
//  WidgetSync.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/5.
//

import Foundation
import WidgetKit

/// App-side bridge to WidgetKit. The shared sources stay WidgetKit-free, so
/// every widget reload the app triggers funnels through this one enum —
/// after a dashboard refresh, a ledger switch, a language change, or a
/// sign-out.
enum WidgetSync {
    static func reloadTimelines() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}

/// The one keeper of the widget snapshot's publish rule: a dashboard
/// report republishes the snapshot only when its window IS the current
/// local month — exact equality, not "covers today" (a week or custom
/// range containing today carries range totals, not the month-to-date
/// figures the widget surfaces), and browsing an older month never
/// overwrites it. Shared by the stats component's overview fetch and the
/// posting path's snapshot refresh.
@MainActor
enum WidgetSnapshotSync {
    static func publishIfCurrentMonth(
        _ dashboard: Dashboard,
        ledgerId: String,
        window: MonthWindow
    ) {
        guard window == AppDates.monthWindow(containing: Date()) else { return }
        WidgetDataStore.saveSnapshot(
            WidgetSnapshot(
                ledgerId: ledgerId,
                dashboard: dashboard,
                month: AppDates.currentYearMonth
            )
        )
        WidgetSync.reloadTimelines()
    }
}
