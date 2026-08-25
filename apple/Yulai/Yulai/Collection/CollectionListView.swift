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
                        NavigationLink(value: item) {
                            StatusSwipeCard(
                                status: item.status,
                                isRevealed: Binding(
                                    get: { revealedItemId == item.id },
                                    set: { revealedItemId = $0 ? item.id : nil }
                                )
                            ) {
                                ItemCardView(item: item)
                            } onToggleStatus: {
                                Task { await toggleStatus(item) }
                            } onArchive: {
                                Task { await archiveItem(item) }
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

/// iMessage-style swipe with two stages: a short swipe slides the card
/// aside and settles it open, revealing the action behind it (tap the
/// action to run it); continuing into a long swipe past `triggerDistance`
/// auto-runs the action and springs the card closed. Swiping right reveals
/// the status toggle on the left; swiping left reveals Archive on the
/// right; swiping the opposite way closes an open card. Vertical drags pass
/// through to the enclosing scroll view. Only one card may be revealed at a
/// time — the owner drives `isRevealed` so opening a card closes its
/// siblings.
private struct StatusSwipeCard<Content: View>: View {
    enum RevealSide {
        case toggle
        case archive
    }

    enum DragAxis {
        case horizontal
        case vertical
    }

    let status: String
    @Binding var isRevealed: Bool
    @ViewBuilder let content: Content
    let onToggleStatus: () -> Void
    let onArchive: () -> Void

    @State private var offsetX: CGFloat = 0
    @State private var revealSide: RevealSide?
    @GestureState private var isDragging = false
    @State private var hasAutoTriggered = false
    @State private var dragAxis: DragAxis?
    /// True once onEnded ran, distinguishing a normal end from a system
    /// cancellation (scroll view stealing the touch).
    @State private var didEndDrag = false
    /// Whether the action pills are present in the backgrounds. Set as soon
    /// as a horizontal drag locks (the delayed progress mapping keeps them
    /// invisible at first) and cleared inside the spring animation that
    /// closes the card, so removal plays a scale-and-fade exit transition
    /// instead of vanishing instantly.
    @State private var showsActions = false

    /// Diameter of the circular action revealed behind the card.
    private let actionWidth: CGFloat = 56
    /// Gap kept between the revealed action and the slid card.
    private let actionMargin: CGFloat = 12
    /// Distance the card settles at when open: the action plus its margin.
    private var revealDistance: CGFloat { actionWidth + actionMargin }
    /// A swipe past this distance auto-triggers the revealed action.
    private var triggerDistance: CGFloat { revealDistance + 160 }

    var body: some View {
        content
            // Tap-to-dismiss while revealed. Kept in a lightweight overlay
            // so the card content keeps a stable view identity — swapping
            // `content` between gesture/no-gesture branches rebuilt the
            // whole card and caused a visible flash at drag end.
            .overlay {
                if isRevealed {
                    Color.clear.onTapGesture { resetOffset() }
                }
            }
            .offset(x: offsetX)
            .background(alignment: .leading) {
                if showsActions {
                    toggleHint
                        .transition(
                            .scale(scale: 0.3, anchor: .center)
                                .combined(with: .opacity)
                        )
                }
            }
            .background(alignment: .trailing) {
                if showsActions {
                    archiveHint
                        .transition(
                            .scale(scale: 0.3, anchor: .center)
                                .combined(with: .opacity)
                        )
                }
            }
            // Keep the slid card inside its own grid cell so it never
            // overlaps the neighboring column on multi-column layouts.
            .clipped()
            .gesture(
                DragGesture(minimumDistance: 20)
                    .updating($isDragging) { _, state, _ in state = true }
                    .onChanged { value in
                        guard !hasAutoTriggered else { return }
                        lockDragAxisIfNeeded(value)
                        guard dragAxis == .horizontal else { return }
                        showsActions = true
                        // Track the finger directly — spring-animating every
                        // drag frame makes the action morph lag and flicker.
                        offsetX = dragOffset(value.translation.width)
                        if offsetX > triggerDistance {
                            hasAutoTriggered = true
                            onToggleStatus()
                            resetOffset()
                        } else if offsetX < -triggerDistance {
                            hasAutoTriggered = true
                            onArchive()
                            resetOffset()
                        }
                    }
                    .onEnded { value in
                        defer {
                            hasAutoTriggered = false
                            dragAxis = nil
                            didEndDrag = true
                        }
                        guard !hasAutoTriggered, dragAxis == .horizontal else { return }
                        let final = dragOffset(value.translation.width)
                        if final > revealDistance / 2 {
                            open(.toggle)
                        } else if final < -revealDistance / 2 {
                            open(.archive)
                        } else {
                            resetOffset()
                        }
                    }
            )
            // onEnded is skipped when the system cancels the gesture (e.g.
            // the scroll view claims the touch), so also reset the drag
            // state whenever the drag stops being active. A cancellation
            // never ran onEnded, so spring the card back closed.
            .onChange(of: isDragging) {
                if isDragging {
                    didEndDrag = false
                } else {
                    hasAutoTriggered = false
                    dragAxis = nil
                    if !didEndDrag { resetOffset() }
                }
            }
            // A sibling card opening flips this binding back to false.
            .onChange(of: isRevealed) {
                if !isRevealed, offsetX != 0 {
                    revealSide = nil
                    withAnimation(.spring(duration: 0.3)) {
                        showsActions = false
                        offsetX = 0
                    }
                }
            }
    }

    /// The toggle action revealed on the leading side by a right swipe.
    /// It scales up from its center, but its appearance is delayed until
    /// the opened gap is wide enough to contain the scaled pill plus the
    /// margin, so it never shows beneath the card; swiping past the reveal
    /// stretches it toward the card, always keeping the margin between them.
    @ViewBuilder
    private var toggleHint: some View {
        let reveal = max(offsetX, 0)
        // The pill is centered in its 56pt square, so its scaled half-width
        // is actionWidth / 2 * progress. It stays hidden until the card has
        // opened actionWidth / 2 + margin, then grows to full size exactly
        // as the gap reaches the settle distance.
        let progress = min(
            max(reveal - actionWidth / 2 - actionMargin, 0) / (actionWidth / 2),
            1
        )
        let isLearned = status == "learned"
        actionButton(
            icon: isLearned ? "arrow.counterclockwise" : "checkmark",
            color: isLearned ? Color.orange : Color.green,
            width: max(actionWidth, reveal - actionMargin),
            action: onToggleStatus
        )
        .scaleEffect(progress, anchor: .center)
        .opacity(min(progress * 1.5, 1))
        .allowsHitTesting(isRevealed)
    }

    /// The Archive action revealed on the trailing side by a left swipe.
    /// It scales up from its center, but its appearance is delayed until
    /// the opened gap is wide enough to contain the scaled pill plus the
    /// margin, so it never shows beneath the card; swiping past the reveal
    /// stretches it toward the card, always keeping the margin between them.
    @ViewBuilder
    private var archiveHint: some View {
        let reveal = max(-offsetX, 0)
        let progress = min(
            max(reveal - actionWidth / 2 - actionMargin, 0) / (actionWidth / 2),
            1
        )
        actionButton(
            icon: "archivebox",
            color: .gray,
            width: max(actionWidth, reveal - actionMargin),
            action: onArchive
        )
        .scaleEffect(progress, anchor: .center)
        .opacity(min(progress * 1.5, 1))
        .allowsHitTesting(isRevealed)
    }

    private func actionButton(
        icon: String,
        color: Color,
        width: CGFloat,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
            resetOffset()
        } label: {
            Image(systemName: icon)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: width, height: actionWidth)
                .background(Capsule().fill(color))
        }
        .buttonStyle(.plain)
        .frame(maxHeight: .infinity)
    }

    /// Tracks the finger from either the closed or the revealed position.
    /// From an open card, dragging the opposite way only closes — it never
    /// crosses over into the other side's reveal.
    private func dragOffset(_ translation: CGFloat) -> CGFloat {
        let base = revealSide.map { $0 == .toggle ? revealDistance : -revealDistance } ?? 0
        let offset = base + translation
        guard isRevealed, let side = revealSide else { return offset }
        switch side {
        case .toggle: return max(offset, 0)
        case .archive: return min(offset, 0)
        }
    }

    private func open(_ side: RevealSide) {
        withAnimation(.spring(duration: 0.3)) {
            revealSide = side
            isRevealed = true
            offsetX = side == .toggle ? revealDistance : -revealDistance
        }
    }

    private func resetOffset() {
        withAnimation(.spring(duration: 0.3)) {
            showsActions = false
            revealSide = nil
            isRevealed = false
            offsetX = 0
        }
    }

    /// Locks the drag axis once the movement is unambiguous, so a wiggling
    /// finger can't flip it mid-gesture (which made the revealed action
    /// flash on and off).
    private func lockDragAxisIfNeeded(_ value: DragGesture.Value) {
        guard dragAxis == nil else { return }
        let width = abs(value.translation.width)
        let height = abs(value.translation.height)
        guard max(width, height) > 12 else { return }
        dragAxis = width > height ? .horizontal : .vertical
    }
}
