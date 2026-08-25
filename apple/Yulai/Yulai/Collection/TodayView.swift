import SwiftUI

struct TodayView: View {
    @Environment(TodayStore.self) private var store
    @Environment(CollectionStore.self) private var collectionStore
    @Environment(\.scenePhase) private var scenePhase

    @State private var currentItemId: String?
    @State private var isMarkingLearned = false
    #if os(macOS)
    @State private var isQuickAddPresented = false
    #endif

    var body: some View {
        VStack(spacing: 0) {
            content
            if !store.items.isEmpty {
                cardFooter
            }
        }
        #if os(macOS)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    isQuickAddPresented = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("添加")
            }
        }
        .sheet(isPresented: $isQuickAddPresented) {
            quickAddSheet
        }
        .onChange(of: isQuickAddPresented) {
            if !isQuickAddPresented {
                Task { await store.load() }
            }
        }
        #endif
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
                Label("全部已学完", systemImage: "checkmark.seal")
            } description: {
                Text("没有待学习的内容了，收藏新内容后再来吧。")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            cardPager
        }
    }

    /// Full-width, full-height cards — one card is one detail page;
    /// swipe horizontally to move between them.
    private var cardPager: some View {
        ScrollView(.horizontal, showsIndicators: false) {
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
        .scrollIndicators(.never)
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
                    Text("标记已学习")
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

    /// `.scrollPosition(id:)` writes nil into the binding during initial
    /// layout before any card reports as visible; the pager still rests on
    /// the first card, so actions target it instead of disabling.
    private var currentItem: CollectionItem? {
        store.items.indices.contains(currentIndex) ? store.items[currentIndex] : nil
    }

    #if os(macOS)
    private var quickAddSheet: some View {
        NavigationStack {
            QuickAddView()
                .navigationTitle("添加")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("关闭") { isQuickAddPresented = false }
                    }
                }
        }
        .frame(width: 460, height: 360)
    }
    #endif

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
            .navigationTitle("学习")
    }
    .environment(TodayStore())
    .environment(CollectionStore())
}
