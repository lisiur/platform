//
//  ScreenshotRecognizeView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import ImageIO
import PhotosUI
import SwiftUI

/// The dedicated screenshot-recognition page: one screenshot in, one entry
/// out. Pick (or receive the share extension's staged image), tile → upload
/// → AI recognize, then review the recognized fields in a small editable
/// form — amount, kind, category (with the AI's one-tap alternates), date,
/// memo — and post through the same quick-entry draft the calculator uses.
/// The page stays mounted after a save and resets to the picker, so a stack
/// of screenshots is processed without leaving.
struct ScreenshotRecognizeView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(JournalStore.self) private var journalStore
    @Environment(ReportStore.self) private var reportStore
    @Environment(BackgroundSettings.self) private var backgroundSettings

    private enum Stage {
        case picking
        case recognizing
        case reviewing
        case saved
    }

    @State private var stage: Stage = .picking
    /// The picked photo — cleared as soon as its bytes are read so the same
    /// photo can be picked again later.
    @State private var screenshotItem: PhotosPickerItem?
    /// Downsampled decode of the image being recognized/reviewed, for the
    /// review header's thumbnail (full-resolution bytes never live here).
    @State private var previewImage: CGImage?
    /// The last successful recognition; its alternates render as one-tap
    /// correction chips and its category name re-resolves on kind switches.
    @State private var recognition: ScreenshotRecognition?
    /// The kind the recognition was applied as: the category alternates only
    /// fit that kind, so a manual kind switch retires them while the amount
    /// ones stay.
    @State private var recognitionKind: QuickEntryKind?
    /// Recognition failures — soft misses (nothing recognized) and hard
    /// errors (network, billing) alike; clears with the alert.
    @State private var recognitionError: String?
    /// Posting failures; keeps the review intact so the verified fields
    /// survive a retry.
    @State private var saveError: String?

    // The editable result of the last recognition.
    @State private var kind: QuickEntryKind = .expense
    @State private var amountText = ""
    @State private var entryDate = Date()
    @State private var memo = ""
    @State private var categoryId: String?

    @State private var isPosting = false
    @State private var isCategoryPickerPresented = false
    @State private var loadedLedgerId: String?
    @State private var accountStore = AccountStore()

    /// Recognition always records into the app's active ledger.
    private var ledger: QianlaiLedger? { ledgerStore.activeLedger }

    var body: some View {
        Group {
            switch stage {
            case .picking:
                pickingStage
            case .recognizing:
                recognizingStage
            case .reviewing:
                reviewingStage
            case .saved:
                savedStage
            }
        }
        .appBackgroundCanvas()
        .background(Color.groupedCanvas)
        .navigationTitle(Text(L10n.string("screenshot.title", defaultValue: "Receipt Recognition")))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.string("common.cancel", defaultValue: "Cancel")) { dismiss() }
            }
            if stage == .reviewing {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.string("common.save", defaultValue: "Save")) {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                }
            }
        }
        .alert(
            L10n.string("screenshot.failedTitle", defaultValue: "Recognition Failed"),
            isPresented: Binding(
                get: { recognitionError != nil },
                set: { if !$0 { recognitionError = nil } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {}
        } message: {
            Text(recognitionError ?? "")
        }
        .alert(
            L10n.string("quick.cannotSaveTitle", defaultValue: "Can't Save Entry"),
            isPresented: Binding(
                get: { saveError != nil },
                set: { if !$0 { saveError = nil } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {}
        } message: {
            Text(saveError ?? "")
        }
        // A fresh pick kicks off the pipeline; clearing the item afterwards
        // re-arms the picker without re-running anything.
        .onChange(of: screenshotItem) {
            guard screenshotItem != nil else { return }
            Task { await recognizePickedScreenshot() }
        }
        // A kind switch swaps the category tree's side: re-resolve the AI's
        // suggestion against the new kind's tree, or drop the pick — the
        // alternates and the selection must always name the rendered tree.
        .onChange(of: kind) {
            categoryId = recognition?.categoryName.flatMap(matchCategoryId)
        }
        // Keyed by the active ledger: the category tree suggestion matching
        // needs must be loaded before any staged handoff runs.
        .task(id: ledger?.id) {
            guard let ledger, loadedLedgerId != ledger.id else { return }
            loadedLedgerId = ledger.id
            await accountStore.load(ledgerId: ledger.id)
            // Posting goes through the shared root journal; the load dedupes
            // against the Journal tab's.
            await journalStore.load(ledgerId: ledger.id)
            // The share extension's handoff runs last, on the loaded tree.
            // Re-runs find nothing staged and no-op.
            await recognizeStagedScreenshot()
        }
    }

    // MARK: - Stages

    /// The empty state: one big picker card, one hint line.
    private var pickingStage: some View {
        // Read on the actor before the label closure: PhotosPicker's label
        // is @Sendable, and the store property is main-actor isolated.
        let surface = backgroundSettings.chipSurface
        return VStack(spacing: 20) {
            Spacer()
            PhotosPicker(selection: $screenshotItem, matching: .images) {
                VStack(spacing: 14) {
                    Image(systemName: "doc.viewfinder")
                        .font(.system(size: 46))
                        .foregroundStyle(Color.accentColor)
                    Text(L10n.string("screenshot.pick", defaultValue: "Choose Screenshot"))
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 190)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(surface)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            Text(L10n.string(
                "screenshot.pickHint",
                defaultValue: "Works with Alipay, WeChat Pay and other payment screenshots"
            ))
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var recognizingStage: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(L10n.string("screenshot.working", defaultValue: "Recognizing…"))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// The recognized entry as a small editable form. Only the fields a
    /// screenshot can carry: the paying pocket stays nil (the server applies
    /// the ledger's default) and the project/participants/payer surfaces are
    /// left to the regular quick entry.
    private var reviewingStage: some View {
        Form {
            screenshotSection
            amountSection
            detailSection
            if recognition?.isLowConfidence == true {
                Section {
                    Label(
                        L10n.string(
                            "screenshot.lowConfidence",
                            defaultValue: "Low confidence — please double-check the amount."
                        ),
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.footnote)
                    .foregroundStyle(.orange)
                }
            }
        }
        .sheet(isPresented: $isCategoryPickerPresented) {
            NavigationStack {
                AccountSelectionView(
                    title: L10n.string("screenshot.category", defaultValue: "Category"),
                    entries: categoryTree,
                    allowsEmpty: false,
                    // Category leaves only — parents fold, never pick.
                    parentSelectable: false,
                    selection: $categoryId
                )
            }
            #if os(iOS)
            .presentationDetents([.large])
            #endif
        }
    }

    private var savedStage: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(Color.accentColor)
            Text(L10n.string("journal.createSuccess", defaultValue: "Entry posted"))
                .font(.headline)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task {
            try? await Task.sleep(for: .seconds(1.2))
            resetForNext()
        }
    }

    // MARK: - Review sections

    private var screenshotSection: some View {
        Section {
            HStack(spacing: 12) {
                if let previewImage {
                    Image(decorative: previewImage, scale: 2)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                } else {
                    Image(systemName: "doc.text.image")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                        .frame(width: 56, height: 56)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(backgroundSettings.chipSurface)
                        )
                }
                Spacer()
                PhotosPicker(selection: $screenshotItem, matching: .images) {
                    Text(L10n.string("screenshot.changePhoto", defaultValue: "Choose Another"))
                        .font(.footnote)
                }
            }
        }
    }

    private var amountSection: some View {
        Section {
            TextField(
                L10n.string("screenshot.amount", defaultValue: "Amount"),
                text: $amountText,
                prompt: Text(verbatim: "0.00")
            )
            .keyboardType(.decimalPad)
            .font(.title2.weight(.semibold))

            if !visibleAmountAlternatives.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text(L10n.string("screenshot.otherAmounts", defaultValue: "Other amounts"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(visibleAmountAlternatives, id: \.self) { amount in
                                suggestionChip(String(format: "%.2f", amount)) {
                                    amountText = String(format: "%.2f", amount)
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var detailSection: some View {
        Section {
            Picker(L10n.string("quick.accountType", defaultValue: "Account Type"), selection: $kind) {
                Text(QuickEntryKind.expense.label).tag(QuickEntryKind.expense)
                Text(QuickEntryKind.income.label).tag(QuickEntryKind.income)
            }
            .pickerStyle(.segmented)

            Button {
                isCategoryPickerPresented = true
            } label: {
                LabeledContent {
                    HStack(spacing: 8) {
                        if let entry = selectedCategoryEntry {
                            if let icon = entry.account.icon, !icon.isEmpty {
                                Text(icon)
                            }
                            Text(entry.account.displayName)
                                .foregroundStyle(.secondary)
                        } else {
                            Text(L10n.string("common.notSelected", defaultValue: "Not selected"))
                                .foregroundStyle(.secondary)
                        }
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                } label: {
                    Text(L10n.string("screenshot.category", defaultValue: "Category"))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if !visibleCategoryAlternatives.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text(L10n.string("screenshot.otherCategories", defaultValue: "Other categories"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(visibleCategoryAlternatives, id: \.self) { name in
                                suggestionChip(name) {
                                    if let id = CategoryPathResolver.leafAccountId(
                                        forSuggestion: name,
                                        tree: categoryTree
                                    ) {
                                        categoryId = id
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 2)
            }

            DatePicker(
                L10n.string("common.date", defaultValue: "Date"),
                selection: $entryDate,
                displayedComponents: [.date, .hourAndMinute]
            )

            LabeledContent(L10n.string("quick.memo", defaultValue: "Memo")) {
                TextField(
                    L10n.string("quick.memoPlaceholder", defaultValue: "e.g. weekly groceries"),
                    text: $memo
                )
                .multilineTextAlignment(.trailing)
                .submitLabel(.done)
                .onSubmit { dismissKeyboard() }
            }
        }
    }

    /// Secondary-tint capsule — a suggestion, not a state signal, so it
    /// stays on the accent color (no red/green kind tinting).
    private func suggestionChip(_ text: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.footnote)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.accentColor.opacity(0.12)))
                .foregroundStyle(Color.accentColor)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Derived

    private var canSave: Bool {
        guard let amount = Double(amountText), amount > 0, categoryId != nil else { return false }
        return !isPosting
    }

    /// The current kind's category tree (parents before children).
    private var categoryTree: [AccountTreeEntry] {
        switch kind {
        case .expense:
            AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .expense })
        case .income:
            AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .income })
        case .transfer:
            []
        }
    }

    private var selectedCategoryEntry: AccountTreeEntry? {
        guard let categoryId else { return nil }
        return categoryTree.first { $0.account.id == categoryId }
    }

    /// Alternate amounts with the current one removed — the model doesn't
    /// guarantee the primary can't reappear among them.
    private var visibleAmountAlternatives: [Double] {
        let current = Double(amountText)
        return recognition?.amountSuggestions.filter { amount in
            guard let current else { return true }
            return abs(amount - current) > 0.001
        } ?? []
    }

    /// Alternate categories with the picked one and duplicates removed,
    /// order preserved — and only while the kind still matches the
    /// recognized one (they name that kind's tree).
    private var visibleCategoryAlternatives: [String] {
        guard let recognition, kind == recognitionKind else { return [] }
        var seen = Set<String>()
        if let picked = recognition.categoryName {
            seen.insert(picked)
        }
        return recognition.categorySuggestions.filter { seen.insert($0).inserted }
    }

    // MARK: - Pipeline

    /// The picker path: read the item's bytes, then hand off to the shared
    /// tile-upload-apply tail.
    private func recognizePickedScreenshot() async {
        guard stage != .recognizing, let item = screenshotItem else { return }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                screenshotItem = nil
                recognitionError = L10n.string(
                    "screenshot.readFailed",
                    defaultValue: "Couldn't read the selected image."
                )
                return
            }
            screenshotItem = nil
            await runRecognition(imageData: data)
        } catch {
            screenshotItem = nil
            recognitionError = recognitionErrorMessage(error)
        }
    }

    /// The share-extension handoff path: consume the staged image and run
    /// the same shared tail. Nothing staged is a silent no-op.
    private func recognizeStagedScreenshot() async {
        guard let data = ScreenshotHandoff.consumePendingImageData() else { return }
        await runRecognition(imageData: data)
    }

    /// Shared tail of both entry paths: tile → upload → apply. The stage
    /// gate keeps one recognition running at a time; a failure (or a soft
    /// miss) falls back to the picker for the next attempt.
    private func runRecognition(imageData: Data) async {
        guard let ledger else { return }
        guard stage != .recognizing else { return }
        stage = .recognizing
        previewImage = Self.previewCGImage(from: imageData)
        guard let tiles = ScreenshotTiler.jpegTiles(from: imageData), !tiles.isEmpty else {
            failRecognition(
                L10n.string("screenshot.readFailed", defaultValue: "Couldn't read the selected image.")
            )
            return
        }
        do {
            let result = try await journalStore.recognizeScreenshot(
                ledgerId: ledger.id,
                tiles: tiles
            )
            applyRecognition(result)
        } catch {
            failRecognition(recognitionErrorMessage(error))
        }
    }

    private func failRecognition(_ message: String) {
        stage = .picking
        previewImage = nil
        recognitionError = message
    }

    /// Billing rejections read as their own guidance; everything else keeps
    /// the server's message.
    private func recognitionErrorMessage(_ error: Error) -> String {
        if case .server(402, _) = error as? APIError {
            return L10n.string(
                "screenshot.noCredit",
                defaultValue: "Not enough credits for screenshot recognition. Redeem a code to top up."
            )
        }
        return error.localizedDescription
    }

    /// Maps a recognition onto the review fields: kind, time, amount,
    /// merchant·memo, then the category — the AI's full-path suggestion
    /// resolved against this ledger's tree (nil leaves it unselected; the
    /// save gate asks for a pick). Alternates stay on `recognition` for the
    /// correction chips.
    private func applyRecognition(_ result: ScreenshotRecognition) {
        guard result.recognized else {
            failRecognition(L10n.string(
                "screenshot.notRecognized",
                defaultValue: "No transaction found in this screenshot. Try another one."
            ))
            return
        }
        recognition = result
        kind = result.kind == "income" ? .income : .expense
        recognitionKind = kind
        entryDate = result.occurredDate ?? Date()
        amountText = result.amount.map { String(format: "%.2f", $0) } ?? ""
        memo = [result.merchant, result.memo]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        categoryId = result.categoryName.flatMap(matchCategoryId)
        stage = .reviewing
    }

    /// Resolves an AI-suggested category against the current kind's tree —
    /// the prompt's "/"-joined full paths (服饰/衣服 vs 育儿/衣服) disambiguate
    /// same-named leaves, and the selectable range is leaves only.
    private func matchCategoryId(_ name: String) -> String? {
        CategoryPathResolver.leafAccountId(forSuggestion: name, tree: categoryTree)
    }

    // MARK: - Save

    private func save() async {
        guard let ledger,
              let amount = Double(amountText), amount > 0,
              let categoryId else { return }
        var draft = QuickEntryDraft()
        draft.kind = kind
        draft.amount = amount
        draft.date = entryDate
        draft.memo = memo
        // The category is the kind's required side; the paying/receiving
        // pocket stays nil so the server applies the ledger's default.
        switch kind {
        case .expense: draft.debitAccountId = categoryId
        case .income: draft.creditAccountId = categoryId
        case .transfer: break
        }
        isPosting = true
        defer { isPosting = false }
        do {
            try await journalStore.post(draft)
            // A posted entry is a used category — feed the recents cache so
            // the quick entry's recents row agrees.
            RecentCategoryStore.record(categoryId, ledgerId: ledger.id, kind: kind)
            stage = .saved
            // The posting moved balances; refresh dashboard and reports in
            // the background so they never show stale numbers.
            if ledgerStore.activeLedger?.id == ledger.id {
                Task { await reportStore.refreshAfterPosting() }
            }
        } catch {
            // Stay in review: the verified fields must survive a retry.
            saveError = error.localizedDescription
        }
    }

    /// Back to the picker for the next screenshot.
    private func resetForNext() {
        stage = .picking
        recognition = nil
        recognitionKind = nil
        previewImage = nil
        kind = .expense
        amountText = ""
        entryDate = Date()
        memo = ""
        categoryId = nil
        screenshotItem = nil
    }

    /// Downsampled decode for the review header — full-resolution bytes are
    /// only ever tiled for upload, never held as a bitmap.
    private static func previewCGImage(from data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 640,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}

/// The page's presentation wrapper — full-screen, interactive dismiss off
/// (a mid-recognition swipe abandons a billed call's result). One definition
/// for both mount points: the Journal toolbar entry and the deep link.
extension View {
    func screenshotRecognitionCover(isPresented: Binding<Bool>) -> some View {
        fullScreenCover(isPresented: isPresented) {
            NavigationStack {
                ScreenshotRecognizeView()
            }
            .interactiveDismissDisabled()
        }
    }
}
