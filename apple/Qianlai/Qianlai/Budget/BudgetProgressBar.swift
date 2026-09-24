//
//  BudgetProgressBar.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import SwiftUI

/// The thin spent-vs-budget ratio bar both budget cards render: a 4pt
/// capsule track with the spent share filled. Color is the status ladder
/// (`BudgetMath.status`): GREEN while normal — the theme tint saturates
/// these cards already and can't double as a state signal — yellow from
/// 80%, red from 100%. A zero budget overspends on the first spent cent
/// ("预算为 0 视为有效预算"); refund-negatives clamp to zero and the fill
/// caps at full width.
/// The status ladder's two color reads, in one place — every surface
/// maps `BudgetMath.status` through these instead of re-switching.
extension BudgetStatus {
    /// The figure tint: nil while normal (the figure stays inert
    /// primary), yellow from 80%, red from 100% — the card line's
    /// remainder, the month page's remainder, and the category rows'
    /// spent figures all read this.
    var figureTint: Color? {
        switch self {
        case .normal: nil
        case .near: .yellow
        case .over: .red
        }
    }

    /// The bar tint: green while normal — the theme tint saturates these
    /// cards already and can't double as a state signal.
    var barTint: Color {
        switch self {
        case .normal: .green
        case .near: .yellow
        case .over: .red
        }
    }
}

struct BudgetProgressBar: View {
    let spentCents: Int
    let budgetCents: Int

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.secondary.opacity(0.15))
                Capsule()
                    .fill(tint)
                    .frame(width: proxy.size.width * ratio)
            }
        }
        .frame(height: 4)
    }

    private var tint: Color {
        BudgetMath.status(countedCents: spentCents, budgetCents: budgetCents).barTint
    }

    private var ratio: Double {
        guard budgetCents > 0 else { return spentCents > 0 ? 1 : 0 }
        return max(0, min(Double(spentCents) / Double(budgetCents), 1))
    }
}
