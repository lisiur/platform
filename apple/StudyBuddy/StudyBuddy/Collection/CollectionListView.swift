import SwiftUI

struct CollectionListView: View {
    @Environment(CollectionStore.self) private var store

    @FocusState private var isQuickAddFocused: Bool
    @State private var searchText = ""
    @State private var newSource = ""

    var body: some View {
        VStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 12) {
                Text("收集并学习英语单词、短语、句子、文章和链接")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                quickAddField
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
        .frame(minWidth: 760, minHeight: 560)
        #endif
        .searchable(text: $searchText, prompt: "搜索…")
        .navigationDestination(for: CollectionItem.self) { item in
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
                Text("在上方粘贴任意内容即可开始收藏。")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 230), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(store.items) { item in
                        NavigationLink(value: item) {
                            ItemCardView(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .refreshable { await store.load() }
        }
    }

    private var quickAddField: some View {
        HStack(spacing: 10) {
            TextField("粘贴单词、短语、句子或链接…", text: $newSource)
                .textFieldStyle(.plain)
                .focused($isQuickAddFocused)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled()
                .onSubmit(submitQuickAdd)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(.quaternary)
                )
            Button(action: submitQuickAdd) {
                HStack(spacing: 6) {
                    if store.isAdding {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                    }
                    Text(store.isAdding ? "添加中…" : "添加")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(
                store.isAdding
                    || newSource.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )
        }
    }

    private var controlsRow: some View {
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
        .pickerStyle(.segmented)
        .frame(maxWidth: 460, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
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

    private func submitQuickAdd() {
        isQuickAddFocused = false
        let source = newSource
        Task {
            if await store.quickAdd(source) {
                newSource = ""
            }
        }
    }
}
