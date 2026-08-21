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

    var label: String {
        switch self {
        case .today: "今日"
        case .collection: "收藏"
        case .profile: "我的"
        }
    }

    var icon: String {
        switch self {
        case .today: "sun.max"
        case .collection: "tray.full"
        case .profile: "person.crop.circle"
        }
    }
}

struct ContentView: View {
    @Environment(CollectionStore.self) private var store
    @State private var tab: AppTab = .today
    @State private var todayStore = TodayStore()

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
            TabView(selection: $tab) {
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
            }
            #endif
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
        }
    }
}

#if os(macOS)
/// WeChat-style bottom tab bar (macOS `TabView` only renders as a top toolbar).
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
        .background(.bar)
    }
}
#endif

#Preview {
    ContentView()
        .environment(AuthManager())
        .environment(CollectionStore())
}
