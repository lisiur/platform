//
//  QuickAddTargetWidget.swift
//  QianlaiWidget
//
//  Created by Lisiur Day on 2026/9/6.
//

import AppIntents
import WidgetKit
import SwiftUI

// MARK: - Entities

/// One configurable quick-add target: a ledger, or a ledger›project pair.
/// Flattened into a single picker because AppIntents has no contextual
/// (parameter-dependent) option queries — the search field handles the
/// combined list. Titles stay plain (project / ledger name); the subtitle
/// carries the context — a guest project credits its owner ("Shared by"),
/// an own project shows its ledger, a bare ledger labels itself.
struct QuickTargetEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: LocalizedStringResource("widget.bound.targetType", defaultValue: "Entry Target")
    )
    static let defaultQuery = QuickTargetQuery()

    /// "ledger:<id>" or "ledger:<id>/project:<projectId>".
    var id: String
    var ledgerId: String
    var ledgerName: String
    var projectId: String?
    var projectName: String?
    /// The hosting ledger's owner — resolved only for guest projects, the
    /// one case where the subtitle credits them.
    var ownerName: String?
    var isGuestLedger: Bool

    init(ledger: QianlaiLedger, project: QianlaiProject? = nil) {
        ledgerId = ledger.id
        ledgerName = ledger.name
        projectId = project?.id
        projectName = project?.name
        isGuestLedger = ledger.isGuest
        if let project {
            id = "ledger:\(ledger.id)/project:\(project.id)"
        } else {
            id = "ledger:\(ledger.id)"
        }
        ownerName = ledger.isGuest
            ? project.flatMap { project in
                project.members.first { $0.userId == ledger.ownerId }?.user?.name
            }
            : nil
    }

    /// Ledger rows carry the switcher's "book" glyph, project rows its
    /// "folder" — the same marks the app uses for the two scopes. A guest's
    /// shared project gets the person-badged folder to set it apart.
    var image: DisplayRepresentation.Image {
        if let projectName {
            return .init(systemName: isGuestLedger ? "folder.badge.person.crop" : "folder")
        }
        return .init(systemName: "book")
    }

    var displayRepresentation: DisplayRepresentation {
        if let projectName {
            // A guest's invited project credits its owner — the hosting
            // ledger's name never appears. An own project simply names its
            // ledger.
            if isGuestLedger {
                if let ownerName {
                    return DisplayRepresentation(
                        title: "\(projectName)",
                        subtitle: "\(L10n.string("widget.bound.sharedByFormat", defaultValue: "Shared by %@", ownerName))",
                        image: image
                    )
                }
                return DisplayRepresentation(title: "\(projectName)", image: image)
            }
            return DisplayRepresentation(title: "\(projectName)", subtitle: "\(ledgerName)", image: image)
        }
        return DisplayRepresentation(title: "\(ledgerName)", image: image)
    }
}

struct QuickTargetQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [QuickTargetEntity] {
        let targets = await Self.allTargets().filter { identifiers.contains($0.id) }
        // Record the resolved target so the category picker can scope
        // itself to it — AppIntents offers no contextual queries.
        if let target = targets.first {
            BoundConfigScratch.targetLedgerId = target.ledgerId
            BoundConfigScratch.targetProjectName = target.projectName
        }
        return targets
    }

    func suggestedEntities() async throws -> [QuickTargetEntity] {
        await Self.allTargets()
    }

    /// Every active ledger as a target, plus each of its active projects as
    /// a ledger›project target — except that a guest's invited ledger never
    /// appears bare: a guest may only post into its projects, so offering
    /// the owner's ledger would both fail and leak its name. Falls back to
    /// the mirrored active ledger when the fetch fails (offline
    /// configuration); empty sends the picker to "no options", the system's
    /// standard misconfiguration handling.
    private static func allTargets() async -> [QuickTargetEntity] {
        let ledgers: [QianlaiLedger]
        do {
            let response: LedgersResponse = try await APIClient.shared.request("GET", "bookkeeping/ledgers")
            ledgers = response.ledgers.filter { $0.isActive }
        } catch {
            guard let mirrored = WidgetDataStore.loadActiveLedger(), mirrored.isActive else { return [] }
            ledgers = [mirrored]
        }
        var targets: [QuickTargetEntity] = []
        for ledger in ledgers {
            if !ledger.isGuest {
                targets.append(QuickTargetEntity(ledger: ledger))
            }
            if let projects = try? await fetchProjects(ledgerId: ledger.id) {
                for project in projects where project.isActive {
                    targets.append(QuickTargetEntity(ledger: ledger, project: project))
                }
            }
        }
        return targets
    }

    private static func fetchProjects(ledgerId: String) async throws -> [QianlaiProject] {
        let response: ProjectsResponse = try await APIClient.shared.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/projects"
        )
        return response.projects
    }
}

/// An optional category binding. Categories are per-ledger (and split by
/// expense/income side), and the picker has no access to the already-picked
/// target — so options list every ledger's categories labeled with the
/// ledger name; the app-side preset ignores a category whose ledger differs
/// from the bound target.
struct QuickCategoryEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: LocalizedStringResource("widget.bound.categoryType", defaultValue: "Category")
    )
    static let defaultQuery = QuickCategoryQuery()

    /// "<ledgerId>:<accountId>".
    var id: String
    var ledgerId: String
    var accountId: String
    var name: String
    /// The entry kind this category posts as — its account side.
    var kind: QuickEntryKind
    var icon: String?
    /// The friendly scope label (picked project, else the ledger) used in
    /// the picker title — never a foreign ledger's name.
    var prefix: String

    init(prefix: String, account: BookAccount, kind: QuickEntryKind) {
        ledgerId = account.ledgerId
        accountId = account.id
        self.kind = kind
        name = account.displayName
        icon = account.icon
        self.prefix = prefix
        id = "\(account.ledgerId):\(account.id)"
    }

    /// Picker label carrying the scope prefix and the category's own emoji.
    var displayTitle: String {
        if let icon, !icon.isEmpty {
            return "\(prefix) › \(icon) \(name)"
        }
        return "\(prefix) › \(name)"
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(displayTitle)")
    }
}

/// Scratch state for the configuration UI, in the shared suite: the target
/// picker records its resolved target here so the category picker (whose
/// query receives no intent context) can scope its list to that ledger and
/// label it with the project name instead of the raw ledger name.
enum BoundConfigScratch {
    private static let targetLedgerKey = "widget.config.targetLedgerId"
    private static let targetProjectNameKey = "widget.config.targetProjectName"

    static var targetLedgerId: String? {
        get { WidgetAppGroup.defaults?.string(forKey: targetLedgerKey) }
        set { WidgetAppGroup.defaults?.set(newValue, forKey: targetLedgerKey) }
    }

    static var targetProjectName: String? {
        get { WidgetAppGroup.defaults?.string(forKey: targetProjectNameKey) }
        set { WidgetAppGroup.defaults?.set(newValue, forKey: targetProjectNameKey) }
    }
}

struct QuickCategoryQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [QuickCategoryEntity] {
        await Self.allCategories().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [QuickCategoryEntity] {
        await Self.allCategories()
    }

    private static func allCategories() async -> [QuickCategoryEntity] {
        let ledgers: [QianlaiLedger]
        do {
            let response: LedgersResponse = try await APIClient.shared.request("GET", "bookkeeping/ledgers")
            ledgers = response.ledgers.filter { $0.isActive }
        } catch {
            guard let mirrored = WidgetDataStore.loadActiveLedger(), mirrored.isActive else { return [] }
            ledgers = [mirrored]
        }
        // Scope to the picked target's ledger when known (the target
        // resolver records it); otherwise default to the mirrored active
        // scope. The label prefix is the friendly scope name — the picked
        // project, falling back to the ledger name (own ledgers only, so
        // no owner-ledger name ever leaks into a guest's picker).
        let mirroredProject = WidgetDataStore.loadScopedProject()
        let scopeLedgerId = BoundConfigScratch.targetLedgerId
            ?? mirroredProject?.ledgerId
            ?? WidgetDataStore.loadActiveLedger()?.id
        let scopeProjectName = BoundConfigScratch.targetProjectName
            ?? (BoundConfigScratch.targetLedgerId == nil ? mirroredProject?.name : nil)
        var categories: [QuickCategoryEntity] = []
        for ledger in ledgers {
            if let scopeLedgerId, ledger.id != scopeLedgerId { continue }
            // Guests post expenses only — their ledgers offer no income
            // bindings, mirroring the app's forced expense kind.
            let kinds: [QuickEntryKind] = ledger.isGuest ? [.expense] : [.expense, .income]
            guard
                let accounts = try? await fetchAccounts(ledgerId: ledger.id)
            else { continue }
            // Leaf nodes only: the app's grid never posts to a parent with
            // sub-categories (tapping one opens the sub-picker), and a
            // parent whose children are all archived counts as a leaf —
            // same pool semantics as `AccountTreeEntry.build`.
            let pool = accounts.filter { !$0.isArchived && !$0.isDefaultPocket }
            let parentIds = Set(pool.compactMap(\.parentId))
            let prefix = scopeProjectName ?? ledger.name
            for account in pool where !parentIds.contains(account.id) {
                guard let kind = kinds.first(where: { $0.rawValue == account.type.rawValue }) else { continue }
                categories.append(QuickCategoryEntity(prefix: prefix, account: account, kind: kind))
            }
        }
        return categories
    }

    private static func fetchAccounts(ledgerId: String) async throws -> [BookAccount] {
        let response: AccountsResponse = try await APIClient.shared.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/accounts"
        )
        return response.accounts
    }
}

// MARK: - Intent + timeline

struct BoundQuickAddIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource =
        LocalizedStringResource("widget.bound.displayName", defaultValue: "Quick Add (Bound)")
    static var description = IntentDescription(
        LocalizedStringResource(
            "widget.bound.description",
            defaultValue: "Bind a ledger or project, and optionally a category."
        )
    )

    @Parameter(title: LocalizedStringResource("widget.bound.targetType", defaultValue: "Entry Target"))
    var target: QuickTargetEntity?

    @Parameter(title: LocalizedStringResource("widget.bound.categoryType", defaultValue: "Category"))
    var category: QuickCategoryEntity?
}

nonisolated struct BoundQuickAddEntry: TimelineEntry {
    let date: Date
    var ledgerId: String? = nil
    var ledgerName: String? = nil
    var projectId: String? = nil
    var projectName: String? = nil
    var targetIsGuest: Bool = false
    var categoryId: String? = nil
    var categoryName: String? = nil
    var categoryIcon: String? = nil
    var categoryKind: QuickEntryKind? = nil

    /// The deep link encoding the full binding; a plain quick-entry link
    /// when nothing is bound.
    var linkURL: URL {
        guard let ledgerId else { return WidgetLinks.quickEntry }
        var components = URLComponents()
        components.scheme = "qianlai"
        components.host = "quick-entry"
        var items = [URLQueryItem(name: "ledger", value: ledgerId)]
        if let projectId { items.append(URLQueryItem(name: "project", value: projectId)) }
        if let categoryId {
            items.append(URLQueryItem(name: "category", value: categoryId))
            if let categoryKind {
                items.append(URLQueryItem(name: "kind", value: categoryKind.rawValue))
            }
        }
        components.queryItems = items
        return components.url ?? WidgetLinks.quickEntry
    }
}

struct BoundQuickAddProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> BoundQuickAddEntry {
        BoundQuickAddEntry(date: Date(), ledgerName: nil)
    }

    func snapshot(for configuration: BoundQuickAddIntent, in context: Context) async -> BoundQuickAddEntry {
        Self.entry(from: configuration)
    }

    func timeline(for configuration: BoundQuickAddIntent, in context: Context) async -> Timeline<BoundQuickAddEntry> {
        // Purely configuration-driven — the system refreshes timelines when
        // the widget is (re)configured; no periodic reload needed.
        Timeline(entries: [Self.entry(from: configuration)], policy: .never)
    }

    private static func entry(from configuration: BoundQuickAddIntent) -> BoundQuickAddEntry {
        BoundQuickAddEntry(
            date: Date(),
            ledgerId: configuration.target?.ledgerId,
            ledgerName: configuration.target?.ledgerName,
            projectId: configuration.target?.projectId,
            projectName: configuration.target?.projectName,
            targetIsGuest: configuration.target?.isGuestLedger ?? false,
            categoryId: configuration.category?.accountId,
            categoryName: configuration.category?.name,
            categoryIcon: configuration.category?.icon,
            categoryKind: configuration.category?.kind
        )
    }
}

// MARK: - View

struct BoundQuickAddEntryView: View {
    let entry: BoundQuickAddEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            scopeHeader
            if let category = entry.categoryName {
                HStack(spacing: 3) {
                    if let icon = entry.categoryIcon, !icon.isEmpty {
                        Text(icon)
                            .font(.caption2)
                    } else {
                        Image(systemName: "tag")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    Text(category)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            }
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 62, height: 62)
                    .background(Circle().fill(Color.accentColor.opacity(0.12)))
                Text(L10n.string("tab.add", defaultValue: "Add"))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) {
            Color(.systemBackground)
        }
        .widgetURL(entry.linkURL)
    }

    @ViewBuilder
    private var scopeHeader: some View {
        if let projectName = entry.projectName {
            HStack(spacing: 3) {
                Image(systemName: entry.targetIsGuest ? "folder.badge.person.crop" : "folder")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Text(projectName)
                    .font(.caption.weight(.semibold))
            }
        } else if let ledgerName = entry.ledgerName {
            Text(ledgerName)
                .font(.caption.weight(.semibold))
        } else {
            Text(defaultScopeName)
                .font(.caption.weight(.semibold))
        }
    }

    private var defaultScopeName: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String) ?? "Qianlai"
    }
}

struct BoundQuickAddWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "QianlaiBoundQuickAdd",
            intent: BoundQuickAddIntent.self,
            provider: BoundQuickAddProvider()
        ) { entry in
            BoundQuickAddEntryView(entry: entry)
        }
        .configurationDisplayName(
            LocalizedStringResource("widget.bound.displayName", defaultValue: "Quick Add (Bound)")
        )
        .description(
            LocalizedStringResource(
                "widget.bound.description",
                defaultValue: "Bind a ledger or project, and optionally a category."
            )
        )
        .supportedFamilies([.systemSmall])
    }
}
