//
//  EmojiPickerSheet.swift
//  Qianlai
//

import SwiftUI

/// Modal emoji picker for the account form's icon field: grouped grid with
/// a keyword search, plus a free-form input as the escape hatch for emoji
/// outside the catalog; a tap (or a committed custom input) writes back and
/// dismisses. Icons are mandatory, so there is no clear action.
struct EmojiPickerSheet: View {
    @Environment(\.dismiss) private var dismiss

    /// The current icon, always a non-empty emoji: icons are mandatory, the
    /// sheet only writes picks back, and Cancel leaves it untouched.
    @Binding var selection: String

    @State private var query = ""
    /// The escape hatch's buffer, seeded with the current selection when it
    /// came from outside the catalog so a previously custom icon stays editable.
    @State private var custom = ""

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
                    customInput
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
        .onAppear {
            if !EmojiCatalog.groups.contains(where: { $0.icons.contains(selection) }) {
                custom = selection
            }
        }
        #if os(iOS)
        .presentationDetents([.large])
        #endif
    }

    /// Anything non-blank up to 12 characters commits (emoji sequences with
    /// modifiers/ZWJ run well under that); keyboard return commits too.
    private var customInput: some View {
        HStack(spacing: 8) {
            TextField(
                L10n.string("icon.custom.placeholder", defaultValue: "Custom emoji"),
                text: $custom
            )
            .submitLabel(.done)
            .onSubmit(commitCustom)
            .onChange(of: custom) { _, newValue in
                if newValue.count > 12 {
                    custom = String(newValue.prefix(12))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
            Button(
                L10n.string("icon.custom.use", defaultValue: "Use"),
                action: commitCustom
            )
            .buttonStyle(UseButtonStyle(isEnabled: !customIsEmpty))
            .disabled(customIsEmpty)
        }
        .padding(.horizontal, 16)
    }

    private var customIsEmpty: Bool {
        custom.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The Use button as a twin of the input field: quiet fill + secondary
    /// label while nothing can be committed (the system prominent disabled
    /// fill reads near-black in dark mode and swallows its own label), the
    /// accent fill only once there is something to use.
    private struct UseButtonStyle: ButtonStyle {
        let isEnabled: Bool

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .font(.subheadline.weight(.medium))
                .foregroundStyle(isEnabled ? Color.white : Color.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(
                            isEnabled
                                ? Color.accentColor
                                : Color.primary.opacity(0.06)
                        )
                        .opacity(configuration.isPressed ? 0.8 : 1)
                }
        }
    }

    private func commitCustom() {
        let trimmed = custom.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        selection = trimmed
        dismiss()
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
