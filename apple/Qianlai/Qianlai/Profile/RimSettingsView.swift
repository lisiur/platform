//
//  RimSettingsView.swift
//  Qianlai
//

import SwiftUI

/// Border highlight (边框高光) sub-page: the slider that drives the
/// glass rim on the app's self-drawn cards. The strength applies live
/// as the user drags — every rim on screen reflects the new value the
/// instant it changes. A live `StatCard` above the slider acts as the
/// preview so the user sees the rim come and go without navigating
/// away.
struct RimSettingsView: View {
    @Environment(RimSettings.self) private var rimSettings

    var body: some View {
        List {
            Section {
                rimPreview
            } header: {
                Text(L10n.string(
                    "profile.theme.rim.preview",
                    defaultValue: "Preview"
                ))
            }
            Section {
                Slider(
                    value: Binding(
                        get: { rimSettings.intensity },
                        set: { rimSettings.setIntensity($0) }
                    ),
                    in: RimSettings.intensityRange
                )
                .appCardRow()
            } footer: {
                Text(L10n.string(
                    "profile.theme.rim.footer",
                    defaultValue: "Strength of the highlight on the cards. Set to zero to turn it off."
                ))
            }
        }
        .appBackgroundCanvas()
        .navigationTitle(Text(L10n.string("profile.theme.rim.title", defaultValue: "Border Highlight")))
    }

    /// The live preview card — the same `StatCard` the dashboard and
    /// journal use, so the rim here matches what users see in-app.
    /// The row drops the system List side margin (`.listRowInsets
    /// (EdgeInsets())`) so `StatCard`'s own 14pt horizontal padding
    /// supplies its content margin and the card sits edge-to-edge with
    /// the slider row below it. The card's own `.frame(maxWidth:
    /// .infinity)` then takes the row's full available width.
    private var rimPreview: some View {
        StatCard(
            icon: "wallet.bifold",
            label: L10n.string("account.type.expense", defaultValue: "Expense"),
            value: 3208.50,
            currency: "CNY",
            tone: .negative
        )
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }
}
