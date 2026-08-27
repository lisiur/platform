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
                list.searchable(text: $query, prompt: Text("Search accounts"))
            } else {
                list
            }
        }
        .navigationTitle(Text(verbatim: title))
        .inlineNavigationBarTitle()
    }

    private var list: some View {
        List {
            if allowsEmpty {
                clearRow
            }
            ForEach(visibleEntries) { entry in
                row(for: entry)
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
        rowTemplate(depth: 0, icon: nil, name: "Not selected", id: nil, hasSubtree: false)
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

    /// Select button spanning the row plus, for parents, a trailing fold
    /// toggle; the checkmark trails the name so the chevron owns the edge.
    private func rowTemplate(
        depth: Int,
        icon: String?,
        name: String,
        id: String?,
        hasSubtree: Bool
    ) -> some View {
        HStack(spacing: 0) {
            Button {
                selection = id
                dismiss()
            } label: {
                HStack(spacing: 0) {
                    HStack(spacing: 8) {
                        if let icon, !icon.isEmpty {
                            Text(icon)
                        }
                        Text(name)
                            .fontWeight(depth == 0 ? .semibold : .regular)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                    }
                    .padding(.leading, 16 * CGFloat(depth))
                    Spacer(minLength: 8)
                    if selection == id {
                        Image(systemName: "checkmark")
                            .foregroundStyle(Color.accentColor)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if hasSubtree, let id {
                Button {
                    withAnimation(.default) {
                        if collapsed.contains(id) {
                            collapsed.remove(id)
                        } else {
                            collapsed.insert(id)
                        }
                    }
                } label: {
                    Image(
                        systemName: collapsed.contains(id)
                            ? "chevron.right"
                            : "chevron.down"
                    )
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
            }
        }
    }
}
