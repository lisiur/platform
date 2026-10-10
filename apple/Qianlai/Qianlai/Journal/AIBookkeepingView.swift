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
/// payment screenshot (tile → upload → AI vision recognize), or hold the
/// voice card and speak the transaction (release ends the dictation; the
/// on-device transcript goes to the server parse). A soft miss (nothing
/// recognized) or an error falls back to the door's idle state for the
/// next attempt.
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

    @State private var stage: Stage = .picking
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
    /// The hold-to-talk pipeline: the voice card drives this model directly
    /// (press starts the transcriber, lifting the finger stops it and kicks
    /// off the parse).
    @State private var voiceModel: VoiceEntryModel

    init(
        onRecognition: @escaping (RecognizedScreenshot) -> Void,
        voiceDemoStage: VoiceEntryModel.Stage? = nil
    ) {
        self.onRecognition = onRecognition
        _voiceModel = State(initialValue: VoiceEntryModel(
            transcriber: VoiceTranscriber(),
            onRecognition: onRecognition,
            demoStage: voiceDemoStage
        ))
    }

    /// Recognition always records into the app's active ledger.
    private var ledger: QianlaiLedger? { ledgerStore.activeLedger }

    /// Voice occupies its card while dictating or parsing.
    private var voiceBusy: Bool { voiceModel.stage != .idle }

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
        .navigationTitle(Text(L10n.string("ai.title", defaultValue: "AI Bookkeeping")))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.string("common.cancel", defaultValue: "Cancel")) {
                    voiceModel.abandon()
                    dismiss()
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

    /// The input state: the screenshot card and the hold-to-talk voice card
    /// — two doors into the same seeded quick entry.
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
            .disabled(voiceBusy)
            .padding(.horizontal, 24)
            voiceCard(surface: surface)
                .padding(.horizontal, 24)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// The hold-to-talk door: press and hold to dictate, release to stop
    /// and parse.
    ///
    /// Structure is load-bearing: the Button's label is a byte-stable empty
    /// card, and ALL stage-dependent visuals (transcript, spinner) render in
    /// an overlay above it. Every prior attempt hung press tracking off the
    /// live content — LongPress sequence, bare DragGesture, style onChange —
    /// and the stage flip at touch-down rebuilt the tracked view mid-gesture,
    /// swallowing the finger-up ("release never stops, a second tap does").
    private func voiceCard(surface: Color) -> some View {
        ZStack {
            Button {
                // Press edges are handled by the style; the tap action is
                // intentionally empty — a bare tap is too short to dictate
                // into and the model's gates absorb it.
            } label: {
                AIInputCard(surface: surface) { Color.clear }
            }
            .buttonStyle(HoldToTalkStyle { pressed in
                if pressed {
                    Task { await startVoice() }
                } else {
                    Task { await finishVoice() }
                }
            })
        }
        .overlay {
            AIInputCard(surface: surface) {
                switch voiceModel.stage {
                case .idle:
                    Image(systemName: "mic.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(Color.accentColor)
                    Text(L10n.string("voice.cardTitle", defaultValue: "Speak an Entry"))
                        .font(.headline)
                    Text(L10n.string(
                        "voice.cardHint",
                        defaultValue: "Hold to speak, release to finish"
                    ))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                case .recording:
                    Image(systemName: "mic.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(Color.accentColor)
                        .symbolEffect(.pulse, options: .repeating, isActive: true)
                    Text(
                        voiceModel.transcriber.partialText.isEmpty
                            ? L10n.string("voice.listening", defaultValue: "Listening…")
                            : voiceModel.transcriber.partialText
                    )
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    Text(L10n.string("voice.releaseToFinish", defaultValue: "Release to finish"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                case .parsing:
                    ProgressView()
                    Text(L10n.string("voice.parsing", defaultValue: "Parsing…"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .allowsHitTesting(false)
        }
        .accessibilityLabel(Text(L10n.string("voice.cardTitle", defaultValue: "Speak an Entry")))
        .accessibilityHint(Text(L10n.string(
            "voice.cardHint",
            defaultValue: "Hold to speak, release to finish"
        )))
        .alert(
            L10n.string("voice.failedTitle", defaultValue: "Voice Entry Failed"),
            isPresented: Binding(
                get: { voiceModel.errorMessage != nil },
                set: { if !$0 { voiceModel.clearError() } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {}
        } message: {
            Text(voiceModel.errorMessage ?? "")
        }
    }

    private func startVoice() async {
        await voiceModel.startRecording(ledgerId: ledger?.id)
    }

    private func finishVoice() async {
        await voiceModel.stopAndParse(ledgerId: ledger?.id) { ledgerId, transcript, now in
            try await journalStore.recognizeVoice(
                ledgerId: ledgerId,
                transcript: transcript,
                now: now
            )
        }
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

/// Press tracking for the hold-to-talk card. Button's own press machinery
/// survives the card's content swapping between idle/recording/parsing —
/// a bare DragGesture attached to the changing content loses the finger-up
/// mid-gesture, which is exactly the "release never stops" bug.
private struct HoldToTalkStyle: ButtonStyle {
    let onHoldChange: (Bool) -> Void

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, pressed in
                onHoldChange(pressed)
            }
    }
}

/// The rounded card chrome both AI-input doors render — the screenshot
/// picker card and the hold-to-talk voice card share the shell, only the
/// contents differ.
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
