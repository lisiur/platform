//
//  VoiceEntryModel.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/10/8.
//

import SwiftUI

/// The hold-to-talk pipeline's state machine, driven by the AI-bookkeeping
/// page's voice card (press starts the transcriber, release stops it and
/// kicks off the parse) and abstracted behind `VoiceTranscribing` so tests
/// can drive it with a fake — the real one needs a mic and, per Apple's
/// sample, a physical device.
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

    let transcriber: any VoiceTranscribing
    /// Offline harness pin (`--ui-demo-voice-recording` / `-parsing`):
    /// non-nil short-circuits the pipelines — no mic, no permissions, no
    /// server.
    private let demoStage: Stage?
    private let onRecognition: (RecognizedScreenshot) -> Void

    typealias Parse = (_ ledgerId: String, _ transcript: String, _ now: String) async throws
        -> ScreenshotRecognition

    /// Set once `transcriber.start()` has returned; a release before that
    /// parks in `pendingFinish` instead of stopping an engine that isn't up
    /// yet.
    private var isListening = false
    /// A finger-up that arrived while `start()` was still in flight
    /// (typically behind the first-run permission prompt); drained by
    /// `startRecording` the moment listening begins.
    private var pendingFinish: (ledgerId: String?, parse: Parse)?

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

    /// Dismisses the failure alert.
    func clearError() {
        errorMessage = nil
    }

    /// The page's cancel: tear the session down without a parse, dropping
    /// any release that is still parked behind an in-flight start. A start
    /// that lands afterwards stops itself (the stage no longer reads
    /// recording).
    func abandon() {
        pendingFinish = nil
        stage = .idle
        transcriber.cancel()
    }

    /// Permission → engine → live transcript. A failure (denied permission,
    /// unsupported locale, dead engine) drops back to the idle card.
    func startRecording(ledgerId: String?) async {
        guard stage == .idle, ledgerId != nil else { return }
        // Fresh session: a release parked by a previous failed start must
        // never drain into this one.
        pendingFinish = nil
        // Recording flips synchronously, before the engine is up: the
        // gesture's repeated touch events and an early finger-up all land
        // on a well-defined stage instead of racing the in-flight start.
        stage = .recording
        isListening = false
        if demoStage != nil {
            isListening = true
            return
        }
        do {
            try await transcriber.start()
        } catch {
            pendingFinish = nil
            if stage == .recording {
                stage = .idle
                errorMessage = Self.message(for: error)
            }
            return
        }
        isListening = true
        guard stage == .recording else {
            // The page was abandoned while start was in flight — don't
            // leave a live engine behind.
            _ = await transcriber.stop()
            return
        }
        // The hold may have ended while the permission prompt or engine
        // setup was in flight — drain the release that arrived early.
        if let pending = pendingFinish {
            pendingFinish = nil
            await stopAndParse(ledgerId: pending.ledgerId, parse: pending.parse)
        }
    }

    /// Final transcript → server parse → hand off. An empty transcript or a
    /// soft miss falls back to the idle card; a success leaves this page for
    /// good — the quick entry carries the result.
    func stopAndParse(
        ledgerId: String?,
        parse: @escaping Parse
    ) async {
        guard stage == .recording else { return }
        guard isListening else {
            // start() still in flight — remember the release; its
            // completion drains it.
            pendingFinish = (ledgerId, parse)
            return
        }
        let transcript = demoStage == nil ? await transcriber.stop() : transcriber.partialText
        // abandon() may have fired while stop() was draining the backend —
        // the page is gone, so nothing further may parse or hand off.
        guard stage == .recording else { return }
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
            // the quick entry — the idle card is the honest answer.
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
