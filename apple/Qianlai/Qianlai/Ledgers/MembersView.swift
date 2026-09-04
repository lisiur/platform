//
//  MembersView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Members manager for one scope. Ledger scope (default): the ledger's
/// members with role controls, transfer, and removal for the owner, plus
/// virtual members for editors. Project scope (`project` set): the
/// project's flat roster — invites mint project codes, and a freshly
/// created virtual member joins the project right away.
struct MembersView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var auth
    @Environment(ToastCenter.self) private var toast
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore

    let ledger: QianlaiLedger
    /// Presented as a sheet (default) — shows the "Done" confirmation
    /// button. Pass `false` where dismissing isn't meaningful: the Members
    /// tab, or a pushed page whose back button already navigates out.
    var isModal: Bool = true
    /// The scoped project when this surface sits inside a project scope
    /// (Members tab with a project selected): the page shows the project's
    /// roster, the invite menu mints project codes, and a newly created
    /// virtual member joins the project immediately. `nil` keeps it
    /// ledger-scoped.
    var project: QianlaiProject? = nil

    @State private var store = MemberStore()
    @State private var memberPendingRemove: LedgerMember?
    @State private var memberPendingTransfer: LedgerMember?
    @State private var projectMemberPendingRemove: ProjectMemberRow?
    @State private var isAddingVirtualMember = false
    @State private var newVirtualMemberName = ""
    @State private var memberPendingRename: LedgerMember?
    @State private var projectMemberPendingRename: ProjectMemberRow?
    @State private var renameMemberName = ""
    @State private var isShowingInvite = false

    var body: some View {
        List {
            membersSection
        }
        .navigationTitle(Text("Members"))
        .inlineNavigationBarTitle()
        .toolbar {
            // Everything the caller can do to grow the current scope,
            // behind one plus menu: invite (project manage / ledger owner),
            // add an existing ledger member (project scope, managers) and
            // virtual members (editor+). Viewers get neither, so no menu
            // at all — same rule the old leading button followed.
            if canInvite || canManageVirtualMembers || canManageProjectMembers {
                ToolbarItem(placement: .confirmationAction) {
                    Menu {
                        if canInvite {
                            Button {
                                isShowingInvite = true
                            } label: {
                                Label(
                                    L10n.string("ledgers.invite", defaultValue: "Invite Members"),
                                    systemImage: "person.badge.plus"
                                )
                            }
                        }
                        // A submenu listing the ledger members not yet in
                        // the project — the old inline "Add Member" row,
                        // relocated.
                        if canManageProjectMembers, let scope = liveProject,
                            !addableProjectMembers(scope).isEmpty
                        {
                            Menu {
                                ForEach(addableProjectMembers(scope)) { member in
                                    Button(member.displayName) {
                                        Task { await addProjectMember(scope, member) }
                                    }
                                }
                            } label: {
                                Label(
                                    L10n.string(
                                        "projects.addLedgerMember",
                                        defaultValue: "Add Ledger Member"
                                    ),
                                    systemImage: "person.fill.badge.plus"
                                )
                            }
                        }
                        if canManageVirtualMembers {
                            Button {
                                newVirtualMemberName = ""
                                isAddingVirtualMember = true
                            } label: {
                                Label(
                                    L10n.string(
                                        "ledgers.addVirtualMember",
                                        defaultValue: "Add Virtual Member"
                                    ),
                                    systemImage: "person.crop.circle.badge.plus"
                                )
                            }
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            if isModal {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .sheet(isPresented: $isShowingInvite) {
            // The invite surface follows the page's scope: project scope
            // mints project invite codes, ledger scope mints member share
            // codes — mirroring which rights the menu gate required.
            if let project {
                NavigationStack {
                    ProjectInviteView(ledgerId: ledger.id, project: project)
                }
            } else {
                NavigationStack {
                    LedgerInviteView(ledger: ledger)
                }
            }
        }
        .alert(
            L10n.string("projects.removeMember", defaultValue: "Remove Member"),
            isPresented: Binding(
                get: { projectMemberPendingRemove != nil },
                set: { if !$0 { projectMemberPendingRemove = nil } }
            )
        ) {
            Button(L10n.string("projects.removeMember", defaultValue: "Remove"), role: .destructive) {
                if let member = projectMemberPendingRemove {
                    Task { await removeProjectMember(member) }
                }
                projectMemberPendingRemove = nil
            }
            Button("Cancel", role: .cancel) { projectMemberPendingRemove = nil }
        } message: {
            if let member = projectMemberPendingRemove {
                Text(L10n.string(
                    "projects.removeMemberConfirm",
                    defaultValue: "Remove %@ from the project?",
                    member.displayName
                ))
            }
        }
        .task {
            // The ledger roster backs the ledger view and, in project
            // scope, the add-member picker — which only managers see, so
            // a guest skips the fetch (and its guaranteed 403). The
            // project roster itself renders straight off the project
            // snapshot either way.
            let needsLedgerRoster = project == nil
                || LedgerPolicy.canManageProjects(
                    role: ledger.myRole,
                    ledgerActive: ledger.isActive
                )
            guard needsLedgerRoster else { return }
            await store.load(ledgerId: ledger.id, myUserId: auth.currentUser?.id)
        }
        .refreshable {
            // Same gate as `.task` — refresh what's already on screen.
            // The ledger roster is force-refetched (the cached load short-
            // circuits), and in project scope the project cache is
            // reloaded so `liveProject` picks up changes made in sibling
            // surfaces (invite redeemed, member added elsewhere).
            let needsLedgerRoster = project == nil
                || LedgerPolicy.canManageProjects(
                    role: ledger.myRole,
                    ledgerActive: ledger.isActive
                )
            if needsLedgerRoster {
                await store.load(
                    ledgerId: ledger.id,
                    myUserId: auth.currentUser?.id,
                    force: true
                )
            }
            if project != nil {
                await projectStore.load(
                    ledgerId: ledger.id,
                    force: true
                )
            }
        }
        .alert(
            L10n.string("ledgers.removeMember", defaultValue: "Remove Member"),
            isPresented: Binding(
                get: { memberPendingRemove != nil },
                set: { if !$0 { memberPendingRemove = nil } }
            )
        ) {
            Button(L10n.string("ledgers.removeMember", defaultValue: "Remove"), role: .destructive) {
                if let member = memberPendingRemove {
                    Task {
                        do {
                            try await store.remove(member)
                            toast.show(L10n.string("ledgers.removeMemberSuccess", defaultValue: "Member removed"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                memberPendingRemove = nil
            }
            Button("Cancel", role: .cancel) { memberPendingRemove = nil }
        } message: {
            if let member = memberPendingRemove {
                Text("Remove \(member.displayName) from this ledger?")
            }
        }
        .alert(
            L10n.string("ledgers.transferOwnership", defaultValue: "Transfer Ownership"),
            isPresented: Binding(
                get: { memberPendingTransfer != nil },
                set: { if !$0 { memberPendingTransfer = nil } }
            )
        ) {
            Button(L10n.string("ledgers.transferOwnership", defaultValue: "Transfer Ownership"), role: .destructive) {
                if let member = memberPendingTransfer {
                    Task {
                        do {
                            try await store.transferOwnership(to: member)
                            toast.show(L10n.string("ledgers.transferSuccess", defaultValue: "Ownership transferred"))
                            await ledgerStore.load()
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                memberPendingTransfer = nil
            }
            Button("Cancel", role: .cancel) { memberPendingTransfer = nil }
        } message: {
            if let member = memberPendingTransfer {
                Text("Transfer ownership to \(member.displayName)? You become an editor.")
            }
        }
        .alert(
            L10n.string(
                "ledgers.addVirtualMember",
                defaultValue: "Add Virtual Member"
            ),
            isPresented: $isAddingVirtualMember
        ) {
            TextField(
                L10n.string(
                    "ledgers.virtualNamePlaceholder",
                    defaultValue: "Name"
                ),
                text: $newVirtualMemberName
            )
            Button(L10n.string("ledgers.add", defaultValue: "Add")) {
                addVirtualMember()
            }
            Button("Cancel", role: .cancel) { newVirtualMemberName = "" }
        } message: {
            Text(
                L10n.string(
                    "ledgers.virtualMemberMessage",
                    defaultValue: "No registration needed — they can be named as a payer or participant and count toward stats. A virtual member can never sign in."
                )
            )
        }
        .alert(
            L10n.string(
                "ledgers.renameMember",
                defaultValue: "Rename"
            ),
            isPresented: Binding(
                get: { memberPendingRename != nil || projectMemberPendingRename != nil },
                set: { if !$0 {
                    memberPendingRename = nil
                    projectMemberPendingRename = nil
                    renameMemberName = ""
                } }
            )
        ) {
            TextField(
                L10n.string(
                    "ledgers.virtualNamePlaceholder",
                    defaultValue: "Name"
                ),
                text: $renameMemberName
            )
            Button("Save") { renameVirtualMember() }
            Button("Cancel", role: .cancel) {
                memberPendingRename = nil
                projectMemberPendingRename = nil
                renameMemberName = ""
            }
        } message: {
            if let member = memberPendingRename {
                Text(member.displayName)
            } else if let row = projectMemberPendingRename {
                Text(row.displayName)
            }
        }
    }

    private func addVirtualMember() {
        let name = newVirtualMemberName.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        newVirtualMemberName = ""
        guard !name.isEmpty else { return }
        Task {
            do {
                let member = try await store.addVirtualMember(
                    ledgerId: ledger.id,
                    name: name
                )
                // In project scope the virtual member joins the project
                // right away — the roster on screen is the project's, so
                // creating them ledger-side only would look like a no-op.
                if let project {
                    try await projectStore.addMember(
                        ledgerId: ledger.id,
                        projectId: project.id,
                        userId: member.userId
                    )
                }
                toast.show(
                    L10n.string(
                        "ledgers.addVirtualMemberSuccess",
                        defaultValue: "Virtual member added"
                    )
                )
            } catch {
                toast.show(error.localizedDescription)
            }
        }
    }

    private func renameVirtualMember() {
        let ledgerMember = memberPendingRename
        let projectRow = projectMemberPendingRename
        memberPendingRename = nil
        projectMemberPendingRename = nil
        let name = renameMemberName.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        renameMemberName = ""
        guard !name.isEmpty else { return }
        Task {
            do {
                if let member = ledgerMember {
                    try await store.rename(member, to: name)
                } else if let row = projectRow {
                    try await store.renameVirtualMember(
                        ledgerId: ledger.id,
                        userId: row.userId,
                        to: name
                    )
                    // Project scope doesn't refresh the ledger roster;
                    // reload the project so the row picks up the new name
                    // (the rename also affected ledger-level display, but
                    // the user is looking at the project's roster here).
                    await projectStore.load(
                        ledgerId: ledger.id,
                        force: true
                    )
                }
                toast.show(
                    L10n.string(
                        "ledgers.renameMemberSuccess",
                        defaultValue: "Member renamed"
                    )
                )
            } catch {
                toast.show(error.localizedDescription)
            }
        }
    }

    private var myUserId: String? {
        auth.currentUser?.id
    }

    /// Project scope never loads the ledger roster (a guest isn't entitled
    /// to that endpoint), so the role falls back to the ledger's own field
    /// there — the virtual-member gate reads it.
    private var myRole: LedgerRole? {
        if project != nil { return ledger.myRole }
        return store.members.first { $0.userId == myUserId }?.role
    }

    private var canManageVirtualMembers: Bool {
        guard let myRole else { return false }
        return LedgerPolicy.canManageVirtualMembers(myRole)
    }

    /// Invites follow the page's scope: a project-scope page needs
    /// project-manage rights on an *active* project, a ledger-scope page
    /// needs the ledger owner. Mirrors the rights each invite view
    /// enforces server-side, so the menu never offers a dead end.
    private var canInvite: Bool {
        if let project {
            return project.isActive
                && LedgerPolicy.canManageProjects(role: ledger.myRole, ledgerActive: ledger.isActive)
        }
        return LedgerPolicy.canCreateShareCode(ledger.myRole)
    }

    /// Project-scope roster management gate — the same combination the
    /// project detail page requires before offering member writes:
    /// editor+ on the ledger and an active project (the server rejects
    /// member writes on archived projects).
    private var canManageProjectMembers: Bool {
        guard let project else { return false }
        return project.isActive
            && LedgerPolicy.canManageProjects(role: ledger.myRole, ledgerActive: ledger.isActive)
    }

    /// Live copy of the scoped project, re-resolved from the store each
    /// render so roster changes (virtual member added, invite redeemed in
    /// another surface) reflect without recreating the page — `project` is
    /// a value snapshot and would otherwise go stale.
    private var liveProject: QianlaiProject? {
        guard let project else { return nil }
        return projectStore.projects(for: ledger.id).first { $0.id == project.id }
    }

    @ViewBuilder
    private var membersSection: some View {
        if let liveProject {
            projectMembersSection(liveProject)
        } else {
            ledgerMembersSection
        }
    }

    /// Ledger scope: role controls, transfer, and removal for the owner.
    private var ledgerMembersSection: some View {
        Section {
            if store.isLoading, store.members.isEmpty {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
            } else if store.members.isEmpty {
                Text("No other members")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.members) { member in
                    memberRow(member)
                }
            }
        } footer: {
            Text("Editors can post entries; viewers can only browse.")
        }
    }

    /// Project scope: the project's flat roster, with the detail page's
    /// management affordances — remove per row, add from the ledger's
    /// remaining members. The server now derives `isVirtual` on project
    /// rows the same way it does for ledger rows, so virtual members are
    /// labeled identically on both surfaces.
    private func projectMembersSection(_ project: QianlaiProject) -> some View {
        Section {
            if project.members.isEmpty {
                Text("No other members")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(project.members) { member in
                    HStack(spacing: 10) {
                        avatar(member.displayName, member.user?.avatar)
                        HStack(spacing: 4) {
                            Text(member.displayName)
                                .font(.body.weight(.medium))
                            if member.user?.isVirtual == true {
                                BadgeView(
                                    text: L10n.string(
                                        "ledgers.virtualBadge",
                                        defaultValue: "Virtual"
                                    ),
                                    outlined: true
                                )
                            }
                            if member.userId == myUserId {
                                Text(L10n.string("ledgers.you", defaultValue: "(you)"))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                    }
                    .contextMenu {
                        // Mirror the ledger roster's rename entry point:
                        // editor+ on the ledger can rename a virtual member
                        // from any scope they manage.
                        if member.user?.isVirtual == true, canManageVirtualMembers {
                            Button {
                                renameMemberName = member.displayName
                                projectMemberPendingRename = member
                            } label: {
                                Label(
                                    L10n.string(
                                        "ledgers.renameMember",
                                        defaultValue: "Rename"
                                    ),
                                    systemImage: "pencil"
                                )
                            }
                        }
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if member.user?.isVirtual == true, canManageVirtualMembers {
                            Button {
                                renameMemberName = member.displayName
                                projectMemberPendingRename = member
                            } label: {
                                Label(
                                    L10n.string(
                                        "ledgers.renameMember",
                                        defaultValue: "Rename"
                                    ),
                                    systemImage: "pencil"
                                )
                            }
                            .tint(.blue)
                        }
                        // Mirror the ledger roster's swipe-to-remove: red,
                        // destructive role, never offered for self (the
                        // owner shouldn't see a control that would remove
                        // their own access).
                        if canManageProjectMembers, member.userId != myUserId {
                            Button(role: .destructive) {
                                projectMemberPendingRemove = member
                            } label: {
                                Label(
                                    L10n.string(
                                        "projects.removeMember",
                                        defaultValue: "Remove"
                                    ),
                                    systemImage: "person.badge.minus"
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    /// Ledger members not yet in the project — the add picker's options.
    private func addableProjectMembers(_ project: QianlaiProject) -> [LedgerMember] {
        store.members.filter { member in
            !project.members.contains { $0.userId == member.userId }
        }
    }

    private func addProjectMember(_ project: QianlaiProject, _ member: LedgerMember) async {
        do {
            try await projectStore.addMember(
                ledgerId: ledger.id,
                projectId: project.id,
                userId: member.userId
            )
            toast.show(L10n.string("projects.memberAdded", defaultValue: "Member added"))
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    private func removeProjectMember(_ member: ProjectMemberRow) async {
        do {
            try await projectStore.removeMember(
                ledgerId: ledger.id,
                projectId: member.projectId,
                userId: member.userId
            )
            toast.show(L10n.string("projects.memberRemoved", defaultValue: "Member removed"))
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    private func memberRow(_ member: LedgerMember) -> some View {
        HStack(spacing: 10) {
            avatar(member.displayName, member.user?.avatar)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(member.displayName)
                        .font(.body.weight(.medium))
                    if member.isVirtual {
                        BadgeView(
                            text: L10n.string(
                                "ledgers.virtualBadge",
                                defaultValue: "Virtual"
                            ),
                            outlined: true
                        )
                    }
                    if member.userId == myUserId {
                        Text(L10n.string("ledgers.you", defaultValue: "(you)"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if store.isOwner, !member.isVirtual,
                    let email = member.user?.email {
                    Text(email)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            if LedgerPolicy.isOwner(member.role) {
                BadgeView(text: member.role.label, color: .orange)
            } else if member.isVirtual {
                // Virtual members can never sign in, so their viewer role is
                // a fixed fact — badge, not a control.
                BadgeView(text: member.role.label, outlined: true)
            } else if store.isOwner, member.userId != myUserId {
                Menu {
                    Button {
                        Task {
                            do {
                                try await store.updateRole(member, role: .editor)
                                toast.show(L10n.string("ledgers.roleUpdated", defaultValue: "Role updated"))
                            } catch {
                                toast.show(error.localizedDescription)
                            }
                        }
                    } label: {
                        if member.role == .editor {
                            Label("Editor", systemImage: "checkmark")
                        } else {
                            Text("Editor")
                        }
                    }
                    Button {
                        Task {
                            do {
                                try await store.updateRole(member, role: .viewer)
                                toast.show(L10n.string("ledgers.roleUpdated", defaultValue: "Role updated"))
                            } catch {
                                toast.show(error.localizedDescription)
                            }
                        }
                    } label: {
                        if member.role == .viewer {
                            Label("Viewer", systemImage: "checkmark")
                        } else {
                            Text("Viewer")
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(member.role.label)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption2)
                    }
                }
            } else {
                BadgeView(text: member.role.label, outlined: true)
            }
        }
        .contextMenu {
            if member.isVirtual, canManageVirtualMembers {
                Button {
                    renameMemberName = member.displayName
                    memberPendingRename = member
                } label: {
                    Label(
                        L10n.string(
                            "ledgers.renameMember",
                            defaultValue: "Rename"
                        ),
                        systemImage: "pencil"
                    )
                }
            }
            if store.isOwner, member.userId != myUserId, !member.isVirtual {
                Button {
                    memberPendingTransfer = member
                } label: {
                    Label("Transfer Ownership", systemImage: "crown")
                }
            }
            if store.isOwner, member.userId != myUserId {
                Button(role: .destructive) {
                    memberPendingRemove = member
                } label: {
                    Label("Remove", systemImage: "person.badge.minus")
                }
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if store.isOwner, member.userId != myUserId {
                Button(role: .destructive) {
                    memberPendingRemove = member
                } label: {
                    Label("Remove", systemImage: "person.badge.minus")
                }
                if !member.isVirtual {
                    Button {
                        memberPendingTransfer = member
                    } label: {
                        Label("Transfer", systemImage: "crown")
                    }
                    .tint(.orange)
                }
            }
            if member.isVirtual, canManageVirtualMembers {
                Button {
                    renameMemberName = member.displayName
                    memberPendingRename = member
                } label: {
                    Label(
                        L10n.string(
                            "ledgers.renameMember",
                            defaultValue: "Rename"
                        ),
                        systemImage: "pencil"
                    )
                }
                .tint(.blue)
            }
        }
    }

    private func avatar(_ name: String, _ avatarPath: String?) -> some View {
        let initial = String(name.prefix(1)).uppercased()
        return Group {
            if let url = ProfileStore.absoluteAvatarURL(
                avatarPath,
                baseURL: auth.apiBaseURL
            ) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Text(initial)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                    }
                }
            } else {
                Text(initial)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color.accentColor.opacity(0.85)))
        .clipShape(Circle())
    }
}

/// Members tab page: the active scope's roster via `MembersView` — the
/// selected project's members in project scope, the ledger's otherwise —
/// or an empty state when nothing is selected. Scope resolution mirrors
/// the dashboard's `scopedProject`, including the guest loading window.
/// The `.id` re-seats every bit of member state when the scope changes —
/// unlike a sheet, the tab never relaunches, so switching ledgers or
/// projects must reset the store (and any pending alert/rename state)
/// explicitly or the roster goes stale.
struct MembersTabPageView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore

    var body: some View {
        content
            /// `scopedProject` only reflects what `projectStore.load` has
            /// cached — `LedgerSwitcherMenu` triggers that load, but it
            /// only mounts in the dashboard's toolbar, so cold-opening
            /// straight to the Members tab would resolve `project` against
            /// an empty list. Loading here mirrors the switcher's
            /// idempotent guard so the project scope picks up without a
            /// second fetch when the switcher eventually runs.
            .task(id: ledgerStore.activeLedger?.id) {
                if let id = ledgerStore.activeLedger?.id {
                    await projectStore.load(ledgerId: id)
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        if let ledger = ledgerStore.activeLedger {
            let project = projectStore.scopedProject(
                in: ledger.id,
                isGuestLedger: ledger.isGuest
            )
            if project == nil, ledger.isGuest,
                !projectStore.isResolved(ledgerId: ledger.id)
            {
                // Project scope still resolving — don't flash the ledger
                // roster (whose endpoint a guest can't even fetch).
                ProgressView()
            } else {
                MembersView(
                    ledger: ledger,
                    isModal: false,
                    project: project
                )
                .id("\(ledger.id)|\(project?.id ?? "ledger")")
            }
        } else {
            EmptyStateView(
                message: L10n.string(
                    "members.selectLedger",
                    defaultValue: "Select a ledger to see its members"
                ),
                systemImage: "person.2"
            )
        }
    }
}

