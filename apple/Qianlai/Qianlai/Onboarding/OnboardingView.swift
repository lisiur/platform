//
//  OnboardingView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import PhotosUI
import SwiftUI

/// First-login guide for self-registered users (the onboarding-pending
/// flag). Two visual steps: profile (name/avatar, saved via the step's
/// single "Save & Continue" button) and ledger (optional — create one by
/// typing a name). Finishing clears the flag server-side and the app root
/// swaps back to the main tabs. An account with no ledger is a valid state.
struct OnboardingView: View {
    @Environment(AuthManager.self) private var auth
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast

    @State private var profileStore = ProfileStore()
    @State private var avatarItem: PhotosPickerItem?
    @State private var name = ""
    @State private var nameError: String?

    @State private var ledgerName = ""

    @State private var isFinishing = false
    @State private var step = Step.profile

    private enum Step {
        case profile
        case ledger
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header
                    switch step {
                    case .profile:
                        profileSection
                        stepActions(
                            primary: "Save & Continue",
                            primaryIcon: "arrow.right",
                            isBusy: isSavingName
                        ) {
                            Task { await saveNameAndContinue() }
                        }
                    case .ledger:
                        ledgerSection
                        stepActions(
                            primary: hasTypedLedgerName ? "Create & Use" : "Skip",
                            primaryIcon: hasTypedLedgerName ? "checkmark" : "arrow.right",
                            isBusy: isFinishing
                        ) {
                            Task { await finishOnboarding() }
                        }
                    }
                }
                .padding(24)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            #if os(iOS)
            .scrollDismissesKeyboard(.interactively)
            #endif
            .navigationTitle(Text("Welcome"))
            .navigationBarTitleDisplayMode(.inline)
            .animation(.smooth, value: step)
        }
    }

    // MARK: - Chrome

    private var header: some View {
        VStack(spacing: 8) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            Text("Welcome, \(auth.currentUser?.greetingName ?? "")!")
                .font(.title2.bold())
            Text("A couple of quick steps to set up your workspace.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    /// Primary button under each step. The flow is forward-only: the
    /// profile step has no skip and the ledger step has no way back.
    /// `isBusy` runs the spinner and disables the button — saving the
    /// profile on step 1, completing onboarding on step 2.
    private func stepActions(
        primary: LocalizedStringKey,
        primaryIcon: String,
        isBusy: Bool,
        onPrimary: @escaping () -> Void
    ) -> some View {
        Button {
            onPrimary()
        } label: {
            HStack(spacing: 8) {
                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    Image(systemName: primaryIcon)
                }
                Text(primary)
                    .font(.headline)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
    }

    // MARK: - Step 1: Profile

    private var profileSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 16) {
                Text("Your profile")
                    .font(.headline)

                HStack(spacing: 16) {
                    avatarPicker
                    // A plain bordered field — FormField's filled style
                    // reads as disabled inside the GroupBox.
                    VStack(alignment: .leading, spacing: 6) {
                        TextField("Your name", text: $name)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(.name)
                            .submitLabel(.done)
                            .onChange(of: name) { _, _ in nameError = nil }
                        if let nameError {
                            Text(nameError)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                    }
                }
            }
            .padding(8)
        }
    }

    private var isSavingName: Bool {
        profileStore.isSaving || profileStore.isUploading
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var avatarPicker: some View {
        PhotosPicker(selection: $avatarItem, matching: .images) {
            avatarImage
        }
        .buttonStyle(.plain)
        .onChange(of: avatarItem) { _, item in
            guard let item else { return }
            avatarItem = nil
            Task { await uploadAvatar(from: item) }
        }
    }

    private var avatarImage: some View {
        let url = ProfileStore.absoluteAvatarURL(
            auth.currentUser?.avatar,
            baseURL: auth.apiBaseURL
        )
        return ZStack(alignment: .bottomTrailing) {
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
                            initials
                        }
                    }
                } else {
                    initials
                }
            }
            .frame(width: 64, height: 64)
            .background(Circle().fill(Color.accentColor))
            .clipShape(Circle())

            Image(systemName: "camera.fill")
                .font(.caption2)
                .foregroundStyle(.white)
                .padding(6)
                .background(Circle().fill(Color.accentColor))
                .overlay(Circle().stroke(.background, lineWidth: 1.5))
                .offset(x: 2, y: 2)
        }
    }

    private var initials: some View {
        Text(String((auth.currentUser?.name ?? auth.currentUser?.email ?? "?").prefix(1)).uppercased())
            .font(.title2.weight(.semibold))
            .foregroundStyle(.white)
    }

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
            try await profileStore.uploadAvatar(
                data: data,
                fileName: "avatar.jpg",
                mimeType: "image/jpeg",
                auth: auth
            )
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    /// Saves the entered name (required) and advances to the ledger step;
    /// an empty or failed save stays on the step.
    private func saveNameAndContinue() async {
        guard !trimmedName.isEmpty else {
            nameError = L10n.string("profile.nameRequired", defaultValue: "Name is required")
            return
        }
        do {
            try await profileStore.updateName(trimmedName, auth: auth)
        } catch {
            toast.show(error.localizedDescription)
            return
        }
        withAnimation(.smooth) { step = .ledger }
    }

    // MARK: - Step 2: Ledger (optional)

    private var ledgerSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    Text("Your first ledger")
                        .font(.headline)
                    // Conspicuous "this can wait" marker — the whole step
                    // is optional and must read that way at a glance.
                    Badge(text: "Optional", icon: "clock", color: .orange)
                }
                Text("Totally optional — create a ledger now, or do it anytime later.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if !ledgerStore.ledgers.isEmpty {
                    Label(
                        L10n.string(
                            "onboarding.ledgerCreated",
                            defaultValue: "Your ledger is ready. You can create more at any time."
                        ),
                        systemImage: "checkmark.circle.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.green)
                } else {
                    createLedgerForm
                }
            }
            .padding(8)
        }
    }

    private var createLedgerForm: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Create a ledger")
                .font(.subheadline.weight(.semibold))
            TextField("e.g. Family, Travel 2026", text: $ledgerName)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.done)
        }
    }

    /// True while a not-yet-created ledger name is typed — flips the
    /// primary button to "Create & Use".
    private var hasTypedLedgerName: Bool {
        !ledgerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Finishes onboarding; creates the typed ledger first when present.
    /// A create failure toasts and keeps the guide up.
    private func finishOnboarding() async {
        isFinishing = true
        defer { isFinishing = false }
        do {
            if hasTypedLedgerName && ledgerStore.ledgers.isEmpty {
                try await ledgerStore.create(
                    name: ledgerName.trimmingCharacters(in: .whitespacesAndNewlines),
                    description: nil,
                    currency: nil
                )
            }
            try await auth.completeOnboarding()
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Small tinted capsule used for the "Optional" marker.
private struct Badge: View {
    let text: LocalizedStringKey
    let icon: String
    let color: Color

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }
}

#Preview {
    OnboardingView()
        .environment(AuthManager())
        .environment(LedgerStore())
        .environment(ToastCenter())
}
