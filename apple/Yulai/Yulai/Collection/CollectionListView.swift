import SwiftUI

struct CollectionListView: View {
    @Environment(CollectionStore.self) private var store

    @State private var searchText = ""
    @State private var isMenuOpen = false
    @State private var isManualAddPresented = false
    @State private var pendingPasteText: String?
    @State private var lightweightToast: String?

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
        .frame(minWidth: 760, minHeight: 560)
        #endif
        .overlay(alignment: .bottomTrailing) {
            quickAddPanel
        }
        .overlay(alignment: .bottom) {
            toastView
        }
        .animation(.snappy(duration: 0.2), value: lightweightToast)
        .sheet(isPresented: $isManualAddPresented) {
            ManualAddSheet(store: store)
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
        #if os(macOS)
        .searchable(text: $searchText, prompt: "搜索…")
        #endif
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
                Text("点击右下角的按钮即可开始收藏。")
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
                            StatusSwipeCard(status: item.status) {
                                ItemCardView(item: item)
                            } onSwipe: {
                                Task { await toggleStatus(item) }
                            }
                        }
                        .buttonStyle(.plain)
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
    private var quickAddPanel: some View {
        VStack(alignment: .trailing, spacing: 12) {
            if isMenuOpen {
                menuActions
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            addButton
        }
        .padding(8)
        .animation(.snappy(duration: 0.25), value: isMenuOpen)
    }

    private var menuActions: some View {
        VStack(spacing: 10) {
            Button {
                isMenuOpen = false
                pasteAndAdd()
            } label: {
                Label("粘贴", systemImage: "doc.on.clipboard")
                    .frame(maxWidth: .infinity)
            }
            Button {
                isMenuOpen = false
                isManualAddPresented = true
            } label: {
                Label("手动输入", systemImage: "square.and.pencil")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .frame(width: 180, alignment: .trailing)
    }

    private var addButton: some View {
        Button {
            withAnimation(.snappy(duration: 0.25)) {
                isMenuOpen.toggle()
            }
        } label: {
            Group {
                if store.isAdding {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else if isMenuOpen {
                    Image(systemName: "xmark")
                        .font(.title2.weight(.semibold))
                        .rotationEffect(.degrees(isMenuOpen ? 90 : 0))
                } else {
                    Image(systemName: "plus")
                        .font(.title2.weight(.semibold))
                }
            }
            .frame(width: 56, height: 56)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.circle)
        .clipShape(Circle())
        .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
        .disabled(store.isAdding)
    }

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
        .frame(maxWidth: 560, alignment: .leading)
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
            if await store.quickAdd(text) {
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

    /// Swipe on a card toggles it between 进行中 and 已掌握.
    private func toggleStatus(_ item: CollectionItem) async {
        let newStatus = item.status == "learned" ? "active" : "learned"
        do {
            _ = try await store.updateItem(
                id: item.id,
                body: UpdateItemBody(
                    title: item.title ?? "",
                    note: item.note ?? "",
                    tags: item.tags,
                    status: newStatus,
                    url: item.url ?? ""
                )
            )
            showLightweightToast(newStatus == "learned" ? "已标记为已掌握" : "已恢复为进行中")
        } catch {
            store.toast = error.localizedDescription
        }
    }
}

/// Wraps a card so a horizontal drag (either direction) visually pulls
/// it sideways with damping and triggers an action past a threshold,
/// then springs back. Vertical drags pass through to the scroll view.
/// iMessage-style swipe: dragging the card right slides it aside and
/// reveals the status action behind it; releasing past the threshold
/// performs the toggle and the card springs back. Vertical drags pass
/// through to the enclosing scroll view.
private struct StatusSwipeCard<Content: View>: View {
    let status: String
    @ViewBuilder let content: Content
    let onSwipe: () -> Void

    @State private var offsetX: CGFloat = 0

    private let triggerDistance: CGFloat = 80

    var body: some View {
        content
            .background(alignment: .leading) {
                actionHint
            }
            .offset(x: max(offsetX, 0))
            .gesture(
                DragGesture(minimumDistance: 20)
                    .onChanged { value in
                        guard isHorizontal(value) else { resetOffset(); return }
                        withAnimation(.interactiveSpring) {
                            offsetX = revealWidth(for: value.translation.width)
                        }
                    }
                    .onEnded { value in
                        if isHorizontal(value),
                           value.translation.width > triggerDistance {
                            onSwipe()
                        }
                        resetOffset()
                    }
            )
    }

    /// The action pill revealed behind the card while swiping.
    @ViewBuilder
    private var actionHint: some View {
        let progress = min(max(offsetX, 0) / triggerDistance, 1)
        let isLearned = status == "learned"
        HStack(spacing: 6) {
            Image(systemName: isLearned ? "arrow.counterclockwise" : "checkmark")
            Text(isLearned ? "进行中" : "已掌握")
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            Capsule().fill(isLearned ? Color.orange : Color.green)
        )
        .scaleEffect(0.8 + 0.2 * progress)
        .opacity(progress)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.leading, 16)
        .allowsHitTesting(false)
    }

    /// The card follows the drag; past the trigger the excess motion
    /// is resisted (rubber band).
    private func revealWidth(for translation: CGFloat) -> CGFloat {
        guard translation > 0 else { return 0 }
        if translation <= triggerDistance {
            return translation
        }
        return triggerDistance + (translation - triggerDistance) * 0.2
    }

    private func isHorizontal(_ value: DragGesture.Value) -> Bool {
        abs(value.translation.width) > abs(value.translation.height)
    }

    private func resetOffset() {
        withAnimation(.spring(duration: 0.3)) { offsetX = 0 }
    }
}

struct ManualAddSheet: View {
    @Environment(\.dismiss) private var dismiss
    let store: CollectionStore

    @State private var source = ""
    @FocusState private var isSourceFocused: Bool
    @State private var didSucceed = false
    @State private var addError: String?

    var body: some View {
        #if os(macOS)
        cardBody
        #else
        formBody
        #endif
    }

    #if os(macOS)
    private var cardBody: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "square.and.pencil")
                    .foregroundStyle(Color.accentColor)
                Text("手动添加")
                    .font(.headline)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .disabled(store.isAdding)
            }
            Text("输入单词、短语或句子，类型将自动识别。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            sourceField
            feedback
            addButton
        }
        .padding(20)
        .frame(width: 360)
        .onAppear { isSourceFocused = true }
    }
    #endif

    #if !os(macOS)
    private var formBody: some View {
        NavigationStack {
            Form {
                Section {
                    sourceField
                } footer: {
                    feedback
                }
            }
            .navigationTitle("手动添加")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                        .disabled(store.isAdding)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(store.isAdding ? "添加中…" : "添加") {
                        Task { await add() }
                    }
                    .disabled(
                        store.isAdding
                            || source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
        }
    }
    #endif

    private var sourceField: some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: $source)
                .focused($isSourceFocused)
                .font(.body)
                #if os(macOS)
                .scrollContentBackground(.hidden)
                #endif
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .frame(minHeight: 120)
                #endif
                .autocorrectionDisabled()
                #if os(macOS)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .frame(minHeight: 120)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(.quaternary)
                )
                #endif
            if source.isEmpty {
                Text("粘贴单词、短语或句子…")
                    .font(.body)
                    .foregroundStyle(.tertiary)
                    .padding(.top, 16)
                    .padding(.leading, 16)
                    .allowsHitTesting(false)
            }
        }
    }

    private var addButton: some View {
        Button {
            Task { await add() }
        } label: {
            HStack(spacing: 6) {
                if store.isAdding {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                }
                Text(store.isAdding ? "添加中…" : "添加")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
        }
        .buttonStyle(.borderedProminent)
        .disabled(
            store.isAdding
                || source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        )
    }

    @ViewBuilder
    private var feedback: some View {
        if didSucceed {
            Label("已加入收藏", systemImage: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
                .transition(.opacity)
        }
        if let addError {
            Label(addError, systemImage: "exclamationmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.red)
                .transition(.opacity)
        }
    }

    private func add() async {
        guard !store.isAdding else { return }
        isSourceFocused = false
        didSucceed = false
        addError = nil
        do {
            _ = try await store.add(source)
            withAnimation { didSucceed = true }
            source = ""
            await store.resetAndLoad()
            try? await Task.sleep(for: .seconds(0.8))
            dismiss()
        } catch {
            withAnimation { addError = error.localizedDescription }
        }
    }
}
