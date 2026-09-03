//
//  ProfileView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import PhotosUI
import SwiftUI

/// Account hub: avatar/name/password management plus links to real accounts,
/// ledger management, and language — with chart of accounts and reports
/// grouped under the active ledger.
///
/// Project-scoped guests don't have ledger chrome to manage — the entire
/// `ledgerSection` (which uses the active ledger name as its header) is
/// hidden, and the "Ledgers" link in `manageSection` opens with guest
/// ledgers expanded into their projects, so the project member never
/// sees a ledger name from the profile tab.
struct ProfileView: View {
    @Environment(AuthManager.self) private var auth
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(LocaleSettings.self) private var localeSettings
    @Environment(ToastCenter.self) private var toast
    @State private var store = ProfileStore()
    @State private var isShowingNameSheet = false
    @State private var isShowingPasswordSheet = false
    @State private var isShowingImporter = false
    @State private var avatarItem: PhotosPickerItem?

    /// True when the viewer is project-scoped on the active ledger —
    /// they shouldn't see ledger-management chrome anywhere on this tab.
    private var isGuest: Bool {
        ledgerStore.activeLedger?.isGuest ?? false
    }

    var body: some View {
        List {
            userSection
            manageSection
            if !isGuest {
                ledgerSection
            }
            languageSection
            Section {
                Button(role: .destructive) {
                    Task { await auth.logout() }
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(Text("Me"))
        .sheet(isPresented: $isShowingNameSheet) {
            NavigationStack {
                EditNameView(store: store)
            }
        }
        .sheet(isPresented: $isShowingPasswordSheet) {
            NavigationStack {
                ChangePasswordView(store: store)
            }
        }
        .photosPicker(
            isPresented: $isShowingImporter,
            selection: $avatarItem,
            matching: .images
        )
        .onChange(of: avatarItem) { _, item in
            guard let item else { return }
            avatarItem = nil
            Task { await uploadAvatar(from: item) }
        }
    }

    // MARK: - Sections

    private var userSection: some View {
        Section {
            HStack(spacing: 14) {
                avatar
                VStack(alignment: .leading, spacing: 4) {
                    Text(auth.currentUser?.name ?? "Unnamed user")
                        .font(.body.weight(.semibold))
                    if let email = auth.currentUser?.email {
                        Text(email)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            .padding(.vertical, 4)
            Button {
                isShowingNameSheet = true
            } label: {
                Label("Edit Name", systemImage: "pencil")
            }
            Button {
                isShowingPasswordSheet = true
            } label: {
                Label("Change Password", systemImage: "key")
            }
        }
    }

    private var manageSection: some View {
        Section("Manage") {
            NavigationLink {
                RealAccountsView()
            } label: {
                Label("Assets", systemImage: "creditcard")
            }
            NavigationLink {
                // Expanded for guests: guest-ledger rows render as their
                // projects, never as ledger names.
                LedgersView(expandGuestLedgers: isGuest)
            } label: {
                Label("Ledgers", systemImage: "book")
            }
        }
    }

    /// Accounts and reports belong to a ledger, so they live under the
    /// active ledger's name.
    private var ledgerSection: some View {
        Section {
            NavigationLink {
                AccountsView()
            } label: {
                Label("Accounts", systemImage: "chart.bar.doc.horizontal")
            }
            NavigationLink {
                CategoriesView()
            } label: {
                Label("Categories", systemImage: "tag")
            }
            if let ledger = ledgerStore.activeLedger {
                NavigationLink {
                    MembersView(ledger: ledger)
                } label: {
                    Label("Members", systemImage: "person.2")
                }
            }
            NavigationLink {
                ProjectsView()
            } label: {
                Label("Projects", systemImage: "folder")
            }
            NavigationLink {
                ReportsView()
            } label: {
                Label("Reports", systemImage: "chart.pie")
            }
        } header: {
            Text(ledgerStore.activeLedger?.name ?? L10n.string("ledger.none", defaultValue: "No ledger"))
        }
    }

    private var languageSection: some View {
        Section("Settings") {
            Picker(
                selection: Binding(
                    get: { localeSettings.identifier },
                    set: { localeSettings.set(identifier: $0) }
                )
            ) {
                Text("Follow system").tag(LocaleSettings.systemIdentifier)
                Text("English", comment: "Language name: English (native form)")
                    .tag("en")
                Text("简体中文", comment: "Language name: Simplified Chinese (native form)")
                    .tag("zh-Hans")
            } label: {
                Label("Language", systemImage: "globe")
            }
        }
    }

    /// Letter fallback for users without a decodable avatar image.
    private var initials: some View {
        Text(String((auth.currentUser?.name ?? auth.currentUser?.email ?? "?").prefix(1)).uppercased())
            .font(.title2.weight(.semibold))
            .foregroundStyle(.white)
    }

    @ViewBuilder
    private var avatar: some View {
        let user = auth.currentUser
        let url = ProfileStore.absoluteAvatarURL(user?.avatar, baseURL: auth.apiBaseURL)
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let url {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        case .failure:
                            initials
                        case .empty:
                            ProgressView()
                        @unknown default:
                            ProgressView()
                        }
                    }
                } else {
                    initials
                }
            }
            .frame(width: 64, height: 64)
            .background(Circle().fill(Color.accentColor))
            .clipShape(Circle())

            Menu {
                Button {
                    isShowingImporter = true
                } label: {
                    Label("Choose Image…", systemImage: "photo")
                }
            } label: {
                Image(systemName: "camera.fill")
                    .font(.caption2)
                    .foregroundStyle(.white)
                    .padding(6)
                    .background(Circle().fill(Color.accentColor))
                    .overlay(Circle().stroke(.background, lineWidth: 1.5))
            }
            .offset(x: 2, y: 2)
        }
    }

    // MARK: - Avatar upload

    private func uploadAvatar(from item: PhotosPickerItem) async {
        do {
            guard let image = try await item.loadTransferable(type: AvatarImage.self) else {
                toast.show(L10n.string("profile.uploadFailed", defaultValue: "Upload failed"))
                return
            }
            guard let data = ProfileStore.avatarJPEG(image.data) else {
                toast.show(L10n.string("profile.uploadFailed", defaultValue: "Upload failed"))
                return
            }
            guard data.count <= 5 * 1024 * 1024 else {
                toast.show(L10n.string("profile.fileTooLarge", defaultValue: "File is too large. Max 5MB."))
                return
            }
            try await store.uploadAvatar(
                data: data,
                fileName: "avatar.jpg",
                mimeType: "image/jpeg",
                auth: auth
            )
            toast.show(L10n.string("profile.avatarUpdated", defaultValue: "Avatar updated"))
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Display-name editor.
struct EditNameView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var auth
    @Environment(ToastCenter.self) private var toast
    let store: ProfileStore

    @State private var name = ""
    @State private var error: String?
    @State private var isSaving = false

    var body: some View {
        Form {
            Section {
                FormField(title: "Name", error: nil) {
                    TextField("Your name", text: $name)
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                }
                .listRowBackground(Color.clear)
            }
            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle(Text("Edit Name"))
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
        .onAppear {
            name = auth.currentUser?.name ?? ""
        }
    }

    private func save() async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            error = L10n.string("profile.nameRequired", defaultValue: "Name is required")
            return
        }
        isSaving = true
        defer { isSaving = false }
        do {
            try await store.updateName(trimmed, auth: auth)
            toast.show(L10n.string("profile.updated", defaultValue: "Profile updated"))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Password change form (server enforces 10–256 chars w/ letters + digits).
struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toast
    let store: ProfileStore

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var error: String?
    @State private var isSaving = false

    var body: some View {
        Form {
            Section {
                FormField(title: "Current Password", error: nil) {
                    SecureField("Enter your current password", text: $currentPassword)
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                }
                .listRowBackground(Color.clear)
                FormField(title: "New Password", error: nil) {
                    SecureField("At least 10 characters", text: $newPassword)
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                }
                .listRowBackground(Color.clear)
                FormField(title: "Confirm New Password", error: nil) {
                    SecureField("Repeat the new password", text: $confirmPassword)
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                }
                .listRowBackground(Color.clear)
            } footer: {
                Text("10–256 characters with both letters and numbers.")
            }
            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle(Text("Change Password"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "Changing…" : "Change") {
                    Task { await save() }
                }
                .disabled(isSaving)
            }
        }
    }

    private func save() async {
        guard !currentPassword.isEmpty else {
            error = L10n.string("profile.currentPasswordRequired", defaultValue: "Current password is required")
            return
        }
        guard newPassword.count >= 10 else {
            error = L10n.string("profile.newPasswordMin", defaultValue: "New password must be 10–256 characters with letters and numbers")
            return
        }
        guard newPassword == confirmPassword else {
            error = L10n.string("profile.passwordsMismatch", defaultValue: "The passwords don't match")
            return
        }
        error = nil
        isSaving = true
        defer { isSaving = false }
        do {
            try await store.changePassword(current: currentPassword, new: newPassword)
            toast.show(L10n.string("profile.passwordChanged", defaultValue: "Password changed"))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
