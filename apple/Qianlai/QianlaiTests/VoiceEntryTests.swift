//
//  VoiceEntryTests.swift
//  QianlaiTests
//

import XCTest
@testable import Qianlai

/// The voice page's stage machine, driven by a fake transcriber — the real
/// one needs a mic and, per Apple's sample, a physical device. Covers the
/// idle → recording → parsing flow: entry guards, every failure fallback,
/// and the recognition handoff.
@MainActor
final class VoiceEntryTests: XCTestCase {
    private final class FakeTranscriber: VoiceTranscribing {
        private(set) var partialText = ""
        private(set) var startCount = 0
        private(set) var stopCount = 0
        var startError: (any Error)?
        /// What `stop` hands back as the final transcript.
        var finalText = ""

        func start() async throws {
            startCount += 1
            if let startError { throw startError }
        }

        func stop() async -> String {
            stopCount += 1
            partialText = finalText
            return finalText
        }

        func cancel() {}
    }

    private func recognition(
        recognized: Bool = true
    ) -> ScreenshotRecognition {
        ScreenshotRecognition(
            recognized: recognized,
            kind: recognized ? "expense" : nil,
            amount: recognized ? 23.0 : nil,
            amountAlternatives: [],
            occurredAt: nil,
            merchant: recognized ? "滴滴" : nil,
            memo: recognized ? "打车" : nil,
            categoryName: recognized ? "transport" : nil,
            categoryAlternatives: [],
            confidence: recognized ? "high" : nil
        )
    }

    private func makeModel(
        _ fake: FakeTranscriber,
        demoStage: VoiceEntryModel.Stage? = nil
    ) -> (VoiceEntryModel, () -> [RecognizedScreenshot]) {
        var handedOff: [RecognizedScreenshot] = []
        let model = VoiceEntryModel(
            transcriber: fake,
            onRecognition: { handedOff.append($0) },
            demoStage: demoStage
        )
        return (model, { handedOff })
    }

    func testTapStartsRecordingThroughTheTranscriber() async {
        let fake = FakeTranscriber()
        let (model, _) = makeModel(fake)

        await model.startRecording(ledgerId: "ledger-1")

        XCTAssertEqual(model.stage, .recording)
        XCTAssertEqual(fake.startCount, 1)
        XCTAssertNil(model.errorMessage)
    }

    func testNoActiveLedgerNeverStartsTheMic() async {
        let fake = FakeTranscriber()
        let (model, _) = makeModel(fake)

        await model.startRecording(ledgerId: nil)

        XCTAssertEqual(model.stage, .idle)
        XCTAssertEqual(fake.startCount, 0)
    }

    func testDeniedPermissionDropsBackToIdleWithCopy() async {
        let fake = FakeTranscriber()
        fake.startError = VoiceTranscriptionError.microphonePermissionDenied
        let (model, _) = makeModel(fake)

        await model.startRecording(ledgerId: "ledger-1")

        XCTAssertEqual(model.stage, .idle)
        XCTAssertEqual(
            model.errorMessage,
            L10n.string(
                "voice.micDenied",
                defaultValue: "Microphone access is off. Enable it in Settings to dictate an entry."
            )
        )
    }

    func testEmptyTranscriptFallsBackToIdleWithoutParsing() async {
        let fake = FakeTranscriber()
        let (model, _) = makeModel(fake)
        await model.startRecording(ledgerId: "ledger-1")
        var parseCalls = 0

        await model.stopAndParse(ledgerId: "ledger-1") { _, _, _ in
            parseCalls += 1
            return self.recognition()
        }

        XCTAssertEqual(model.stage, .idle)
        XCTAssertEqual(parseCalls, 0)
        XCTAssertEqual(fake.stopCount, 1)
        XCTAssertEqual(
            model.errorMessage,
            L10n.string(
                "voice.noSpeech",
                defaultValue: "Didn't catch anything. Try again."
            )
        )
    }

    func testRecognizedHandoffCarriesTranscriptAndOffsetFreeNow() async {
        let fake = FakeTranscriber()
        fake.finalText = "昨天打车 23 块"
        let (model, handedOff) = makeModel(fake)
        await model.startRecording(ledgerId: "ledger-1")
        var seenLedgerId: String?
        var seenTranscript: String?
        var seenNow: String?

        await model.stopAndParse(ledgerId: "ledger-1") { ledgerId, transcript, now in
            seenLedgerId = ledgerId
            seenTranscript = transcript
            seenNow = now
            return self.recognition()
        }

        XCTAssertEqual(seenLedgerId, "ledger-1")
        XCTAssertEqual(seenTranscript, "昨天打车 23 块")
        // The server resolves "昨天" against this anchor — it must stay
        // offset-free local wall clock, the same shape occurredAt returns.
        XCTAssertNotNil(seenNow?.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$"#, options: .regularExpression))
        XCTAssertEqual(handedOff().count, 1)
        XCTAssertEqual(handedOff().first?.recognition.amount, 23.0)
    }

    func testSoftMissFallsBackToIdleWithCopy() async {
        let fake = FakeTranscriber()
        fake.finalText = "这个月花了多少"
        let (model, handedOff) = makeModel(fake)
        await model.startRecording(ledgerId: "ledger-1")

        await model.stopAndParse(ledgerId: "ledger-1") { _, _, _ in
            self.recognition(recognized: false)
        }

        XCTAssertEqual(model.stage, .idle)
        XCTAssertTrue(handedOff().isEmpty)
        XCTAssertEqual(
            model.errorMessage,
            L10n.string(
                "voice.notRecognized",
                defaultValue: "Couldn't make out a transaction. Try saying it again."
            )
        )
    }

    func testBillingRejectionSurfacesNoCreditCopy() async {
        let fake = FakeTranscriber()
        fake.finalText = "午饭 35 块"
        let (model, handedOff) = makeModel(fake)
        await model.startRecording(ledgerId: "ledger-1")

        await model.stopAndParse(ledgerId: "ledger-1") { _, _, _ in
            throw APIError.server(status: 402, message: "Insufficient credit balance")
        }

        XCTAssertEqual(model.stage, .idle)
        XCTAssertTrue(handedOff().isEmpty)
        XCTAssertEqual(
            model.errorMessage,
            L10n.string(
                "voice.noCredit",
                defaultValue: "Not enough credits for voice entry. Redeem a code to top up."
            )
        )
    }

    /// The `--ui-demo-voice-recording` / `-parsing` pin: pipelines
    /// short-circuit — no mic, no server parse, and the handoff plays the
    /// fake demo recognition.
    func testDemoHarnessSkipsMicAndServer() async {
        let fake = FakeTranscriber()
        let (model, handedOff) = makeModel(fake, demoStage: .idle)
        var parseCalls = 0

        await model.startRecording(ledgerId: "ledger-1")
        XCTAssertEqual(model.stage, .recording)
        XCTAssertEqual(fake.startCount, 0)

        await model.stopAndParse(ledgerId: "ledger-1") { _, _, _ in
            parseCalls += 1
            return self.recognition()
        }

        XCTAssertEqual(parseCalls, 0)
        XCTAssertEqual(handedOff().count, 1)
        XCTAssertEqual(handedOff().first?.recognition.merchant, "盒马")
        XCTAssertEqual(handedOff().first?.recognition.amount, 35.0)
    }

    /// A start() that parks until released — simulates the first-run
    /// permission prompt sitting between touch-down and listening.
    private final class GatedTranscriber: VoiceTranscribing {
        private(set) var partialText = ""
        private var gate: CheckedContinuation<Void, Never>?

        func releaseStart() {
            gate?.resume()
            gate = nil
        }

        func start() async throws {
            await withCheckedContinuation { gate = $0 }
        }

        func stop() async -> String {
            partialText = "昨天打车 23 块"
            return partialText
        }

        func cancel() {}
    }

    /// Release while `start()` is still parked: the release parks in the
    /// model and drains the moment listening begins — it must never wedge
    /// the stage in `.recording`.
    func testEarlyReleaseDuringStartDrainsOnceListening() async {
        let fake = GatedTranscriber()
        var handedOff: [RecognizedScreenshot] = []
        let model = VoiceEntryModel(
            transcriber: fake,
            onRecognition: { handedOff.append($0) }
        )

        let startTask = Task { await model.startRecording(ledgerId: "ledger-1") }
        try? await Task.sleep(for: .milliseconds(100))
        // Touch-down flips the stage synchronously, engine still parked.
        XCTAssertEqual(model.stage, .recording)

        var parseCalls = 0
        let finishTask = Task {
            await model.stopAndParse(ledgerId: "ledger-1") { _, _, _ in
                parseCalls += 1
                return self.recognition()
            }
        }
        try? await Task.sleep(for: .milliseconds(100))
        // Still parked: the release is held, nothing parsed yet.
        XCTAssertEqual(parseCalls, 0)

        fake.releaseStart()
        await startTask.value
        await finishTask.value

        XCTAssertEqual(parseCalls, 1)
        XCTAssertEqual(handedOff.count, 1)
        XCTAssertEqual(handedOff.first?.recognition.amount, 23.0)
    }

    /// A stop() that parks until released — mirrors the real transcriber's
    /// wait-for-backend drain.
    private final class GatedStopTranscriber: VoiceTranscribing {
        private(set) var partialText = ""
        private var gate: CheckedContinuation<Void, Never>?

        func releaseStop() {
            gate?.resume()
            gate = nil
        }

        func start() async throws {}

        func stop() async -> String {
            await withCheckedContinuation { gate = $0 }
            return "昨天打车 23 块"
        }

        func cancel() {}
    }

    /// Cancel while stop() is still draining: the page is gone, so the
    /// parked stop must resolve into no parse and no handoff.
    func testAbandonDuringStopSkipsTheParse() async {
        let fake = GatedStopTranscriber()
        var handedOff: [RecognizedScreenshot] = []
        let model = VoiceEntryModel(
            transcriber: fake,
            onRecognition: { handedOff.append($0) }
        )
        await model.startRecording(ledgerId: "ledger-1")
        XCTAssertEqual(model.stage, .recording)

        let finishTask = Task {
            await model.stopAndParse(ledgerId: "ledger-1") { _, _, _ in
                XCTFail("parse must not run after abandon")
                return self.recognition()
            }
        }
        try? await Task.sleep(for: .milliseconds(100)) // stop() parked
        model.abandon()
        fake.releaseStop()
        await finishTask.value

        XCTAssertTrue(handedOff.isEmpty)
        XCTAssertEqual(model.stage, .idle)
    }
}
