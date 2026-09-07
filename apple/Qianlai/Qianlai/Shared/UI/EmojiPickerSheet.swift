//
//  EmojiPickerSheet.swift
//  Qianlai
//

import SwiftUI

/// Modal emoji picker for the account form's icon field: grouped grid with
/// a keyword search; a tap writes the pick back and dismisses. Icons are
/// mandatory, so there is no clear action.
struct EmojiPickerSheet: View {
    @Environment(\.dismiss) private var dismiss

    /// The current icon, always a non-empty emoji: icons are mandatory, the
    /// sheet only writes picks back, and Cancel leaves it untouched.
    @Binding var selection: String

    @State private var query = ""

    /// One rendered grid block: a group while browsing, a single results
    /// section while searching.
    private struct Section: Identifiable {
        let title: String
        let icons: [String]

        var id: String { title }
    }

    private var sections: [Section] {
        guard EmojiSearch.normalized(query).isEmpty else {
            let results = EmojiCatalog.groups.flatMap { group in
                group.icons.filter {
                    EmojiSearch.matches($0, query: query, groupTitle: group.title)
                }
            }
            guard !results.isEmpty else { return [] }
            return [Section(
                title: L10n.string("icon.search.results", defaultValue: "Results"),
                icons: results
            )]
        }
        return EmojiCatalog.groups.map { Section(title: $0.title, icons: $0.icons) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    ForEach(sections) { section in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(section.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.secondary)
                            LazyVGrid(
                                columns: Array(
                                    repeating: GridItem(.flexible(), spacing: 8),
                                    count: 6
                                ),
                                spacing: 10
                            ) {
                                ForEach(section.icons, id: \.self) { emoji in
                                    cell(emoji)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    if sections.isEmpty {
                        Text(L10n.string("icon.search.noResults", defaultValue: "No matches"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    }
                }
                .padding(.vertical, 12)
            }
            .navigationTitle(Text(L10n.string("icon.picker.title", defaultValue: "Choose Icon")))
            .inlineNavigationBarTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.string("common.cancel", defaultValue: "Cancel")) { dismiss() }
                }
            }
            #if os(iOS)
            .searchable(
                text: $query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: Text(L10n.string("icon.search.placeholder", defaultValue: "Search icons"))
            )
            #else
            .searchable(
                text: $query,
                prompt: Text(L10n.string("icon.search.placeholder", defaultValue: "Search icons"))
            )
            #endif
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }

    private func cell(_ emoji: String) -> some View {
        let isSelected = emoji == selection
        return Button {
            selection = emoji
            dismiss()
        } label: {
            Text(emoji)
                .font(.system(size: 28))
                .frame(maxWidth: .infinity, minHeight: 44)
                .background {
                    if isSelected {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.accentColor.opacity(0.15))
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
