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
    @State private var showIconPicker = false

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
        // Icons are mandatory: new forms start on the type's default, and
        // legacy icon-less accounts pick it up on their next edit.
        _icon = State(initialValue: account?.icon ?? fixedType.defaultIcon)
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

    private var formTitle: L10n.Entry {
        if account != nil {
            return isCategory
                ? L10n.Entry("categories.edit", "Edit Category")
                : .init("accounts.editAccount", "Edit Account")
        } else if parent != nil {
            return isCategory
                ? L10n.Entry("categories.addSub", "Add Sub-category")
                : .init("accounts.addSub", "Add Sub-account")
        }
        return isCategory
            ? L10n.Entry("categories.new", "New Category")
            : .init("accounts.newAccount", "New Account")
    }

    /// Categories (income/expense) and accounts (asset/liability) each get
    /// their own example. Equity is system-managed and never opens this
    /// form; it rides with asset.
    private var namePlaceholder: String {
        switch fixedType {
        case .expense:
            L10n.string("accounts.expenseNamePlaceholder", defaultValue: "e.g. Dining")
        case .income:
            L10n.string("accounts.incomeNamePlaceholder", defaultValue: "e.g. Salary")
        case .asset, .equity:
            L10n.string("accounts.assetNamePlaceholder", defaultValue: "e.g. Chase Debit Card")
        case .liability:
            L10n.string("accounts.liabilityNamePlaceholder", defaultValue: "e.g. Chase Credit Card")
        }
    }

    var body: some View {
        Form {
            Section {
                HStack {
                    Text(L10n.string("common.name", defaultValue: "Name"))
                    Spacer()
                    TextField(
                        account?.code != nil
                            ? L10n.string("accounts.nameOptional", defaultValue: "Leave empty to keep the default label")
                            : namePlaceholder,
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
                Button {
                    showIconPicker = true
                } label: {
                    HStack {
                        Text(L10n.string("common.icon", defaultValue: "Icon"))
                        Spacer()
                        Text(icon)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if let parent {
                    HStack {
                        Text(L10n.string(
                            isCategory ? "categories.parent" : "accounts.parent",
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
                    Picker(L10n.string("accounts.realAccount", defaultValue: "Real Account"), selection: $realAccountId) {
                        Text(L10n.string("accounts.notLinked", defaultValue: "Not linked")).tag(noRealAccount)
                        ForEach(
                            realAccountStore.realAccounts.filter { $0.type == fixedType }
                        ) { real in
                            Text("\(real.icon ?? "") \(real.name)").tag(real.id)
                        }
                    }
                } header: {
                    Text(L10n.string("accounts.realAccount", defaultValue: "Real Account"))
                } footer: {
                    Text(L10n.string("accounts.linkFooter", defaultValue: "Link this pocket to your real account to include it in your private net worth."))
                }
            }

            Section {
                ForEach($metaEntries) { $entry in
                    VStack(alignment: .leading, spacing: 6) {
                        TextField(L10n.string("common.fieldLabel", defaultValue: "Label"), text: $entry.key)
                            .font(.subheadline)
                            .submitLabel(.done)
                            .onSubmit { dismissKeyboard() }
                        TextField(L10n.string("common.fieldValue", defaultValue: "Value"), text: $entry.value)
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
                    Label(L10n.string("common.addField", defaultValue: "Add Field"), systemImage: "plus")
                }
            } header: {
                Text(L10n.string("common.extraInfo", defaultValue: "Extra Info"))
            } footer: {
                Text(L10n.string("accounts.metaFooter", defaultValue: "Custom info such as card numbers."))
            }
        }
        .navigationTitle(Text(L10n.string(formTitle)))
        .inlineNavigationBarTitle()
        .sheet(isPresented: $showIconPicker) {
            EmojiPickerSheet(selection: $icon)
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.string("common.cancel", defaultValue: "Cancel")) { dismiss() }
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? L10n.string("common.saving", defaultValue: "Saving…") : L10n.string("common.save", defaultValue: "Save")) {
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
        let trimmedIcon = icon.trimmingCharacters(in: .whitespacesAndNewlines)
        let result = AccountFormResult(
            name: trimmedName.isEmpty ? nil : trimmedName,
            icon: trimmedIcon.isEmpty ? fixedType.defaultIcon : trimmedIcon,
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
