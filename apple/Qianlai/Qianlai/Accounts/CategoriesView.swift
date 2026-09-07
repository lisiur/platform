//
//  CategoriesView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/27.
//

import SwiftUI

/// Income and expense chart of accounts of the active ledger — the
/// classification side of bookkeeping, split out from the asset/liability
/// "Accounts" screen on the Me page.
struct CategoriesView: View {
    var body: some View {
        AccountsView(
            managing: [.expense, .income],
            title: L10n.string("accounts.categories", defaultValue: "Categories"),
            collapsible: true
        )
    }
}
