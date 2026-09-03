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
    @State private var isShowingManage = false
    @State private var isShowingJoin = false

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
                    isShowingJoin = true
                } label: {
                    Label("Join", systemImage: "qrcode")
                }
                Button {
                    isShowingManage = true
                } label: {
                    Label("Manage Ledgers", systemImage: "gearshape")
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isProjectScoped || isGuestActive ? "folder" : "book")
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
            // label and its active-project star (both read
            // `projectStore.scopedProject(in:)`) stay in sync. Only `load`
            // updates the mirror in `projects`; the prefetch below never
            // does.
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
        .sheet(isPresented: $isShowingManage) {
            NavigationStack {
                // In project scope, replace each guest-ledger entry with
                // its projects so the manage sheet shows project names
                // instead of ledger names the project member shouldn't see.
                LedgersView(expandGuestLedgers: isGuestActive)
            }
        }
        .sheet(isPresented: $isShowingJoin) {
            JoinLedgerScanView()
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
        let isActive = isActiveLedger(ledger)
        return Button {
            // A ledger-row tap always means ledger-wide scope — drop any
            // project selection so owners can exit a scoped project (guests
            // never render ledger rows, so this can't break their flow).
            projectStore.select(nil)
            ledgerStore.setActive(ledger.id)
        } label: {
            LedgerSwitcherRowLabel(
                icon: "book",
                title: ledger.name,
                trailing: ledger.myRole.label,
                isActive: isActive
            )
        }
    }

    /// True when `ledger`'s row should carry the active star — only while
    /// no project claims the scope. Exactly one row (ledger or project)
    /// stars at a time because both resolve through `scopedProject`.
    private func isActiveLedger(_ ledger: QianlaiLedger) -> Bool {
        guard ledgerStore.activeLedger?.id == ledger.id else { return false }
        return projectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest) == nil
    }

    private func projectButton(for project: QianlaiProject, in ledger: QianlaiLedger) -> some View {
        let isActive = ledgerStore.activeLedger?.id == ledger.id && isActiveProject(project, in: ledger)
        return Button {
            ledgerStore.setActive(ledger.id)
            projectStore.select(project.id)
        } label: {
            LedgerSwitcherRowLabel(
                icon: "folder",
                title: project.name,
                trailing: nil,
                isActive: isActive
            )
        }
    }

    /// True when the star should render next to `project` — it claims the
    /// scope of its ledger (explicit selection for any role, auto-picked
    /// first project for guest ledgers, whose users never see a ledger row).
    private func isActiveProject(_ project: QianlaiProject, in ledger: QianlaiLedger) -> Bool {
        projectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest)?.id == project.id
    }
}

/// Row label shared by `ledgerButton` and `projectButton`. Active
/// state is conveyed by swapping the prefix icon to a star (filled,
/// accent color) — this works identically on iOS and macOS because
/// the icon change happens before any trailing-item layout, which
/// `NSMenu` on macOS can't reliably honor.
private struct LedgerSwitcherRowLabel: View {
    let icon: String
    let title: String
    let trailing: String?
    let isActive: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isActive ? "star.fill" : icon)
                .foregroundStyle(isActive ? Color.accentColor : .secondary)
                .frame(width: 18)
            Text(title)
                .lineLimit(1)
                .foregroundStyle(isActive ? Color.accentColor : .primary)
            if let trailing {
                Text(trailing)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}
