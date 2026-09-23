//
//  ToolbarDividerGroup.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/23.
//

import SwiftUI

/// Two toolbar controls sharing ONE Liquid Glass capsule with a hairline
/// divider between them (the calendar | stats look). Host both sides in a
/// single `ToolbarItem` — one item's content groups into one capsule; the
/// old alternative, `ToolbarSpacer(.fixed)` between two items, renders
/// two independent pills instead.
///
/// The divider renders only while BOTH sides do: pass `showsDivider`
/// false when either side hides, or a lone hairline would sit between
/// the remaining control and an empty slot. A side that hides with the
/// whole group (same gate) can pass `showsDivider: true` outright.
struct ToolbarDividerGroup<Leading: View, Trailing: View>: View {
    var showsDivider: Bool
    @ViewBuilder var leading: () -> Leading
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 10) {
            leading()
            if showsDivider {
                Divider()
                    .frame(height: 20)
            }
            trailing()
        }
    }
}
