//
//  AIBookkeepingView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import PhotosUI
import SwiftUI

/// The screenshot-recognition handoff: the structured recognition plus the
/// recognized screenshot itself, compressed to its final upload receipt
/// bytes (`nil` when the re-encode failed — the entry still seeds, just
/// without the receipt). One value because the pair always travels
/// together: result surface → seeded quick entry.
struct RecognizedScreenshot {
    let recognition: ScreenshotRecognition
    let imageData: Data?
}

/// The AI-bookkeeping page: two doors into one seeded quick entry — pick a
/// payment screenshot (tile → upload → AI vision recognize) or speak the
/// transaction (on-device transcription → server parse). A soft miss
/// (nothing recognized) or an error falls back to the door's idle state for
/// the next attempt.
struct AIBookkeepingView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(JournalStore.self) private var journalStore
    @Environment(BackgroundSettings.self) private var backgroundSettings

    /// Receives the recognition the moment it lands; the cover's content
    /// swaps in place to the seeded quick entry.
    let onRecognition: (RecognizedScreenshot) -> Void

    private enum Stage {
        case picking
        case recognizing
    }

    /// Which door is open — the picking cards, or the voice sub-page
    /// (self-contained: its own stages, title, and cancel).
    private enum Mode {
        case screenshot
        case voice
    }

    @State private var stage: Stage = .picking
    @State private var mode: Mode = .screenshot
    /// The picked photo — cleared as soon as its bytes are read so the same
    /// photo can be picked again later.
    @State private var screenshotItem: PhotosPickerItem?
    /// Recognition failures — soft misses (nothing recognized) and hard
    /// errors (network, billing) alike; clears with the alert.
    @State private var recognitionError: String?
    /// The pinned model's vision budget — seeded from the UserDefaults
    /// mirror at init, corrected by a fetch when the cover appears, so the
    /// tiler follows a model switch made in the admin without an app
    /// update.
    @State private var budgetStore = RecognitionBudgetStore()

    /// Recognition always records into the app's active ledger.
    private var ledger: QianlaiLedger? { ledgerStore.activeLedger }

    var body: some View {
        Group {
            if mode == .voice {
                VoiceEntryView(
                    onRecognition: onRecognition,
                    onBack: { mode = .screenshot }
                )
            } else {
                switch stage {
                case .picking:
                    pickingStage
                case .recognizing:
                    recognizingStage
                }
            }
        }
        .appBackgroundCanvas()
        .background(Color.groupedCanvas)
        .navigationTitle(Text(L10n.string("ai.title", defaultValue: "AI Bookkeeping")))
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
        .onAppear {
            Task { await budgetStore.refresh() }
        }
    }

    // MARK: - Stages

    /// The input state: the screenshot card and the voice card — two doors
    /// into the same seeded quick entry, each with its one-line hint.
    private var pickingStage: some View {
        // Read on the actor before the label closure: PhotosPicker's label
        // is @Sendable, and the store property is main-actor isolated.
        let surface = backgroundSettings.chipSurface
        return VStack(spacing: 16) {
            Spacer()
            PhotosPicker(selection: $screenshotItem, matching: .images) {
                AIInputCard(surface: surface) {
                    Image(systemName: "doc.viewfinder")
                        .font(.system(size: 40))
                        .foregroundStyle(Color.accentColor)
                    Text(L10n.string("screenshot.pick", defaultValue: "Choose Screenshot"))
                        .font(.headline)
                    Text(L10n.string(
                        "screenshot.pickHint",
                        defaultValue: "Works with Alipay, WeChat Pay and other payment screenshots"
                    ))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            Button {
                mode = .voice
            } label: {
                AIInputCard(surface: surface) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(Color.accentColor)
                    Text(L10n.string("voice.cardTitle", defaultValue: "Speak an Entry"))
                        .font(.headline)
                    Text(L10n.string(
                        "voice.cardHint",
                        defaultValue: "One transaction, spoken out loud"
                    ))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
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
        guard let tiles = ScreenshotTiler.recognitionTiles(
            from: imageData,
            budget: budgetStore.budget
        ), !tiles.isEmpty else {
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
            // The recognized screenshot rides along as the entry's receipt:
            // compressed to its final upload bytes now, the same pipeline
            // the attachments picker drains through. A re-encode failure
            // just skips the receipt — never a failed recognition.
            onRecognition(RecognizedScreenshot(
                recognition: result,
                imageData: ReceiptImage.jpeg(imageData)
            ))
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
    func aiBookkeepingCover(
        isPresented: Binding<Bool>,
        seed: Binding<RecognizedScreenshot?>
    ) -> some View {
        fullScreenCover(isPresented: isPresented, onDismiss: { seed.wrappedValue = nil }) {
            NavigationStack {
                if let recognized = seed.wrappedValue {
                    QuickEntryView(recognition: recognized)
                } else {
                    AIBookkeepingView(onRecognition: { seed.wrappedValue = $0 })
                }
            }
            .interactiveDismissDisabled()
        }
    }
}

/// The rounded card chrome both AI-input doors render — the screenshot
/// picker card here and the voice page's idle mic card share the shell,
/// only the contents differ.
struct AIInputCard<Content: View>: View {
    let surface: Color
    var spacing: CGFloat = 12
    var height: CGFloat = 160
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: spacing) { content() }
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(surface)
            )
            .contentShape(Rectangle())
    }
}
