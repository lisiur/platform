//
//  JournalSearchable.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/18.
//

import SwiftUI

/// The entry list's keyword filter, bound to a JournalStore — the store's
/// 200ms coalescing reload is the debounce, and `clearFilters` resets the
/// field for free. On iOS it pins in the navigation bar's drawer, with two
/// visibility modes: the journal page (the only remaining consumer)
/// collapses it until pull-down, while `.always` pins it — a mode the
/// drill-down pages dropped: a pushed page's search field background is
/// system glass that only engages after the transition, flashing a bare
/// field for the first frames. macOS renders the plain field.
extension View {
    func journalSearchable(_ store: JournalStore, alwaysVisible: Bool) -> some View {
        #if os(iOS)
        return searchable(
            text: Binding(
                get: { store.searchQuery },
                set: { store.searchQuery = $0 }
            ),
            placement: .navigationBarDrawer(displayMode: alwaysVisible ? .always : .automatic),
            prompt: Text(L10n.string("journal.search.placeholder", defaultValue: "Search…"))
        )
        #else
        return searchable(
            text: Binding(
                get: { store.searchQuery },
                set: { store.searchQuery = $0 }
            ),
            prompt: Text(L10n.string("journal.search.placeholder", defaultValue: "Search…"))
        )
        #endif
    }
}