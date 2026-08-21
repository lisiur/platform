import SwiftUI

struct TodayView: View {
    @Environment(TodayStore.self) private var store
    @Environment(CollectionStore.self) private var collectionStore
    @Environment(\.scenePhase) private var scenePhase

    @State private var currentItemId: String?
    @State private var isMarkingLearned = false
    @State private var isManualAddPresented = false
    @State private var isAddMenuPresented = false
    @State private var pendingPasteText: String?
    @State private var lightweightToast: String?

    var body: some View {
        VStack(spacing: 0) {
            content
            if !store.items.isEmpty {
                cardFooter
            }
        }
        #if os(macOS)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                addMenu
            }
        }
        .overlay(alignment: .bottom) {
            toastView
        }
        .animation(.snappy(duration: 0.2), value: lightweightToast)
        .sheet(isPresented: $isManualAddPresented) {
            ManualAddSheet(store: collectionStore)
        }
        .onChange(of: isManualAddPresented) {
            if !$0 { Task { await store.load() } }
        }
        .alert(
            "确认粘贴？",
            isPresented: Binding(
                get: { pendingPasteText != nil },
                set: { if !$0 { pendingPasteText = nil } }
            )
        ) {
            Button("加入收藏") {
                confirmPasteAndAdd()
            }
            Button("取消", role: .cancel) {}
        } message: {
            if let pendingPasteText {
                Text(pendingPasteText)
            }
        }
        .task {
            await store.load()
        }
        .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in
            Task { await store.load() }
        }
        .onChange(of: scenePhase) {
            if scenePhase == .active {
                Task { await store.load() }
            }
        }
        .onChange(of: store.items) { oldItems, newItems in
            reconcileSelection(oldItems: oldItems, newItems: newItems)
            loadMoreIfNeeded()
        }
        .onChange(of: currentItemId) {
            loadMoreIfNeeded()
        }
        .alert(
            store.toast ?? "",
            isPresented: Binding(
                get: { store.toast != nil },
                set: { if !$0 { store.toast = nil } }
            )
        ) {
            Button("好", role: .cancel) {}
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.items.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store.items.isEmpty {
            ContentUnavailableView {
                Label("今日已学完", systemImage: "checkmark.seal")
            } description: {
                Text("今天没有待学习的内容了，收藏新内容后再来吧。")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            cardPager
        }
    }

    /// Full-width, full-height cards — one card is one detail page;
    /// swipe horizontally to move between them.
    private var cardPager: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(store.items) { item in
                    TodayCardPageView(item: item)
                        .containerRelativeFrame(.horizontal)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $currentItemId)
        .scrollIndicators(.hidden)
    }

    private var cardFooter: some View {
        HStack {
            Button {
                Task { await markLearned() }
            } label: {
                HStack(spacing: 6) {
                    if isMarkingLearned {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "checkmark.circle")
                    }
                    Text("已学习")
                }
            }
            .buttonStyle(.bordered)
            .disabled(isMarkingLearned || currentItem == nil)
            Spacer()
            if store.isLoadingMore {
                ProgressView()
                    .controlSize(.small)
            }
            Text(positionLabel)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .monospacedDigit()
            Button {
                moveBy(-1)
            } label: {
                Image(systemName: "chevron.left")
            }
            .disabled(currentIndex <= 0)
            Button {
                moveBy(1)
            } label: {
                Image(systemName: "chevron.right")
            }
            .disabled(currentIndex >= store.items.count - 1 && !store.hasMore)
        }
        .buttonStyle(.bordered)
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    private var currentIndex: Int {
        store.items.firstIndex(where: { $0.id == currentItemId }) ?? 0
    }

    private var currentItem: CollectionItem? {
        store.items.first { $0.id == currentItemId }
    }

    #if os(macOS)
    private var addMenu: some View {
        Button {
            isAddMenuPresented.toggle()
        } label: {
            if collectionStore.isAdding {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "plus")
            }
        }
        .disabled(collectionStore.isAdding)
        .popover(isPresented: $isAddMenuPresented, arrowEdge: .bottom) {
            addMenuActions
        }
    }

    private var addMenuActions: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                isAddMenuPresented = false
                pasteAndAdd()
            } label: {
                Label("粘贴", systemImage: "doc.on.clipboard")
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            Divider()
            Button {
                isAddMenuPresented = false
                isManualAddPresented = true
            } label: {
                Label("手动输入", systemImage: "square.and.pencil")
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
        .padding(.vertical, 6)
        .frame(minWidth: 150, alignment: .leading)
    }
    #else
    private var addMenu: some View {
        Menu {
            addMenuContent
        } label: {
            if collectionStore.isAdding {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "plus")
            }
        }
        .disabled(collectionStore.isAdding)
    }

    @ViewBuilder
    private var addMenuContent: some View {
        Button {
            pasteAndAdd()
        } label: {
            Label("粘贴", systemImage: "doc.on.clipboard")
        }
        Button {
            isManualAddPresented = true
        } label: {
            Label("手动输入", systemImage: "square.and.pencil")
        }
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

    private func pasteAndAdd() {
        guard
            let text = clipboardText?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !text.isEmpty
        else {
            store.toast = "剪贴板没有可粘贴的内容"
            isManualAddPresented = true
            return
        }
        pendingPasteText = text
    }

    private func confirmPasteAndAdd() {
        guard let text = pendingPasteText else { return }
        pendingPasteText = nil
        Task {
            if await collectionStore.quickAdd(text) {
                await store.load()
                showLightweightToast("已加入收藏")
            }
        }
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

    private var clipboardText: String? {
        #if os(macOS)
        NSPasteboard.general.string(forType: .string)
        #else
        UIPasteboard.general.string
        #endif
    }

    private func markLearned() async {
        guard let item = currentItem, !isMarkingLearned else { return }
        isMarkingLearned = true
        defer { isMarkingLearned = false }
        do {
            _ = try await collectionStore.updateItem(
                id: item.id,
                body: UpdateItemBody(
                    title: item.title ?? "",
                    note: item.note ?? "",
                    tags: item.tags,
                    status: "learned",
                    url: item.url ?? ""
                )
            )
            // Learned items leave the Today deck (status=active filter);
            // the pager lands on the neighboring card.
            store.removeItem(id: item.id)
        } catch {
            store.toast = error.localizedDescription
        }
    }

    private var positionLabel: String {
        let shown = store.items.isEmpty ? 0 : currentIndex + 1
        return "第 \(shown) / \(store.items.count) 张"
    }

    private func moveBy(_ delta: Int) {
        let target = currentIndex + delta
        guard store.items.indices.contains(target) else { return }
        withAnimation {
            currentItemId = store.items[target].id
        }
    }

    /// Keeps the pager on a valid card when the list changes: keeps the
    /// current card if it survives, otherwise lands on the card that took
    /// its place (e.g. after a delete), or the first card.
    private func reconcileSelection(oldItems: [CollectionItem], newItems: [CollectionItem]) {
        if let currentItemId, newItems.contains(where: { $0.id == currentItemId }) {
            return
        }
        guard !newItems.isEmpty else {
            if currentItemId != nil { currentItemId = nil }
            return
        }
        if let currentId = currentItemId {
            let index = oldItems.firstIndex(where: { $0.id == currentId }) ?? 0
            withAnimation {
                currentItemId = newItems[min(index, newItems.count - 1)].id
            }
        } else {
            currentItemId = newItems.first?.id
        }
    }

    /// Swiping onto the last card fetches the next page so the deck
    /// keeps going.
    private func loadMoreIfNeeded() {
        guard
            let currentItemId,
            currentItemId == store.items.last?.id,
            store.hasMore,
            !store.isLoadingMore,
            !store.isLoading
        else { return }
        Task { await store.loadMore() }
    }
}

#Preview {
    NavigationStack {
        TodayView()
            .navigationTitle("今日")
    }
    .environment(TodayStore())
    .environment(CollectionStore())
}
