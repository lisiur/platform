import SwiftUI

/// One full-height card page in the Today pager. The card IS the detail
/// page: it loads its own detail (the list response carries no
/// enrichments), polls while enrichments generate, and offers
/// edit/delete through a context menu.
struct TodayCardPageView: View {
    @Environment(CollectionStore.self) private var store
    @Environment(TodayStore.self) private var todayStore

    let item: CollectionItem

    @State private var detail: CollectionItem?
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var isRetrying = false
    @State private var isEditing = false
    @State private var isConfirmingDelete = false

    private var resolvedItem: CollectionItem { detail ?? item }

    var body: some View {
        Group {
            if isLoading && detail == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let loadError, detail == nil {
                ContentUnavailableView {
                    Label("加载失败", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("重试") {
                        Task { await loadDetail() }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                cardBody(resolvedItem)
            }
        }
        .task(id: item.id) {
            await loadDetail()
        }
        .onChange(of: item.status) {
            Task { await loadDetail() }
        }
        .task(id: detail?.enrichStatus) {
            // Bounded polling: stop after repeated failures (e.g. offline)
            // instead of retrying every 5 seconds forever.
            var consecutiveFailures = 0
            while detail?.enrichStatus == .pending, consecutiveFailures < 3 {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                if await loadDetail() {
                    consecutiveFailures = 0
                } else {
                    consecutiveFailures += 1
                }
            }
        }
        .contextMenu {
            Button("编辑") { isEditing = true }
            Button("删除", role: .destructive) { isConfirmingDelete = true }
        }
        .confirmationDialog(
            "删除此条目及其全部释义？此操作不可撤销。",
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button("删除", role: .destructive) {
                Task {
                    if await store.deleteItem(id: item.id) {
                        todayStore.removeItem(id: item.id)
                    }
                }
            }
            Button("取消", role: .cancel) {}
        }
        .sheet(isPresented: $isEditing) {
            ItemEditSheet(item: resolvedItem) {
                Task { await loadDetail() }
            }
        }
    }

    private func cardBody(_ item: CollectionItem) -> some View {
        ScrollView {
            ItemDetailContent(
                item: item,
                isRetrying: isRetrying,
                onRetryEnrich: { Task { await retryEnrich() } }
            )
            .padding(20)
        }
        .scrollIndicators(.never)
    }

    @discardableResult
    private func loadDetail() async -> Bool {
        if detail == nil { isLoading = true }
        defer { isLoading = false }
        do {
            detail = try await store.fetchItem(id: item.id)
            loadError = nil
            return true
        } catch {
            if case let APIError.server(status, _) = error, status == 404 {
                // Genuinely gone — fall back to the list summary.
                loadError = nil
            } else if detail == nil {
                loadError = error.localizedDescription
            }
            return false
        }
    }

    private func retryEnrich() async {
        isRetrying = true
        defer { isRetrying = false }
        do {
            _ = try await store.client.send(
                "POST", "collection/items/\(item.id)/enrich/retry"
            )
            await loadDetail()
        } catch {
            store.toast = error.localizedDescription
        }
    }
}

#Preview {
    TodayCardPageView(
        item: CollectionItem(
            id: "preview",
            type: .word,
            source: "ephemeral",
            url: nil,
            title: "Ephemeral",
            note: nil,
            tags: ["adjective"],
            status: "active",
            enrichStatus: .ok,
            enrichError: nil,
            enrichmentsCount: 2,
            createdAt: Date(),
            updatedAt: Date(),
            enrichments: nil,
            attachments: nil
        )
    )
    .environment(CollectionStore())
    .environment(TodayStore())
}
