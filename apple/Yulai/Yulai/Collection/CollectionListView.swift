import SwiftUI

struct CollectionListView: View {
    @Environment(CollectionStore.self) private var store

    /// macOS cards carry larger fonts, so their adaptive columns need a
    /// wider minimum to keep the text from wrapping too aggressively.
    #if os(macOS)
    private static let cardMinWidth: CGFloat = 270
    #else
    private static let cardMinWidth: CGFloat = 230
    #endif

    @State private var searchText = ""
    @State private var lightweightToast: String?
    /// The item whose card is currently slid open; opening a card closes
    /// any other revealed card, like iMessage rows.
    @State private var revealedItemId: String?
    /// Item pushed to the detail screen. Rows handle taps themselves so a
    /// tap on a revealed card can close it without triggering navigation.
    @State private var pushedItem: CollectionItem?

    var body: some View {
        VStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 12) {
                #if !os(macOS)
                searchField
                #endif
                controlsRow
            }
            Divider()
            content
            if store.pageCount > 1 {
                paginationFooter
            }
        }
        .padding(20)
        #if os(macOS)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        #endif
        .overlay(alignment: .bottom) {
            toastView
        }
        .animation(.snappy(duration: 0.2), value: lightweightToast)
        #if os(macOS)
        .searchable(text: $searchText, prompt: "搜索…")
        #endif
        .navigationDestination(item: $pushedItem) { item in
            ItemDetailView(itemId: item.id)
        }
        .task {
            await store.resetAndLoad()
        }
        .task(id: searchText) {
            guard searchText != store.searchText else { return }
            try? await Task.sleep(for: .seconds(0.4))
            guard !Task.isCancelled else { return }
            store.searchText = searchText
            await store.resetAndLoad()
        }
        .onChange(of: store.typeFilter) {
            Task { await store.resetAndLoad() }
        }
        .onChange(of: store.statusFilter) {
            Task { await store.resetAndLoad() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.items.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store.items.isEmpty {
            ContentUnavailableView {
                Label("还没有内容", systemImage: "tray")
            } description: {
                Text("点击“添加”按钮收藏新内容。")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVGrid(
                    columns: [
                        GridItem(.adaptive(minimum: Self.cardMinWidth), spacing: 12)
                    ],
                    spacing: 12
                ) {
                    ForEach(store.items) { item in
                        SwipeActionCard(
                            leadingAction: SwipeAction(
                                icon: item.status == "learned"
                                    ? "arrow.counterclockwise" : "checkmark",
                                color: item.status == "learned" ? .orange : .green,
                                title: item.status == "learned" ? "标记学习中" : "标记已学习"
                            ) {
                                Task { await toggleStatus(item) }
                            },
                            trailingAction: SwipeAction(
                                icon: "archivebox",
                                color: .gray,
                                title: "归档"
                            ) {
                                Task { await archiveItem(item) }
                            },
                            isRevealed: Binding(
                                get: { revealedItemId == item.id },
                                set: { revealedItemId = $0 ? item.id : nil }
                            )
                        ) {
                            ItemCardView(item: item)
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            // While any card is revealed, taps belong to the
                            // reveal/close interaction, never navigation.
                            guard revealedItemId == nil else { return }
                            pushedItem = item
                        }
                    }
                }
            }
            .refreshable { await store.load() }
        }
    }

    #if !os(macOS)
    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("搜索…", text: $searchText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(.secondarySystemBackground))
        )
    }
    #endif

    @ViewBuilder
    private var toastView: some View {
        if let lightweightToast {
            Label(lightweightToast, systemImage: "checkmark.circle.fill")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.regularMaterial, in: Capsule())
                .shadow(color: .black.opacity(0.16), radius: 12, y: 6)
                .padding(.bottom, 20)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private var controlsRow: some View {
        HStack(spacing: 12) {
            typePicker
            Spacer(minLength: 0)
            statusPicker
        }
    }

    private var typePicker: some View {
        Picker(
            "类型",
            selection: Binding(
                get: { store.typeFilter },
                set: { store.typeFilter = $0 }
            )
        ) {
            Text("全部").tag(CollectionItemType?.none)
            ForEach(CollectionItemType.allCases) { type in
                Text(type.label).tag(CollectionItemType?.some(type))
            }
        }
        .labelsHidden()
        .pickerStyle(.segmented)
        .controlSize(.large)
    }

    private var statusPicker: some View {
        Picker(
            "状态",
            selection: Binding(
                get: { store.statusFilter },
                set: { store.statusFilter = $0 }
            )
        ) {
            Text("全部").tag(CollectionItemStatus?.none)
            ForEach(CollectionItemStatus.allCases) { status in
                Text(status.label).tag(CollectionItemStatus?.some(status))
            }
        }
        .labelsHidden()
        #if os(iOS)
        .pickerStyle(.menu)
        #else
        .pickerStyle(.segmented)
        .controlSize(.large)
        #endif
    }

    private var paginationFooter: some View {
        HStack {
            Text("共 \(store.total) 条")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
            Button {
                Task { await store.setPage(store.page - 1) }
            } label: {
                Image(systemName: "chevron.left")
            }
            .disabled(store.page <= 1)
            Text("第 \(store.page) / \(store.pageCount) 页")
                .font(.footnote)
                .monospacedDigit()
            Button {
                Task { await store.setPage(store.page + 1) }
            } label: {
                Image(systemName: "chevron.right")
            }
            .disabled(store.page >= store.pageCount)
        }
        .buttonStyle(.bordered)
    }

    private func showLightweightToast(_ message: String) {
        lightweightToast = message
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            guard lightweightToast == message else { return }
            withAnimation(.snappy(duration: 0.2)) {
                lightweightToast = nil
            }
        }
    }

    /// Swipe on a card toggles it between 学习中 and 已学习.
    private func toggleStatus(_ item: CollectionItem) async {
        let newStatus = item.status == "learned" ? "active" : "learned"
        guard await setStatus(item, status: newStatus) else { return }
        showLightweightToast(newStatus == "learned" ? "已标记为已学习" : "已恢复为学习中")
    }

    private func archiveItem(_ item: CollectionItem) async {
        guard await setStatus(item, status: "archived") else { return }
        showLightweightToast("已归档")
    }

    @discardableResult
    private func setStatus(_ item: CollectionItem, status: String) async -> Bool {
        do {
            _ = try await store.updateItem(
                id: item.id,
                body: UpdateItemBody(
                    title: item.title ?? "",
                    note: item.note ?? "",
                    tags: item.tags,
                    status: status,
                    url: item.url ?? ""
                )
            )
            return true
        } catch {
            store.toast = error.localizedDescription
            return false
        }
    }
}
