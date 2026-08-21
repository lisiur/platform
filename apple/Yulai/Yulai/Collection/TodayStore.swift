import Foundation
import Observation

@MainActor
@Observable
final class TodayStore {
    let client = APIClient.shared

    private(set) var items: [CollectionItem] = []
    private(set) var total = 0
    private(set) var isLoading = false
    private(set) var isLoadingMore = false

    var toast: String?

    let pageSize = 24
    private var loadGeneration = 0

    var hasMore: Bool {
        items.count < total
    }

    /// Reloads the first page, replacing whatever is shown.
    func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        if items.isEmpty { isLoading = true }
        do {
            let response: ListResponse = try await client.request(
                "GET",
                Self.listPath(limit: pageSize, offset: 0)
            )
            guard generation == loadGeneration else { return }
            items = response.items
            total = response.total
        } catch {
            guard generation == loadGeneration else { return }
            toast = error.localizedDescription
        }
        isLoading = false
    }

    /// Appends the next page so the card pager can keep swiping.
    func loadMore() async {
        guard hasMore, !isLoading, !isLoadingMore else { return }
        isLoadingMore = true
        loadGeneration += 1
        let generation = loadGeneration
        do {
            let response: ListResponse = try await client.request(
                "GET",
                Self.listPath(limit: pageSize, offset: items.count)
            )
            guard generation == loadGeneration else { return }
            let known = Set(items.map(\.id))
            items += response.items.filter { !known.contains($0.id) }
            total = response.total
        } catch {
            guard generation == loadGeneration else { return }
            toast = error.localizedDescription
        }
        isLoadingMore = false
    }

    /// Locally drops a card deleted from its pager; the server is
    /// already up to date.
    func removeItem(id: String) {
        items.removeAll { $0.id == id }
        total = max(0, total - 1)
    }

    private static func listPath(limit: Int, offset: Int) -> String {
        var query = "limit=\(limit)&offset=\(offset)&status=active"
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: Date())
        let startOfTomorrow = calendar.date(
            byAdding: .day, value: 1, to: startOfToday
        ) ?? startOfToday
        let formatter = ISO8601DateFormatter()
        query += "&from=\(queryEncode(formatter.string(from: startOfToday)))"
            + "&to=\(queryEncode(formatter.string(from: startOfTomorrow)))"
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
