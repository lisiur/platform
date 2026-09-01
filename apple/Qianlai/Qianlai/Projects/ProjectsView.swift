//
//  ProjectsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Projects of the active ledger: a list that drills into a project detail
/// with the income/expense statement, the equal-split settlement, member
/// management, and project-scoped invite codes.
struct ProjectsView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore
    @State private var isShowingNewProject = false

    var body: some View {
        Group {
            if let ledger = ledgerStore.activeLedger {
                projectList(ledger)
            } else {
                EmptyStateView(
                    message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                    systemImage: "folder"
                )
            }
        }
        .navigationTitle(Text("Projects"))
        .sheet(isPresented: $isShowingNewProject) {
            if ledgerStore.activeLedger != nil {
                NavigationStack {
                    ProjectFormView(project: nil)
                }
            }
        }
    }

    @ViewBuilder
    private func projectList(_ ledger: QianlaiLedger) -> some View {
        List {
            if projectStore.isLoading && projectStore.projects.isEmpty {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else if projectStore.projects.isEmpty {
                EmptyStateView(
                    message: L10n.string("projects.empty", defaultValue: "No projects yet. Create one to start recording together."),
                    systemImage: "folder.badge.plus"
                )
                .listRowBackground(Color.clear)
            } else {
                ForEach(projectStore.projects) { project in
                    NavigationLink {
                        ProjectDetailView(projectId: project.id)
                    } label: {
                        ProjectListRow(project: project)
                    }
                }
            }
        }
        .toolbar {
            if LedgerPolicy.canManageProjects(role: ledger.myRole, ledgerActive: ledger.isActive) {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        isShowingNewProject = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .refreshable {
            await projectStore.load(ledgerId: ledger.id)
        }
        .task(id: ledger.id) {
            await projectStore.load(ledgerId: ledger.id)
        }
    }
}

private struct ProjectListRow: View {
    let project: QianlaiProject

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(project.name)
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                Spacer()
                if project.isArchived {
                    Text(L10n.string("projects.archived", defaultValue: "Archived"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.secondary.opacity(0.15)))
                }
            }
            HStack(spacing: 12) {
                Label("\(project.members.count)", systemImage: "person.2")
                Label("\(project.entryCount)", systemImage: "list.bullet")
                if let start = project.startDate {
                    Text(start, style: .date)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

/// One project: statement, settlement, members, invites, and management
/// actions. Re-resolves the project from the store so edits stay live.
struct ProjectDetailView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore
    @Environment(AuthManager.self) private var auth
    @Environment(ToastCenter.self) private var toast

    let projectId: String

    /// When true, suppresses the navigation title — the Dashboard uses
    /// this so the leading LedgerSwitcher remains the only header on the
    /// tab, while the Projects tab (where this view is also reachable)
    /// still gets the project name in the title.
    var hidesNavigationTitle: Bool = false

    @State private var memberStore = MemberStore()
    @State private var isEditPresented = false
    @State private var isInvitePresented = false
    @State private var confirmation: DetailAction?
    @State private var isLoadingReport = false

    private enum DetailAction: Hashable {
        case delete
        case leave
        case removeMember(String)
    }

    /// Re-resolves the project from the active ledger's cached list so
    /// edits stay live — and background prefetches of other ledgers can
    /// never satisfy the lookup with a foreign project.
    private var project: QianlaiProject? {
        guard let ledgerId = ledgerStore.activeLedger?.id else { return nil }
        return projectStore.projects(for: ledgerId).first { $0.id == projectId }
    }

    private var ledger: QianlaiLedger? { ledgerStore.activeLedger }

    private var canManage: Bool {
        guard let ledger else { return false }
        return LedgerPolicy.canManageProjects(role: ledger.myRole, ledgerActive: ledger.isActive)
    }

    private var isOwner: Bool {
        ledger.map { LedgerPolicy.isOwner($0.myRole) } ?? false
    }

    var body: some View {
        Group {
            if let project, let ledger {
                content(project, ledger)
            } else {
                EmptyStateView(
                    message: L10n.string("projects.gone", defaultValue: "This project no longer exists."),
                    systemImage: "folder"
                )
            }
        }
        .navigationTitle(hidesNavigationTitle ? Text("") : Text(project?.name ?? ""))
        .inlineNavigationBarTitle()
        .toolbar {
            if let project {
                ToolbarItem(placement: .primaryAction) {
                    managementMenu(project)
                }
            }
        }
        .sheet(isPresented: $isEditPresented) {
            if let project {
                NavigationStack {
                    ProjectFormView(project: project)
                }
            }
        }
        .sheet(isPresented: $isInvitePresented) {
            if let project, let ledger {
                NavigationStack {
                    ProjectInviteView(ledgerId: ledger.id, project: project)
                }
            }
        }
        .confirmationDialog(
            Text("Are you sure?"),
            isPresented: Binding(
                get: { confirmation != nil },
                set: { if !$0 { confirmation = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let confirmation {
                switch confirmation {
                case .delete:
                    Button(L10n.string("projects.delete", defaultValue: "Delete Project"), role: .destructive) {
                        Task { await deleteProject() }
                    }
                case .leave:
                    Button(L10n.string("projects.leave", defaultValue: "Leave Project"), role: .destructive) {
                        Task { await leaveProject() }
                    }
                case .removeMember(let userId):
                    Button(L10n.string("projects.removeMember", defaultValue: "Remove Member"), role: .destructive) {
                        Task { await removeMember(userId) }
                    }
                }
            }
            Button(L10n.string("Cancel", defaultValue: "Cancel"), role: .cancel) {}
        } message: {
            switch confirmation {
            case .delete:
                Text("Its records are kept but become unassigned.")
            case .leave:
                Text("You will no longer see or record in this project.")
            case .removeMember(let userId):
                Text("Remove \(project?.members.first { $0.userId == userId }?.displayName ?? userId) from the project?")
            case .none:
                Text("")
            }
        }
        .task(id: projectId) {
            guard let ledger else { return }
            isLoadingReport = true
            defer { isLoadingReport = false }
            await memberStore.load(ledgerId: ledger.id, myUserId: nil)
            await projectStore.loadReport(ledgerId: ledger.id, projectId: projectId)
        }
    }

    @ViewBuilder
    private func content(_ project: QianlaiProject, _ ledger: QianlaiLedger) -> some View {
        List {
            if let report = projectStore.report, report.project.id == project.id {
                statementSection(project, ledger, report)
                settlementSection(project, ledger, report)
            } else if isLoadingReport {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            }

            membersSection(project, ledger)
        }
        .refreshable {
            await projectStore.load(ledgerId: ledger.id)
            await projectStore.loadReport(ledgerId: ledger.id, projectId: project.id)
        }
    }

    private func statementSection(
        _ project: QianlaiProject,
        _ ledger: QianlaiLedger,
        _ report: ProjectReport
    ) -> some View {
        Section {
            statementTotalLink(project, ledger, type: .expense, amount: report.statement.totalExpense)
            ForEach(report.statement.expense) { row in
                statementRowLink(project, ledger, type: .expense, row: row)
            }
            statementTotalLink(project, ledger, type: .income, amount: report.statement.totalIncome)
            ForEach(report.statement.income) { row in
                statementRowLink(project, ledger, type: .income, row: row)
            }
        } header: {
            Text(L10n.string("projects.statement", defaultValue: "Income & Expense"))
        } footer: {
            Text(L10n.string(
                "projects.statementFooter",
                defaultValue: "Split the totals equally — the settlement below suggests who owes whom."
            ))
        }
    }

    /// Total row of one flow, drilling into every entry of the project on
    /// that side of the books.
    private func statementTotalLink(
        _ project: QianlaiProject,
        _ ledger: QianlaiLedger,
        type: AccountType,
        amount: Double
    ) -> some View {
        NavigationLink {
            ProjectEntriesDetailView(
                ledger: ledger,
                scope: .statement(projectId: project.id, type: type, category: nil)
            )
        } label: {
            HStack {
                Text(type == .expense
                    ? L10n.string("projects.totalExpense", defaultValue: "Expenses")
                    : L10n.string("projects.totalIncome", defaultValue: "Income"))
                Spacer()
                Text(Money.format(amount, currency: ledger.currency))
                    .font(.callout.weight(.semibold).monospacedDigit())
            }
        }
    }

    /// One category row, drilling into the project's entries of exactly
    /// that category.
    private func statementRowLink(
        _ project: QianlaiProject,
        _ ledger: QianlaiLedger,
        type: AccountType,
        row: StatementRow
    ) -> some View {
        NavigationLink {
            ProjectEntriesDetailView(
                ledger: ledger,
                scope: .statement(projectId: project.id, type: type, category: row)
            )
        } label: {
            HStack {
                Text(row.displayName)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(Money.format(row.balance, currency: ledger.currency))
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func settlementSection(
        _ project: QianlaiProject,
        _ ledger: QianlaiLedger,
        _ report: ProjectReport
    ) -> some View {
        Section {
            ForEach(report.settlement) { row in
                NavigationLink {
                    ProjectEntriesDetailView(
                        ledger: ledger,
                        scope: .settlement(projectId: project.id, userId: row.userId, name: row.name)
                    )
                } label: {
                    HStack(spacing: 10) {
                        avatar(row.name, row.avatar)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(row.name)
                                Spacer()
                                Text(Money.format(row.balance, currency: ledger.currency))
                                    .font(.callout.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(row.balance > 0 ? Color.income : row.balance < 0 ? Color.expense : .secondary)
                            }
                            HStack(spacing: 12) {
                                Text("\(L10n.string("projects.paid", defaultValue: "Paid")) \(Money.format(row.paid, currency: ledger.currency))")
                                Text("\(L10n.string("projects.share", defaultValue: "Share")) \(Money.format(row.share, currency: ledger.currency))")
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        } header: {
            Text(L10n.string("projects.settlement", defaultValue: "Settlement"))
        } footer: {
            Text(L10n.string(
                "projects.settlementFooter",
                defaultValue: "Entries tagged with members split among them; untagged entries split across all members."
            ))
        }
    }

    @ViewBuilder
    private func membersSection(_ project: QianlaiProject, _ ledger: QianlaiLedger) -> some View {
        Section {
            ForEach(project.members) { member in
                HStack(spacing: 10) {
                    avatar(member.displayName, member.user?.avatar)
                    Text(member.displayName)
                    Spacer()
                    if canManage, project.isActive {
                        Button {
                            confirmation = .removeMember(member.userId)
                        } label: {
                            Image(systemName: "minus.circle")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
            if canManage, project.isActive, !addableMembers(project).isEmpty {
                Menu {
                    ForEach(addableMembers(project)) { member in
                        Button(member.displayName) {
                            Task { await addMember(project, member) }
                        }
                    }
                } label: {
                    Label(
                        L10n.string("projects.addMember", defaultValue: "Add Member"),
                        systemImage: "person.badge.plus"
                    )
                }
            }
        } header: {
            HStack {
                Text(L10n.string("projects.members", defaultValue: "Members"))
                Spacer()
                if canManage, project.isActive {
                    Button {
                        isInvitePresented = true
                    } label: {
                        Label(
                            L10n.string("projects.invite", defaultValue: "Invite via Code"),
                            systemImage: "qrcode"
                        )
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
    }

    private func avatar(_ name: String, _ path: String?) -> some View {
        let initial = String(name.prefix(1)).uppercased()
        return Group {
            if let url = ProfileStore.absoluteAvatarURL(path, baseURL: auth.apiBaseURL) {
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

    private func addableMembers(_ project: QianlaiProject) -> [LedgerMember] {
        memberStore.members.filter { member in
            !project.members.contains { $0.userId == member.userId }
        }
    }

    @ViewBuilder
    private func managementMenu(_ project: QianlaiProject) -> some View {
        Menu {
            if canManage {
                Button {
                    isEditPresented = true
                } label: {
                    Label(L10n.string("projects.edit", defaultValue: "Edit"), systemImage: "pencil")
                }
                Button {
                    Task { await toggleArchive(project) }
                } label: {
                    if project.isActive {
                        Label(L10n.string("projects.archive", defaultValue: "Archive"), systemImage: "archivebox")
                    } else {
                        Label(L10n.string("projects.unarchive", defaultValue: "Unarchive"), systemImage: "arrow.up.bin")
                    }
                }
            }
            if isOwner {
                Button(role: .destructive) {
                    confirmation = .delete
                } label: {
                    Label(L10n.string("projects.delete", defaultValue: "Delete Project"), systemImage: "trash")
                }
            }
            if isProjectMember(project) {
                Button(role: .destructive) {
                    confirmation = .leave
                } label: {
                    Label(L10n.string("projects.leave", defaultValue: "Leave Project"), systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
    }

    private func isProjectMember(_ project: QianlaiProject) -> Bool {
        guard let myUserId = auth.currentUser?.id else { return false }
        return project.members.contains { $0.userId == myUserId }
    }

    private func addMember(_ project: QianlaiProject, _ member: LedgerMember) async {
        guard let ledger else { return }
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

    private func removeMember(_ userId: String) async {
        guard let ledger else { return }
        do {
            try await projectStore.removeMember(
                ledgerId: ledger.id,
                projectId: projectId,
                userId: userId
            )
            toast.show(L10n.string("projects.memberRemoved", defaultValue: "Member removed"))
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    private func toggleArchive(_ project: QianlaiProject) async {
        guard let ledger else { return }
        do {
            try await projectStore.setStatus(
                ledgerId: ledger.id,
                project,
                active: !project.isActive
            )
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    private func deleteProject() async {
        guard let ledger, let project else { return }
        do {
            try await projectStore.delete(ledgerId: ledger.id, project)
            toast.show(L10n.string("projects.deleteSuccess", defaultValue: "Project deleted"))
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    private func leaveProject() async {
        guard let ledger else { return }
        do {
            try await projectStore.leave(ledgerId: ledger.id, projectId: projectId)
            // Active-ledger context: refresh the mirror so this view and
            // the dashboard drop the project.
            await projectStore.load(ledgerId: ledger.id)
            toast.show(L10n.string("projects.leftProject", defaultValue: "You left the project"))
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Creates or edits a project. Pass a project to edit it.
struct ProjectFormView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore
    @Environment(ToastCenter.self) private var toast

    let project: QianlaiProject?

    @State private var name = ""
    @State private var description = ""
    @State private var hasStartDate = false
    @State private var startDate = Date()
    @State private var hasEndDate = false
    @State private var endDate = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(project: QianlaiProject?) {
        self.project = project
        _name = State(initialValue: project?.name ?? "")
        _description = State(initialValue: project?.description ?? "")
        _hasStartDate = State(initialValue: project?.startDate != nil)
        _startDate = State(initialValue: project?.startDate ?? Date())
        _hasEndDate = State(initialValue: project?.endDate != nil)
        _endDate = State(initialValue: project?.endDate ?? Date())
    }

    var body: some View {
        Form {
            Section {
                TextField(
                    L10n.string("projects.namePlaceholder", defaultValue: "e.g. Kyoto Trip"),
                    text: $name
                )
                TextField(
                    L10n.string("projects.descriptionPlaceholder", defaultValue: "What is this project about?"),
                    text: $description,
                    axis: .vertical
                )
                .lineLimit(3...)
            } header: {
                Text(L10n.string("projects.details", defaultValue: "Details"))
            }

            Section {
                Toggle(isOn: $hasStartDate) {
                    Text(L10n.string("projects.startDate", defaultValue: "Start Date"))
                }
                if hasStartDate {
                    DatePicker(
                        L10n.string("projects.startDate", defaultValue: "Start Date"),
                        selection: $startDate,
                        displayedComponents: [.date]
                    )
                }
                Toggle(isOn: $hasEndDate) {
                    Text(L10n.string("projects.endDate", defaultValue: "End Date"))
                }
                if hasEndDate {
                    DatePicker(
                        L10n.string("projects.endDate", defaultValue: "End Date"),
                        selection: $endDate,
                        in: (hasStartDate ? startDate : .distantPast)...,
                        displayedComponents: [.date]
                    )
                }
            } header: {
                Text(L10n.string("projects.schedule", defaultValue: "Schedule"))
            }

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle(Text(project == nil ? L10n.string("projects.create", defaultValue: "New Project") : L10n.string("projects.edit", defaultValue: "Edit Project")))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.string("Cancel", defaultValue: "Cancel")) { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(L10n.string("Save", defaultValue: "Save"))
                    }
                }
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
            }
        }
    }

    private func save() async {
        guard let ledger = ledgerStore.activeLedger else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
            let start = hasStartDate ? Calendar.current.startOfDay(for: startDate) : nil
            var end: Date?
            if let endOfDay = hasEndDate ? Calendar.current.startOfDay(for: endDate) : nil {
                end = Calendar.current.date(byAdding: DateComponents(day: 1, second: -1), to: endOfDay)
            }
            if let project {
                try await projectStore.update(
                    ledgerId: ledger.id,
                    project,
                    name: trimmedName,
                    description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                    startDate: start,
                    endDate: end
                )
                toast.show(L10n.string("projects.updateSuccess", defaultValue: "Project updated"))
            } else {
                try await projectStore.create(
                    ledgerId: ledger.id,
                    name: trimmedName,
                    description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                    startDate: start,
                    endDate: end
                )
                toast.show(L10n.string("projects.createSuccess", defaultValue: "Project created"))
            }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Generates a project-scoped invite code and shows it for sharing.
/// Redeemers join the ledger as guests scoped to exactly this project.
struct ProjectInviteView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toast

    let ledgerId: String
    let project: QianlaiProject

    @State private var projectStore = ProjectStore()
    @State private var code: String?
    @State private var errorMessage: String?
    @State private var isCreating = false

    var body: some View {
        Form {
            Section {
                Button {
                    Task { await createCode() }
                } label: {
                    HStack {
                        Label(
                            L10n.string("projects.createCode", defaultValue: "Create Invite Code"),
                            systemImage: "qrcode"
                        )
                        Spacer()
                        if isCreating {
                            ProgressView().controlSize(.small)
                        }
                    }
                }
                .disabled(isCreating)
            } footer: {
                Text(L10n.string(
                    "projects.inviteFooter",
                    defaultValue: "Anyone with the code joins this project as a guest — they can only see and record expenses of this project."
                ))
            }

            if let code {
                Section {
                    HStack {
                        Text(code)
                            .font(.title3.monospaced().weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                        Spacer()
                        Button {
                            Self.copy(code)
                            toast.show(L10n.string("projects.copied", defaultValue: "Copied"))
                        } label: {
                            Image(systemName: "doc.on.doc")
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle(Text(L10n.string("projects.invite", defaultValue: "Invite via Code")))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.string("Done", defaultValue: "Done")) { dismiss() }
            }
        }
    }

    private func createCode() async {
        isCreating = true
        defer { isCreating = false }
        do {
            let newCode = try await projectStore.createInviteCode(
                ledgerId: ledgerId,
                projectId: project.id
            )
            code = newCode
            Self.copy(newCode)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private static func copy(_ value: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        #else
        UIPasteboard.general.string = value
        #endif
    }
}
