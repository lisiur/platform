//
//  VoiceTranscriber.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/10/8.
//

import AVFoundation
import Speech

/// The dictation capability the voice page drives, abstracted so the stage
/// machine is testable with a fake — the real one needs a mic and, per
/// Apple's sample, a physical device.
@MainActor
protocol VoiceTranscribing: AnyObject {
    /// The live transcript so far — final segments plus the still-changing
    /// volatile tail.
    var partialText: String { get }

    /// Requests both permissions and starts listening. Throws the typed
    /// errors the voice page maps to its own copy.
    func start() async throws

    /// Finalizes the transcription and returns the final transcript (empty
    /// when nothing was recognized). Safe to call even when `start` failed —
    /// it just returns the empty string.
    func stop() async -> String

    /// Tears the session down without waiting for a final result.
    func cancel()
}

/// Errors the voice page surfaces as its own copy; everything else keeps the
/// underlying description.
enum VoiceTranscriptionError: LocalizedError {
    case microphonePermissionDenied
    case speechPermissionDenied
    case assetsUnavailable
    case localeUnsupported
    case engineFailure(String)

    var errorDescription: String? {
        switch self {
        case .microphonePermissionDenied:
            return L10n.string(
                "voice.micDenied",
                defaultValue: "Microphone access is off. Enable it in Settings to dictate an entry."
            )
        case .speechPermissionDenied:
            return L10n.string(
                "voice.speechDenied",
                defaultValue: "Speech recognition is off. Enable it in Settings to dictate an entry."
            )
        case .assetsUnavailable:
            return L10n.string(
                "voice.assetsUnavailable",
                defaultValue: "The speech model isn't downloaded yet. Check your connection and try again."
            )
        case .localeUnsupported:
            return L10n.string(
                "voice.localeUnsupported",
                defaultValue: "Speech recognition isn't available for this language."
            )
        case .engineFailure(let message):
            return message
        }
    }
}

/// One dictation pass: permission → audio engine → the iOS 26
/// `SpeechTranscriber` with live partial text, ending in a final transcript.
/// On-device only, by contract — the classic `SFSpeechRecognizer` gets no
/// fallback path here because its non-on-device route sends audio to Apple's
/// server, the one thing this feature must never do. Audio never leaves the
/// device and never touches disk or logs; only the final text travels
/// onward, inside the ledger-scoped recognition call.
@MainActor
@Observable
final class VoiceTranscriber: VoiceTranscribing {
    /// The live transcript so far — final segments plus the still-changing
    /// volatile tail. Read by the recording stage.
    private(set) var partialText = ""

    private(set) var isRecording = false

    /// Tail padding: the finger comes up *with* the last syllable, so the
    /// tail's decay (a Chinese final rings 150–300ms past the release) and
    /// the short trailing silence the transcriber needs to commit a segment
    /// both land after the release. Ending the input stream at lift-off
    /// throws that audio away for good — a finished continuation silently
    /// drops every buffer the still-running tap yields — so what survives is
    /// a last segment cut at its onset, which is exactly the shape on-device
    /// transcription degrades on. The tap keeps feeding for a beat past the
    /// release instead. Sized to the decay with margin, not to a bar: a
    /// bookkeeping utterance is one sentence, so a longer window would only
    /// hold the card open.
    private static let tailPadding = Duration.milliseconds(400)

    private var engine: AVAudioEngine?
    /// Set once the analyzer can produce no more results; guards the stop
    /// waiter against a finalize that already happened.
    private var backendDone = false
    /// The deferred input-stream close armed by `stop`; cancelled by
    /// `teardown` so an abandon during the tail window never finalizes.
    private var tailTask: Task<Void, Never>?
    /// Bumped per `stop` so a stale watchdog can't release a newer wait.
    private var stopGeneration = 0
    /// `stop` parks here until the analyzer's results stream drained (final
    /// result delivered). Resumed exactly once — by the completion path,
    /// which nils it.
    private var stopWaiter: CheckedContinuation<Void, Never>?

    // MARK: - Public pipeline

    func start() async throws {
        guard await Self.requestMicrophonePermission() else {
            throw VoiceTranscriptionError.microphonePermissionDenied
        }
        guard await Self.requestSpeechPermission() else {
            throw VoiceTranscriptionError.speechPermissionDenied
        }
        partialText = ""
        // Fresh session state: a previous pass on this instance ended
        // through stop or cancel, either of which marks the backend done.
        backendDone = false
        stopWaiter = nil
        isRecording = true
        // A locale the on-device model doesn't cover is a dead end — there
        // is deliberately no server-side recognizer to fall back to.
        guard let locale = await Self.transcriberSupportedLocale() else {
            isRecording = false
            throw VoiceTranscriptionError.localeUnsupported
        }
        do {
            try await startAnalyzerPath(locale: locale)
        } catch let error as VoiceTranscriptionError {
            isRecording = false
            throw error
        } catch {
            isRecording = false
            teardown()
            throw VoiceTranscriptionError.engineFailure(error.localizedDescription)
        }
    }

    func stop() async -> String {
        guard isRecording else { return "" }
        isRecording = false
        if !backendDone {
            tailTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: Self.tailPadding)
                // Abandoned (or a second stop) while padding — the waiter is
                // already resolved and the plumbing is gone.
                guard let self, !Task.isCancelled else { return }
                // Armed here, not at entry: the finalize drain gets the full
                // budget on its own, never split with the padding.
                self.armStopWatchdog()
                self.finalizeBackend()
            }
            await withCheckedContinuation { continuation in
                self.stopWaiter = continuation
            }
        }
        teardown()
        return partialText
    }

    /// Watchdog: completion is normally signalled by the results stream
    /// ending; if the backend never confirms, release the stop after a beat
    /// with whatever transcript exists — a wedged stop is worse than a
    /// truncated one. Generation-scoped so a stale one can't release a newer
    /// wait.
    private func armStopWatchdog() {
        stopGeneration += 1
        let generation = stopGeneration
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard let self, generation == self.stopGeneration,
                  !self.backendDone, let waiter = self.stopWaiter else { return }
            self.stopWaiter = nil
            waiter.resume()
        }
    }

    func cancel() {
        // Deliberately guard-free: a stop() may be parked waiting for the
        // backend (it already cleared isRecording) — release it and tear
        // the plumbing down, so no analyzer leaks behind either path.
        isRecording = false
        backendDone = true
        stopWaiter?.resume()
        stopWaiter = nil
        teardown()
    }

    // MARK: - Permissions

    private static func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    private static func requestSpeechPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    // MARK: - Locale

    /// The device's language, region variant included — recognition follows
    /// the speaker, not the app's in-app language override.
    private static var preferredLocale: Locale { .current }

    /// The supported equivalent of the preferred locale, else zh-CN.
    private static func transcriberSupportedLocale() async -> Locale? {
        guard SpeechTranscriber.isAvailable else { return nil }
        if let equivalent = await SpeechTranscriber.supportedLocale(
            equivalentTo: preferredLocale
        ) {
            return equivalent
        }
        return await SpeechTranscriber.supportedLocale(
            equivalentTo: Locale(identifier: "zh-CN")
        )
    }

    // MARK: - Analyzer path

    private var analyzer: SpeechAnalyzer?
    private var resultsTask: Task<Void, Never>?
    /// The live tap's input side. Ending this stream is what makes the
    /// analyzer finalize and its results sequence complete — without it a
    /// live-tap stop can never finish.
    private var inputContinuation: AsyncStream<AnalyzerInput>.Continuation?
    private var frozenText = ""
    private var volatileText = ""

    private func startAnalyzerPath(locale: Locale) async throws {
        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        let status = await AssetInventory.status(forModules: [transcriber])
        if status != .installed {
            // First use on this device: bring the on-device model down
            // (hundreds of MB). A missing request or a failed install is a
            // dead end — there is deliberately no server recognizer behind
            // it.
            guard
                let request = try await AssetInventory.assetInstallationRequest(
                    supporting: [transcriber]
                )
            else {
                throw VoiceTranscriptionError.assetsUnavailable
            }
            do {
                try await request.downloadAndInstall()
            } catch {
                throw VoiceTranscriptionError.assetsUnavailable
            }
        }

        frozenText = ""
        volatileText = ""
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer

        let engine = AVAudioEngine()
        self.engine = engine
        let inputNode = engine.inputNode
        let tapFormat = inputNode.outputFormat(forBus: 0)
        guard
            let targetFormat = await transcriber.availableCompatibleAudioFormats.min(by: {
                abs($0.sampleRate - tapFormat.sampleRate)
                    < abs($1.sampleRate - tapFormat.sampleRate)
            })
        else {
            throw VoiceTranscriptionError.engineFailure(
                "No compatible audio format for transcription"
            )
        }
        try await analyzer.prepareToAnalyze(in: targetFormat)

        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        inputContinuation = continuation
        guard
            let converter = AVAudioConverter(from: tapFormat, to: targetFormat)
        else {
            throw VoiceTranscriptionError.engineFailure(
                "Couldn't convert microphone audio for transcription"
            )
        }
        let tap = AnalyzerTap(
            converter: converter,
            format: targetFormat,
            continuation: continuation
        )
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: tapFormat) { buffer, _ in
            tap.forward(buffer)
        }

        try await Self.activateRecordingSession()
        try engine.start()
        try await analyzer.start(inputSequence: stream)

        resultsTask = Task { [weak self] in
            do {
                for try await result in transcriber.results {
                    guard let self else { return }
                    let text = String(result.text.characters)
                    let volatileEnd = await analyzer.volatileRange?.end
                    if let volatileEnd, result.range.end <= volatileEnd {
                        // Still changeable — it rides the volatile tail and
                        // gets replaced by the next emission of that range.
                        self.volatileText = text
                    } else {
                        self.frozenText += text
                        self.volatileText = ""
                    }
                    self.partialText = self.frozenText + self.volatileText
                }
            } catch {
                // Stream ended through finalize or an engine failure; either
                // way the transcript so far is the honest answer.
            }
            self?.backendCompleted()
        }
    }

    // MARK: - Stop / teardown

    /// Ends the input so the analyzer finalizes what it heard and its
    /// results sequence completes — the completion path then releases
    /// `stop`. The explicit finalize rides along for devices where the
    /// results stream drags its feet after end-of-input; neither call can
    /// block this synchronous context.
    private func finalizeBackend() {
        guard !backendDone else { return }
        inputContinuation?.finish()
        Task {
            try? await analyzer?.finalizeAndFinishThroughEndOfInput()
        }
    }

    /// The single completion hop: marks the backend done, releases a waiting
    /// `stop`, then tears the audio plumbing down.
    private func backendCompleted() {
        guard !backendDone else { return }
        backendDone = true
        stopWaiter?.resume()
        stopWaiter = nil
        finishRecordingSession()
    }

    private func teardown() {
        // The padding task must never outlive the session: it holds the only
        // reference to a finalize that would otherwise run against a torn
        // down analyzer.
        tailTask?.cancel()
        tailTask = nil
        resultsTask?.cancel()
        if let analyzer {
            Task { await analyzer.cancelAndFinishNow() }
        }
        finishRecordingSession()
    }

    /// Ends the audio plumbing; idempotent across the cancel/stop paths.
    /// Deactivation runs off the main thread — the synchronous
    /// `setActive(false)` warns it can stall the UI while the session is
    /// live, and the engine is already stopped here anyway.
    private func finishRecordingSession() {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        Task.detached(priority: .utility) {
            try? AVAudioSession.sharedInstance().setActive(
                false, options: .notifyOthersOnDeactivation
            )
        }
        inputContinuation?.finish()
        inputContinuation = nil
        engine = nil
        analyzer = nil
        resultsTask = nil
    }

    private static func activateRecordingSession() async throws {
        try AVAudioSession.sharedInstance().setCategory(
            .playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker]
        )
        // Off-main: the synchronous activation can block the UI thread
        // while the audio server round-trips.
        try await Task.detached(priority: .userInitiated) {
            try AVAudioSession.sharedInstance().setActive(true)
        }.value
    }
}

/// The tap's audio-thread side: converts each hardware buffer into the
/// transcriber's compatible format and yields it into the analyzer stream.
/// `@unchecked Sendable` because `installTap` closures run off the main
/// actor, and none of the captured AV objects are Sendable.
private final class AnalyzerTap: @unchecked Sendable {
    private let converter: AVAudioConverter
    private let format: AVAudioFormat
    private let continuation: AsyncStream<AnalyzerInput>.Continuation

    init(
        converter: AVAudioConverter,
        format: AVAudioFormat,
        continuation: AsyncStream<AnalyzerInput>.Continuation
    ) {
        self.converter = converter
        self.format = format
        self.continuation = continuation
    }

    func forward(_ buffer: AVAudioPCMBuffer) {
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
        guard
            let converted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity)
        else { return }
        var delivered = false
        converter.convert(
            to: converted,
            error: nil,
            withInputFrom: { _, outStatus in
                if delivered {
                    outStatus.pointee = .noDataNow
                    return nil
                }
                delivered = true
                outStatus.pointee = .haveData
                return buffer
            }
        )
        if converted.frameLength > 0 {
            continuation.yield(AnalyzerInput(buffer: converted))
        }
    }
}
