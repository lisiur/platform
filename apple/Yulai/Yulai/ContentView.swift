//
//  ContentView.swift
//  Yulai
//
//  Created by Lisiur Day on 2026/8/19.
//

import SwiftUI

enum AppTab: Hashable {
    case today
    case collection
    case profile
    /// Never an actual selection — identifies the add pill, whose tap is
    /// intercepted to present the quick-add sheet instead of navigating.
    case quickAdd

    var label: String {
        switch self {
        case .today: "学习"
        case .collection: "收藏"
        case .profile: "我的"
        case .quickAdd: "添加"
        }
    }

    var icon: String {
        switch self {
        case .today: "book"
        case .collection: "tray.full"
        case .profile: "person.crop.circle"
        case .quickAdd: "plus"
        }
    }
}

struct ContentView: View {
    @Environment(CollectionStore.self) private var store
    @State private var tab: AppTab = .today
    @State private var todayStore = TodayStore()
    #if os(iOS)
    @State private var isQuickAddPresented = false
    #endif

    var body: some View {
        Group {
            #if os(macOS)
            VStack(spacing: 0) {
                Divider()
                currentTab
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                AppTabBar(selection: $tab)
            }
            #else
            TabView(selection: tabSelection) {
                Tab(
                    AppTab.today.label,
                    systemImage: AppTab.today.icon,
                    value: AppTab.today
                ) {
                    NavigationStack {
                        TodayView()
                            .navigationTitle(AppTab.today.label)
                            .navigationBarTitleDisplayMode(.inline)
                    }
                    .environment(todayStore)
                }
                Tab(
                    AppTab.collection.label,
                    systemImage: AppTab.collection.icon,
                    value: AppTab.collection
                ) {
                    NavigationStack {
                        CollectionListView()
                            .navigationTitle(AppTab.collection.label)
                            .navigationBarTitleDisplayMode(.inline)
                    }
                }
                Tab(
                    AppTab.profile.label,
                    systemImage: AppTab.profile.icon,
                    value: AppTab.profile
                ) {
                    NavigationStack {
                        ProfileView()
                            .navigationTitle(AppTab.profile.label)
                            .navigationBarTitleDisplayMode(.inline)
                    }
                }
                // Apple Music-style trailing search pill: renders as a
                // separated capsule at the right end of the glass tab bar.
                // Its tap is intercepted in `tabSelection` to present the
                // quick-add sheet, so the page below is never shown.
                Tab(
                    AppTab.quickAdd.label,
                    systemImage: AppTab.quickAdd.icon,
                    value: AppTab.quickAdd,
                    role: .search
                ) {
                    Color.clear
                }
            }
            #endif
        }
        #if os(iOS)
        .sheet(isPresented: $isQuickAddPresented) {
            quickAddSheet
        }
        // The sheet can't reach `todayStore` (it's only injected into the
        // 学习 tab), so refresh the deck here once it closes.
        .onChange(of: isQuickAddPresented) {
            if !isQuickAddPresented {
                Task { await todayStore.load() }
            }
        }
        #endif
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

    #if os(iOS)
    /// Rejects `.quickAdd` as a selection — tapping the pill presents the
    /// sheet while the visible tab stays unchanged.
    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { tab },
            set: { newValue in
                guard newValue != .quickAdd else {
                    isQuickAddPresented = true
                    return
                }
                tab = newValue
            }
        )
    }

    private var quickAddSheet: some View {
        NavigationStack {
            QuickAddView()
                .navigationTitle("添加")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("关闭") { isQuickAddPresented = false }
                    }
                }
                .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }
    #endif

    @ViewBuilder
    private var currentTab: some View {
        switch tab {
        case .today:
            NavigationStack {
                TodayView()
                    .navigationTitle(AppTab.today.label)
            }
            .environment(todayStore)
        case .collection:
            NavigationStack {
                CollectionListView()
                    .navigationTitle(AppTab.collection.label)
            }
        case .profile:
            NavigationStack {
                ProfileView()
                    .navigationTitle(AppTab.profile.label)
            }
        case .quickAdd:
            EmptyView()
        }
    }
}

#if os(macOS)
/// WeChat-style bottom tab bar (macOS `TabView` only renders as a top
/// toolbar). Quick add lives in the 学习 toolbar on macOS instead.
struct AppTabBar: View {
    @Binding var selection: AppTab

    private let tabs = [AppTab.today, .collection, .profile]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs, id: \.self) { tab in
                Button {
                    selection = tab
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 17))
                        Text(tab.label)
                            .font(.caption2)
                    }
                    .foregroundStyle(
                        selection == tab ? Color.accentColor : Color.secondary
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(.bar, ignoresSafeAreaEdges: .bottom)
    }
}
#endif

#Preview {
    ContentView()
        .environment(AuthManager())
        .environment(CollectionStore())
}
