//
//  LedgerTransferTests.swift
//  QianlaiTests
//
//  The import preview is the screen a user trusts before handing over a
//  ledger file, so its decoding and its gate are pinned here: a shape the
//  server changes must fail loudly in a test rather than quietly reading
//  zeros in the user's face.
//

import XCTest
@testable import Qianlai

final class LedgerTransferTests: XCTestCase {
    private func decodePreview(_ json: String) throws -> LedgerImportPreview {
        try JSONDecoder().decode(LedgerImportPreview.self, from: Data(json.utf8))
    }

    /// The server's preview response, trimmed to the fields this screen
    /// reads. `source: "archive"` is the restore path (a zip with data.json
    /// inside), which is the one that carries photos.
    private let archivePreview = """
        {
          "source": "archive",
          "formatVersion": 1,
          "ledger": {
            "name": "家庭账本",
            "currency": "CNY",
            "entries": 128,
            "accounts": 31,
            "projects": 2,
            "people": 3,
            "from": "2024-01-05",
            "to": "2026-08-22"
          },
          "target": { "mode": "new", "ledgerId": null },
          "accounts": [
            { "key": "acc_1", "label": "餐饮", "action": "reuse", "targetId": "tgt_1" },
            { "key": "acc_2", "label": "旅行", "action": "create" }
          ],
          "projects": [
            { "key": "prj_1", "name": "京都之行", "action": "create" }
          ],
          "people": [
            { "key": "usr_a", "name": "Alice", "email": null, "action": "create" },
            { "key": "usr_b", "name": "Bob", "email": null, "action": "drop" }
          ],
          "entries": { "total": 128, "importable": 120, "duplicates": 7, "invalid": 1 },
          "photos": { "count": 34, "bytes": 4096, "missing": ["E000001-1.jpg"] },
          "issues": [
            { "where": "entry:ent_9", "message": "借贷不平：借方 10.00，贷方 9.00" }
          ],
          "blocking": [],
          "previewToken": "abc123"
        }
        """

    func testDecodesARestorePreview() throws {
        let preview = try decodePreview(archivePreview)

        XCTAssertEqual(preview.source, "archive")
        XCTAssertTrue(preview.isRestore)
        XCTAssertEqual(preview.ledger.name, "家庭账本")
        XCTAssertEqual(preview.ledger.currency, "CNY")
        XCTAssertEqual(preview.ledger.from, "2024-01-05")
        XCTAssertEqual(preview.ledger.to, "2026-08-22")
        XCTAssertEqual(preview.entries.importable, 120)
        XCTAssertEqual(preview.entries.duplicates, 7)
        XCTAssertEqual(preview.entries.invalid, 1)
        XCTAssertEqual(preview.photos.missing, ["E000001-1.jpg"])
        XCTAssertEqual(preview.previewToken, "abc123")
        XCTAssertTrue(preview.canCommit)
    }

    func testResolutionRowsCarryEitherALabelOrAName() throws {
        let preview = try decodePreview(archivePreview)

        XCTAssertEqual(preview.accounts.count, 2)
        XCTAssertEqual(preview.accounts[0].title, "餐饮")
        XCTAssertTrue(preview.accounts[0].isReuse)
        XCTAssertEqual(preview.accounts[0].targetId, "tgt_1")
        XCTAssertFalse(preview.accounts[1].isReuse)

        XCTAssertEqual(preview.projects[0].title, "京都之行")
        XCTAssertEqual(preview.people[0].title, "Alice")
        XCTAssertTrue(preview.people[1].isDrop)
    }

    func testIssuesDecodeTheReservedWhereKey() throws {
        let preview = try decodePreview(archivePreview)
        XCTAssertEqual(preview.issues.first?.where_, "entry:ent_9")
        XCTAssertTrue(preview.issues.first?.message.contains("借贷不平") == true)
    }

    func testBlockingIssuesMakeThePreviewUncommittable() throws {
        let json = archivePreview.replacingOccurrences(
            of: "\"blocking\": []",
            with: "\"blocking\": [\"流水条数 99999 超过 20000 上限\"]"
        )
        let preview = try decodePreview(json)
        XCTAssertFalse(preview.canCommit)
        XCTAssertEqual(preview.blocking.count, 1)
    }

    /// A bare .xlsx has no `data.json` and no receipts, so the screen has to
    /// stop describing it as a restore — the hint under the button changes
    /// from "restores everything" to "skips what's already here".
    func testAWorkbookIsNotARestore() throws {
        let json = archivePreview.replacingOccurrences(
            of: "\"source\": \"archive\"",
            with: "\"source\": \"workbook\""
        )
        let preview = try decodePreview(json)
        XCTAssertFalse(preview.isRestore)
    }

    /// A newer server may add an `action` the client has never heard of; the
    /// row must render as "new", not crash a switch over an enum.
    func testUnknownActionDegradesInsteadOfTrapping() throws {
        let json = archivePreview.replacingOccurrences(
            of: "\"action\": \"drop\"",
            with: "\"action\": \"transmogrify\""
        )
        let preview = try decodePreview(json)
        XCTAssertFalse(preview.people[1].isReuse)
        XCTAssertFalse(preview.people[1].isDrop)
    }

    func testCommitResultDecodesCounts() throws {
        let result = try JSONDecoder().decode(
            LedgerImportResult.self,
            from: Data(
                """
                {
                  "ledgerId": "new_led",
                  "mode": "new",
                  "created": { "accounts": 31, "projects": 2, "people": 1, "entries": 120, "photos": 33 },
                  "skipped": { "entries": 7 },
                  "warnings": ["有 1 位成员超过上限"]
                }
                """.utf8
            )
        )
        XCTAssertEqual(result.ledgerId, "new_led")
        XCTAssertEqual(result.created.entries, 120)
        XCTAssertEqual(result.skipped.entries, 7)
        XCTAssertEqual(result.warnings.count, 1)
    }
}

/// The import sheet's states. `.idle` has to be a resting state the user can
/// act on — a cancelled picker and a finished commit both land there, and a
/// spinner in either one is a dead end with no way back.
final class LedgerTransferPhaseTests: XCTestCase {
    func testEveryPhaseIsRepresentable() {
        let phases: [LedgerTransferStore.ImportPhase] = [
            .idle,
            .reading,
            .previewing,
            .ready(
                LedgerImportPreview(
                    source: "archive",
                    formatVersion: 1,
                    ledger: LedgerImportSummary(
                        name: nil,
                        currency: "CNY",
                        entries: 0,
                        accounts: 0,
                        projects: 0,
                        people: 0,
                        from: nil,
                        to: nil
                    ),
                    target: LedgerImportTargetSummary(mode: "new", ledgerId: nil),
                    accounts: [],
                    projects: [],
                    people: [],
                    entries: LedgerImportEntryCounts(
                        total: 0,
                        importable: 0,
                        duplicates: 0,
                        invalid: 0
                    ),
                    photos: LedgerImportPhotoCounts(count: 0, bytes: 0, missing: []),
                    issues: [],
                    blocking: [],
                    previewToken: "t"
                )
            ),
            .committing,
            .failed("boom"),
        ]
        // Equatable is what lets the sheet switch on the phase without
        // binding an unknown case.
        XCTAssertEqual(Set(phases.map { "\($0)" }).count, phases.count)
    }

    func testExportPhaseCarriesTheFileOrTheReasonItHasNone() {
        XCTAssertEqual(LedgerTransferStore.ExportPhase.idle, .idle)
        XCTAssertNotEqual(
            LedgerTransferStore.ExportPhase.ready(URL(fileURLWithPath: "/tmp/a.zip")),
            .failed("nope")
        )
        XCTAssertEqual(
            LedgerTransferStore.ExportPhase.exporting(includePhotos: false),
            .exporting(includePhotos: false)
        )
    }
}

final class LedgerPolicyTransferTests: XCTestCase {
    /// Mirrors the server's transfer guards: export is `requireLedgerAccess
    /// (..., "editor")` with no writability check, import is the same plus
    /// `assertLedgerWritable`. The menu hides what the API would refuse, so
    /// a mismatch here is a button that 403s.
    func testExportIsEditorAndUp() {
        XCTAssertTrue(LedgerPolicy.canExportLedger(.owner))
        XCTAssertTrue(LedgerPolicy.canExportLedger(.editor))
        XCTAssertFalse(LedgerPolicy.canExportLedger(.viewer))
        XCTAssertFalse(LedgerPolicy.canExportLedger(.guest))
    }

    /// An archived ledger still exports: export only reads, and backing up a
    /// closed book is exactly when someone wants one.
    func testExportIgnoresArchivedLedgers() {
        XCTAssertTrue(LedgerPolicy.canExportLedger(.owner))
        XCTAssertFalse(LedgerPolicy.canImportInto(role: .owner, ledgerActive: false))
    }

    func testImportNeedsAnActiveEditorLedger() {
        XCTAssertTrue(LedgerPolicy.canImportInto(role: .owner, ledgerActive: true))
        XCTAssertTrue(LedgerPolicy.canImportInto(role: .editor, ledgerActive: true))
        XCTAssertFalse(LedgerPolicy.canImportInto(role: .viewer, ledgerActive: true))
        XCTAssertFalse(LedgerPolicy.canImportInto(role: .guest, ledgerActive: true))
    }
}
