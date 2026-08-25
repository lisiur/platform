import SwiftUI

struct ItemDetailView: View {
    @Environment(CollectionStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    let itemId: String

    @State private var item: CollectionItem?
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var isRetrying = false
    @State private var isEditing = false
    @State private var isConfirmingDelete = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let item {
                detailBody(item)
            } else if let loadError {
                ContentUnavailableView {
                    Label("加载失败", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("重试") {
                        Task { await load() }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("未找到该条目。", systemImage: "magnifyingglass")
                }
            }
        }
        .navigationTitle("条目")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("编辑") { isEditing = true }
                    .disabled(item == nil)
            }
            ToolbarItem(placement: .primaryAction) {
                Button("删除", role: .destructive) { isConfirmingDelete = true }
                    .disabled(item == nil)
            }
        }
        .task {
            await load()
        }
        .task(id: item?.enrichStatus) {
            // Bounded polling: stop after repeated failures (e.g. offline)
            // instead of retrying every 5 seconds forever.
            var consecutiveFailures = 0
            while item?.enrichStatus == .pending, consecutiveFailures < 3 {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                if await load() {
                    consecutiveFailures = 0
                } else {
                    consecutiveFailures += 1
                }
            }
        }
        .confirmationDialog(
            "删除此条目及其全部释义？此操作不可撤销。",
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button("删除", role: .destructive) {
                Task {
                    if await store.deleteItem(id: itemId) {
                        dismiss()
                    }
                }
            }
            Button("取消", role: .cancel) {}
        }
        .sheet(isPresented: $isEditing) {
            if let item {
                ItemEditSheet(item: item) {
                    Task { await load() }
                }
            }
        }
    }

    private func detailBody(_ item: CollectionItem) -> some View {
        ScrollView {
            ItemDetailContent(
                item: item,
                isRetrying: isRetrying,
                onRetryEnrich: { Task { await retryEnrich() } }
            )
            .padding(20)
        }
    }

    @discardableResult
    private func load() async -> Bool {
        if item == nil { isLoading = true }
        defer { isLoading = false }
        do {
            item = try await store.fetchItem(id: itemId)
            loadError = nil
            return true
        } catch {
            if case let APIError.server(status, _) = error, status == 404 {
                // Genuinely gone — keep the "not found" state.
                loadError = nil
            } else if item == nil {
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
                "POST", "collection/items/\(itemId)/enrich/retry"
            )
            await load()
        } catch {
            store.toast = error.localizedDescription
        }
    }
}

/// The detail rendering shared by the pushed detail screen and the Today
/// card pager: header card, failure banner, and enrichment sections.
/// Callers own scrolling and padding.
struct ItemDetailContent: View {
    let item: CollectionItem
    var isRetrying = false
    var onRetryEnrich: (() -> Void)?

    var body: some View {
        VStack(spacing: 14) {
            headerCard
            if item.enrichStatus == .failed {
                failureBanner
            }
            let kinds = CollectionItemType.enrichmentKinds[item.type] ?? []
            if kinds.isEmpty {
                Text("此类型暂不支持 AI 释义。")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(kinds) { kind in
                        EnrichmentSectionView(
                            kind: kind,
                            data: item.enrichments?.first { $0.kind == kind.rawValue },
                            pending: item.enrichStatus == .pending,
                            word: item.source
                        )
                    }
                }
            }
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                BadgeView(text: item.type.label, color: item.type.badgeColor)
                BadgeView(text: statusLabel(item.status), outlined: true)
                Spacer()
                Text(CollectionTime.full(item.createdAt))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            Text(item.source)
                .font(.title3.weight(.semibold))
                .textSelection(.enabled)
            if let title = item.title, !title.isEmpty {
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let note = item.note, !note.isEmpty {
                Text(note)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            if !item.tags.isEmpty {
                WrapLayout(spacing: 6) {
                    ForEach(item.tags, id: \.self) { tag in
                        BadgeView(text: tag, outlined: true)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.primary.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08))
        )
    }

    private var failureBanner: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("自动生成释义失败")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.red)
                if let error = item.enrichError, !error.isEmpty {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button {
                onRetryEnrich?()
            } label: {
                HStack(spacing: 6) {
                    if isRetrying {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                    Text("重试")
                }
            }
            .buttonStyle(.bordered)
            .disabled(isRetrying)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.red.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.red.opacity(0.35))
        )
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "active": "学习中"
        case "archived": "已归档"
        case "learned": "已学习"
        default: status
        }
    }
}

struct ItemEditSheet: View {
    @Environment(CollectionStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    let item: CollectionItem
    let onSaved: () -> Void

    @State private var title: String
    @State private var note: String
    @State private var tagsText: String
    @State private var status: String
    @State private var urlText: String
    @State private var isSaving = false
    @State private var urlError: String?

    init(item: CollectionItem, onSaved: @escaping () -> Void) {
        self.item = item
        self.onSaved = onSaved
        _title = State(initialValue: item.title ?? "")
        _note = State(initialValue: item.note ?? "")
        _tagsText = State(initialValue: item.tags.joined(separator: ", "))
        _status = State(initialValue: item.status)
        _urlText = State(initialValue: item.url ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("标题") {
                    TextField("标题", text: $title)
                }
                Section("笔记") {
                    TextField("笔记", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section("标签（逗号分隔）") {
                    TextField("adjective, daily", text: $tagsText)
                }
                Section("状态") {
                    Picker("状态", selection: $status) {
                        Text("学习中").tag("active")
                        Text("已归档").tag("archived")
                        Text("已学习").tag("learned")
                    }
                    .pickerStyle(.segmented)
                }
                Section("链接") {
                    TextField("https://…", text: $urlText)
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        #endif
                        .autocorrectionDisabled()
                    if let urlError {
                        Text(urlError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("更新条目详情")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "保存中…" : "保存") {
                        Task { await save() }
                    }
                    .disabled(isSaving)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 440, minHeight: 420)
        #endif
    }

    private func save() async {
        let trimmedURL = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedURL.isEmpty,
           trimmedURL.range(of: #"^https?://.+"#, options: .regularExpression) == nil {
            urlError = "请输入有效的 http(s) 链接。"
            return
        }
        urlError = nil
        let body = UpdateItemBody(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            note: note.trimmingCharacters(in: .whitespacesAndNewlines),
            tags: tagsText
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty },
            status: status,
            url: trimmedURL
        )
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await store.updateItem(id: item.id, body: body)
            store.toast = "条目已更新"
            onSaved()
            dismiss()
        } catch {
            store.toast = error.localizedDescription
        }
    }
}
