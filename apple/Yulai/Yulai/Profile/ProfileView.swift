#if os(macOS)
import AppKit
#endif
import SwiftUI
import UniformTypeIdentifiers

struct ProfileView: View {
    @Environment(AuthManager.self) private var auth
    @Environment(CollectionStore.self) private var collectionStore
    @Environment(LocaleSettings.self) private var localeSettings
    @State private var store = ProfileStore()
    @State private var isShowingRedeem = false
    @State private var isShowingImporter = false
    @State private var isShowingImportConfirm = false
    #if !os(macOS)
    @State private var exportedFileURL: URL?
    #endif

    var body: some View {
        profileLayout
            .task {
                await store.loadCredit()
            }
            .sheet(isPresented: $isShowingRedeem) {
                RedeemSheet(store: store)
            }
            .fileImporter(
                isPresented: $isShowingImporter,
                allowedContentTypes: [.json]
            ) { result in
                if case .success(let url) = result {
                    Task {
                        await collectionStore.prepareImport(from: url)
                        if collectionStore.pendingImport != nil {
                            isShowingImportConfirm = true
                        }
                    }
                }
            }
            .confirmationDialog(
                collectionStore.pendingImport.map { "\($0.count) items" } ?? "Import",
                isPresented: $isShowingImportConfirm,
                titleVisibility: .visible
            ) {
                Button("Import") {
                    collectionStore.confirmImport()
                }
                Button("Cancel", role: .cancel) {
                    collectionStore.cancelImport()
                }
            } message: {
                Text("Restore items from a Yulai export file. Items already in your collection will be skipped.")
            }
            .alert(
                collectionStore.toast ?? "",
                isPresented: Binding(
                    get: { collectionStore.toast != nil },
                    set: { if !$0 { collectionStore.toast = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await auth.logout() }
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .tint(.red)
                }
            }
        #if !os(macOS)
            .sheet(
                isPresented: Binding(
                    get: { exportedFileURL != nil },
                    set: { if !$0 { clearExportedFile() } }
                )
            ) {
                if let exportedFileURL {
                    ShareSheet(items: [exportedFileURL])
                }
            }
        #endif
    }

    @ViewBuilder
    private var profileLayout: some View {
        #if os(macOS)
        profileContent
            .padding(20)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        #else
        GeometryReader { proxy in
            ScrollView {
                profileContent
                    .padding(20)
                    .frame(maxWidth: 480)
                    .frame(
                        maxWidth: .infinity,
                        minHeight: proxy.size.height,
                        alignment: .top
                    )
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        #endif
    }

    private var profileContent: some View {
        VStack(spacing: 14) {
            if let user = auth.currentUser {
                VStack(spacing: 10) {
                    avatar(user)
                    Text(user.name ?? "Unnamed user")
                        .font(.title2.weight(.semibold))
                    if let email = user.email {
                        Text(email)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 20)
            }
            creditCard
            Button {
                isShowingRedeem = true
            } label: {
                Label("Redeem points", systemImage: "giftcard")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
            Button {
                Task { await handleExport() }
            } label: {
                HStack(spacing: 6) {
                    if collectionStore.isExporting {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "square.and.arrow.down")
                    }
                    Text(collectionStore.isExporting ? "Exporting…" : "Export data")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
            .disabled(collectionStore.isExporting)
            Button {
                isShowingImporter = true
            } label: {
                HStack(spacing: 6) {
                    if collectionStore.isImporting {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "square.and.arrow.up")
                    }
                    Text(collectionStore.isImporting ? "Importing…" : "Import data")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
            .disabled(collectionStore.isImporting)
            languageCard
            #if os(macOS)
            Spacer()
            #endif
        }
    }

    private var languageCard: some View {
        HStack {
            Text("Language")
                .font(.subheadline)
            Spacer()
            Picker(
                "Language",
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
            }
            .pickerStyle(.menu)
            .labelsHidden()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.quaternary)
        )
    }

    #if !os(macOS)
    /// The shared file lives in the temporary directory; remove it once the
    /// share sheet is dismissed (the system copies data to the chosen
    /// destination before then).
    private func clearExportedFile() {
        if let exportedFileURL {
            try? FileManager.default.removeItem(at: exportedFileURL)
        }
        exportedFileURL = nil
    }
    #endif

    private var creditCard: some View {
        VStack(spacing: 6) {
            if store.isLoadingCredit, store.credit == nil {
                ProgressView()
                    .controlSize(.small)
                    .padding(.vertical, 8)
            } else if let credit = store.credit {
                Label {
                    Text("\(credit.balance - credit.frozen)")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                } icon: {
                    Image(systemName: "star.hexagon")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                }
                Text(credit.frozen > 0
                     ? "Credits remaining (\(credit.frozen) frozen)"
                     : "Credits remaining")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("Credit info unavailable")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.accentColor.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.accentColor.opacity(0.2))
        )
        .overlay(alignment: .topTrailing) {
            NavigationLink {
                CreditLedgerView(store: store)
            } label: {
                HStack(spacing: 2) {
                    Text("Credit history")
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(6)
        }
    }

    private func avatar(_ user: User) -> some View {
        let initial = String((user.name ?? user.email ?? "?").prefix(1)).uppercased()
        return Text(initial)
            .font(.title.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: 72, height: 72)
            .background(Circle().fill(Color.accentColor))
    }

    private func handleExport() async {
        guard let data = await collectionStore.exportData() else { return }
        await saveExport(data)
    }

    private func saveExport(_ data: Data) async {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let name = "studybuddy-collection-\(formatter.string(from: Date.now)).json"
        #if os(macOS)
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = name
        // Await the sheet instead of running a nested modal loop.
        let response: NSApplication.ModalResponse
        if let window = NSApp.keyWindow {
            response = await panel.beginSheetModal(for: window)
        } else {
            response = await withCheckedContinuation { continuation in
                panel.begin { continuation.resume(returning: $0) }
            }
        }
        if response == .OK, let url = panel.url {
            do {
                try data.write(to: url)
                collectionStore.toast = "Exported"
            } catch {
                collectionStore.toast = "Export failed. Please try again."
            }
        }
        #else
        do {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(name)
            try data.write(to: url)
            exportedFileURL = url
        } catch {
            collectionStore.toast = "Export failed. Please try again."
        }
        #endif
    }
}

struct RedeemSheet: View {
    @Environment(\.dismiss) private var dismiss
    let store: ProfileStore

    @State private var code = ""
    @FocusState private var isCodeFocused: Bool
    @State private var successBalance: Int?

    var body: some View {
        #if os(macOS)
        cardBody
        #else
        formBody
        #endif
    }

    #if os(macOS)
    private var cardBody: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "giftcard.fill")
                    .foregroundStyle(Color.accentColor)
                Text("Redeem points")
                    .font(.headline)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .disabled(store.isRedeeming)
            }
            Text("Enter a redemption code — credits will be added instantly.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            codeField
            feedback
            redeemButton
        }
        .padding(20)
        .frame(width: 360)
        .onAppear { isCodeFocused = true }
    }
    #endif

    #if !os(macOS)
    private var formBody: some View {
        NavigationStack {
            Form {
                Section {
                    codeField
                } header: {
                    Text("Redemption code")
                } footer: {
                    feedback
                }
            }
            .navigationTitle("Redeem points")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .disabled(store.isRedeeming)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(store.isRedeeming ? "Redeeming…" : "Redeem") {
                        Task { await redeem() }
                    }
                    .disabled(
                        store.isRedeeming
                            || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
        }
    }
    #endif

    private var codeField: some View {
        TextField("Enter your redemption code", text: $code)
            .focused($isCodeFocused)
            #if os(macOS)
            .textFieldStyle(.plain)
            #endif
            #if os(iOS)
            .textInputAutocapitalization(.characters)
            #endif
            .autocorrectionDisabled()
            .onSubmit { Task { await redeem() } }
            #if os(macOS)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(.quaternary)
            )
            #endif
    }

    private var redeemButton: some View {
        Button {
            Task { await redeem() }
        } label: {
            HStack(spacing: 6) {
                if store.isRedeeming {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                }
                Text(store.isRedeeming ? "Redeeming…" : "Redeem")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
        }
        .buttonStyle(.borderedProminent)
        .disabled(
            store.isRedeeming
                || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        )
    }

    @ViewBuilder
    private var feedback: some View {
        if let successBalance {
            Label(
                "Redeemed successfully. Current balance: \(successBalance) points.",
                systemImage: "checkmark.circle.fill"
            )
            .font(.caption)
            .foregroundStyle(.green)
            .transition(.opacity)
        } else if let error = store.redeemError {
            Label(error, systemImage: "exclamationmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.red)
                .transition(.opacity)
        }
    }

    private func redeem() async {
        isCodeFocused = false
        successBalance = nil
        if let balance = await store.redeem(code: code) {
            withAnimation { successBalance = balance }
            code = ""
        }
    }
}
