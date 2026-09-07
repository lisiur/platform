//
//  QuickEntryView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// One-click income/expense/transfer entry: pick a scenario, two accounts,
/// and a single amount — the draft expands into the balanced two-line double
/// entry the API expects. Pass an `entry` to edit it instead: every field is
/// prefilled and saving issues a full replace of the entry.
/// The parsed query items of a bound widget's deep link
/// (`qianlai://quick-entry?ledger=…&project=…&category=…&kind=…`), before
/// the ledger is resolved against the loaded ledger list.
struct QuickEntryPreset: Equatable {
    var ledgerId: String
    var projectId: String?
    var categoryId: String?
    var kind: QuickEntryKind?

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        var items: [String: String] = [:]
        for item in components.queryItems ?? [] where item.value != nil {
            items[item.name] = item.value
        }
        guard let ledgerId = items["ledger"], !ledgerId.isEmpty else { return nil }
        self.ledgerId = ledgerId
        projectId = items["project"]
        categoryId = items["category"]
        kind = items["kind"].flatMap(QuickEntryKind.init(rawValue:))
    }
}

/// A bound widget's recording target: its own ledger (never the app's
/// active one) plus optional project/category/kind prefill, parsed from the
/// deep link and resolved against the loaded ledger list. The sheet reads
/// everything it needs from here — the global active-ledger scope is never
/// consulted, let alone changed.
struct QuickEntryBinding: Equatable {
    var ledger: QianlaiLedger
    var projectId: String?
    var categoryId: String?
    var kind: QuickEntryKind?

    init(
        ledger: QianlaiLedger,
        projectId: String? = nil,
        categoryId: String? = nil,
        kind: QuickEntryKind? = nil
    ) {
        self.ledger = ledger
        self.projectId = projectId
        self.categoryId = categoryId
        self.kind = kind
    }

    /// Parses a bound widget's deep link and resolves its ledger from the
    /// loaded ledger list; nil when the link carries no ledger (plain quick
    /// add) or the ledger no longer exists.
    init?(url: URL, ledgers: [QianlaiLedger]) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        var items: [String: String] = [:]
        for item in components.queryItems ?? [] where item.value != nil {
            items[item.name] = item.value
        }
        guard let ledgerId = items["ledger"], !ledgerId.isEmpty,
              let ledger = ledgers.first(where: { $0.id == ledgerId })
        else { return nil }
        self.ledger = ledger
        projectId = items["project"]
        categoryId = items["category"]
        kind = items["kind"].flatMap(QuickEntryKind.init(rawValue:))
    }
}

struct QuickEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast
    @Environment(JournalStore.self) private var journalStore
    @Environment(ReportStore.self) private var reportStore
    @Environment(AuthManager.self) private var auth
    /// In-app language override for date formatting (`quickTimeValue`).
    @Environment(\.locale) private var locale
    private let editedEntry: JournalEntry?
    /// The bound widget's target; nil for pill/tab presentations, which
    /// follow the app's active-ledger scope.
    private let binding: QuickEntryBinding?
    @State private var draft: QuickEntryDraft

    /// The ledger this sheet records into: the bound target for widget
    /// presentations, the app's active ledger otherwise. Everything in the
    /// sheet — guest rules, currency, pickers, posting — reads this, so a
    /// bound sheet never touches the global scope.
    private var ledger: QianlaiLedger? {
        binding?.ledger ?? ledgerStore.activeLedger
    }

    /// Bound sheets post through a private journal so the shared root store
    /// (which targets the app's active ledger) never sees a foreign ledger —
    /// EXCEPT when the bound target is the ledger the root journal is
    /// already serving: posting through the root there is what makes the
    /// 流水 page update reactively.
    @State private var boundJournalStore = JournalStore()
    private var postingJournal: JournalStore {
        if let binding, journalStore.ledgerId == binding.ledger.id {
            return journalStore
        }
        return binding == nil ? journalStore : boundJournalStore
    }
    /// The calculator engine doubles as the amount field: the inline
    /// `CalculatorView` — display and keypad as one unit — mutates it
    /// through a binding, so every edit applies immediately.
    @State private var engine: CalculatorEngine
    @State private var isParticipantsPresented = false
    @State private var activeAccountSide: AccountSide?
    /// Set by the save guards and posting failures; renders as an alert —
    /// an inline row can sit under the keyboard or below the fold — and
    /// clears when the alert is dismissed.
    @State private var validationError: String?
    @State private var isPosting = false
    /// Place chosen on the location picker map; its result is copied into
    /// the draft.
    @State private var isLocationPickerPresented = false
    /// Memo editor sheet behind the quick bar's memo chip; binds the draft
    /// live so Done just dismisses.
    @State private var isMemoPresented = false
    @FocusState private var isMemoFieldFocused: Bool
    /// The chip bar / more-sheet arrangement for the row fields. Ships
    /// `.standard`; the later customization UI replaces this in place.
    @State private var layout: QuickEntryLayout = .standard
    /// More-fields sheet behind the quick bar's trailing button: hosts
    /// every field the layout keeps out of the chip row.
    @State private var isMoreFieldsPresented = false
    /// Categories manage sheet behind the grid's trailing gear chip —
    /// the shared collapsible CategoriesView.
    @State private var isCategoryManagePresented = false
    /// Expanded inline date-and-time picker under the collapsed row.
    @State private var isDateTimePresented = false
    /// Parent category whose sub-picker bubble is open — keyed by the
    /// tapped grid chip so the popover anchors to it.
    @State private var popupParent: AccountTreeEntry?
    /// Drill-down path inside the open bubble: each entry is a category
    /// whose subs are being shown; empty shows the anchor chip's subs.
    @State private var popupStack: [AccountTreeEntry] = []
    /// Ledger the scoped stores were last loaded for — lets the task tell
    /// the initial load apart from a switcher tap inside the sheet.
    @State private var loadedLedgerId: String?

    /// Editing seeds every field from the entry; creating starts blank,
    /// optionally prefilled from the bound widget's binding.
    init(entry: JournalEntry? = nil, binding: QuickEntryBinding? = nil) {
        editedEntry = entry
        self.binding = binding
        var seed = entry.map { QuickEntryDraft(entry: $0) } ?? QuickEntryDraft()
        if let binding {
            if let kind = binding.kind { seed.kind = kind }
            if let projectId = binding.projectId { seed.projectId = projectId }
            if let categoryId = binding.categoryId, let kind = binding.kind {
                switch kind {
                case .expense: seed.debitAccountId = categoryId
                case .income: seed.creditAccountId = categoryId
                case .transfer: break
                }
            }
        }
        _draft = State(initialValue: seed)
        // No grouping separator so post()'s Double parsing round-trips.
        _engine = State(initialValue: CalculatorEngine(initialText: entry.map { String(format: "%.2f", $0.amount) } ?? ""))
    }

    @State private var accountStore = AccountStore()
    @State private var memberStore = MemberStore()
    /// The app-level project store: owns the ledger switcher's scope and the
    /// per-ledger cache this sheet's picker reads. A project scoped there
    /// pins new entries to itself. (A local fetching instance here used to
    /// refetch the same list the switcher had just loaded.)
    @Environment(ProjectStore.self) private var appProjectStore

    /// Whether the viewer is a guest on this ledger — restricts to expense
    /// entries inside their projects (kind picker and pay-side account row
    /// are hidden, project assignment is mandatory).
    private var isGuest: Bool {
        ledger?.isGuest ?? false
    }

    /// Projects of the recording ledger, from the app-level per-ledger
    /// cache — kept warm by the ledger switcher's own load (bound sheets
    /// fill it via the cache-only prefetch).
    private var ledgerProjects: [QianlaiProject] {
        guard let ledger else { return [] }
        return appProjectStore.projects(for: ledger.id)
    }

    /// The project currently claiming scope in the ledger switcher — an
    /// explicit selection for any role, the auto-picked first project for
    /// guests. Non-nil fixes new entries to it in place of the picker.
    /// Bound sheets never follow the global scope: their project is the
    /// binding's.
    private var scopedProject: QianlaiProject? {
        guard binding == nil, let ledger = ledger else { return nil }
        return appProjectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest)
    }

    /// Who can be tagged on this entry. When the entry targets a project
    /// (mandatory for guests), only that project's members are eligible —
    /// selection and the posted `participantUserIds` are keyed by userId
    /// (the API tags participants by user, not by ledger membership).
    /// Personal entries fall back to the whole ledger roster.
    private var participantCandidates: [LedgerMember] {
        if let projectId = draft.projectId,
           let project = ledgerProjects.first(where: { $0.id == projectId }) {
            let memberUserIds = Set(project.members.map(\.userId))
            return memberStore.members.filter { memberUserIds.contains($0.userId) }
        }
        return memberStore.members
    }

    /// Who can be named as the payer: any ledger member — the recorder is
    /// not always the person who fronted the money. Ledger-wide, unlike the
    /// participant set: someone outside the picked project can still have
    /// paid for it.
    private var payerCandidates: [LedgerMember] {
        memberStore.members
    }

    /// When editing, the entry's stored payer may no longer be a member
    /// (they left the ledger after posting). The server keeps a resubmitted
    /// historical payer, so the picker must still list them — without a tag
    /// matching the draft's selection it would render blank.
    private var historicalPayer: (id: String, label: String)? {
        guard let entry = editedEntry,
              let paidById = entry.paidById,
              !payerCandidates.contains(where: { $0.userId == paidById })
        else { return nil }
        let name = entry.paidBy?.name ?? paidById
        return (
            paidById,
            String(
                format: L10n.string(
                    "quick.paidByFormerMember",
                    defaultValue: "%@ (no longer a member)"
                ),
                name
            )
        )
    }

    /// Which side's account picker the sheet is showing — one presentation
    /// state serves both fields.
    private enum AccountSide: String, Identifiable {
        case debit, credit

        var id: String { rawValue }
    }

    var body: some View {
        // Zero spacing: the form and the calculator must sit flush, or the
        // grouped canvas would peek through as a strip between the form's
        // canvas and the calculator's top border.
        VStack(spacing: 0) {
            // Guests are scoped to expense-only entries; the kind picker is
            // hidden and `draft.kind` stays at its default (`.expense`).
            if !isGuest {
                // Pinned above the form: grouped lists reserve a built-in
                // top margin for the first section that no public config
                // removes, so the tabs live outside the form — flush under
                // the title.
                Picker(L10n.string("quick.accountType", defaultValue: "Account Type"), selection: $draft.kind) {
                    ForEach(QuickEntryKind.allCases) { kind in
                        Text(kind.label).tag(kind)
                    }
                }
                .pickerStyle(.segmented)
                .controlSize(.regular)
                .padding(.horizontal, 16)
                // Breathing gap to the form below (the VStack spacing is
                // zero so the form meets the calculator flush).
                .padding(.bottom, 8)
                .onChange(of: draft.kind) {
                    // Both sides restart unselected when the scenario
                    // changes.
                    draft.debitAccountId = nil
                    draft.creditAccountId = nil
                    validationError = nil
                    applyExpenseCategoryDefault()
                }
            }

            // The category grid is the only always-visible form surface;
            // every row field lives in the quick bar's chips or the more
            // sheet behind them, per the layout — except the transfer's
            // pockets, which are the kind's essential fields (no category
            // grid) and get a fixed section.
            Form {
                categorySection

                if draft.kind == .transfer {
                    transferAccountsSection
                }
            }
            // Zeroing the top content margin drops the grouped style's
            // built-in first-section inset, so the grid sits flush under
            // the tabs.
            .compactListSectionSpacing()
            .contentMargins(.top, 12, for: .scrollContent)

            // The pinned chip bar above the calculator: chips for the
            // layout's chip fields, the more button fixed at the trailing
            // edge opening a sheet with everything else.
            quickFieldsBar

            // Pinned calculator between the form and the sheet's bottom
            // edge: display and keypad combined, always visible, so the
            // amount is typed and adjusted without presenting anything.
            // The pad's check key posts the entry — the sheet's only save
            // control, spinner while posting. The display paints a card
            // matching the form's sections; the pad itself stays
            // transparent on the canvas.
            CalculatorView(
                engine: $engine,
                currency: ledger?.currency,
                onCommit: { Task { await save() } },
                isCommitDisabled: isPosting || draft.isSameAccount,
                isCommitting: isPosting
            )
        }
        // The whole sheet sits on the form's grouped canvas: the keypad is
        // transparent, so without this it would read as a plain-white
        // panel against the form's gray in light mode. On the shared
        // canvas the display card and keys float on the same surface the
        // form scrolls on, and the segmented control's translucent chrome
        // picks the canvas up too.
        .background(Color.groupedCanvas)
        // Opt out of keyboard avoidance: focusing the memo field must not
        // shrink this layout or shove the pinned calculator above the
        // keyboard — the whole stack stays exactly where it is and the
        // keyboard just slides over the lower half.
        .ignoresSafeArea(.keyboard, edges: .bottom)
        // Disables the form and its fields only — attached before the
        // toolbar so Cancel and the ledger switcher stay usable on a
        // read-only ledger (switching away is the escape hatch there).
        .disabled(!canPost)
        .navigationTitle(Text(navigationTitleText))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.string("common.cancel", defaultValue: "Cancel")) { dismiss() }
            }
            // The trailing slot is the ledger switcher, not a save button:
            // the entry's target ledger is picked here while the
            // calculator's check key does the posting. Bound sheets hide it
            // — their target is fixed by the widget configuration — and
            // show a read-only scope label instead.
            ToolbarItem(placement: .confirmationAction) {
                if binding == nil {
                    LedgerSwitcherMenu()
                } else {
                    boundScopeLabel
                }
            }
        }
        .sheet(item: $activeAccountSide) { side in
            NavigationStack {
                AccountSelectionView(
                    title: side == .debit ? debitLabel : creditLabel,
                    entries: side == .debit ? debitEntries : creditEntries,
                    allowsEmpty: side == .debit
                        ? draft.kind == .income
                        : draft.kind == .expense,
                    // Category parents with subs commit nothing in the
                    // sheet — only leaves are pickable, matching the grid.
                    parentSelectable: side != categorySide,
                    selection: side == .debit
                        ? $draft.debitAccountId
                        : $draft.creditAccountId
                )
            }
            #if os(iOS)
            .presentationDetents([.medium, .large])
            #endif
        }
        .sheet(isPresented: $isParticipantsPresented) {
            ParticipantSelectionView(
                members: participantCandidates,
                selection: $draft.participants
            )
        }
        .sheet(isPresented: $isLocationPickerPresented) {
            LocationPickerSheet(initialLocation: draft.location) { place in
                draft.location = place
                draft.isLocationCleared = false
            }
        }
        // Memo editor sheet behind the quick bar's memo chip: binds the
        // draft live, Done just dismisses — the same pattern as the
        // date-time sheet.
        .sheet(isPresented: $isMemoPresented) {
            NavigationStack {
                Form {
                    TextField(
                        L10n.string("quick.memoPlaceholder", defaultValue: "e.g. weekly groceries"),
                        text: $draft.memo,
                        axis: .vertical
                    )
                    .submitLabel(.done)
                    .onSubmit { isMemoFieldFocused = false }
                    .focused($isMemoFieldFocused)
                }
                .navigationTitle(Text(L10n.string("quick.memo", defaultValue: "Memo")))
                .inlineNavigationBarTitle()
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(L10n.string("common.done", defaultValue: "Done")) { isMemoPresented = false }
                    }
                }
                .task { isMemoFieldFocused = true }
            }
            #if os(iOS)
            .presentationDetents([.medium])
            #endif
        }
        // More-fields sheet behind the quick bar's trailing button: the
        // layout's non-chip fields as one form.
        .sheet(isPresented: $isMoreFieldsPresented) {
            NavigationStack {
                Form {
                    moreFieldsSection
                }
                .navigationTitle(Text(L10n.string("quick.more.title", defaultValue: "More")))
                .inlineNavigationBarTitle()
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(L10n.string("common.done", defaultValue: "Done")) { isMoreFieldsPresented = false }
                    }
                }
            }
            #if os(iOS)
            .presentationDetents([.medium, .large])
            #endif
        }
        // Categories manage sheet behind the grid's gear chip: the shared
        // collapsible CategoriesView (expense/income tabs, tree list) in a
        // modal stack — Done dismisses back to the grid.
        .sheet(isPresented: $isCategoryManagePresented) {
            NavigationStack {
                CategoriesView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button(L10n.string("common.done", defaultValue: "Done")) { isCategoryManagePresented = false }
                        }
                    }
            }
            #if os(iOS)
            .presentationDetents([.large])
            #endif
        }
        // Returning from the manage sheet: reload categories so creations,
        // renames, archives, and deletions there reach the grid — the
        // .task above only reloads on ledger changes.
        .onChange(of: isCategoryManagePresented) {
            guard !isCategoryManagePresented else { return }
            Task { await accountStore.reload() }
        }
        // Popup date-and-time picker: binds the draft live, Done just
        // dismisses. The default detent sits a bit above medium so the
        // calendar and time wheel fit without clipping the wheel's bottom.
        .sheet(isPresented: $isDateTimePresented) {
            NavigationStack {
                ScrollView {
                    DatePicker(
                        L10n.string("common.date", defaultValue: "Date"),
                        selection: $draft.date,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                .navigationTitle(Text(dateTimeLabel))
                .inlineNavigationBarTitle()
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(L10n.string("common.done", defaultValue: "Done")) { isDateTimePresented = false }
                    }
                }
            }
            #if os(iOS)
            .presentationDetents([.fraction(0.65), .large])
            #endif
        }
        // Save guards and posting failures surface here instead of an
        // inline form row: the keyboard and the pinned calculator cover
        // the form's lower half, so an inline error can go unseen.
        .alert(
            L10n.string("quick.cannotSaveTitle", defaultValue: "Can't Save Entry"),
            isPresented: Binding(
                get: { validationError != nil },
                set: { if !$0 { validationError = nil } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {}
        } message: {
            Text(validationError ?? "")
        }
        .overlay {
            if !canPost {
                ContentUnavailableView(
                    L10n.string("quick.readOnlyLedger", defaultValue: "Read-only ledger"),
                    systemImage: "lock",
                    description: Text(L10n.string("journal.editorRequired", defaultValue: "Editor access or higher is required to post entries."))
                )
            }
        }
        // Keyed by the recording ledger — the binding's own for bound
        // sheets (constant), the active ledger otherwise, so a switcher tap
        // inside the sheet reloads the ledger-scoped stores for the target.
        .task(id: ledger?.id) {
            guard let ledger = self.ledger else { return }
            if loadedLedgerId != ledger.id {
                loadedLedgerId = ledger.id
                // A bound sheet never switches ledgers, so its seeded
                // binding always survives.
                if editedEntry == nil && binding == nil {
                    // Account, member, and project ids are all
                    // ledger-scoped, so a fresh add drops the previous
                    // ledger's selections; the defaults below re-apply
                    // against the new ledger's data. Edits keep their
                    // draft — the server rejects a cross-ledger update
                    // and the error surfaces in `validationError`.
                    if ledger.isGuest {
                        // Guest ledgers hide the kind picker and are
                        // expense-only, so the kind is forced too — a
                        // kind picked on the previous ledger would
                        // otherwise stick with no way to change it.
                        draft.kind = .expense
                    }
                    draft.debitAccountId = nil
                    draft.creditAccountId = nil
                    draft.participants = []
                    // paidByUserId stays nil: the server defaults the payer
                    // to the recorder, and the picker's binding displays the
                    // signed-in user for a nil draft value.
                    draft.projectId = nil
                    draft.countsInLedger = true
                    draft.location = nil
                    draft.isLocationCleared = false
                    validationError = nil
                }
            }
            await accountStore.load(ledgerId: ledger.id)
            await memberStore.load(ledgerId: ledger.id, myUserId: nil)
            // The sheet posts through (and prefills categories from) the
            // root JournalStore — this task is what targets it at the
            // active ledger, so posting works without ever visiting the
            // Journal tab. The load dedupes against the tab's own.
            // Bound sheets fill the project cache without claiming scope;
            // unbound ones already have it warm from the switcher.
            if binding != nil {
                await appProjectStore.prefetch(ledgerId: ledger.id)
            }
            await postingJournal.load(ledgerId: ledger.id)
            applyExpenseCategoryDefault()
            applyGuestProjectDefault()
            applyScopedProjectDefault()
            applyBinding()
        }
        // The switcher inside this sheet can change the scope mid-edit:
        // follow it so a pinned entry never outlives its scope, and an
        // unscoped sheet picks the scope up as soon as one is claimed.
        .onChange(of: scopedProject?.id) {
            applyScopedProjectDefault()
        }
    }

    /// The kind's category side as an icon grid — the common path for
    /// picking a category, replacing the old form row. A "recently used"
    /// capsule row leads (fed by `RecentCategoryStore`, so it survives
    /// restarts), the grid shows the tree's top-level categories (tapping
    /// one with subs opens an inline bubble listing them), and a trailing
    /// "More" chip opens the hierarchical picker sheet for long-tail
    /// categories. Transfer has no category side and shows nothing.
    @ViewBuilder
    private var categorySection: some View {
        if let side = categorySide {
            Section {
                if !recentCategoryEntries.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(L10n.string("quick.categories.recent", defaultValue: "Recent"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(recentCategoryEntries) { entry in
                                    recentCategoryChip(entry)
                                }
                            }
                        }
                    }
                    // The category area sits directly on the canvas — no
                    // grouped card behind it.
                    .listRowBackground(Color.clear)
                }

                LazyVGrid(
                    // Five tight columns: more categories per row without
                    // crowding the 44pt icon circles.
                    columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5),
                    spacing: 10
                ) {
                    ForEach(categoryEntries) { entry in
                        categoryChip(entry)
                    }
                    moreChip(side: side)
                    // Owner/editor on the recording ledger only — guests
                    // (and viewers) never see it. Bound sheets hide it too:
                    // the manage screen follows the app's active ledger,
                    // which a widget-bound sheet may not be recording into.
                    if binding == nil, canPost {
                        categoryManageChip
                    }
                }
                .listRowBackground(Color.clear)
            }
        }
    }

    /// Icon-over-name grid cell: a tinted circle carries the category's
    /// emoji (or a fallback glyph when it has none); the picked category's
    /// circle fills with the accent color. A category with subs carries a
    /// little ellipsis badge on the circle's bottom-right and opens an
    /// inline sub-picker bubble instead of selecting directly.
    private func categoryChip(_ entry: AccountTreeEntry) -> some View {
        let subs = subCategories(of: entry)
        let isSelected = categorySelection.wrappedValue == entry.id
        let subPath = selectedSubPath(under: entry)
        return Button {
            if subs.isEmpty {
                selectCategory(entry.id)
            } else {
                popupParent = entry
                popupStack = []
            }
        } label: {
            if let subPath, let leaf = subPath.last {
                // A picked sub surfaces on its top-level chip in the
                // selected state: the sub's icon and a "<parent>-<sub>"
                // breadcrumb name.
                categoryCellLabel(
                    entry,
                    isSelected: true,
                    hasSubs: !subs.isEmpty,
                    icon: leaf.account.icon,
                    name: ([entry.account.displayName] + subPath.map(\.account.displayName))
                        .joined(separator: "-")
                )
            } else {
                categoryCellLabel(entry, isSelected: isSelected, hasSubs: !subs.isEmpty)
            }
        }
        .buttonStyle(.plain)
        // Only the tapped parent's binding flips true, so exactly one
        // presentation exists and the bubble anchors to its chip. The
        // arrow tip targets the chip's bottom edge while the top arrow
        // edge hangs the bubble body below the chip.
        .popover(
            isPresented: Binding(
                get: { popupParent?.id == entry.id },
                set: { if !$0 { popupParent = nil; popupStack = [] } }
            ),
            attachmentAnchor: .point(.bottom),
            arrowEdge: .top
        ) {
            categoryPopup(for: entry)
        }
    }

    /// The grid cell's visuals, shared by the main grid and the bubble's
    /// sub grid so both levels read identically. `icon`/`name` override the
    /// category's own when a chip borrows its selected sub's identity.
    private func categoryCellLabel(
        _ entry: AccountTreeEntry,
        isSelected: Bool,
        hasSubs: Bool,
        icon: String? = nil,
        name: String? = nil
    ) -> some View {
        let displayIcon = icon ?? entry.account.icon
        let displayName = name ?? entry.account.displayName
        return VStack(spacing: 6) {
            categoryIcon(displayIcon, diameter: 44, isSelected: isSelected)
                .overlay(alignment: .bottomTrailing) {
                    if hasSubs {
                        subIndicatorBadge
                            .offset(x: 4, y: 3)
                    }
                }
            Text(displayName)
                .font(.caption)
                .foregroundStyle(isSelected ? Color.accentColor : Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }

    /// The little ellipsis badge marking a category that has subs.
    private var subIndicatorBadge: some View {
        Image(systemName: "ellipsis")
            .font(.system(size: 8, weight: .black))
            .foregroundStyle(.secondary)
            .frame(width: 15, height: 15)
            .background(Circle().fill(Color.cardSurface))
            .overlay(Circle().strokeBorder(.black.opacity(0.1)))
    }

    /// Inline bubble anchored to the tapped chip, rendered as a mini grid
    /// matching the main one. Only leaves are selectable: a sub with its
    /// own subs drills into the next level (with a back row), keeping the
    /// no-parent-selection rule at every depth.
    private func categoryPopup(for parent: AccountTreeEntry) -> some View {
        let node = popupStack.last ?? parent
        let rows = subCategories(of: node)
        let selection = categorySelection.wrappedValue
        let gridRows = (rows.count + 2) / 3
        let backRowHeight: CGFloat = popupStack.isEmpty ? 0 : 32
        return VStack(spacing: 0) {
            if !popupStack.isEmpty {
                popupBackRow(for: node)
            }
            ScrollView {
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3),
                    spacing: 12
                ) {
                    ForEach(rows) { entry in
                        popupCell(entry, isSelected: selection == entry.id)
                    }
                }
                .padding(8)
            }
        }
        .frame(
            width: 240,
            height: min(CGFloat(gridRows) * 77 + 16 + backRowHeight, 330)
        )
        #if os(iOS)
        .presentationCompactAdaptation(.popover)
        #endif
    }

    /// A sub grid cell: leaves select and close the bubble; deeper parents
    /// drill in.
    private func popupCell(_ entry: AccountTreeEntry, isSelected: Bool) -> some View {
        let subs = subCategories(of: entry)
        return Button {
            if subs.isEmpty {
                selectCategory(entry.id)
                popupParent = nil
                popupStack = []
            } else {
                popupStack.append(entry)
            }
        } label: {
            categoryCellLabel(entry, isSelected: isSelected, hasSubs: !subs.isEmpty)
        }
        .buttonStyle(.plain)
    }

    /// Back row shown once the bubble has drilled below the anchor chip.
    private func popupBackRow(for node: AccountTreeEntry) -> some View {
        Button {
            popupStack.removeLast()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.left")
                    .font(.footnote.weight(.semibold))
                Text(node.account.displayName)
                    .font(.footnote)
                    .lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
    }

    /// Compact icon+name capsule for the recents row.
    private func recentCategoryChip(_ entry: AccountTreeEntry) -> some View {
        let isSelected = categorySelection.wrappedValue == entry.id
        return Button {
            selectCategory(entry.id)
        } label: {
            HStack(spacing: 6) {
                if let icon = entry.account.icon, !icon.isEmpty {
                    Text(icon).font(.footnote)
                }
                Text(entry.account.displayName)
                    .font(.footnote)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(
                    isSelected ? Color.accentColor.opacity(0.15) : Color.primary.opacity(0.06)
                )
            )
            .foregroundStyle(isSelected ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.primary))
        }
        .buttonStyle(.plain)
    }

    /// Opens the hierarchical picker sheet — the grid shows the whole tree
    /// flattened, but the sheet keeps fold states and search.
    private func moreChip(side: AccountSide) -> some View {
        Button {
            activeAccountSide = side
        } label: {
            VStack(spacing: 6) {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 22))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.primary.opacity(0.06)))
                    .foregroundStyle(.secondary)
                Text(L10n.string("quick.categories.more", defaultValue: "More"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Grid-trailing gear chip, styled like the more chip beside it:
    /// opens the categories manage sheet.
    private var categoryManageChip: some View {
        Button {
            isCategoryManagePresented = true
        } label: {
            VStack(spacing: 6) {
                Image(systemName: "gearshape")
                    .font(.system(size: 22))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.primary.opacity(0.06)))
                    .foregroundStyle(.secondary)
                Text(L10n.string("quick.categories.manage", defaultValue: "Manage"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func categoryIcon(
        _ icon: String?,
        diameter: CGFloat,
        isSelected: Bool
    ) -> some View {
        Group {
            if let icon, !icon.isEmpty {
                Text(icon).font(.system(size: diameter * 0.5))
            } else {
                Image(systemName: "tag")
                    .font(.system(size: diameter * 0.4))
                    .foregroundStyle(isSelected ? AnyShapeStyle(.white) : AnyShapeStyle(.secondary))
            }
        }
        .frame(width: diameter, height: diameter)
        .background(
            Circle().fill(isSelected ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(Color.primary.opacity(0.06)))
        )
    }

    /// Transfer's from/to pockets as a fixed form section — the kind has
    /// no category grid, so these two rows are the main screen's
    /// essential fields, always visible rather than chip-bar material.
    /// The same-account warning rides here, next to the rows it
    /// invalidates (the ✓ key is disabled while it shows).
    @ViewBuilder
    private var transferAccountsSection: some View {
        Section {
            accountRow(
                title: creditLabel,
                side: .credit,
                selection: $draft.creditAccountId,
                entries: creditEntries
            )
            accountRow(
                title: debitLabel,
                side: .debit,
                selection: $draft.debitAccountId,
                entries: debitEntries
            )
            if draft.isSameAccount {
                Label(
                    L10n.string("quick.sameAccountError", defaultValue: "The transfer's origin and destination can't be the same account."),
                    systemImage: "exclamationmark.triangle"
                )
                .font(.caption)
                .foregroundStyle(.orange)
            }
        }
    }

    /// Horizontally scrollable chip row pinned above the calculator, with
    /// the more button fixed at the trailing edge. The layout decides
    /// which fields render as chips here and which wait in the more
    /// sheet's form behind the button. Some fields hide contextually:
    /// guests get no account chip (their pay side falls back to the
    /// ledger's default pocket on the server) and the participants chip
    /// hides when no candidates exist.
    private var quickFieldsBar: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(layout.chipFields) { field in
                        chip(for: field)
                    }
                }
                .padding(.leading, 16)
            }
            // iOS 26 paints an automatic edge-effect strip at the trailing
            // edge once the chips overflow — tinted with the page
            // background, it reads as a fixed background block around the
            // more button. Zero trailing gap too: chips scroll right up to
            // the button's edge instead of vanishing short of it.
            .scrollEdgeEffectHidden(true, for: .trailing)
            moreFieldsButton
                .padding(.leading, 4)
                .padding(.trailing, 16)
        }
        .padding(.top, 6)
    }

    /// The fixed trailing control of the bar: opens the more sheet with
    /// the fields the layout keeps out of the chip row. Bare icon — no
    /// capsule chrome, unlike the scrolling chips.
    private var moreFieldsButton: some View {
        Button {
            isMoreFieldsPresented = true
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
                .padding(.vertical, 6)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(L10n.string("quick.more.title", defaultValue: "More")))
    }

    /// The chip rendering for one layout field. Chip builders exist for
    /// the standard chip set; a field without a chip builder renders
    /// nothing here, so a future user-arranged layout sticks to the
    /// chip-capable fields until builders are added.
    @ViewBuilder
    private func chip(for field: QuickEntryField) -> some View {
        switch field {
        case .account:
            if !isGuest {
                switch draft.kind {
                case .expense:
                    accountChip(
                        title: creditLabel,
                        side: .credit,
                        selected: draft.creditAccountId,
                        entries: creditEntries
                    )
                case .income:
                    accountChip(
                        title: debitLabel,
                        side: .debit,
                        selected: draft.debitAccountId,
                        entries: debitEntries
                    )
                case .transfer:
                    // The transfer's pockets render as the fixed form
                    // section on the main screen, not as chips.
                    EmptyView()
                }
            }
        case .memo:
            quickChip(systemImage: "square.and.pencil", value: memoChipValue) {
                isMemoPresented = true
            }
        case .time:
            quickChip(systemImage: "clock", value: quickTimeValue) {
                isDateTimePresented = true
            }
        case .participants:
            if !participantCandidates.isEmpty {
                quickChip(systemImage: "person.2", value: participantSummary) {
                    isParticipantsPresented = true
                }
            }
        case .location:
            locationChip
        case .paidBy, .project, .countsInLedger:
            EmptyView()
        }
    }

    /// The more sheet's form: one row per field the layout keeps out of
    /// the chip bar, in canonical order.
    private var moreFieldsSection: some View {
        Section {
            ForEach(layout.moreFields) { field in
                row(for: field)
            }
        }
    }

    /// The form-row rendering for one layout field — every arrangeable
    /// field has one, so any layout arrangement stays renderable.
    @ViewBuilder
    private func row(for field: QuickEntryField) -> some View {
        switch field {
        case .account:
            // Guests are expense-only and their pay side falls back to the
            // ledger's default pocket on the server, so they get no
            // account row.
            if !isGuest {
                switch draft.kind {
                case .expense:
                    accountRow(
                        title: creditLabel,
                        side: .credit,
                        selection: $draft.creditAccountId,
                        entries: creditEntries
                    )
                case .income:
                    accountRow(
                        title: debitLabel,
                        side: .debit,
                        selection: $draft.debitAccountId,
                        entries: debitEntries
                    )
                case .transfer:
                    // The transfer's pockets render as the fixed form
                    // section on the main screen — not repeated here.
                    EmptyView()
                }
            }
        case .memo:
            LabeledContent(L10n.string("quick.memo", defaultValue: "Memo")) {
                TextField(L10n.string("quick.memoPlaceholder", defaultValue: "e.g. weekly groceries"), text: $draft.memo)
                    .multilineTextAlignment(.trailing)
                    .submitLabel(.done)
                    .onSubmit { dismissKeyboard() }
            }
        case .time:
            Button {
                isDateTimePresented = true
            } label: {
                LabeledContent {
                    HStack(spacing: 8) {
                        Text(quickTimeValue)
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                } label: {
                    Text(L10n.string("common.date", defaultValue: "Date"))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        case .participants:
            Button {
                isParticipantsPresented = true
            } label: {
                LabeledContent {
                    HStack(spacing: 8) {
                        Text(participantSummary)
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                } label: {
                    Text(L10n.string("quick.participants", defaultValue: "Participants"))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        case .location:
            Button {
                isLocationPickerPresented = true
            } label: {
                LabeledContent {
                    HStack(spacing: 8) {
                        Text(locationRowValue)
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                } label: {
                    Text(L10n.string("quick.location", defaultValue: "Location"))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        case .paidBy:
            // Who fronted the money — a person, unlike the paying pocket.
            // Defaults to the recorder; picking a teammate records that
            // THEY paid while I only wrote the entry down.
            if !payerCandidates.isEmpty || historicalPayer != nil {
                Picker(L10n.string("quick.paidBy", defaultValue: "Paid By"), selection: Binding(
                    get: { draft.paidByUserId ?? auth.currentUser?.id ?? "" },
                    set: { draft.paidByUserId = $0.isEmpty ? nil : $0 }
                )) {
                    ForEach(payerCandidates) { member in
                        Text(member.displayName).tag(member.userId)
                    }
                    if let historicalPayer {
                        Text(historicalPayer.label).tag(historicalPayer.id)
                    }
                }
            }
        case .project:
            if editedEntry == nil, let scopedProject {
                // Project scope pins the entry: read-only row instead of
                // the picker.
                LabeledContent(L10n.string("quick.project", defaultValue: "Project")) {
                    Text(scopedProject.name)
                        .foregroundStyle(.secondary)
                }
            } else if !isGuest, !ledgerProjects.isEmpty {
                Picker(L10n.string("quick.project", defaultValue: "Project"), selection: Binding(
                    get: { draft.projectId ?? "" },
                    set: { draft.projectId = $0.isEmpty ? nil : $0 }
                )) {
                    Text(L10n.string("projects.none", defaultValue: "No project")).tag("")
                    ForEach(ledgerProjects) { project in
                        Text(project.name).tag(project.id)
                    }
                }
                // Switching the project narrows the participant set to the
                // new project's members — drop any picked participant who
                // isn't in it, or the post would fail validation.
                .onChange(of: draft.projectId) {
                    pruneParticipants()
                }
            }
        case .countsInLedger:
            // Guests are forced into project scope server-side, so the
            // choice is theirs only on full-role ledgers.
            if !isGuest {
                Toggle(isOn: $draft.countsInLedger) {
                    Text(L10n.string("quick.countsInLedger", defaultValue: "Count in Income & Expense"))
                }
            }
        }
    }

    /// The location row's trailing value: the resolved place label while
    /// one is set, else the "Add Location" call to action.
    private var locationRowValue: String {
        draft.location.map(locationLabel)
            ?? L10n.string("quick.location.add", defaultValue: "Add Location")
    }

    /// The account picker row for the more sheet's form: title leading,
    /// the selected account's icon + name trailing, opening the shared
    /// account selection sheet.
    private func accountRow(
        title: String,
        side: AccountSide,
        selection: Binding<String?>,
        entries: [AccountTreeEntry]
    ) -> some View {
        Button {
            activeAccountSide = side
        } label: {
            LabeledContent {
                // Explicit HStack: LabeledContent stacks multiple trailing
                // views vertically, which would drop the chevron to a
                // second line.
                HStack(spacing: 8) {
                    accountRowValue(entries, selection.wrappedValue)
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            } label: {
                Text(title)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// The selected account's icon + display name — the icon mirrors the
    /// picker rows so the value reads the same in both places — or the
    /// "Not selected" sentinel; never a blank trailing label.
    @ViewBuilder
    private func accountRowValue(_ entries: [AccountTreeEntry], _ selected: String?) -> some View {
        if let selected,
           let entry = entries.first(where: { $0.account.id == selected }) {
            HStack(spacing: 8) {
                if let icon = entry.account.icon, !icon.isEmpty {
                    Text(icon)
                }
                Text(entry.account.displayName)
            }
            .foregroundStyle(.secondary)
        } else {
            Text(L10n.string("common.notSelected", defaultValue: "Not selected"))
                .foregroundStyle(.secondary)
        }
    }

    /// The memo chip reads the memo while there is one, else the "Memo"
    /// sentinel — never a blank capsule.
    private var memoChipValue: String {
        draft.memo.isEmpty
            ? L10n.string("quick.memo", defaultValue: "Memo")
            : draft.memo
    }

    /// Account chip: the side's title while nothing is picked ("收款账户"),
    /// the account's emoji + display name once picked — mirroring the
    /// picker rows the chip opens.
    private func accountChip(
        title: String,
        side: AccountSide,
        selected: String?,
        entries: [AccountTreeEntry]
    ) -> some View {
        Button {
            activeAccountSide = side
        } label: {
            Group {
                if let selected, let entry = entries.first(where: { $0.account.id == selected }) {
                    HStack(spacing: 6) {
                        if let icon = entry.account.icon, !icon.isEmpty {
                            Text(icon).font(.footnote)
                        }
                        Text(entry.account.displayName)
                            .font(.footnote)
                            .lineLimit(1)
                    }
                } else {
                    Text(title)
                        .font(.footnote)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.primary.opacity(0.06)))
            .foregroundStyle(.primary)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    /// Location chip: an "Add Location" capsule while empty; once set, the
    /// resolved label with a trailing clear button sharing the capsule
    /// (clearing used to live on the form row).
    @ViewBuilder
    private var locationChip: some View {
        if let location = draft.location {
            HStack(spacing: 6) {
                Button {
                    isLocationPickerPresented = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "mappin")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Text(locationLabel(location))
                            .font(.footnote)
                            .lineLimit(1)
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                Button {
                    // Marks the place for removal: on an edit the body
                    // sends an explicit null, on a fresh post there was
                    // nothing to keep anyway.
                    draft.location = nil
                    draft.isLocationCleared = true
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.primary.opacity(0.06)))
            .foregroundStyle(.primary)
        } else {
            quickChip(
                systemImage: "mappin",
                value: L10n.string("quick.location.add", defaultValue: "Add Location")
            ) {
                isLocationPickerPresented = true
            }
        }
    }

    /// The collapsed time display as a plain string for the quick bar chip
    /// — same rule as the form row: time only on today, date + time once
    /// the entry falls on another day. Formatted with the in-app override
    /// locale (`\.locale`), not the device language.
    private var quickTimeValue: String {
        if isEntryToday {
            return draft.date.formatted(.dateTime.hour().minute().locale(locale))
        }
        return draft.date.formatted(.dateTime.day().month(.abbreviated).hour().minute().locale(locale))
    }

    /// Capsule chip matching the recents row's styling: secondary icon +
    /// one-line value on a neutral fill.
    private func quickChip(
        systemImage: String,
        value: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.footnote)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.primary.opacity(0.06)))
            .foregroundStyle(.primary)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    /// Whether the entry falls on today — the display-only condition behind
    /// the quick bar's time chip date hiding.
    private var isEntryToday: Bool {
        Calendar.current.isDateInToday(draft.date)
    }

    /// Sheet title mirroring what the time chip shows: "Time" while the
    /// entry falls on today, "Date" once it doesn't.
    private var dateTimeLabel: String {
        isEntryToday
            ? L10n.string("quick.time", defaultValue: "Time")
            : L10n.string("common.date", defaultValue: "Date")
    }

    /// Trailing label of the location chip: POI name → address → formatted
    /// coordinates, so a geocoding gap never shows a blank value.
    private func locationLabel(_ location: EntryLocationBody) -> String {
        location.rowLabel ?? L10n.string("quick.location.set", defaultValue: "Location set")
    }

    /// Whether posting is allowed on the recording ledger.
    private var canPost: Bool {
        ledger?.canPost ?? false
    }

    /// Read-only trailing label for bound sheets: the scope the entry will
    /// record into — the bound project (folder glyph, person-badged on guest
    /// ledgers) or the bound ledger. Not tappable; the target is fixed.
    private var boundScopeLabel: some View {
        HStack(spacing: 4) {
            if let binding {
                if binding.projectId != nil {
                    Image(systemName: binding.ledger.isGuest ? "folder.badge.person.crop" : "folder")
                } else {
                    Image(systemName: "book")
                }
                Text(boundScopeName)
            }
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }

    private var boundScopeName: String {
        guard let binding else { return "" }
        if let projectId = binding.projectId,
           let project = ledgerProjects.first(where: { $0.id == projectId }) {
            return project.name
        }
        return binding.ledger.name
    }

    // `Text` with a runtime `String` never localizes, so dynamic titles
    // route through `L10n.string` (which honors the in-app language).
    private var navigationTitleText: String {
        editedEntry == nil
            ? L10n.string("quick.addEntry", defaultValue: "Add Entry")
            : L10n.string("quick.editEntry", defaultValue: "Edit Entry")
    }

    // Debit side = where value goes (expense category / receiving pocket /
    // transfer destination); credit side = where it comes from (paying
    // pocket / income source / transfer origin).
    private var debitLabel: String {
        switch draft.kind {
        case .expense: L10n.string("quick.expenseCategory", defaultValue: "Expense Category")
        case .income: L10n.string("quick.receiveAccount", defaultValue: "Receive Into")
        case .transfer: L10n.string("quick.toAccount", defaultValue: "To")
        }
    }

    private var creditLabel: String {
        switch draft.kind {
        case .expense: L10n.string("quick.payAccount", defaultValue: "Pay From")
        case .income: L10n.string("quick.incomeCategory", defaultValue: "Income Category")
        case .transfer: L10n.string("quick.fromAccount", defaultValue: "From")
        }
    }

    /// Category sides render as a tree (parents before indented children);
    /// pocket sides are flat.
    private var debitEntries: [AccountTreeEntry] {
        switch draft.kind {
        case .expense:
            AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .expense })
        case .income:
            accountStore.pickable
                .filter { $0.type == .asset }
                .map { AccountTreeEntry(account: $0, depth: 0) }
        case .transfer:
            accountStore.assetLike.map { AccountTreeEntry(account: $0, depth: 0) }
        }
    }

    private var creditEntries: [AccountTreeEntry] {
        switch draft.kind {
        case .expense:
            accountStore.assetLike.map { AccountTreeEntry(account: $0, depth: 0) }
        case .income:
            AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .income })
        case .transfer:
            accountStore.assetLike.map { AccountTreeEntry(account: $0, depth: 0) }
        }
    }

    /// Which picker side the kind's category lives on — the grid edits this
    /// side of the draft; transfer has no category.
    private var categorySide: AccountSide? {
        switch draft.kind {
        case .expense: .debit
        case .income: .credit
        case .transfer: nil
        }
    }

    /// The kind's full category tree (parents before children) — the grid
    /// shows only its top level, subs live behind the chip's popup.
    private var categoryTree: [AccountTreeEntry] {
        switch draft.kind {
        case .expense:
            AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .expense })
        case .income:
            AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .income })
        case .transfer:
            []
        }
    }

    /// Top-level categories for the grid.
    private var categoryEntries: [AccountTreeEntry] {
        categoryTree.filter { $0.depth == 0 }
    }

    /// Direct children of a grid category, in tree order.
    private func subCategories(of parent: AccountTreeEntry) -> [AccountTreeEntry] {
        categoryTree.filter { $0.account.parentId == parent.account.id }
    }

    /// The chain of descendants of `entry` down to the current selection
    /// (first level first), or nil when the selection is not under it —
    /// lets a top-level chip surface a picked sub as its display value.
    private func selectedSubPath(under entry: AccountTreeEntry) -> [AccountTreeEntry]? {
        guard let selectedId = categorySelection.wrappedValue else { return nil }
        var byId: [String: AccountTreeEntry] = [:]
        for node in categoryTree {
            byId[node.account.id] = node
        }
        var chain: [AccountTreeEntry] = []
        var cursor = byId[selectedId]
        while let node = cursor {
            if node.account.id == entry.account.id {
                return chain.isEmpty ? nil : Array(chain.reversed())
            }
            chain.append(node)
            cursor = node.account.parentId.flatMap { byId[$0] }
        }
        return nil
    }

    /// Grid binding into the draft's category side.
    private var categorySelection: Binding<String?> {
        switch draft.kind {
        case .expense: $draft.debitAccountId
        case .income: $draft.creditAccountId
        case .transfer: .constant(nil)
        }
    }

    /// Cached recents resolved against the full category tree, so subs and
    /// archived/deleted categories resolve (or drop out) correctly even
    /// though the grid itself only shows the top level.
    private var recentCategoryEntries: [AccountTreeEntry] {
        guard let ledger = self.ledger, categorySide != nil else { return [] }
        let byId = Dictionary(
            categoryTree.map { ($0.account.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        return RecentCategoryStore.ids(ledgerId: ledger.id, kind: draft.kind)
            .compactMap { byId[$0] }
    }

    /// Applies a grid or bubble pick to the draft. The recents cache is
    /// deliberately not touched here — it only moves when the entry is
    /// actually posted (see `save`), so exploring a draft never rewrites
    /// the recents row.
    private func selectCategory(_ id: String) {
        categorySelection.wrappedValue = id
    }

    private func recordRecentCategory(_ id: String) {
        guard let ledger = self.ledger, categorySide != nil else { return }
        RecentCategoryStore.record(id, ledgerId: ledger.id, kind: draft.kind)
    }

    /// The expense category to prefill: the one on the most recent expense
    /// entry in the journal — repeated spending is the common case — falling
    /// back to the first category in picker order for a fresh ledger.
    private var defaultExpenseCategoryId: String? {
        let categories = AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .expense })
        let categoryIds = Set(categories.map(\.account.id))
        // Entries are newest-first; the debit line of an expense is its category.
        for entry in postingJournal.entries {
            if let line = entry.lines.first(where: { $0.debit > 0 && categoryIds.contains($0.accountId) }) {
                return line.accountId
            }
        }
        return categories.first?.account.id
    }

    /// Seeds the expense category once accounts are in; an explicit pick is
    /// never overwritten, and no-op for the other scenarios.
    private func applyExpenseCategoryDefault() {
        guard draft.kind == .expense, draft.debitAccountId == nil else { return }
        draft.debitAccountId = defaultExpenseCategoryId
    }

    /// A guest's only project pre-fills the assignment so they only have to
    /// pick the category and the amount. With multiple projects the scoped
    /// default below takes over instead — guests auto-claim the first
    /// project, so the draft is still pinned rather than left unassigned
    /// (validated server-side too).
    private func applyGuestProjectDefault() {
        guard isGuest, draft.projectId == nil, ledgerProjects.count == 1 else { return }
        draft.projectId = ledgerProjects[0].id
    }

    /// A project scoped in the ledger switcher fixes new entries: the draft
    /// follows the scope — live, if it changes while the sheet is open — so
    /// everything recorded under a project scope belongs to that project.
    /// Edits keep the entry's own assignment.
    private func applyScopedProjectDefault() {
        guard editedEntry == nil, let project = scopedProject else { return }
        guard draft.projectId != project.id else { return }
        draft.projectId = project.id
        pruneParticipants()
    }

    /// Re-applies the bound widget's binding after the ledger-scoped
    /// defaults run — the binding is why the sheet opened, so it wins over
    /// the scoped pinning. A bound category is dropped when the ledger's
    /// account list no longer contains it (deleted since the widget was
    /// configured).
    private func applyBinding() {
        guard let binding, binding.ledger.id == ledger?.id else { return }
        if let kind = binding.kind { draft.kind = kind }
        if let projectId = binding.projectId {
            draft.projectId = projectId
            pruneParticipants()
        }
        guard let categoryId = binding.categoryId, let kind = binding.kind else { return }
        guard accountStore.items.contains(where: { $0.id == categoryId }) else { return }
        switch kind {
        case .expense: draft.debitAccountId = categoryId
        case .income: draft.creditAccountId = categoryId
        case .transfer: break
        }
    }

    /// Drops picked participants who aren't members of the entry's current
    /// project — switching projects must not carry participants across, or
    /// the post fails validation.
    private func pruneParticipants() {
        guard !participantCandidates.isEmpty else {
            draft.participants = []
            return
        }
        let candidateIds = Set(participantCandidates.map(\.userId))
        draft.participants.formIntersection(candidateIds)
    }

    /// Field row that opens the account picker as a bottom sheet: the tree
    /// of accounts is too large for an inline menu, so the form only shows
    /// the current value and the full hierarchy opens on tap.
    /// Trailing label of the Participants row: selected names, or a
    /// sentinel — never a blank trailing label. With a project selected,
    /// "none picked" posts the whole project membership at posting time
    /// (the server snapshots it as the split set), so say that instead of
    /// the ledger-wide "Not selected".
    private var participantSummary: String {
        let names = memberStore.members
            .filter { draft.participants.contains($0.userId) }
            .map(\.displayName)
        guard !names.isEmpty else {
            if draft.projectId != nil {
                return L10n.string(
                    "quick.participants.allMembers",
                    defaultValue: "All project members"
                )
            }
            return L10n.string("common.notSelected", defaultValue: "Not selected")
        }
        return names.joined(separator: ", ")
    }

    private func save() async {
        // Settle any pending operation first ("14 + 5" reading 19 posts 19)
        // — there is no keypad sheet dismissal to fold it in anymore.
        engine.commitPending()
        guard let amount = Double(engine.entry), amount > 0 else {
            validationError = L10n.string("quick.amountRequired", defaultValue: "Enter an amount greater than 0.")
            return
        }
        draft.amount = amount
        if isGuest, draft.projectId == nil {
            validationError = L10n.string("quick.projectRequired", defaultValue: "Choose a project.")
            return
        }
        guard draft.isValid else {
            validationError = L10n.string("quick.accountRequired", defaultValue: "Please pick the required account(s).")
            return
        }
        validationError = nil
        isPosting = true
        defer { isPosting = false }
        do {
            if let editedEntry {
                try await postingJournal.update(editedEntry, draft: draft)
                toast.show(L10n.string("journal.updateSuccess", defaultValue: "Entry updated"))
            } else {
                try await postingJournal.post(draft)
                toast.show(L10n.string("journal.createSuccess", defaultValue: "Entry posted"))
            }
            // A posted entry is a used category — feed the recents cache so
            // the grid's recents row and the prefilled default agree.
            if categorySide != nil, let id = categorySelection.wrappedValue {
                recordRecentCategory(id)
            }
            dismiss()
            // The posting moved balances; refresh dashboard and reports in
            // the background so they never show stale numbers. Bound sheets
            // only need this when their target is the app's active ledger —
            // a posting into a foreign ledger can't change what's on
            // screen, and the shared report stores have nothing to refresh
            // for it.
            if ledgerStore.activeLedger?.id == ledger?.id {
                Task { await reportStore.refreshAfterPosting() }
            }
        } catch {
            validationError = error.localizedDescription
        }
    }
}
