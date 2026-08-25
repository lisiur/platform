import Foundation
import Observation

@MainActor
@Observable
final class CollectionStore {
    let client = APIClient.shared

    private(set) var items: [CollectionItem] = []
    private(set) var total = 0
    private(set) var page = 1
    private(set) var isLoading = false
    private(set) var isAdding = false
    private(set) var isExporting = false
    private(set) var isImporting = false

    var typeFilter: CollectionItemType?
    var statusFilter: CollectionItemStatus?
    var searchText = ""
    var toast: String?
    var pendingImport: PendingImport?

    let pageSize = 24
    private var loadGeneration = 0
    private var pollTask: Task<Void, Never>?
    private var consecutiveFailedPolls = 0

    var pageCount: Int {
        max(1, (total + pageSize - 1) / pageSize)
    }

    func resetAndLoad() async {
        page = 1
        await load()
    }

    func setPage(_ newPage: Int) async {
        let clamped = min(max(newPage, 1), pageCount)
        guard clamped != page else { return }
        page = clamped
        await load()
    }

    /// User-initiated load: supersedes any scheduled poll and reports errors.
    func load() async {
        pollTask?.cancel()
        await performLoad(reportErrors: true)
    }

    /// Reload without surfacing errors — for surfaces like the menu bar
    /// whose toasts have no visible host window.
    func reloadQuietly() async {
        pollTask?.cancel()
        await performLoad(reportErrors: false)
    }

    /// The actual fetch. Never cancels `pollTask` — the poll task calls this
    /// itself, and cancelling from within would abort the in-flight request
    /// (`URLError.cancelled` surfaced as "Could not reach the server").
    /// Background polls pass `reportErrors: false` so transient failures
    /// don't alert every 5 seconds.
    private func performLoad(reportErrors: Bool) async {
        loadGeneration += 1
        let generation = loadGeneration
        if items.isEmpty { isLoading = true }
        do {
            let response: ListResponse = try await client.request(
                "GET",
                Self.listPath(
                    type: typeFilter,
                    q: searchText,
                    status: statusFilter,
                    limit: pageSize,
                    offset: (page - 1) * pageSize
                )
            )
            guard generation == loadGeneration else { return }
            items = response.items
            total = response.total
            consecutiveFailedPolls = 0
        } catch {
            guard generation == loadGeneration else { return }
            consecutiveFailedPolls += 1
            if reportErrors {
                toast = error.localizedDescription
            }
        }
        isLoading = false
        schedulePollingIfNeeded()
    }

    /// Creates an item via the API. Throws on failure; never touches
    /// `toast` — callers decide how to surface the result.
    func add(_ source: String) async throws -> CollectionItem {
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        isAdding = true
        defer { isAdding = false }
        return try await client.request(
            "POST",
            "collection/items",
            body: CreateItemBody(
                type: CollectionItemType.detect(trimmed).rawValue,
                source: trimmed
            )
        )
    }

    /// Add + reload; errors are surfaced through `toast`, while success is left
    /// to the caller's local feedback UI.
    func quickAdd(_ source: String) async -> Bool {
        do {
            _ = try await add(source)
            await resetAndLoad()
            return true
        } catch {
            toast = error.localizedDescription
            return false
        }
    }

    func exportData() async -> Data? {
        isExporting = true
        defer { isExporting = false }
        do {
            let (data, _) = try await client.send("GET", "collection/items/export")
            let object = try JSONSerialization.jsonObject(with: data)
            return try JSONSerialization.data(
                withJSONObject: object,
                options: [.prettyPrinted, .sortedKeys]
            )
        } catch {
            toast = "Export failed. Please try again."
            return nil
        }
    }

    func prepareImport(from url: URL) async {
        struct ExportFile: Decodable {
            let items: [EnrichValue]?
        }
        let gotAccess = url.startAccessingSecurityScopedResource()
        defer { if gotAccess { url.stopAccessingSecurityScopedResource() } }
        guard
            let data = try? Data(contentsOf: url),
            let file = try? JSONDecoder().decode(ExportFile.self, from: data),
            let importedItems = file.items,
            !importedItems.isEmpty
        else {
            toast = "This isn't a valid Yulai export file."
            return
        }
        guard importedItems.count <= 1000 else {
            toast = "Too many items in the file (max 1000). Please split and try again."
            return
        }
        pendingImport = PendingImport(
            fileName: url.lastPathComponent,
            count: importedItems.count,
            items: importedItems
        )
    }

    /// Must be called synchronously from the dialog button so the payload is
    /// captured before the dialog's dismissal mutates view state.
    func confirmImport() {
        guard let pending = pendingImport else { return }
        Task { await performImport(pending) }
    }

    func cancelImport() {
        pendingImport = nil
    }

    private func performImport(_ pending: PendingImport) async {
        isImporting = true
        defer { isImporting = false }
        do {
            let result: ImportResult = try await client.request(
                "POST",
                "collection/items/import",
                body: ImportBody(items: pending.items)
            )
            pendingImport = nil
            toast = "Imported \(result.created) items, skipped \(result.skipped) duplicates"
            await resetAndLoad()
        } catch {
            toast = error.localizedDescription
        }
    }

    func fetchItem(id: String) async throws -> CollectionItem {
        try await client.request("GET", "collection/items/\(id)")
    }

    func updateItem(id: String, body: UpdateItemBody) async throws -> CollectionItem {
        let updated: CollectionItem = try await client.request(
            "PATCH",
            "collection/items/\(id)",
            body: body
        )
        await load()
        return updated
    }

    func deleteItem(id: String) async -> Bool {
        do {
            _ = try await client.send("DELETE", "collection/items/\(id)")
            toast = "Item deleted"
            await load()
            return true
        } catch {
            toast = error.localizedDescription
            return false
        }
    }

    private func schedulePollingIfNeeded() {
        pollTask?.cancel()
        // Stop polling after repeated failures (e.g. offline) instead of
        // retrying silently forever; a successful user load resets the count.
        guard consecutiveFailedPolls < 5,
              items.contains(where: { $0.enrichStatus == .pending })
        else { return }
        pollTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard let self, !Task.isCancelled else { return }
            await self.performLoad(reportErrors: false)
        }
    }

    private static func listPath(
        type: CollectionItemType?,
        q: String,
        status: CollectionItemStatus?,
        limit: Int,
        offset: Int
    ) -> String {
        var query = "limit=\(limit)&offset=\(offset)"
        if let type {
            query += "&type=\(type.rawValue)"
        }
        if let status {
            query += "&status=\(status.rawValue)"
        }
        if !q.isEmpty {
            query += "&q=\(queryEncode(q))"
        }
        return "collection/items?\(query)"
    }

    private static func queryEncode(_ value: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+/?")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}

private struct ListResponse: Decodable {
    let items: [CollectionItem]
    let total: Int
}

private struct CreateItemBody: Encodable {
    let type: String
    let source: String
}

private struct ImportBody: Encodable {
    let items: [EnrichValue]
}

private struct ImportResult: Decodable {
    let created: Int
    let skipped: Int
}
