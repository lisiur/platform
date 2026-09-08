//
//  PreferenceStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/8.
//

import Foundation
import Observation

/// Server-synced personalization: the bottom-tab arrangement (user scope)
/// and the quick-entry chip layout per ledger / project. Rows live under
/// `bookkeeping/preferences`; a missing scope means "client default", so
/// every read resolves through a fallback chain and a failed load silently
/// keeps the defaults.
@MainActor
@Observable
final class PreferenceStore {
    let client = APIClient.shared

    /// Simultaneously visible configurable tabs — the bar holds dashboard
    /// plus these plus profile (the add pill is the tab bar's own). Capped
    /// at two so the bar never exceeds the system's five-item capacity and
    /// never collapses into the system "More" page.
    static let tabLimits = 1...2

    /// The shipped middle arrangement; also the fallback for invalid or
    /// empty payloads.
    static let defaultTabs: [AppTab] = [.journal, .members]

    /// The bottom bar where the arrangement doesn't apply — a project claims
    /// scope or the ledger is guest: 仪表盘/流水/成员/我的, always.
    static let fixedTabs: [AppTab] = [.dashboard, .journal, .members, .profile]

    /// Whether the current context pins the bar to `fixedTabs`: guests and
    /// project scopes get no tab arrangement — and no customization entry;
    /// the profile gates its link on this same rule.
    static func isTabBarFixed(isGuest: Bool, isProjectScoped: Bool) -> Bool {
        isGuest || isProjectScoped
    }

    private(set) var isLoading = false

    /// User-scope tab arrangement (the configurable middle only); nil means
    /// no config — `visibleTabs` falls back to `defaultTabs`. Internal so
    /// tests can seed state without network.
    var configuredTabs: [AppTab]?

    /// Ledger/project-scope quick-entry chip arrangements. Presence IS the
    /// config — an empty array is meaningful (every field lives in the more
    /// sheet), absence falls back to `.standard`.
    var ledgerChipFields: [String: [QuickEntryField]] = [:]
    var projectChipFields: [String: [QuickEntryField]] = [:]

    // MARK: - Reads

    /// The full tab list: dashboard pinned first, profile pinned last, the
    /// configurable middle from the user's saved arrangement. A fixed
    /// context (guest / project scope) renders `fixedTabs` and ignores the
    /// arrangement entirely.
    func visibleTabs(isGuest: Bool, isProjectScoped: Bool) -> [AppTab] {
        if Self.isTabBarFixed(isGuest: isGuest, isProjectScoped: isProjectScoped) {
            return Self.fixedTabs
        }
        var middle = configuredTabs ?? Self.defaultTabs
        if middle.isEmpty {
            middle = Self.defaultTabs
        }
        return [.dashboard] + middle.prefix(Self.tabLimits.upperBound) + [.profile]
    }

    /// Chip layout for a quick-entry scope: the pinned project's config,
    /// else the ledger's, else `.standard`. A stored (possibly empty) list
    /// always wins over the default.
    func quickEntryLayout(ledgerId: String?, projectId: String?) -> QuickEntryLayout {
        if let projectId, let fields = projectChipFields[projectId] {
            return QuickEntryLayout(chipFields: fields)
        }
        if let ledgerId, let fields = ledgerChipFields[ledgerId] {
            return QuickEntryLayout(chipFields: fields)
        }
        return .standard
    }

    // MARK: - Load

    /// Fetches every scope once per login. Silent failure: the defaults
    /// keep every surface working offline; the next launch retries.
    func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let response: UserPreferencesResponse = try? await client.request(
            "GET", "bookkeeping/preferences"
        ) else {
            return
        }
        apply(response)
    }

    /// Maps the payload onto state. Unknown tab/field raw values (a newer
    /// client's config read here) are dropped rather than failing the whole
    /// decode; what survives is clamped to the current rules. Internal so
    /// tests exercise those rules without network.
    func apply(_ response: UserPreferencesResponse) {
        if let user = response.user {
            let tabs = user.tabs.compactMap(AppTab.init(rawValue:)).filter(\.isConfigurable)
            configuredTabs = Self.tabLimits.contains(tabs.count) ? tabs : nil
        } else {
            configuredTabs = nil
        }
        ledgerChipFields = response.ledgers.mapValues {
            $0.quickEntry.chipFields.compactMap(QuickEntryField.init(rawValue:))
        }
        projectChipFields = response.projects.mapValues {
            $0.quickEntry.chipFields.compactMap(QuickEntryField.init(rawValue:))
        }
    }

    // MARK: - Writes (optimistic; rolled back so the UI never lies)

    func setTabs(_ tabs: [AppTab]) async throws {
        let previous = configuredTabs
        configuredTabs = tabs
        do {
            let _: TabsPreference = try await client.request(
                "PUT", "bookkeeping/preferences/user",
                body: UpdateTabsBody(tabs: tabs)
            )
        } catch {
            configuredTabs = previous
            throw error
        }
    }

    func restoreTabs() async throws {
        let previous = configuredTabs
        configuredTabs = nil
        do {
            let _: PreferenceDeleteResponse = try await client.request(
                "DELETE", "bookkeeping/preferences/user"
            )
        } catch {
            configuredTabs = previous
            throw error
        }
    }

    /// Persists the chip arrangement for the quick-entry scope — the
    /// project when one is pinned, else the ledger.
    func setChipFields(ledgerId: String, projectId: String?, _ fields: [QuickEntryField]) async throws {
        if let projectId {
            let previous = projectChipFields[projectId]
            projectChipFields[projectId] = fields
            do {
                let _: QuickEntryPreference = try await client.request(
                    "PUT", "bookkeeping/preferences/project/\(projectId)",
                    body: UpdateQuickEntryBody(quickEntry: .init(chipFields: fields))
                )
            } catch {
                projectChipFields[projectId] = previous
                throw error
            }
        } else {
            let previous = ledgerChipFields[ledgerId]
            ledgerChipFields[ledgerId] = fields
            do {
                let _: QuickEntryPreference = try await client.request(
                    "PUT", "bookkeeping/preferences/ledger/\(ledgerId)",
                    body: UpdateQuickEntryBody(quickEntry: .init(chipFields: fields))
                )
            } catch {
                ledgerChipFields[ledgerId] = previous
                throw error
            }
        }
    }

    /// Drops the scope's stored arrangement — the next read resolves to
    /// `.standard`.
    func restoreChipFields(ledgerId: String, projectId: String?) async throws {
        if let projectId {
            let previous = projectChipFields[projectId]
            projectChipFields[projectId] = nil
            do {
                let _: PreferenceDeleteResponse = try await client.request(
                    "DELETE", "bookkeeping/preferences/project/\(projectId)"
                )
            } catch {
                projectChipFields[projectId] = previous
                throw error
            }
        } else {
            let previous = ledgerChipFields[ledgerId]
            ledgerChipFields[ledgerId] = nil
            do {
                let _: PreferenceDeleteResponse = try await client.request(
                    "DELETE", "bookkeeping/preferences/ledger/\(ledgerId)"
                )
            } catch {
                ledgerChipFields[ledgerId] = previous
                throw error
            }
        }
    }
}

// MARK: - DTOs

/// GET bookkeeping/preferences — every scope the user has configured.
struct UserPreferencesResponse: Decodable {
    var user: TabsPreference?
    var ledgers: [String: QuickEntryPreference]
    var projects: [String: QuickEntryPreference]
}

/// User-scope payload. Tabs stay strings here so a newer client's raw
/// values decode on an older one (dropped during mapping, never fatal).
struct TabsPreference: Codable, Equatable {
    var tabs: [String]
}

/// Ledger/project-scope payload.
struct QuickEntryPreference: Codable, Equatable {
    var quickEntry: ChipFieldsConfig

    struct ChipFieldsConfig: Codable, Equatable {
        var chipFields: [String]
    }
}

struct UpdateTabsBody: Encodable {
    var tabs: [AppTab]
}

struct UpdateQuickEntryBody: Encodable {
    var quickEntry: ChipFieldsBody

    struct ChipFieldsBody: Encodable {
        var chipFields: [QuickEntryField]
    }
}

struct PreferenceDeleteResponse: Decodable {
    var success: Bool
}
