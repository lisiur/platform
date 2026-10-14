import SwiftUI
import UniformTypeIdentifiers

// Export hands the user a file — a backup archive with everything, or the
// workbook alone when they'd rather open it in Excel. Import is the
// mirror: a file in, a preview of what it will do, and a commit that only
// ever runs on the exact file that was previewed.

/// The archive's photo set. On by default for a restore (that's the point
/// of a backup) but off for the workbook, which carries no bytes.
private enum ExportKind: String, CaseIterable, Identifiable {
    case backup
    case workbook

    var id: String { rawValue }

    var title: String {
        switch self {
        case .backup:
            L10n.string("transfer.export.backup", defaultValue: "Backup archive")
        case .workbook:
            L10n.string("transfer.export.workbook", defaultValue: "Excel workbook")
        }
    }

    var detail: String {
        switch self {
        case .backup:
            L10n.string(
                "transfer.export.backupDetail",
                defaultValue: "Everything — accounts, entries, projects, budgets and photo receipts. One file you can keep or move to another device."
            )
        case .workbook:
            L10n.string(
                "transfer.export.workbookDetail",
                defaultValue: "A spreadsheet you can open in Excel or Numbers. Editable, but no receipts."
            )
        }
    }

    var systemImage: String {
        switch self {
        case .backup: return "archivebox"
        case .workbook: return "tablecells"
        }
    }
}

struct LedgerExportView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerTransferStore.self) private var transfer

    let ledger: QianlaiLedger

    @State private var kind: ExportKind = .backup
    @State private var includePhotos = true

    /// What the current file on screen was built from. The download task is
    /// keyed on it, so picking the other format or flipping the receipts
    /// toggle re-exports — the sheet otherwise keeps showing the file the
    /// first option produced while the user thinks they changed it.
    private var optionSignature: String {
        "\(kind.rawValue)-\(includePhotos)"
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(ExportKind.allCases) { option in
                        Button {
                            kind = option
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: option.systemImage)
                                    .foregroundStyle(.tint)
                                    .frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(option.title)
                                        .foregroundStyle(.primary)
                                    Text(option.detail)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if kind == option {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.tint)
                                }
                            }
                        }
                    }
                }

                if kind == .backup {
                    Section {
                        Toggle(
                            L10n.string("transfer.export.photos", defaultValue: "Include photo receipts"),
                            isOn: $includePhotos
                        )
                    } footer: {
                        Text(
                            L10n.string(
                                "transfer.export.photosHint",
                                defaultValue: "Receipts are most of a backup's size. Leave this on to keep them; turn it off for a smaller file."
                            )
                        )
                    }
                }

                Section {
                    switch transfer.exportPhase {
                    case .exporting:
                        HStack {
                            ProgressView()
                            Text(L10n.string("transfer.exporting", defaultValue: "Preparing your file…"))
                                .foregroundStyle(.secondary)
                        }
                    case .ready(let url):
                        ShareExport(url: url, title: L10n.string("transfer.export.share", defaultValue: "Share or save"))
                    case .failed(let message):
                        Text(message)
                            .foregroundStyle(.red)
                    case .idle:
                        EmptyView()
                    }
                }
            }
            .navigationTitle(L10n.string("transfer.export.title", defaultValue: "Export Ledger"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.string("common.done", defaultValue: "Done")) { dismiss() }
                }
            }
        }
        .task(id: optionSignature) {
            await runExport()
        }
    }

    private func runExport() async {
        switch kind {
        case .backup:
            await transfer.exportLedger(ledger, includePhotos: includePhotos)
        case .workbook:
            await transfer.exportWorkbook(ledger)
        }
    }
}

/// The share affordance for the finished file. A `ShareLink` is the
/// whole of it on macOS; iOS goes through the activity sheet.
private struct ShareExport: View {
    let url: URL
    let title: String

    var body: some View {
        #if canImport(UIKit)
        ShareSheet(items: [url])
            .frame(height: 44)
            .overlay(alignment: .leading) {
                Text(title)
            }
        #else
        ShareLink(item: url) {
            Label(title, systemImage: "square.and.arrow.up")
        }
        #endif
    }
}

/// Import from a file the user picks.
///
/// The target is fixed by where the sheet was opened from — the toolbar
/// restores into a new ledger, a ledger row merges into that one — so the
/// user never has to choose a destination while picking a file; they only
/// see what the file will do to it.
struct LedgerImportView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerTransferStore.self) private var transfer
    @Environment(LedgerStore.self) private var ledgerStore

    let target: LedgerImportTarget

    @State private var isPickingFile = false
    @State private var isCommitting = false
    @State private var result: LedgerImportResult?

    private static let importableTypes: [UTType] = [
        .zip,
        UTType(filenameExtension: "xlsx") ?? .data,
        .json,
    ]

    var body: some View {
        NavigationStack {
            List {
                targetSection

                switch transfer.importPhase {
                case .idle:
                    if result == nil {
                        Section {
                            Button {
                                isPickingFile = true
                            } label: {
                                Label(
                                    L10n.string("transfer.import.chooseFile", defaultValue: "Choose File"),
                                    systemImage: "doc.badge.plus"
                                )
                            }
                        } footer: {
                            Text(
                                L10n.string(
                                    "transfer.import.supportedFiles",
                                    defaultValue: "A backup archive from this app, or a workbook (.xlsx) you exported earlier."
                                )
                            )
                        }
                    }
                case .reading, .previewing:
                    Section {
                        HStack {
                            ProgressView()
                            Text(L10n.string("transfer.import.reading", defaultValue: "Reading the file…"))
                                .foregroundStyle(.secondary)
                        }
                    }
                case .committing:
                    Section {
                        HStack {
                            ProgressView()
                            Text(L10n.string("transfer.import.committing", defaultValue: "Importing…"))
                                .foregroundStyle(.secondary)
                        }
                    }
                case .failed(let message):
                    Section {
                        Text(message)
                            .foregroundStyle(.red)
                    }
                    // The store still holds the file the preview described,
                    // so retrying is the same bytes — which is the only kind
                    // of retry the server will accept.
                    if transfer.canRetryCommit {
                        Section {
                            Button {
                                Task { await commit() }
                            } label: {
                                Text(L10n.string("transfer.import.retry", defaultValue: "Try Again"))
                            }
                        }
                    }
                case .ready(let preview):
                    previewSections(preview)
                }

                if let result {
                    Section(L10n.string("transfer.import.done", defaultValue: "Imported")) {
                        LabeledContent(
                            L10n.string("transfer.import.entries", defaultValue: "Entries"),
                            value: "\(result.created.entries)"
                        )
                        LabeledContent(
                            L10n.string("transfer.import.accounts", defaultValue: "Accounts"),
                            value: "\(result.created.accounts)"
                        )
                        LabeledContent(
                            L10n.string("transfer.import.photos", defaultValue: "Receipts"),
                            value: "\(result.created.photos)"
                        )
                        if result.skipped.entries > 0 {
                            LabeledContent(
                                L10n.string("transfer.import.skipped", defaultValue: "Skipped as already present"),
                                value: "\(result.skipped.entries)"
                            )
                        }
                    }
                    if !result.warnings.isEmpty {
                        Section(L10n.string("transfer.import.warnings", defaultValue: "Warnings")) {
                            ForEach(Array(result.warnings.enumerated()), id: \.offset) { _, warning in
                                Text(warning)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle(L10n.string("transfer.import.title", defaultValue: "Import Ledger"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.string("common.close", defaultValue: "Close")) {
                        transfer.resetImport()
                        dismiss()
                    }
                }
            }
        }
        .fileImporter(
            isPresented: $isPickingFile,
            allowedContentTypes: Self.importableTypes,
            allowsMultipleSelection: false
        ) { outcome in
            switch outcome {
            case .success(let urls):
                if let url = urls.first {
                    Task { await transfer.previewImport(fileURL: url, target: target) }
                }
            case .failure:
                transfer.resetImport()
            }
        }
        .task {
            // The sheet opens on the picker: there is nothing to show until
            // a file has been chosen, and a preview of nothing is a lie.
            isPickingFile = true
        }
    }

    private var targetSection: some View {
        Section {
            switch target {
            case .new:
                LabeledContent(
                    L10n.string("transfer.import.newLedger", defaultValue: "Destination"),
                    value: L10n.string("transfer.import.newLedgerValue", defaultValue: "A new ledger")
                )
            case .merge(let ledgerId):
                LabeledContent(
                    L10n.string("transfer.import.newLedger", defaultValue: "Destination"),
                    value: ledgerStore.ledgers.first { $0.id == ledgerId }?.name ?? ""
                )
            }
        }
    }

    @ViewBuilder
    private func previewSections(_ preview: LedgerImportPreview) -> some View {
        Section(L10n.string("transfer.import.file", defaultValue: "File")) {
            LabeledContent(
                L10n.string("transfer.import.name", defaultValue: "Ledger"),
                value: preview.ledger.name ?? L10n.string("transfer.import.unnamed", defaultValue: "(unnamed)")
            )
            LabeledContent(
                L10n.string("transfer.import.dateRange", defaultValue: "Date range"),
                value: dateRange(preview)
            )
            LabeledContent(
                L10n.string("transfer.import.entries", defaultValue: "Entries"),
                value: "\(preview.entries.importable)/\(preview.entries.total)"
            )
            if preview.entries.duplicates > 0 {
                LabeledContent(
                    L10n.string("transfer.import.duplicates", defaultValue: "Already in this ledger"),
                    value: "\(preview.entries.duplicates)"
                )
            }
            if preview.entries.invalid > 0 {
                LabeledContent(
                    L10n.string("transfer.import.invalid", defaultValue: "Can't be imported"),
                    value: "\(preview.entries.invalid)"
                )
            }
            if preview.photos.count > 0 {
                LabeledContent(
                    L10n.string("transfer.import.photos", defaultValue: "Receipts"),
                    value: "\(preview.photos.count)"
                )
            }
        }

        if !preview.accounts.isEmpty {
            resolutionSection(
                title: L10n.string("transfer.import.accounts", defaultValue: "Accounts"),
                rows: preview.accounts
            )
        }
        if !preview.people.isEmpty {
            resolutionSection(
                title: L10n.string("transfer.import.people", defaultValue: "People"),
                rows: preview.people
            )
        }

        if !preview.issues.isEmpty {
            Section(L10n.string("transfer.import.issues", defaultValue: "Problems")) {
                ForEach(preview.issues) { issue in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(issue.message)
                        Text(issue.where_)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }

        if !preview.blocking.isEmpty {
            Section {
                ForEach(preview.blocking, id: \.self) { problem in
                    Text(problem)
                        .foregroundStyle(.red)
                }
            }
        } else {
            Section {
                Button {
                    Task { await commit() }
                } label: {
                    HStack {
                        if isCommitting {
                            ProgressView()
                        }
                        Text(L10n.string("transfer.import.confirm", defaultValue: "Import"))
                    }
                }
                .disabled(isCommitting)
            } footer: {
                Text(
                    preview.isRestore
                        ? L10n.string(
                            "transfer.import.restoreHint",
                            defaultValue: "Restoring keeps everything, including entries you already have elsewhere."
                        )
                        : L10n.string(
                            "transfer.import.mergeHint",
                            defaultValue: "Entries already in this ledger are skipped, so importing the same file twice changes nothing."
                        )
                )
            }
        }
    }

    private func resolutionSection(
        title: String,
        rows: [LedgerImportResolution]
    ) -> some View {
        Section(title) {
            ForEach(rows) { row in
                HStack {
                    Text(row.title)
                        .lineLimit(1)
                    Spacer()
                    Text(actionLabel(row))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func actionLabel(_ row: LedgerImportResolution) -> String {
        if row.isDrop {
            return L10n.string("transfer.import.willDrop", defaultValue: "Skipped")
        }
        if row.isReuse {
            return L10n.string("transfer.import.willReuse", defaultValue: "Kept")
        }
        return L10n.string("transfer.import.willCreate", defaultValue: "New")
    }

    private func dateRange(_ preview: LedgerImportPreview) -> String {
        switch (preview.ledger.from, preview.ledger.to) {
        case (let from?, let to?) where from == to:
            return from
        case (let from?, let to?):
            return "\(from) – \(to)"
        default:
            return L10n.string("transfer.import.noEntries", defaultValue: "No entries")
        }
    }

    private func commit() async {
        isCommitting = true
        defer { isCommitting = false }
        guard let outcome = await transfer.commitImport() else { return }
        result = outcome
        await ledgerStore.load()
    }
}
