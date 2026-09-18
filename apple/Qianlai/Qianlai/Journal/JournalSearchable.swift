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
/// visibility modes: the journal page collapses it until pull-down, while
/// presented sheets pin it always-visible (a drawer hidden until pull-down
/// fights the sheet's own drag-to-dismiss). macOS renders the plain field.
/// Hoisted out of EntryListView so the dashboard's drill-down sheet and the
/// journal tab share one binding shape — neither view owns the modifier
/// anymore.
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