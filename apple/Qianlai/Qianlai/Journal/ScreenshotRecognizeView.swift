//
//  ScreenshotRecognizeView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import PhotosUI
import SwiftUI

/// The screenshot-recognition page: pick a screenshot, tile → upload → AI
/// recognize — then hand the result to the quick-entry sheet, which is the
/// result surface now (`QuickEntryView(recognition:)` seeds the recognized
/// fields in). This page only covers picking and recognizing; a soft miss
/// (nothing recognized) or an error falls back to the picker for the next
/// attempt.
struct ScreenshotRecognizeView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(JournalStore.self) private var journalStore
    @Environment(BackgroundSettings.self) private var backgroundSettings

    /// Receives the recognition the moment it lands; the cover's content
    /// swaps in place to the seeded quick entry.
    let onRecognition: (ScreenshotRecognition) -> Void

    private enum Stage {
        case picking
        case recognizing
    }

    @State private var stage: Stage = .picking
    /// The picked photo — cleared as soon as its bytes are read so the same
    /// photo can be picked again later.
    @State private var screenshotItem: PhotosPickerItem?
    /// Recognition failures — soft misses (nothing recognized) and hard
    /// errors (network, billing) alike; clears with the alert.
    @State private var recognitionError: String?

    /// Recognition always records into the app's active ledger.
    private var ledger: QianlaiLedger? { ledgerStore.activeLedger }

    var body: some View {
        Group {
            switch stage {
            case .picking:
                pickingStage
            case .recognizing:
                recognizingStage
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
        // A fresh pick kicks off the pipeline; clearing the item afterwards
        // re-arms the picker without re-running anything.
        .onChange(of: screenshotItem) {
            guard screenshotItem != nil else { return }
            Task { await recognizePickedScreenshot() }
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

    /// Shared tail of the picker path: tile → upload → hand off. The stage
    /// gate keeps one recognition running at a time; a failure (or a soft
    /// miss) falls back to the picker for the next attempt, while a success
    /// leaves this page for good — the quick entry carries the result.
    private func runRecognition(imageData: Data) async {
        guard let ledger else { return }
        guard stage != .recognizing else { return }
        stage = .recognizing
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
            // A soft miss (the model saw no transaction) never reaches the
            // quick entry — the picker state is the honest answer.
            guard result.recognized else {
                failRecognition(L10n.string(
                    "screenshot.notRecognized",
                    defaultValue: "No transaction found in this screenshot. Try another one."
                ))
                return
            }
            onRecognition(result)
        } catch {
            failRecognition(recognitionErrorMessage(error))
        }
    }

    private func failRecognition(_ message: String) {
        stage = .picking
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
}

/// The page's presentation wrapper — full-screen, interactive dismiss off
/// (a mid-recognition swipe abandons a billed call's result). The cover
/// hosts BOTH phases: while `seed` is nil it shows the pick/recognize page;
/// once a recognition lands the content swaps in place to the seeded quick
/// entry — the result surface IS the quick entry. One cover for the whole
/// flow: presenting a second cover from this one's onDismiss raced its
/// content snapshot and opened the quick entry without the seed.
extension View {
    func screenshotRecognitionCover(
        isPresented: Binding<Bool>,
        seed: Binding<ScreenshotRecognition?>
    ) -> some View {
        fullScreenCover(isPresented: isPresented, onDismiss: { seed.wrappedValue = nil }) {
            NavigationStack {
                if let recognized = seed.wrappedValue {
                    QuickEntryView(recognition: recognized)
                } else {
                    ScreenshotRecognizeView(onRecognition: { seed.wrappedValue = $0 })
                }
            }
            .interactiveDismissDisabled()
        }
    }
}
