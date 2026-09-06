//
//  LedgerSwitcher.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Toolbar menu that shows the active ledger and switches between ledgers.
/// Three sections: "My Ledgers" for ledgers the user owns, "My Projects" for
/// projects the user is an explicit member of (across every ledger), and
/// "Joined" for editor / viewer memberships. Guest-ledger entries render
/// nowhere by name — their projects surface in "My Projects" so the project
/// member only sees project names, never the containing ledger's name.
struct LedgerSwitcherMenu: View {
    @Environment(AuthManager.self) private var auth
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore
    /// Presentation state owned by the enclosing surface when set. A sheet
    /// attached inside `ToolbarItem` content is cancelled when the toolbar
    /// rebuilds mid-presentation — with no active ledger, the manage sheet's
    /// ledger load flips DashboardView's loading branch and dismisses it
    /// instantly — so the toolbar owner presents it from its stable surface
    /// instead. nil keeps the sheet here for toolbar-less contexts.
    var isShowingManage: Binding<Bool>? = nil
    @State private var isPresentingManageInternally = false

    private var isGuestActive: Bool {
        ledgerStore.activeLedger?.isGuest ?? false
    }

    private var ownLedgers: [QianlaiLedger] {
        ledgerStore.activeLedgers.filter { LedgerPolicy.isOwner($0.myRole) }
    }

    /// One "My Projects" row — a project the current user is an explicit
    /// member of, paired with its containing ledger so the tap can switch
    /// both the ledger and the project scope.
    private struct ProjectEntry: Identifiable {
        let project: QianlaiProject
        let ledger: QianlaiLedger

        var id: String { "p-\(ledger.id)-\(project.id)" }
    }

    /// Projects the user is an explicit member of, across every active
    /// ledger. Membership mirrors `ProjectsView.isProjectMember`; ledgers
    /// whose project lists haven't loaded yet simply contribute nothing.
    private var ownProjects: [ProjectEntry] {
        guard let myUserId = auth.currentUser?.id else { return [] }
        return ledgerStore.activeLedgers.flatMap { ledger in
            projectStore.projects(for: ledger.id)
                .filter { project in
                    project.members.contains { $0.userId == myUserId }
                }
                .map { ProjectEntry(project: $0, ledger: ledger) }
        }
    }

    /// Ledgers the user joined as a ledger member (editor / viewer). Owners
    /// live in "My Ledgers"; guests have no ledger-wide identity, so their
    /// ledgers are hidden entirely and their projects surface under
    /// "My Projects" instead.
    private var joinedLedgers: [QianlaiLedger] {
        ledgerStore.activeLedgers.filter { !LedgerPolicy.isOwner($0.myRole) && !$0.isGuest }
    }

    /// Every active ledger can contribute to "My Projects", so all of their
    /// project lists need loading. Stable key so the per-ledger projects
    /// task refires when ledgers appear or disappear (e.g. after `load()`).
    private var allLedgerIdsKey: String {
        ledgerStore.activeLedgers.map(\.id).joined(separator: "|")
    }

    var body: some View {
        // Owner-presented mode attaches no sheet: the owner shows it from a
        // surface that survives toolbar rebuilds.
        if isShowingManage != nil {
            switcher
        } else {
            switcher
                .sheet(isPresented: $isPresentingManageInternally) {
                    manageSheet
                }
        }
    }

    @ViewBuilder
    private var manageSheet: some View {
        NavigationStack {
            // In project scope, replace each guest-ledger entry with
            // its projects so the manage sheet shows project names
            // instead of ledger names the project member shouldn't see.
            LedgersView(expandGuestLedgers: isGuestActive)
        }
    }

    private var switcher: some View {
        Menu {
            if !ownLedgers.isEmpty {
                Section("My Ledgers") {
                    ForEach(ownLedgers) { ledger in
                        ledgerButton(for: ledger)
                    }
                }
            }
            if !ownProjects.isEmpty {
                Section("My Projects") {
                    ForEach(ownProjects) { entry in
                        projectButton(for: entry.project, in: entry.ledger)
                    }
                }
            }
            if !joinedLedgers.isEmpty {
                Section("Joined") {
                    ForEach(joinedLedgers) { ledger in
                        ledgerButton(for: ledger)
                    }
                }
            }
            Section {
                Button {
                    if let isShowingManage {
                        isShowingManage.wrappedValue = true
                    } else {
                        isPresentingManageInternally = true
                    }
                } label: {
                    Label("Manage Ledgers", systemImage: "gearshape")
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isGuestActive ? "folder.badge.person.crop" : (isProjectScoped ? "folder" : "book"))
                Text(switcherLabel)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
        .task(id: ledgerStore.activeLedger?.id) {
            // Make sure the active ledger's projects are loaded so the
            // switcher label (which reads `projectStore.scopedProject(in:)`)
            // stays in sync. Only `load` updates the mirror in `projects`;
            // the prefetch below never does.
            if let id = ledgerStore.activeLedger?.id {
                await projectStore.load(ledgerId: id)
            }
        }
        .task(id: allLedgerIdsKey) {
            // Prefetch projects for every other active ledger so "My
            // Projects" can list memberships across all of them. Prefetch
            // only fills the per-ledger cache — writing the `projects`
            // mirror here would race the active-ledger load and could
            // surface another ledger's project on the dashboard.
            let activeId = ledgerStore.activeLedger?.id
            for ledger in ledgerStore.activeLedgers where ledger.id != activeId {
                await projectStore.prefetch(ledgerId: ledger.id)
            }
        }
    }

    /// True when the toolbar label/icon should reflect project scope — a
    /// guest ledger (always project-scoped) or any role's explicit
    /// selection.
    private var isProjectScoped: Bool {
        guard let ledger = ledgerStore.activeLedger else { return false }
        return projectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest) != nil
    }

    /// Project-scoped users never see the ledger name — show the scoped
    /// project instead, with a sensible fallback while the project list
    /// hasn't loaded yet. Resolved against the active ledger's cached list
    /// so background prefetches can't surface another ledger's project.
    private var switcherLabel: String {
        guard let ledger = ledgerStore.activeLedger else {
            return L10n.string("ledger.none", defaultValue: "No ledger")
        }
        if let project = projectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest) {
            return project.name
        }
        if ledger.isGuest {
            return L10n.string("projects.none", defaultValue: "No project")
        }
        return ledger.name
    }

    private func ledgerButton(for ledger: QianlaiLedger) -> some View {
        Button {
            // A ledger-row tap always means ledger-wide scope — drop any
            // project selection so owners can exit a scoped project (guests
            // never render ledger rows, so this can't break their flow).
            projectStore.select(nil)
            ledgerStore.setActive(ledger.id)
        } label: {
            // Menu flattening rules (SwiftUI Menu docs): the first Image is
            // the row icon, the first Text the title, and the second Text
            // renders as the system-styled subtitle. Wrapping these in
            // stacks or a Label would drop the subtitle. (.badge() is
            // documented for menus but silently ignored on iOS toolbar
            // menus — the subtitle slot is the only reliable place for the
            // role.)
            Image(systemName: "book")
            Text(ledger.name)
            Text([ledger.description, ledger.currency, ledger.myRole.label]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " · "))
        }
    }

    private func projectButton(for project: QianlaiProject, in ledger: QianlaiLedger) -> some View {
        Button {
            ledgerStore.setActive(ledger.id)
            projectStore.select(project.id)
        } label: {
            Image(systemName: ledger.isGuest ? "folder.badge.person.crop" : "folder")
            Text(project.name)
            Text([projectSubtitle(project, in: ledger), ledger.myRole.label]
                .filter { !$0.isEmpty }
                .joined(separator: " · "))
        }
    }

    /// The single subtitle slot for a project row: the owner credit for
    /// shared (guest) projects, else the description, else the hosting
    /// ledger's name (own/member ledgers only).
    private func projectSubtitle(_ project: QianlaiProject, in ledger: QianlaiLedger) -> String {
        if ledger.isGuest,
           let owner = project.members.first(where: { $0.userId == ledger.ownerId })?.user?.name {
            return L10n.string("widget.bound.sharedByFormat", defaultValue: "Shared by %@", owner)
        }
        return project.description ?? ledger.name
    }
}
