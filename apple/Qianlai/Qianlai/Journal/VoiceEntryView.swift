//
//  VoiceEntryView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/10/8.
//

import SwiftUI

/// The voice page's state machine, extracted from the view so a fake
/// transcriber can drive it in tests — the real one needs a mic and, per
/// Apple's sample, a physical device.
@MainActor
@Observable
final class VoiceEntryModel {
    enum Stage {
        case idle
        case recording
        case parsing
    }

    private(set) var stage: Stage
    /// Recognition failures — soft misses (nothing recognized), empty
    /// transcripts, and hard errors (network, billing, permissions) alike;
    /// clears with the alert.
    private(set) var errorMessage: String?

    /// Dismisses the failure alert.
    func clearError() {
        errorMessage = nil
    }

    let transcriber: any VoiceTranscribing
    /// Offline harness pin (`--ui-demo-voice-entry`): non-nil short-circuits
    /// the pipelines — no mic, no permissions, no server.
    private let demoStage: Stage?
    private let onRecognition: (RecognizedScreenshot) -> Void

    init(
        transcriber: any VoiceTranscribing,
        onRecognition: @escaping (RecognizedScreenshot) -> Void,
        demoStage: Stage? = nil
    ) {
        self.transcriber = transcriber
        self.onRecognition = onRecognition
        self.demoStage = demoStage
        stage = demoStage ?? .idle
    }

    /// Permission → engine → live transcript. A failure (denied permission,
    /// unsupported locale, dead engine) drops back to the idle mic.
    func startRecording(ledgerId: String?) async {
        guard stage == .idle, ledgerId != nil else { return }
        if demoStage != nil {
            stage = .recording
            return
        }
        do {
            try await transcriber.start()
            stage = .recording
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    /// Final transcript → server parse → hand off. An empty transcript or a
    /// soft miss falls back to the idle mic; a success leaves this page for
    /// good — the quick entry carries the result.
    func stopAndParse(
        ledgerId: String?,
        parse: (_ ledgerId: String, _ transcript: String, _ now: String) async throws
            -> ScreenshotRecognition
    ) async {
        guard stage == .recording else { return }
        let transcript = demoStage == nil ? await transcriber.stop() : transcriber.partialText
        stage = .parsing
        if demoStage != nil {
            try? await Task.sleep(for: .seconds(1))
            onRecognition(RecognizedScreenshot(
                recognition: Self.demoRecognition,
                imageData: nil
            ))
            return
        }
        guard let ledgerId else { return }
        guard !transcript.isEmpty else {
            stage = .idle
            errorMessage = L10n.string(
                "voice.noSpeech",
                defaultValue: "Didn't catch anything. Try again."
            )
            return
        }
        do {
            let result = try await parse(ledgerId, transcript, Self.localWallClockNow())
            // A soft miss (no transaction in the transcript) never reaches
            // the quick entry — the idle mic is the honest answer.
            guard result.recognized else {
                stage = .idle
                errorMessage = L10n.string(
                    "voice.notRecognized",
                    defaultValue: "Couldn't make out a transaction. Try saying it again."
                )
                return
            }
            onRecognition(RecognizedScreenshot(recognition: result, imageData: nil))
        } catch {
            stage = .idle
            errorMessage = Self.message(for: error)
        }
    }

    /// Billing rejections read as their own guidance; everything else keeps
    /// the error's own message (the transcriber's typed errors carry the
    /// localized copy already).
    private static func message(for error: Error) -> String {
        if case .server(402, _) = error as? APIError {
            return L10n.string(
                "voice.noCredit",
                defaultValue: "Not enough credits for voice entry. Redeem a code to top up."
            )
        }
        return error.localizedDescription
    }

    /// The anchor the server resolves "昨天早上" against — local wall
    /// clock, no offset, the same format `occurredAt` comes back in.
    private static func localWallClockNow() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        formatter.timeZone = .current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.string(from: Date())
    }

    /// The demo pipeline's fake parse result — the handoff plays against
    /// this, mirroring the shape a real server answer takes.
    private static let demoRecognition = ScreenshotRecognition(
        recognized: true,
        kind: "expense",
        amount: 35.0,
        amountAlternatives: [],
        occurredAt: nil,
        merchant: "盒马",
        memo: "午饭",
        categoryName: "餐饮",
        categoryAlternatives: [],
        confidence: "high"
    )
}

/// The voice-entry page: speak one transaction, watch the live transcript,
/// then hand the parsed result to the quick-entry sheet, which is the result
/// surface now (`QuickEntryView(recognition:)` seeds the recognized fields
/// in — speech produces no image, so the receipt slot stays empty). This
/// page only covers dictating and parsing; a soft miss (nothing recognized)
/// or an error falls back to the idle mic for the next attempt.
struct VoiceEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(JournalStore.self) private var journalStore
    @Environment(BackgroundSettings.self) private var backgroundSettings

    /// The way back to the input cards. `nil` (standalone mounting) makes
    /// the cancel button dismiss the whole page instead.
    let onBack: (() -> Void)?

    @State private var model: VoiceEntryModel

    init(
        onRecognition: @escaping (RecognizedScreenshot) -> Void,
        onBack: (() -> Void)? = nil,
        demoStage: VoiceEntryModel.Stage? = nil
    ) {
        self.onBack = onBack
        _model = State(initialValue: VoiceEntryModel(
            transcriber: VoiceTranscriber(),
            onRecognition: onRecognition,
            demoStage: demoStage
        ))
    }

    /// Recognition always records into the app's active ledger.
    private var ledger: QianlaiLedger? { ledgerStore.activeLedger }

    var body: some View {
        Group {
            switch model.stage {
            case .idle:
                idleStage
            case .recording:
                recordingStage
            case .parsing:
                parsingStage
            }
        }
        .appBackgroundCanvas()
        .background(Color.groupedCanvas)
        .navigationTitle(Text(L10n.string("voice.title", defaultValue: "Voice Entry")))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.string("common.cancel", defaultValue: "Cancel")) {
                    model.transcriber.cancel()
                    if let onBack {
                        onBack()
                    } else {
                        dismiss()
                    }
                }
            }
        }
        .alert(
            L10n.string("voice.failedTitle", defaultValue: "Voice Entry Failed"),
            isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { if !$0 { model.clearError() } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    // MARK: - Stages

    private var surface: Color { backgroundSettings.chipSurface }

    /// The empty state: one big mic card, one hint line with a worked
    /// example so the first-time user knows what a dictation sounds like.
    private var idleStage: some View {
        VStack(spacing: 20) {
            Spacer()
            Button {
                Task { await startRecording() }
            } label: {
                AIInputCard(surface: surface, spacing: 14, height: 190) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 46))
                        .foregroundStyle(Color.accentColor)
                    Text(L10n.string("voice.tapToSpeak", defaultValue: "Tap and Speak"))
                        .font(.headline)
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            Text(L10n.string(
                "voice.hint",
                defaultValue: "Try: “Lunch today, 35 yuan, at Hema”"
            ))
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// The dictation state: pulsing mic, the live transcript (or a
    /// listening placeholder while nothing has come through yet), and the
    /// stop button that ends dictation and kicks off the parse.
    private var recordingStage: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "mic.fill")
                .font(.system(size: 46))
                .foregroundStyle(Color.accentColor)
                .symbolEffect(.pulse, options: .repeating, isActive: true)
            Text(
                model.transcriber.partialText.isEmpty
                    ? L10n.string("voice.listening", defaultValue: "Listening…")
                    : model.transcriber.partialText
            )
            .font(.title3)
            .multilineTextAlignment(.center)
            .frame(minHeight: 60)
            .padding(.horizontal, 32)
            Button {
                Task { await stopAndParse() }
            } label: {
                Text(L10n.string("voice.stop", defaultValue: "Done"))
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 24)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var parsingStage: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(L10n.string("voice.parsing", defaultValue: "Parsing…"))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Pipeline

    private func startRecording() async {
        await model.startRecording(ledgerId: ledger?.id)
    }

    private func stopAndParse() async {
        await model.stopAndParse(ledgerId: ledger?.id) { ledgerId, transcript, now in
            try await journalStore.recognizeVoice(
                ledgerId: ledgerId,
                transcript: transcript,
                now: now
            )
        }
    }
}
