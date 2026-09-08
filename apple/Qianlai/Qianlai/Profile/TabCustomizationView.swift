//
//  TabCustomizationView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/8.
//

import SwiftUI

/// Bottom-tab personalization in one section: dashboard pinned first and
/// profile pinned last (no toggle, no drag), the configurable middle
/// between them — the toggle decides visibility and the row order IS the
/// tab order. Every change persists immediately through `PreferenceStore`
/// (optimistic, toast on failure). Only reachable from a plain ledger
/// scope — guests and project scopes render the fixed bar and get no
/// entry here.
struct TabCustomizationView: View {
    @Environment(PreferenceStore.self) private var preferenceStore
    @Environment(ToastCenter.self) private var toast

    /// Row display order — every configurable slot, visible ones first.
    @State private var order: [AppTab] = AppTab.configurableCases
    /// Slots currently shown in the tab bar.
    @State private var shown: Set<AppTab> = []

    private var visibleTabs: [AppTab] {
        order.filter { shown.contains($0) }
    }

    var body: some View {
        List {
            Section {
                pinnedRow(.dashboard)
                ForEach(order, id: \.self) { tab in
                    configurableRow(tab, isShown: shown.contains(tab))
                }
                .onMove(perform: move)
                pinnedRow(.profile)
            } footer: {
                Text(L10n.string(
                    "preferences.tabs.footer",
                    defaultValue: "Show 1–3 tabs; drag to reorder."
                ))
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(L10n.string("preferences.restoreDefaults", defaultValue: "Reset")) {
                    restoreDefaults()
                }
            }
        }
        .navigationTitle(Text(L10n.string("preferences.tabs.title", defaultValue: "Customize Tabs")))
        .inlineNavigationBarTitle()
        .task { syncFromStore() }
    }

    // MARK: - Rows

    private func pinnedRow(_ tab: AppTab) -> some View {
        Label {
            Text(tab.label)
        } icon: {
            Image(systemName: tab.icon)
        }
        .foregroundStyle(.secondary)
    }

    private func configurableRow(_ tab: AppTab, isShown: Bool) -> some View {
        Toggle(isOn: Binding(
            get: { self.shown.contains(tab) },
            set: { setShow(tab, $0) }
        )) {
            Label {
                Text(tab.label)
            } icon: {
                Image(systemName: tab.icon)
            }
            .opacity(isShown ? 1 : 0.45)
        }
        // 1–3 visible: at three nothing may switch on, at one nothing may
        // switch off — disabled state makes the constraint visible instead
        // of silently snapping the switch back.
        .disabled(toggleIsDisabled(tab, isShown: isShown))
    }

    private func toggleIsDisabled(_ tab: AppTab, isShown: Bool) -> Bool {
        if isShown {
            return visibleTabs.count <= PreferenceStore.tabLimits.lowerBound
        }
        return visibleTabs.count >= PreferenceStore.tabLimits.upperBound
    }

    // MARK: - Mutations

    private func setShow(_ tab: AppTab, _ isOn: Bool) {
        if isOn {
            shown.insert(tab)
        } else {
            shown.remove(tab)
        }
        persist(visibleTabs)
    }

    private func move(from source: IndexSet, to destination: Int) {
        order.move(fromOffsets: source, toOffset: destination)
        persist(visibleTabs)
    }

    private func restoreDefaults() {
        Task {
            do {
                try await preferenceStore.restoreTabs()
                syncFromStore()
            } catch {
                toast.show(error.localizedDescription)
            }
        }
    }

    private func persist(_ tabs: [AppTab]) {
        Task {
            do {
                try await preferenceStore.setTabs(tabs)
            } catch {
                toast.show(error.localizedDescription)
                syncFromStore()
            }
        }
    }

    /// Re-derives the working copy from the store's saved arrangement —
    /// the raw user-scope config, never a scope-filtered rendering, so an
    /// edit can only ever move/hide slots the editor actually shows. Any
    /// never-shown slots trail in canonical order.
    private func syncFromStore() {
        let saved = preferenceStore.configuredTabs ?? PreferenceStore.defaultTabs
        order = saved + AppTab.configurableCases.filter { !saved.contains($0) }
        shown = Set(saved)
    }
}
