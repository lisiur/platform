//
//  AccountSelectionView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Pushed account picker for quick entry: renders the chart as a real
/// collapsible hierarchy — parents lead, children sit indented beneath a
/// guide line and fold away behind a disclosure chevron — checkmarks the
/// active choice, and offers search once the chart grows. Replaces the
/// default `Picker`, whose space-padded flat menu does not scale to many
/// categories.
struct AccountSelectionView: View {
    @Environment(\.dismiss) private var dismiss

    let title: String
    /// Parent-first flattened tree of pickable accounts.
    let entries: [AccountTreeEntry]
    /// Optional pocket sides show a clear row ("Not selected").
    let allowsEmpty: Bool
    /// When false, a category that has subs cannot be picked — tapping a
    /// parent row toggles its fold instead; only leaf rows commit a
    /// selection. The current choice still shows its checkmark (an edit of
    /// an entry posted to a parent keeps displaying it).
    var parentSelectable = true
    @Binding var selection: String?

    /// Ids of parents whose children are folded away. Empty by default, so
    /// every level starts expanded and folding is opt-in.
    @State private var collapsed: Set<String> = []
    @State private var query = ""

    private var isSearching: Bool {
        !query.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Below this count the plain list reads faster than a search field.
    private var showsSearch: Bool { entries.count >= 10 }

    /// Category sides pick leaves of the chart tree, account sides pick
    /// flat pockets — the same flag that gates parent folding says which
    /// search placeholder applies.
    private var searchPlaceholder: String {
        parentSelectable
            ? L10n.string("accounts.search.accounts", defaultValue: "Search accounts")
            : L10n.string("accounts.search.categories", defaultValue: "Search categories")
    }

    private var childrenByParent: [String: [AccountTreeEntry]] {
        Dictionary(grouping: entries.filter { $0.depth > 0 }) { $0.account.parentId ?? "" }
    }

    /// Roots are the depth-0 entries (`build` normalizes orphans to roots),
    /// children resolve through their real parent link at any nesting depth.
    private var roots: [AccountTreeEntry] { entries.filter { $0.depth == 0 } }

    private func children(of id: String) -> [AccountTreeEntry] {
        childrenByParent[id] ?? []
    }

    private func hasChildren(_ id: String) -> Bool {
        !(childrenByParent[id]?.isEmpty ?? true)
    }

    /// Whether any row carries a subtree — gates the leading fold slot so
    /// flat pickers (asset sides) don't render an empty 30pt column.
    private var showsTree: Bool {
        entries.contains { hasChildren($0.account.id) }
    }

    /// Depth-first walk that skips the subtrees folded away by the user;
    /// while searching, every match shows flat regardless of fold state.
    private var visibleEntries: [AccountTreeEntry] {
        if isSearching {
            let trimmed = query.trimmingCharacters(in: .whitespaces)
            return entries.filter { entry in
                entry.account.displayName.range(
                    of: trimmed,
                    options: [.caseInsensitive, .diacriticInsensitive]
                ) != nil
            }
        }
        var result: [AccountTreeEntry] = []
        func visit(_ level: [AccountTreeEntry]) {
            for entry in level {
                result.append(entry)
                if !collapsed.contains(entry.account.id) {
                    visit(children(of: entry.account.id))
                }
            }
        }
        visit(roots)
        return result
    }

    var body: some View {
        Group {
            if showsSearch {
                #if os(iOS)
                list.searchable(
                    text: $query,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: Text(searchPlaceholder)
                )
                #else
                list.searchable(text: $query, prompt: Text(searchPlaceholder))
                #endif
            } else {
                list
            }
        }
        .navigationTitle(Text(verbatim: title))
        .inlineNavigationBarTitle()
    }

    /// Grouped-card list mirroring `CategoriesManageView` — same default
    /// list style, same depth insets, same row anatomy — so picking reads
    /// like managing, minus the manage actions.
    private var list: some View {
        List {
            if allowsEmpty {
                clearRow
            }
            ForEach(visibleEntries) { entry in
                row(for: entry)
                    .listRowInsets(EdgeInsets(top: 6, leading: 12 + CGFloat(entry.depth) * 18, bottom: 6, trailing: 12))
            }
        }
        .overlay {
            if visibleEntries.isEmpty, !allowsEmpty {
                ContentUnavailableView.search(text: query)
            }
        }
        .animation(.default, value: visibleEntries)
    }

    // MARK: - Rows

    private var clearRow: some View {
        rowTemplate(depth: 0, icon: nil, name: L10n.string("common.notSelected", defaultValue: "Not selected"), id: nil, hasSubtree: false)
    }

    private func row(for entry: AccountTreeEntry) -> some View {
        rowTemplate(
            depth: entry.depth,
            icon: entry.account.icon,
            name: entry.account.displayName,
            id: entry.account.id,
            hasSubtree: hasChildren(entry.account.id)
        )
    }

    /// Row anatomy mirrors `AccountTreeRow` — leading fold chevron, emoji
    /// icon, name weighted by depth — with the manage screen's trailing
    /// menu swapped for the picker's checkmark. Unselectable parents fold
    /// on tap; everything else commits the selection.
    private func rowTemplate(
        depth: Int,
        icon: String?,
        name: String,
        id: String?,
        hasSubtree: Bool
    ) -> some View {
        HStack(spacing: 8) {
            if showsTree {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(hasSubtree && !collapsed.contains(id ?? "") ? 90 : 0))
                    .opacity(hasSubtree ? 1 : 0)
            }
            if let icon, !icon.isEmpty {
                Text(icon)
            }
            Text(name)
                .font(.body.weight(depth == 0 ? .medium : .regular))
                .lineLimit(1)
            Spacer(minLength: 8)
            if selection == id {
                Image(systemName: "checkmark")
                    .foregroundStyle(Color.accentColor)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if !parentSelectable, hasSubtree, let id {
                withAnimation(.snappy) {
                    if collapsed.contains(id) {
                        collapsed.remove(id)
                    } else {
                        collapsed.insert(id)
                    }
                }
            } else {
                selection = id
                dismiss()
            }
        }
    }
}
