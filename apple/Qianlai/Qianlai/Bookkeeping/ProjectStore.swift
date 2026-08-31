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
    private(set) var isLoading = false
    private(set) var loadError: String?
    private(set) var selectedProjectId: String?

    var selectedProject: QianlaiProject? {
        projects.first { $0.id == selectedProjectId } ?? projects.first
    }

    func load(ledgerId: String) async {
        isLoading = true
        defer { isLoading = false }
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
    }

    /// Cache-only variant of `load`: refreshes `projectsByLedger` for one
    /// ledger without touching the active-ledger mirror (`projects`,
    /// selection, loading flags). Use whenever the ledger may not be the
    /// active one — prefetching the switcher menu, or refreshing after
    /// leaving a project of a background ledger — so active-ledger readers
    /// never observe another ledger's list.
    func prefetch(ledgerId: String) async {
        guard let projects = try? await fetch(ledgerId: ledgerId) else { return }
        projectsByLedger[ledgerId] = projects
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

    /// Ledger-scoped counterpart of `selectedProject`: resolves the explicit
    /// selection (or the auto-picked first project) against that ledger's
    /// cached list instead of the active-ledger mirror.
    func selectedProject(in ledgerId: String) -> QianlaiProject? {
        let projects = projects(for: ledgerId)
        return projects.first { $0.id == selectedProjectId } ?? projects.first
    }

    func select(_ id: String?) {
        selectedProjectId = id
    }

    func loadReport(ledgerId: String, projectId: String) async {
        do {
            report = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/projects/\(projectId)/report"
            )
        } catch {
            report = nil
        }
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
        await load(ledgerId: ledgerId)
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
        await load(ledgerId: ledgerId)
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
        await load(ledgerId: ledgerId)
    }

    func delete(ledgerId: String, _ project: QianlaiProject) async throws {
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(project.id)"
        )
        if selectedProjectId == project.id {
            selectedProjectId = nil
        }
        await load(ledgerId: ledgerId)
    }

    // MARK: - Members

    func addMember(ledgerId: String, projectId: String, userId: String) async throws {
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(projectId)/members",
            body: AddProjectMemberBody(userId: userId)
        )
        await load(ledgerId: ledgerId)
    }

    func removeMember(ledgerId: String, projectId: String, userId: String) async throws {
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(projectId)/members/\(userId)"
        )
        await load(ledgerId: ledgerId)
    }

    func leave(ledgerId: String, projectId: String) async throws {
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/projects/\(projectId)/leave"
        )
        if selectedProjectId == projectId {
            selectedProjectId = nil
        }
        // No auto-reload: callers refresh via `load` (active ledger) or
        // `prefetch` (background ledger) as appropriate.
    }

    /// Creates a project invite code and returns it. Redeemers join as
    /// guests scoped to exactly this project.
    func createInviteCode(ledgerId: String, projectId: String) async throws -> String {
        let code: ShareCode = try await client.request(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/share-codes",
            body: CreateShareCodeBody(
                role: .guest,
                expiresAt: nil,
                maxUses: nil,
                projectId: projectId
            )
        )
        return code.code
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
