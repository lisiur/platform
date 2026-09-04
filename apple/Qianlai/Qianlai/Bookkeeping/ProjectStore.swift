//
//  ProjectStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Projects of the active ledger: list, report (income/expense + equal-split
/// settlement), member management, and project-scoped invite codes.
@MainActor
@Observable
final class ProjectStore {
    let client = APIClient.shared

    private(set) var projects: [QianlaiProject] = []
    /// Per-ledger project cache so the ledger switcher can list projects of
    /// every guest ledger without re-fetching each time the menu opens.
    /// `projects` mirrors the ledger of the most recent `load` for the views
    /// that only care about the active one — `prefetch` deliberately never
    /// touches it, so background loads can't leak another ledger's list.
    private(set) var projectsByLedger: [String: [QianlaiProject]] = [:]
    private(set) var report: ProjectReport?
    /// Identifies the latest report request so a cancelled or late response
    /// from an older project-detail task cannot clear or overwrite new data.
    private var reportRequestID = UUID()
    private var reportLoadTask: Task<Result<ProjectReport, Error>, Never>?
    private(set) var isLoading = false
    private(set) var loadError: String?
    private(set) var selectedProjectId: String?
    /// Ledgers whose project list finished loading at least once this
    /// session (success or failure). Scope resolution reads this instead of
    /// the transient `isLoading` flag: between a ledger becoming active and
    /// its `load` actually starting, `isLoading` is still false — a gap the
    /// dashboard used to read as "settled" and fire ledger-wide fetches that
    /// guests always get 403 on.
    private(set) var resolvedLedgerIds: Set<String> = []
    /// In-flight loads per ledger: a caller arriving while a fetch runs (a
    /// toolbar remount can re-trigger within the fetch window, before the
    /// resolved set is written) awaits it instead of firing a duplicate
    /// request.
    private var inFlightLoads: [String: Task<Void, Never>] = [:]

    var selectedProject: QianlaiProject? {
        projects.first { $0.id == selectedProjectId } ?? projects.first
    }

    /// Loads (or cache-serves) a ledger's projects. Already-resolved ledgers
    /// sync the active-ledger mirror from the cache instead of refetching —
    /// mounting views (the toolbar rebuilds on every dashboard branch flip,
    /// restarting its tasks) used to fire this several times per page open.
    /// Mutations and pull-to-refresh pass `force: true`.
    func load(ledgerId: String, force: Bool = false) async {
        if !force, resolvedLedgerIds.contains(ledgerId) {
            projects = projectsByLedger[ledgerId] ?? []
            return
        }
        if !force, let existing = inFlightLoads[ledgerId] {
            await existing.value
            projects = projectsByLedger[ledgerId] ?? []
            return
        }
        let task = Task { await performLoad(ledgerId: ledgerId) }
        inFlightLoads[ledgerId] = task
        await task.value
    }

    private func performLoad(ledgerId: String) async {
        isLoading = true
        defer {
            isLoading = false
            inFlightLoads[ledgerId] = nil
        }
        do {
            let projects = try await fetch(ledgerId: ledgerId)
            self.projects = projects
            projectsByLedger[ledgerId] = projects
            loadError = nil
            if let selectedProjectId, !projects.contains(where: { $0.id == selectedProjectId }) {
                self.selectedProjectId = nil
            }
        } catch {
            loadError = error.localizedDescription
        }
        // The scope-resolution window closes either way — a failed load
        // leaves the cache empty, but waiting longer would only stall the
        // dashboard's project-vs-ledger decision.
        resolvedLedgerIds.insert(ledgerId)
    }

    /// Cache-only variant of `load`: refreshes `projectsByLedger` for one
    /// ledger without touching the active-ledger mirror (`projects`,
    /// selection, loading flags). Use whenever the ledger may not be the
    /// active one — prefetching the switcher menu — so active-ledger readers
    /// never observe another ledger's list.
    func prefetch(ledgerId: String) async {
        // Already-resolved ledgers keep their cached list, and an in-flight
        // load will fill it — prefetch is a cache warmer, not a refresh.
        guard !resolvedLedgerIds.contains(ledgerId),
              inFlightLoads[ledgerId] == nil,
              let projects = try? await fetch(ledgerId: ledgerId)
        else { return }
        projectsByLedger[ledgerId] = projects
        resolvedLedgerIds.insert(ledgerId)
    }

    /// Forced, cache-only refresh of one ledger's project list. Unlike
    /// `prefetch` it refetches already-resolved ledgers (a left project must
    /// actually drop from the manage sheet's rows), and unlike `load` it
    /// never touches the active-ledger mirror or selection — for background
    /// ledgers only.
    func refresh(ledgerId: String) async {
        guard let projects = try? await fetch(ledgerId: ledgerId) else { return }
        projectsByLedger[ledgerId] = projects
        resolvedLedgerIds.insert(ledgerId)
    }

    /// True once `load(ledgerId:)` or `prefetch(ledgerId:)` has completed
    /// for this ledger. The cache may still be empty (zero projects or a
    /// failed fetch), but the scope question is answerable.
    func isResolved(ledgerId: String) -> Bool {
        resolvedLedgerIds.contains(ledgerId)
    }

    private func fetch(ledgerId: String) async throws -> [QianlaiProject] {
        let response: ProjectsResponse = try await client.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/projects"
        )
        return response.projects
    }

    /// Cached projects for any ledger this user has access to. Returns an
    /// empty array until `load(ledgerId:)` or `prefetch(ledgerId:)` has
    /// populated it.
    func projects(for ledgerId: String) -> [QianlaiProject] {
        projectsByLedger[ledgerId] ?? []
    }

    /// The project currently claiming scope in `ledger`: an explicit
    /// selection resolves against that ledger's cached list for any role;
    /// guest ledgers additionally fall back to the auto-picked first
    /// project, since their members default to project scope. Full-role
    /// ledgers default to ledger-wide scope (nil) until a project is
    /// explicitly selected.
    func scopedProject(in ledgerId: String, isGuestLedger: Bool) -> QianlaiProject? {
        let projects = projects(for: ledgerId)
        if let selectedProjectId, let project = projects.first(where: { $0.id == selectedProjectId }) {
            return project
        }
        guard isGuestLedger else { return nil }
        return projects.first
    }

    func select(_ id: String?) {
        selectedProjectId = id
    }

    func loadReport(ledgerId: String, projectId: String) async {
        let path = "bookkeeping/ledgers/\(ledgerId)/projects/\(projectId)/report"
        let requestID = UUID()
        reportRequestID = requestID
        reportLoadTask?.cancel()
        let client = self.client
        let task = Task.detached(priority: .userInitiated) { () -> Result<ProjectReport, Error> in
            do {
                return .success(try await client.request("GET", path))
            } catch {
                return .failure(error)
            }
        }
        reportLoadTask = task
        let result = await task.value
        guard reportRequestID == requestID else { return }

        switch result {
        case .success(let loaded):
            report = loaded
        case .failure(let error):
            if Self.isCancellation(error) {
                return
            }
            report = nil
        }
    }

    private static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let apiError = error as? APIError,
           case .transport(let urlError) = apiError,
           urlError.code == .cancelled {
            return true
        }
        return false
    }

    // MARK: - CRUD

    func create(
        ledgerId: String,
        name: String,
        description: String?,
        startDate: Date?,
        endDate: Date?
    ) async throws {
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/projects",
            body: CreateProjectBody(
                name: name,
                description: description,
                startDate: startDate,
                endDate: endDate
            )
        )
        await load(ledgerId: ledgerId, force: true)
    }

    func update(
        ledgerId: String,
        _ project: QianlaiProject,
        name: String,
        description: String?,
        startDate: Date?,
        endDate: Date?
    ) async throws {
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(project.id)",
            body: UpdateProjectBody(
                name: name,
                description: description,
                clearDescription: description == nil,
                startDate: startDate,
                endDate: endDate,
                status: nil
            )
        )
        await load(ledgerId: ledgerId, force: true)
    }

    func setStatus(ledgerId: String, _ project: QianlaiProject, active: Bool) async throws {
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(project.id)",
            body: UpdateProjectBody(
                name: nil,
                description: nil,
                clearDescription: false,
                startDate: nil,
                endDate: nil,
                status: active ? "active" : "archived"
            )
        )
        await load(ledgerId: ledgerId, force: true)
    }

    func delete(ledgerId: String, _ project: QianlaiProject) async throws {
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(project.id)"
        )
        if selectedProjectId == project.id {
            selectedProjectId = nil
        }
        await load(ledgerId: ledgerId, force: true)
    }

    // MARK: - Members

    func addMember(ledgerId: String, projectId: String, userId: String) async throws {
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(projectId)/members",
            body: AddProjectMemberBody(userId: userId)
        )
        await load(ledgerId: ledgerId, force: true)
    }

    func removeMember(ledgerId: String, projectId: String, userId: String) async throws {
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(projectId)/members/\(userId)"
        )
        await load(ledgerId: ledgerId, force: true)
    }

    /// Leaves a project and re-resolves the active scope — the shared entry
    /// point for every leave action (project detail page, manage sheet), so
    /// the follow-up can't drift between call sites.
    ///
    /// The server deletes a guest's ledger membership together with their
    /// last project membership in the ledger, so the ledger list is
    /// refreshed before the follow-up: the left ledger may no longer exist
    /// for this user at all. When it survives, its project list refreshes
    /// too — a mirror-syncing `load` when it's the active ledger (guests
    /// auto-scope to the first remaining project, full roles fall back to
    /// the ledger-wide view via the cleared selection), a cache-only
    /// `refresh` for a background one. When it's gone, its cached projects
    /// are dropped and a formerly-active pointer is cleared — `activeLedger`
    /// falls through to the default / first remaining ledger on its own,
    /// and an emptied ledger list lands the dashboard on its create/empty
    /// state page.
    func leaveAndReselect(
        ledgerId: String,
        projectId: String,
        in ledgerStore: LedgerStore
    ) async throws {
        let wasActive = ledgerStore.activeLedger?.id == ledgerId
        try await leave(ledgerId: ledgerId, projectId: projectId)
        await ledgerStore.load()
        if ledgerStore.ledgers.contains(where: { $0.id == ledgerId }) {
            if wasActive {
                await load(ledgerId: ledgerId, force: true)
            } else {
                await refresh(ledgerId: ledgerId)
            }
        } else {
            projectsByLedger[ledgerId] = nil
            resolvedLedgerIds.remove(ledgerId)
            if wasActive {
                ledgerStore.setActive(nil)
            }
        }
    }

    func leave(ledgerId: String, projectId: String) async throws {
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(projectId)/leave"
        )
        if selectedProjectId == projectId {
            selectedProjectId = nil
        }
        // No auto-reload: use `leaveAndReselect` — it refreshes the ledger
        // and project lists and re-resolves the active scope. Bare `leave`
        // stays as the API-only layer.
    }

    /// Mints a project-scoped invite and returns it. Redeemers join as
    /// guests scoped to exactly this project. Codes expire server-side
    /// after a minute — callers showing a QR re-mint on a timer (see
    /// `LiveInviteQR`).
    func mintInvite(ledgerId: String, projectId: String) async throws -> ShareCode {
        return try await client.request(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/share-codes",
            body: CreateShareCodeBody(role: .guest, projectId: projectId)
        )
    }
}

// MARK: - Request bodies

struct CreateProjectBody: Encodable {
    var name: String
    var description: String?
    var startDate: Date?
    var endDate: Date?
}

/// Manual encoding: `description` must travel as JSON null (to clear) versus
/// being omitted (untouched); date fields omit when nil.
struct UpdateProjectBody: Encodable {
    var name: String?
    var description: String?
    var clearDescription: Bool
    var startDate: Date?
    var endDate: Date?
    var status: String?

    init(
        name: String?,
        description: String?,
        clearDescription: Bool = false,
        startDate: Date?,
        endDate: Date?,
        status: String?
    ) {
        self.name = name
        self.description = description
        self.clearDescription = clearDescription
        self.startDate = startDate
        self.endDate = endDate
        self.status = status
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        if clearDescription {
            try container.encodeNil(forKey: .description)
        } else {
            try container.encodeIfPresent(description, forKey: .description)
        }
        try container.encodeIfPresent(startDate, forKey: .startDate)
        try container.encodeIfPresent(endDate, forKey: .endDate)
        try container.encodeIfPresent(status, forKey: .status)
    }

    private enum CodingKeys: String, CodingKey {
        case name
        case description
        case startDate
        case endDate
        case status
    }
}

struct AddProjectMemberBody: Encodable {
    var userId: String
}
