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
    case members
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
        case .members:
            LocalizedStringResource(
                "tab.members",
                defaultValue: "Members",
                comment: "Bottom tab: active ledger members (Chinese 成员)"
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
        case .members: "person.2"
        case .profile: "person.crop.circle"
        case .quickAdd: "plus"
        }
    }
}

struct ContentView: View {
    @Environment(LedgerStore.self) private var ledgerStore

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
                    }
                }
                Tab(AppTab.journal.label, systemImage: AppTab.journal.icon, value: AppTab.journal) {
                    NavigationStack {
                        tabPage(.journal)
                            .navigationTitle(Text(AppTab.journal.label))
                            .inlineNavigationBarTitle()
                    }
                }
                Tab(AppTab.members.label, systemImage: AppTab.members.icon, value: AppTab.members) {
                    NavigationStack {
                        tabPage(.members)
                            .navigationTitle(Text(AppTab.members.label))
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
                // quick-entry sheet, so this page is never navigated to —
                // but the system still activates the tab briefly when the
                // tap is rejected (no postable ledger), so it mirrors the
                // current page instead of flashing a blank screen.
                Tab(
                    AppTab.quickAdd.label,
                    systemImage: AppTab.quickAdd.icon,
                    value: AppTab.quickAdd,
                    role: .search
                ) {
                    NavigationStack {
                        tabPage(tab)
                            .navigationTitle(Text(tab.label))
                    }
                }
            }
            #endif
        }
        .fullScreenCover(isPresented: $isQuickAddPresented) {
            NavigationStack {
                QuickEntryView(binding: quickAddBinding)
            }
            .interactiveDismissDisabled()
        }
        .onOpenURL { url in
            // Widget deep links: qianlai://quick-entry opens the quick-entry
            // sheet (a bound widget's link carries its target as query
            // items), qianlai://dashboard lands on the dashboard tab.
            switch url.host {
            case "quick-entry":
                tryPresentQuickAdd(preset: QuickEntryPreset(url: url))
            case "dashboard":
                tab = .dashboard
            default:
                break
            }
        }
        .alert(
            L10n.string("quick.cannotAddTitle", defaultValue: "Can't Add Entry"),
            isPresented: Binding(
                get: { quickAddDeniedReason != nil },
                set: { if !$0 { quickAddDeniedReason = nil } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {}
        } message: {
            Text(quickAddDeniedReason ?? "")
        }
    }

    @State private var tab: AppTab = .dashboard
    @State private var isQuickAddPresented = false
    /// The bound widget's target when the sheet was opened from its deep
    /// link; nil keeps the sheet on the active-ledger defaults. The bound
    /// sheet records against its own ledger — the global scope is untouched.
    @State private var quickAddBinding: QuickEntryBinding?
    /// Set when the quick-add pill is tapped without a postable ledger;
    /// drives the denial alert and clears on dismiss.
    @State private var quickAddDeniedReason: String?

    /// Rejects `.quickAdd` as a selection — tapping the pill presents the
    /// quick-entry sheet while the visible tab stays unchanged. Requires an
    /// editable active ledger, matching the floating button it replaced.
    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { tab },
            set: { newValue in
                guard newValue != .quickAdd else {
                    tryPresentQuickAdd()
                    return
                }
                tab = newValue
            }
        )
    }

    /// Presents the quick-entry sheet when the active ledger allows posting;
    /// otherwise surfaces the denial alert. Shared by the tab-bar pill and
    /// the widget's `qianlai://quick-entry` deep link. A bound widget's
    /// link resolves to its own ledger and the sheet records against it
    /// without touching the global scope. A widget tap is usually a cold
    /// launch, so the ledger list may not be loaded yet — the load runs and
    /// resolution retries before the sheet opens; only a ledger that still
    /// can't be found (deleted) degrades to a plain quick add.
    private func tryPresentQuickAdd(preset: QuickEntryPreset? = nil) {
        if let preset {
            if let ledger = ledgerStore.ledgers.first(where: { $0.id == preset.ledgerId }) {
                presentQuickAdd(QuickEntryBinding(
                    ledger: ledger,
                    projectId: preset.projectId,
                    categoryId: preset.categoryId,
                    kind: preset.kind
                ))
            } else {
                Task { @MainActor in
                    await ledgerStore.load()
                    if let ledger = ledgerStore.ledgers.first(where: { $0.id == preset.ledgerId }) {
                        presentQuickAdd(QuickEntryBinding(
                            ledger: ledger,
                            projectId: preset.projectId,
                            categoryId: preset.categoryId,
                            kind: preset.kind
                        ))
                    } else {
                        tryPresentQuickAdd()
                    }
                }
            }
            return
        }
        // Plain presentations must never inherit a previous bound target.
        quickAddBinding = nil
        if ledgerStore.activeLedger != nil, ledgerStore.canPost {
            isQuickAddPresented = true
        } else if ledgerStore.activeLedger == nil {
            quickAddDeniedReason = L10n.string("quick.selectLedgerFirst", defaultValue: "Select a ledger first")
        } else {
            quickAddDeniedReason = L10n.string("quick.cannotPost", defaultValue: "You can't add entries in this ledger")
        }
    }

    private func presentQuickAdd(_ binding: QuickEntryBinding) {
        quickAddBinding = binding
        isQuickAddPresented = true
    }

    @ViewBuilder
    private func page(_ tab: AppTab) -> some View {
        switch tab {
        case .dashboard: DashboardView()
        case .journal: JournalView()
        case .members: MembersTabPageView()
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

    private let tabs = [AppTab.dashboard, .journal, .members, .profile, .quickAdd]

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
