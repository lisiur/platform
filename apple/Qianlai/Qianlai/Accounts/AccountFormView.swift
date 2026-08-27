//
//  AccountFormView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Sentinel meaning "not linked to any real account".
let noRealAccount = "none"

/// One editable meta key/value pair. `raw` keeps the original JSON value so
/// an untouched row round-trips non-string values unchanged.
struct MetaEntryRow: Identifiable {
    let id = UUID()
    var key: String
    var value: String
    var raw: JSONValue?

    init(key: String = "", value: String = "", raw: JSONValue? = nil) {
        self.key = key
        self.value = value
        self.raw = raw
    }
}

/// Built form values passed to the save handler.
struct AccountFormResult {
    var name: String?
    var icon: String?
    var meta: [String: JSONValue]?
    var realAccountId: String?
    var linkChanged: Bool
}

/// Shared form for creating and editing accounts: display name, icon, free
/// -form meta entries, and the owner-private real-account link. Owns its
/// toolbar save action; `onSave` performs the API call.
struct AccountFormView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(RealAccountStore.self) private var realAccountStore

    let account: BookAccount?
    let parent: BookAccount?
    /// The link snapshot captured when the form opened; only a *changed* link
    /// is sent so an untouched save never unlinks another member's master.
    let seededLink: String
    let onSave: (AccountFormResult) async -> Bool

    @State private var name: String
    @State private var icon: String
    @State private var metaEntries: [MetaEntryRow]
    @State private var realAccountId: String
    @State private var nameError: String?
    @State private var isSaving = false

    private let fixedType: AccountType

    init(
        account: BookAccount?,
        parent: BookAccount?,
        seededLink: String = noRealAccount,
        onSave: @escaping (AccountFormResult) async -> Bool
    ) {
        self.account = account
        self.parent = parent
        self.seededLink = seededLink
        self.onSave = onSave
        self.fixedType = account?.type ?? parent?.type ?? .asset
        _name = State(initialValue: account?.name ?? "")
        _icon = State(initialValue: account?.icon ?? "")
        _metaEntries = State(initialValue: account?.metaFormRows ?? [])
        _realAccountId = State(initialValue: seededLink)
    }

    private var isAssetLike: Bool {
        fixedType == .asset || fixedType == .liability
    }

    /// Income/expense forms speak of categories (分类) rather than
    /// accounts (科目).
    private var isCategory: Bool {
        fixedType == .income || fixedType == .expense
    }

    private var formTitle: String {
        let key: String
        let fallback: String
        if account != nil {
            key = isCategory ? "categories.edit" : "Edit Account"
            fallback = isCategory ? "Edit Category" : "Edit Account"
        } else if parent != nil {
            key = isCategory ? "categories.addSub" : "Add Sub-account"
            fallback = isCategory ? "Add Sub-category" : "Add Sub-account"
        } else {
            key = isCategory ? "categories.new" : "New Account"
            fallback = isCategory ? "New Category" : "New Account"
        }
        return L10n.string(key, defaultValue: fallback)
    }

    var body: some View {
        Form {
            Section {
                HStack {
                    Text("Name")
                    Spacer()
                    TextField(
                        account?.code != nil
                            ? L10n.string("accounts.nameOptional", defaultValue: "Leave empty to keep the default label")
                            : L10n.string("accounts.namePlaceholder", defaultValue: "e.g. USD Cash"),
                        text: $name
                    )
                    .multilineTextAlignment(.trailing)
                    .textFieldStyle(.plain)
                    .submitLabel(.done)
                    .onSubmit { dismissKeyboard() }
                }
                if let nameError {
                    Label(nameError, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                HStack {
                    Text("Icon")
                    Spacer()
                    TextField("Emoji, e.g. 💳", text: $icon)
                        .multilineTextAlignment(.trailing)
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                        #if os(iOS)
                        .frame(width: 160)
                        #endif
                }
                if let parent {
                    HStack {
                        Text(L10n.string(
                            isCategory ? "categories.parent" : "Parent",
                            defaultValue: "Parent"
                        ))
                        Spacer()
                        Text("\(parent.icon ?? "") \(parent.displayName)")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if isAssetLike, !realAccountStore.realAccounts.isEmpty {
                Section {
                    Picker("Real Account", selection: $realAccountId) {
                        Text("Not linked").tag(noRealAccount)
                        ForEach(
                            realAccountStore.realAccounts.filter { $0.type == fixedType }
                        ) { real in
                            Text("\(real.icon ?? "") \(real.name)").tag(real.id)
                        }
                    }
                } header: {
                    Text("Real Account")
                } footer: {
                    Text("Link this pocket to your real account to include it in your private net worth.")
                }
            }

            Section {
                ForEach($metaEntries) { $entry in
                    VStack(alignment: .leading, spacing: 6) {
                        TextField("Label", text: $entry.key)
                            .font(.subheadline)
                            .submitLabel(.done)
                            .onSubmit { dismissKeyboard() }
                        TextField("Value", text: $entry.value)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .submitLabel(.done)
                            .onSubmit { dismissKeyboard() }
                    }
                }
                .onDelete { metaEntries.remove(atOffsets: $0) }
                Button {
                    metaEntries.append(MetaEntryRow())
                } label: {
                    Label("Add Field", systemImage: "plus")
                }
            } header: {
                Text("Extra Info")
            } footer: {
                Text("Custom info such as card numbers.")
            }
        }
        .navigationTitle(Text(formTitle))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "Saving…" : "Save") {
                    Task { await save() }
                }
                .disabled(isSaving)
            }
        }
    }

    private func save() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        // User-created accounts need a name; seeded ones may keep the label.
        if account?.code == nil, trimmedName.isEmpty {
            nameError = L10n.string("accounts.nameRequired", defaultValue: "Name is required")
            return
        }
        nameError = nil

        var meta: [String: JSONValue] = [:]
        for entry in metaEntries {
            let key = entry.key.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty else { continue }
            // Preserve the original JSON value unless the text was edited.
            if let raw = entry.raw, raw.editableString == entry.value {
                meta[key] = raw
            } else {
                meta[key] = .string(entry.value)
            }
        }

        let link = (realAccountId == noRealAccount) ? nil : realAccountId
        let result = AccountFormResult(
            name: trimmedName.isEmpty ? nil : trimmedName,
            icon: icon.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? nil
                : icon.trimmingCharacters(in: .whitespacesAndNewlines),
            meta: meta.isEmpty ? nil : meta,
            realAccountId: link,
            linkChanged: link != seededLink
        )

        isSaving = true
        let ok = await onSave(result)
        isSaving = false
        if ok {
            dismiss()
        }
    }
}

extension BookAccount {
    /// Seeds the form's editable meta rows from the stored JSON map.
    var metaFormRows: [MetaEntryRow] {
        (meta ?? [:])
            .sorted { $0.key < $1.key }
            .map { MetaEntryRow(key: $0.key, value: $0.value.editableString, raw: $0.value) }
    }
}

extension RealAccount {
    var metaFormRows: [MetaEntryRow] {
        (meta ?? [:])
            .sorted { $0.key < $1.key }
            .map { MetaEntryRow(key: $0.key, value: $0.value.editableString, raw: $0.value) }
    }
}
