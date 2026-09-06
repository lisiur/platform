//
//  QianlaiWidgetBundle.swift
//  QianlaiWidget
//
//  Created by Lisiur Day on 2026/9/5.
//

import WidgetKit
import SwiftUI

@main
struct QianlaiWidgetBundle: WidgetBundle {
    var body: some Widget {
        SummaryWidget()
        QuickAddWidget()
        BoundQuickAddWidget()
    }
}
