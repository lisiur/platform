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
