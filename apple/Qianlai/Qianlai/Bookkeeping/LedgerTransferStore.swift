import Foundation
import Observation
import os

// MARK: - Models

/// Where an import lands. A restore creates a ledger; a merge folds the
/// file into one that already exists, reusing what it can and skipping the
/// entries already there.
enum LedgerImportTarget: Equatable {
    case new(name: String?)
    case merge(ledgerId: String)
}

/// One row of the preview's resolution table: an account, a project or a
/// person, and what the import will do with it.
struct LedgerImportResolution: Decodable, Equatable, Identifiable {
    var key: String
    /// Accounts report their name-or-code, people their name; projects carry
    /// `name` instead, since two projects can share a label and the name is
    /// what a merge matches on.
    var label: String?
    var name: String?
    var email: String?
    var action: String
    var targetId: String?

    var id: String { key }

    var title: String { label ?? name ?? key }

    /// `reuse` / `create` / `drop`, guarded so an unknown value from a
    /// newer server degrades to the neutral one instead of crashing a
    /// switch that never saw it.
    var isReuse: Bool { action == "reuse" }
    var isDrop: Bool { action == "drop" }
}

struct LedgerImportEntryCounts: Decodable, Equatable {
    var total: Int
    var importable: Int
    var duplicates: Int
    var invalid: Int
}

struct LedgerImportPhotoCounts: Decodable, Equatable {
    var count: Int
    var bytes: Int
    var missing: [String]
}

struct LedgerImportIssue: Decodable, Equatable, Identifiable {
    var where_: String
    var message: String

    var id: String { "\(where_)|\(message)" }

    enum CodingKeys: String, CodingKey {
        case where_ = "where"
        case message
    }
}

struct LedgerImportPreview: Decodable, Equatable {
    var source: String
    var formatVersion: Int
    var ledger: LedgerImportSummary
    var target: LedgerImportTargetSummary
    var accounts: [LedgerImportResolution]
    var projects: [LedgerImportResolution]
    var people: [LedgerImportResolution]
    var entries: LedgerImportEntryCounts
    var photos: LedgerImportPhotoCounts
    var issues: [LedgerImportIssue]
    var blocking: [String]
    /// The hash the commit has to echo back; the server refuses a file that
    /// isn't byte-identical to the previewed one.
    var previewToken: String

    var canCommit: Bool { blocking.isEmpty }
    var isRestore: Bool { source == "archive" || source == "document" }
}

struct LedgerImportSummary: Decodable, Equatable {
    var name: String?
    var currency: String
    var entries: Int
    var accounts: Int
    var projects: Int
    var people: Int
    var from: String?
    var to: String?
}

struct LedgerImportTargetSummary: Decodable, Equatable {
    var mode: String
    var ledgerId: String?
}

struct LedgerImportCreated: Decodable, Equatable {
    var accounts: Int
    var projects: Int
    var people: Int
    var entries: Int
    var photos: Int
}

struct LedgerImportResult: Decodable, Equatable {
    var ledgerId: String
    var mode: String
    var created: LedgerImportCreated
    var skipped: LedgerImportSkipped
    var warnings: [String]
}

struct LedgerImportSkipped: Decodable, Equatable {
    var entries: Int
}

// MARK: - Store

/// Ledger export and import.
///
/// Export is one streaming download of a file the user then hands to
/// whatever they like (AirDrop, Files, a chat), so the store's job ends at
/// writing the bytes somewhere shareable. Import is a two-step the server
/// insists on: preview the file, show what it will do, commit only that
/// exact file. The store keeps the preview's bytes around between the two
/// so the commit can't be pointed at something else.
@MainActor
@Observable
final class LedgerTransferStore {
    private static let logger = Logger(subsystem: "top.hapaul.qianlai", category: "LedgerTransfer")

    private let client = APIClient.shared

    enum ExportPhase: Equatable {
        case idle
        case exporting(includePhotos: Bool)
        case ready(URL)
        case failed(String)
    }

    enum ImportPhase: Equatable {
        case idle
        case reading
        case previewing
        case ready(LedgerImportPreview)
        case committing
        case failed(String)
    }

    private(set) var exportPhase: ExportPhase = .idle
    private(set) var importPhase: ImportPhase = .idle

    /// The bytes the current preview described, and the token that binds
    /// them. Held until the next preview replaces them — the commit reads
    /// this rather than re-reading whatever file the user picked since.
    private var pendingImport: (data: Data, fileName: String, token: String)?
    private var pendingTarget: LedgerImportTarget = .new(name: nil)

    var isExporting: Bool {
        if case .exporting = exportPhase { return true }
        return false
    }

    var isBusy: Bool {
        if isExporting { return true }
        switch importPhase {
        case .reading, .previewing, .committing: return true
        default: return false
        }
    }

    /// True when a commit failed but the previewed file is still held — the
    /// sheet offers a retry there, because the server only accepts the exact
    /// bytes that were previewed and those are still in hand.
    var canRetryCommit: Bool {
        if case .failed = importPhase { return pendingImport != nil }
        return false
    }

    // MARK: Export

    /// Downloads the ledger as a backup archive and leaves the file in the
    /// app's Documents directory, ready for the share sheet.
    ///
    /// `includePhotos` is off by default because the receipts are what
    /// makes an archive big; the workbook and the ledger's whole history
    /// are in there either way.
    @discardableResult
    func exportLedger(
        _ ledger: QianlaiLedger,
        includePhotos: Bool
    ) async -> URL? {
        exportPhase = .exporting(includePhotos: includePhotos)
        do {
            let data = try await client.download(
                "bookkeeping/ledgers/\(ledger.id)/export",
                query: [
                    URLQueryItem(name: "format", value: "zip"),
                    URLQueryItem(name: "includePhotos", value: includePhotos ? "true" : "false"),
                    URLQueryItem(name: "tzOffsetMinutes", value: "\(TimeZone.current.secondsFromGMT() / 60)")
                ]
            )
            let url = try writeExport(data, ledgerName: ledger.name)
            exportPhase = .ready(url)
            return url
        } catch {
            Self.logger.error("Export failed: \(String(describing: error), privacy: .public)")
            exportPhase = .failed(Self.message(for: error))
            return nil
        }
    }

    func resetExport() {
        exportPhase = .idle
    }

    /// Exports the workbook alone — no receipts, so a spreadsheet the user
    /// can open and edit in Excel or Numbers.
    @discardableResult
    func exportWorkbook(_ ledger: QianlaiLedger) async -> URL? {
        exportPhase = .exporting(includePhotos: false)
        do {
            let data = try await client.download(
                "bookkeeping/ledgers/\(ledger.id)/export",
                query: [
                    URLQueryItem(name: "format", value: "xlsx"),
                    URLQueryItem(name: "tzOffsetMinutes", value: "\(TimeZone.current.secondsFromGMT() / 60)")
                ]
            )
            let url = try writeExport(data, ledgerName: ledger.name, pathExtension: "xlsx")
            exportPhase = .ready(url)
            return url
        } catch {
            exportPhase = .failed(Self.message(for: error))
            return nil
        }
    }

    private func writeExport(
        _ data: Data,
        ledgerName: String,
        pathExtension: String = "zip"
    ) throws -> URL {
        let directory = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Exports", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let stamp = Self.fileStampFormatter.string(from: Date())
        let safeName = ledgerName
            .replacingOccurrences(of: "/", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let name = safeName.isEmpty ? "ledger" : safeName
        let url = directory.appendingPathComponent("\(name)-\(stamp).\(pathExtension)")
        try data.write(to: url, options: .atomic)
        return url
    }

    private static let fileStampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmm"
        return formatter
    }()

    // MARK: Import

    /// Reads a picked file and asks the server what importing it would do.
    /// Nothing is written until `commit` runs on this same file.
    func previewImport(
        fileURL: URL,
        target: LedgerImportTarget
    ) async {
        importPhase = .reading
        do {
            // A picked file is security-scoped; reading it outside the
            // callback that opened the picker fails.
            let accessed = fileURL.startAccessingSecurityScopedResource()
            defer { if accessed { fileURL.stopAccessingSecurityScopedResource() } }

            let data = try Data(contentsOf: fileURL)
            let preview: LedgerImportPreview = try await client.postMultipart(
                "bookkeeping/transfers/preview",
                fileData: data,
                fileName: fileURL.lastPathComponent,
                mimeType: mimeType(for: fileURL),
                fields: targetFields(target)
            )
            pendingImport = (data, fileURL.lastPathComponent, preview.previewToken)
            pendingTarget = target
            importPhase = .ready(preview)
        } catch {
            Self.logger.error("Import preview failed: \(String(describing: error), privacy: .public)")
            pendingImport = nil
            importPhase = .failed(Self.message(for: error))
        }
    }

    /// Runs the preview the user saw. Refuses locally when the preview has
    /// something blocking in it, so a doomed import never leaves the device.
    func commitImport() async -> LedgerImportResult? {
        guard let pendingImport else {
            importPhase = .failed(L10n.string("transfer.import.stalePreview", defaultValue: "请重新选择文件预览"))
            return nil
        }
        guard case .ready(let preview) = importPhase else { return nil }
        guard preview.canCommit else { return nil }

        importPhase = .committing
        do {
            let result: LedgerImportResult = try await client.postMultipart(
                "bookkeeping/transfers/commit",
                fileData: pendingImport.data,
                fileName: pendingImport.fileName,
                mimeType: mimeType(forNamed: pendingImport.fileName),
                fields: targetFields(pendingTarget) + [
                    (name: "previewToken", value: pendingImport.token)
                ]
            )
            self.pendingImport = nil
            importPhase = .idle
            return result
        } catch {
            Self.logger.error("Import commit failed: \(String(describing: error), privacy: .public)")
            // The file stays pending: the server refuses anything that isn't
            // byte-identical to the preview, so a retry has to be the same
            // file, and it is still right here.
            importPhase = .failed(Self.message(for: error))
            return nil
        }
    }

    func resetImport() {
        pendingImport = nil
        pendingTarget = .new(name: nil)
        importPhase = .idle
    }

    private func targetFields(_ target: LedgerImportTarget) -> [(name: String, value: String)] {
        switch target {
        case .new(let name):
            var fields: [(name: String, value: String)] = [("target", "new")]
            if let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines),
               !trimmed.isEmpty
            {
                fields.append(("ledgerName", trimmed))
            }
            return fields
        case .merge(let ledgerId):
            return [("target", ledgerId)]
        }
    }

    private func mimeType(for url: URL) -> String {
        mimeType(forNamed: url.lastPathComponent)
    }

    private func mimeType(forNamed name: String) -> String {
        switch (name as NSString).pathExtension.lowercased() {
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "json": return "application/json"
        default: return "application/zip"
        }
    }

    private static func message(for error: Error) -> String {
        if let apiError = error as? APIError, case .server(_, let message) = apiError {
            return message
        }
        return error.localizedDescription
    }
}
