//
//  LedgersView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Ledger management: create, join by share code, edit, set default,
/// archive/unarchive, delete, leave, and open the members manager.
struct LedgersView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore
    @Environment(ToastCenter.self) private var toast
    @State private var editingLedger: QianlaiLedger?
    @State private var isShowingCreate = false
    @State private var isShowingJoin = false
    @State private var membersLedger: QianlaiLedger?
    @State private var ledgerPendingDelete: QianlaiLedger?
    @State private var ledgerPendingLeave: QianlaiLedger?
    @State private var projectPendingLeave: QianlaiProject?

    /// When true, every guest-ledger row is replaced by one row per project
    /// the user was invited to in that ledger — the project name replaces
    /// the ledger name. Used by the toolbar switcher so project-scoped
    /// guests never see ledger names for ledgers they've only been invited
    /// to a project of.
    private let expandGuestLedgers: Bool

    init(expandGuestLedgers: Bool = false) {
        self.expandGuestLedgers = expandGuestLedgers
    }

    /// One row in the manage list — either a ledger or a project. The enum
    /// lets `ForEach` render ledger and project rows side-by-side without
    /// needing two `Section`s.
    private enum Entry: Identifiable {
        case ledger(QianlaiLedger)
        case project(QianlaiProject, ledger: QianlaiLedger)

        var id: String {
            switch self {
            case .ledger(let ledger): return "l-\(ledger.id)"
            case .project(let project, _): return "p-\(project.id)"
            }
        }

        var ledger: QianlaiLedger {
            switch self {
            case .ledger(let ledger): return ledger
            case .project(_, let ledger): return ledger
            }
        }
    }

    /// Active ledgers the user owns (`myRole == .owner`). Rendered in the
    /// "My Ledgers" section.
    private var ownActiveLedgers: [QianlaiLedger] {
        ledgerStore.activeLedgers.filter { $0.myRole == .owner }
    }

    /// Active ledgers / projects the user joined but doesn't own. Editor /
    /// viewer roles stay as ledger rows; guest-ledger rows explode into the
    /// projects the user was invited to (when `expandGuestLedgers` is on).
    private var joinedActiveEntries: [Entry] {
        ledgerStore.activeLedgers.flatMap { ledger -> [Entry] in
            if ledger.myRole == .owner {
                return []
            }
            if ledger.isGuest {
                if expandGuestLedgers {
                    let projects = projectStore.projects(for: ledger.id)
                    if projects.isEmpty {
                        return [.ledger(ledger)]
                    }
                    return projects.map { Entry.project($0, ledger: ledger) }
                }
                return [.ledger(ledger)]
            }
            return [.ledger(ledger)]
        }
    }

    /// Archived rows: own archived ledgers stay as ledger rows, joined
    /// archived ledgers explode into their projects when
    /// `expandGuestLedgers` is on (matching the active-section rules).
    private var archivedEntries: [Entry] {
        ledgerStore.archivedLedgers.flatMap { ledger -> [Entry] in
            if expandGuestLedgers, ledger.isGuest {
                let projects = projectStore.projects(for: ledger.id)
                if projects.isEmpty {
                    return [.ledger(ledger)]
                }
                return projects.map { Entry.project($0, ledger: ledger) }
            }
            return [.ledger(ledger)]
        }
    }

    private var hasVisibleContent: Bool {
        !ownActiveLedgers.isEmpty || !joinedActiveEntries.isEmpty || !archivedEntries.isEmpty
    }

    var body: some View {
        List {
            if ledgerStore.isLoading, !hasVisibleContent {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
            } else if let error = ledgerStore.loadError, !hasVisibleContent {
                ErrorRetryView(message: error) {
                    Task { await ledgerStore.load() }
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else if !hasVisibleContent {
                EmptyStateView(
                    message: L10n.string("ledgers.empty", defaultValue: "No ledgers yet. Create one or join with a share code."),
                    systemImage: "book"
                )
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else {
                if !ownActiveLedgers.isEmpty {
                    Section("My Ledgers") {
                        ForEach(ownActiveLedgers) { ledger in
                            row(ledger)
                        }
                    }
                }
                if !joinedActiveEntries.isEmpty {
                    Section("Joined") {
                        ForEach(joinedActiveEntries) { entry in
                            switch entry {
                            case .ledger(let ledger):
                                row(ledger)
                            case .project(let project, let ledger):
                                projectRow(project, in: ledger)
                            }
                        }
                    }
                }
                if !archivedEntries.isEmpty {
                    Section("Archived") {
                        ForEach(archivedEntries) { entry in
                            switch entry {
                            case .ledger(let ledger):
                                row(ledger)
                            case .project(let project, let ledger):
                                projectRow(project, in: ledger)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(Text("Ledgers"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    isShowingCreate = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(Text("Create Ledger"))
            }
            ToolbarItem(placement: .cancellationAction) {
                Button("Join") { isShowingJoin = true }
            }
        }
        .task {
            await ledgerStore.load()
            // In project mode, pre-fetch the projects for every guest ledger
            // so the rows render as project entries instead of falling back
            // to the placeholder ledger row. Prefetch only fills the
            // per-ledger cache — ledgers here may not be the active one.
            if expandGuestLedgers {
                let guestLedgers = ledgerStore.ledgers.filter { $0.isGuest }
                for ledger in guestLedgers {
                    await projectStore.prefetch(ledgerId: ledger.id)
                }
            }
        }
        .sheet(isPresented: $isShowingCreate) {
            NavigationStack {
                LedgerFormView(ledger: nil)
            }
        }
        .sheet(item: $editingLedger) { ledger in
            NavigationStack {
                LedgerFormView(ledger: ledger)
            }
        }
        .sheet(isPresented: $isShowingJoin) {
            NavigationStack {
                JoinLedgerView()
            }
        }
        .sheet(item: $membersLedger) { ledger in
            NavigationStack {
                MembersView(ledger: ledger)
            }
        }
        .alert(
            L10n.string("ledgers.delete", defaultValue: "Delete"),
            isPresented: Binding(
                get: { ledgerPendingDelete != nil },
                set: { if !$0 { ledgerPendingDelete = nil } }
            )
        ) {
            Button("Delete", role: .destructive) {
                if let ledger = ledgerPendingDelete {
                    Task {
                        do {
                            try await ledgerStore.delete(ledger)
                            toast.show(L10n.string("ledgers.deleteSuccess", defaultValue: "Ledger deleted"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                ledgerPendingDelete = nil
            }
            Button("Cancel", role: .cancel) { ledgerPendingDelete = nil }
        } message: {
            if let ledger = ledgerPendingDelete {
                Text("Delete “\(ledger.name)”? Its accounts, entries, and members will be permanently removed.")
            }
        }
        .alert(
            L10n.string("ledgers.leave", defaultValue: "Leave Ledger"),
            isPresented: Binding(
                get: { ledgerPendingLeave != nil },
                set: { if !$0 { ledgerPendingLeave = nil } }
            )
        ) {
            Button(L10n.string("ledgers.leave", defaultValue: "Leave"), role: .destructive) {
                if let ledger = ledgerPendingLeave {
                    Task {
                        do {
                            try await ledgerStore.leave(ledger)
                            toast.show(L10n.string("ledgers.leaveSuccess", defaultValue: "You left the ledger"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                ledgerPendingLeave = nil
            }
            Button("Cancel", role: .cancel) { ledgerPendingLeave = nil }
        } message: {
            Text("Leave this ledger? Rejoining requires a new share code.")
        }
        .alert(
            L10n.string("projects.leave", defaultValue: "Leave Project"),
            isPresented: Binding(
                get: { projectPendingLeave != nil },
                set: { if !$0 { projectPendingLeave = nil } }
            )
        ) {
            Button(L10n.string("projects.leave", defaultValue: "Leave"), role: .destructive) {
                if let project = projectPendingLeave {
                    let ledgerId = project.ledgerId
                    let projectId = project.id
                    Task {
                        do {
                            try await projectStore.leave(ledgerId: ledgerId, projectId: projectId)
                            // This ledger may not be the active one — refresh
                            // its cache only so the row drops from the list.
                            await projectStore.prefetch(ledgerId: ledgerId)
                            toast.show(L10n.string("projects.leftProject", defaultValue: "You left the project"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                projectPendingLeave = nil
            }
            Button("Cancel", role: .cancel) { projectPendingLeave = nil }
        } message: {
            Text("Leave this project? Rejoining requires a new share code.")
        }
    }

    private func row(_ ledger: QianlaiLedger) -> some View {
        let isOwner = ledger.myRole == .owner
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                if ledger.isDefault {
                    Image(systemName: "star.fill")
                        .font(.caption)
                        .foregroundStyle(.yellow)
                }
                Text(ledger.name)
                    .font(.body.weight(.medium))
                if ledger.shared {
                    BadgeView(text: L10n.string("ledgers.shared", defaultValue: "Shared"), outlined: true)
                }
                Spacer()
            }
            HStack(spacing: 8) {
                Text(ledger.currency)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                Text(ledger.myRole.label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Label("\(ledger.membersCount)", systemImage: "person.2")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if ledger.isArchived {
                    BadgeView(text: L10n.string("status.archived", defaultValue: "Archived"), color: .orange)
                }
            }
            if let description = ledger.description, !description.isEmpty {
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture {
            if isOwner {
                editingLedger = ledger
            }
        }
        .contextMenu {
            membersAction(ledger)
            if isOwner {
                editAction(ledger)
                archiveAction(ledger)
                deleteAction(ledger)
            } else {
                leaveAction(ledger)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            editAction(ledger)
            membersAction(ledger)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if isOwner {
                deleteAction(ledger)
                archiveAction(ledger)
            } else {
                leaveAction(ledger)
            }
        }
    }

    /// Project row used when a guest-ledger entry explodes into its
    /// projects. Mirrors the ledger row's metadata layout but uses the
    /// project's name and member list, and only exposes the actions a
    /// guest actually has (leave, members).
    private func projectRow(_ project: QianlaiProject, in ledger: QianlaiLedger) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: "folder")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(project.name)
                    .font(.body.weight(.medium))
                Spacer()
            }
            HStack(spacing: 8) {
                Text(ledger.currency)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                Text(ledger.myRole.label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Label("\(project.members.count)", systemImage: "person.2")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if project.isArchived {
                    BadgeView(text: L10n.string("status.archived", defaultValue: "Archived"), color: .orange)
                }
            }
            if let description = project.description, !description.isEmpty {
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .contextMenu {
            membersAction(ledger)
            Button(role: .destructive) {
                projectPendingLeave = project
            } label: {
                Label(L10n.string("projects.leave", defaultValue: "Leave Project"), systemImage: "rectangle.portrait.and.arrow.right")
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            membersAction(ledger)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                projectPendingLeave = project
            } label: {
                Label(L10n.string("projects.leave", defaultValue: "Leave"), systemImage: "rectangle.portrait.and.arrow.right")
            }
        }
    }

    // Shared row actions used by both the context menu and the swipe actions.
    private func membersAction(_ ledger: QianlaiLedger) -> some View {
        Button {
            membersLedger = ledger
        } label: {
            Label("Members", systemImage: "person.2")
        }
    }

    private func editAction(_ ledger: QianlaiLedger) -> some View {
        Button {
            editingLedger = ledger
        } label: {
            Label("Edit", systemImage: "pencil")
        }
        .tint(.indigo)
    }

    private func archiveAction(_ ledger: QianlaiLedger) -> some View {
        Button {
            Task { await toggleArchive(ledger) }
        } label: {
            Label(
                ledger.isActive ? "Archive" : "Unarchive",
                systemImage: ledger.isActive ? "archivebox" : "archivebox.fill"
            )
        }
        .tint(.orange)
    }

    private func deleteAction(_ ledger: QianlaiLedger) -> some View {
        Button(role: .destructive) {
            ledgerPendingDelete = ledger
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    private func leaveAction(_ ledger: QianlaiLedger) -> some View {
        Button(role: .destructive) {
            ledgerPendingLeave = ledger
        } label: {
            Label("Leave", systemImage: "rectangle.portrait.and.arrow.right")
        }
    }

    private func toggleArchive(_ ledger: QianlaiLedger) async {
        do {
            try await ledgerStore.archiveToggle(ledger)
            toast.show(
                ledger.isActive
                    ? L10n.string("ledgers.archiveSuccess", defaultValue: "Ledger archived")
                    : L10n.string("ledgers.unarchiveSuccess", defaultValue: "Ledger unarchived")
            )
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Create/edit ledger form. Currency is a 3-letter code (default CNY).
struct LedgerFormView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast

    let ledger: QianlaiLedger?

    @State private var name = ""
    @State private var description = ""
    @State private var currency = "CNY"
    @State private var nameError: String?
    @State private var isSaving = false

    private let currencies = ["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD", "SGD", "KRW", "AUD", "CAD", "CHF"]

    var body: some View {
        Form {
            Section {
                TextField("Name", text: $name)
                    .submitLabel(.done)
                    .onSubmit { dismissKeyboard() }
                if let nameError {
                    Label(nameError, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                TextField("Description (optional)", text: $description, axis: .vertical)
                Picker("Currency", selection: $currency) {
                    ForEach(currencies, id: \.self) { code in
                        Text(code).tag(code)
                    }
                }
            } footer: {
                if ledger == nil {
                    Text("A starter chart of accounts is seeded automatically.")
                }
            }
        }
        .navigationTitle(Text(ledger != nil ? "Edit Ledger" : "Create Ledger"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "Saving…" : "Save") {
                    Task { await save() }
                }
                .disabled(isSaving)
            }
        }
        .onAppear {
            if let ledger {
                name = ledger.name
                description = ledger.description ?? ""
                currency = ledger.currency
            }
        }
    }

    private func save() async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            nameError = L10n.string("ledgers.nameRequired", defaultValue: "Ledger name is required")
            return
        }
        nameError = nil
        isSaving = true
        defer { isSaving = false }
        do {
            if let ledger {
                try await ledgerStore.update(
                    ledger,
                    name: trimmed,
                    description: description.isEmpty ? nil : description,
                    currency: currency
                )
                toast.show(L10n.string("ledgers.updateSuccess", defaultValue: "Ledger updated"))
            } else {
                try await ledgerStore.create(
                    name: trimmed,
                    description: description.isEmpty ? nil : description,
                    currency: currency
                )
                toast.show(L10n.string("ledgers.createSuccess", defaultValue: "Ledger created"))
            }
            dismiss()
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Join someone else's ledger by pasting a share code.
struct JoinLedgerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast

    @State private var code = ""
    @State private var error: String?
    @State private var isJoining = false
    @FocusState private var isCodeFocused: Bool

    var body: some View {
        Form {
            Section {
                FormField(title: "Share Code", error: nil) {
                    TextField("e.g. A2B4C6D8E9F2", text: $code)
                        .textFieldStyle(.plain)
                        #if os(iOS)
                        .textInputAutocapitalization(.characters)
                        #endif
                        .autocorrectionDisabled()
                        .focused($isCodeFocused)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                }
                .listRowBackground(Color.clear)
            } header: {
                Text("Join a Ledger")
            } footer: {
                Text("Paste a share code from the ledger owner to join as an editor or viewer.")
            }
            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle(Text("Join"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(isJoining)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isJoining ? "Joining…" : "Join") {
                    Task { await join() }
                }
                .disabled(isJoining || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .onAppear { isCodeFocused = true }
    }

    private func join() async {
        isCodeFocused = false
        isJoining = true
        defer { isJoining = false }
        do {
            let ledgerId = try await ledgerStore.join(code: code)
            ledgerStore.setActive(ledgerId)
            toast.show(L10n.string("ledgers.joinSuccess", defaultValue: "Joined the ledger"))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
