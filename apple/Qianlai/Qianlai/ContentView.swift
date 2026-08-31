//
//  ContentView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

enum AppTab: Hashable {
    case dashboard
    case journal
    case projects
    case profile
    /// Never an actual selection — identifies the add pill, whose tap is
    /// intercepted to present the quick-entry sheet instead of navigating.
    case quickAdd

    var label: LocalizedStringResource {
        switch self {
        case .dashboard:
            LocalizedStringResource(
                "tab.dashboard",
                defaultValue: "Dashboard",
                comment: "Bottom tab: ledger overview (Chinese 仪表盘)"
            )
        case .journal:
            LocalizedStringResource(
                "tab.journal",
                defaultValue: "Journal",
                comment: "Bottom tab: journal entries (Chinese 流水)"
            )
        case .projects:
            LocalizedStringResource(
                "tab.projects",
                defaultValue: "Projects",
                comment: "Bottom tab: shared projects (Chinese 项目)"
            )
        case .profile:
            LocalizedStringResource(
                "tab.profile",
                defaultValue: "Me",
                comment: "Bottom tab: profile and settings (Chinese 我的)"
            )
        case .quickAdd:
            LocalizedStringResource(
                "tab.add",
                defaultValue: "Add",
                comment: "Bottom tab: quick-entry pill (Chinese 记一笔)"
            )
        }
    }

    var icon: String {
        switch self {
        case .dashboard: "square.grid.2x2"
        case .journal: "list.bullet.rectangle"
        case .projects: "folder"
        case .profile: "person.crop.circle"
        case .quickAdd: "plus"
        }
    }
}

struct ContentView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(JournalStore.self) private var journalStore

    var body: some View {
        Group {
            #if os(macOS)
            VStack(spacing: 0) {
                Divider()
                currentTab
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                AppTabBar(selection: tabSelection)
            }
            #else
            TabView(selection: tabSelection) {
                Tab(AppTab.dashboard.label, systemImage: AppTab.dashboard.icon, value: AppTab.dashboard) {
                    NavigationStack {
                        tabPage(.dashboard)
                            .navigationTitle(Text(AppTab.dashboard.label))
                            .inlineNavigationBarTitle()
                    }
                }
                Tab(AppTab.journal.label, systemImage: AppTab.journal.icon, value: AppTab.journal) {
                    NavigationStack {
                        tabPage(.journal)
                            .navigationTitle(Text(AppTab.journal.label))
                            .inlineNavigationBarTitle()
                    }
                }
                Tab(AppTab.projects.label, systemImage: AppTab.projects.icon, value: AppTab.projects) {
                    NavigationStack {
                        tabPage(.projects)
                            .navigationTitle(Text(AppTab.projects.label))
                            .inlineNavigationBarTitle()
                    }
                }
                Tab(AppTab.profile.label, systemImage: AppTab.profile.icon, value: AppTab.profile) {
                    NavigationStack {
                        tabPage(.profile)
                            .navigationTitle(Text(AppTab.profile.label))
                            .inlineNavigationBarTitle()
                    }
                }
                // Apple Music-style trailing search pill: renders as a
                // separated capsule at the right end of the glass tab bar.
                // Its tap is intercepted in `tabSelection` to present the
                // quick-entry sheet, so the page below is never shown.
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
        .sheet(isPresented: $isQuickAddPresented) {
            NavigationStack {
                QuickEntryView()
            }
        }
        // The quick-add sheet posts through the root JournalStore, whose
        // ledgerId used to be set only by the Journal tab's .task — posting
        // before ever visiting that tab was a silent no-op. Track the active
        // ledger here so the sheet always targets it.
        .task(id: ledgerStore.activeLedger?.id) {
            guard let id = ledgerStore.activeLedger?.id else { return }
            await journalStore.load(ledgerId: id)
        }
    }

    @State private var tab: AppTab = .dashboard
    @State private var isQuickAddPresented = false

    /// Rejects `.quickAdd` as a selection — tapping the pill presents the
    /// quick-entry sheet while the visible tab stays unchanged. Requires an
    /// editable active ledger, matching the floating button it replaces.
    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { tab },
            set: { newValue in
                guard newValue != .quickAdd else {
                    if ledgerStore.activeLedger != nil, ledgerStore.canPost {
                        isQuickAddPresented = true
                    }
                    return
                }
                tab = newValue
            }
        )
    }

    @ViewBuilder
    private func page(_ tab: AppTab) -> some View {
        switch tab {
        case .dashboard: DashboardView()
        case .journal: JournalView()
        case .projects: ProjectsView()
        case .profile: ProfileView()
        case .quickAdd: Color.clear
        }
    }

    /// Page content plus the shared toast host. Mounted per-tab (inside the
    /// stack's safe area) so the capsule floats just above the tab bar,
    /// matching Yulai's lightweight toast placement.
    @ViewBuilder
    private func tabPage(_ tab: AppTab) -> some View {
        page(tab)
            .overlay(alignment: .bottom) {
                ToastOverlay()
            }
    }

    private var currentTab: some View {
        NavigationStack {
            tabPage(tab)
                .navigationTitle(Text(tab.label))
        }
    }
}

#if os(macOS)
/// WeChat-style bottom tab bar (macOS `TabView` only renders as a top
/// toolbar).
struct AppTabBar: View {
    @Binding var selection: AppTab

    private let tabs = [AppTab.dashboard, .journal, .projects, .profile, .quickAdd]

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
