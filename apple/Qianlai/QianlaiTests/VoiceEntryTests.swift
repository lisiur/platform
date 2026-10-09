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

    /// The `--ui-demo-voice-entry` pin: pipelines short-circuit — no mic,
    /// no server parse, and the handoff plays the fake demo recognition.
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
}
