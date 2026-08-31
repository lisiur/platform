//
//  CalculatorEngineTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/8/28.
//

import XCTest
@testable import Qianlai

final class CalculatorEngineTests: XCTestCase {
    func testDigitEntryAndDecimal() {
        var engine = CalculatorEngine()
        engine.inputDigit("1")
        engine.inputDigit("2")
        engine.inputDecimal()
        engine.inputDigit("5")
        XCTAssertEqual(engine.entry, "12.5")
    }

    func testLeadingZerosCollapse() {
        var engine = CalculatorEngine()
        engine.inputDigit("0")
        engine.inputDigit("0")
        engine.inputDigit("7")
        XCTAssertEqual(engine.entry, "7")
        engine.inputDecimal()
        engine.inputDecimal()
        XCTAssertEqual(engine.entry, "7.")
    }

    func testSeedsFromExistingAmount() {
        let engine = CalculatorEngine(initialText: "12.50")
        XCTAssertEqual(engine.entry, "12.5")
        XCTAssertTrue(engine.hint == nil)
    }

    func testBasicArithmetic() {
        var engine = CalculatorEngine()
        engine.inputDigit("2")
        engine.inputOperation(.add)
        engine.inputDigit("3")
        engine.inputEquals()
        XCTAssertEqual(engine.entry, "5")

        engine.inputOperation(.multiply)
        engine.inputDigit("4")
        engine.inputEquals()
        XCTAssertEqual(engine.entry, "20")
    }

    func testChainedOperationsFoldLeftToRight() {
        var engine = CalculatorEngine()
        engine.inputDigit("2")
        engine.inputOperation(.add)
        engine.inputDigit("3")
        engine.inputOperation(.multiply)
        XCTAssertEqual(engine.hint, "5 ×")
        engine.inputDigit("4")
        engine.inputEquals()
        XCTAssertEqual(engine.entry, "20")
    }

    func testPercentIsImmediate() {
        var engine = CalculatorEngine()
        engine.inputDigit("1")
        engine.inputDigit("5")
        engine.inputPercent()
        XCTAssertEqual(engine.entry, "0.15")
        engine.inputOperation(.multiply)
        engine.inputDigit("2")
        engine.inputDigit("0")
        engine.inputDigit("0")
        engine.inputEquals()
        XCTAssertEqual(engine.entry, "30")
    }

    func testDigitAfterPercentStartsNewTerm() {
        var engine = CalculatorEngine()
        engine.inputDigit("5")
        engine.inputDigit("0")
        engine.inputPercent()
        XCTAssertEqual(engine.entry, "0.5")
        engine.inputDigit("5")
        XCTAssertEqual(engine.entry, "5")
    }

    func testPercentStillFoldsIntoPendingOperation() {
        var engine = CalculatorEngine()
        engine.inputDigit("2")
        engine.inputOperation(.add)
        engine.inputDigit("5")
        engine.inputDigit("0")
        engine.inputPercent()
        engine.inputOperation(.add)
        XCTAssertEqual(engine.hint, "2.5 +")
        engine.inputDigit("5")
        engine.inputEquals()
        XCTAssertEqual(engine.entry, "7.5")
    }

    func testPasteReplacesEntryAndBecomesOperand() {
        var engine = CalculatorEngine(initialText: "8")
        engine.pasteEntry("1,5")
        XCTAssertEqual(engine.entry, "1.5")
        engine.inputOperation(.add)
        engine.pasteEntry(" 2.50 ")
        XCTAssertEqual(engine.entry, "2.5")
        engine.inputEquals()
        XCTAssertEqual(engine.entry, "4")
    }

    func testPasteRejectsJunk() {
        var engine = CalculatorEngine(initialText: "8")
        engine.pasteEntry("abc")
        XCTAssertEqual(engine.entry, "8")
        engine.pasteEntry("   ")
        XCTAssertEqual(engine.entry, "8")
        engine.pasteEntry("1.2.3")
        XCTAssertEqual(engine.entry, "8")
    }

    func testDivisionByZeroFailsThenACRecovers() {
        var engine = CalculatorEngine()
        engine.inputDigit("5")
        engine.inputOperation(.divide)
        engine.inputDigit("0")
        engine.inputEquals()
        XCTAssertTrue(engine.isError)
        engine.clearAll()
        XCTAssertFalse(engine.isError)
        XCTAssertEqual(engine.entry, "0")
    }

    func testBackspace() {
        var engine = CalculatorEngine(initialText: "12.5")
        engine.inputBackspace()
        XCTAssertEqual(engine.entry, "12.")
        engine.inputBackspace()
        engine.inputBackspace()
        XCTAssertEqual(engine.entry, "1")
        engine.inputBackspace()
        XCTAssertEqual(engine.entry, "0")
    }

    func testLiveDisplayPreviewsPendingFold() {
        var engine = CalculatorEngine()
        XCTAssertEqual(engine.displayValue, "0")
        engine.inputDigit("1")
        XCTAssertEqual(engine.displayValue, "1")
        engine.inputOperation(.add)
        // Before the next operand starts, the running total shows.
        XCTAssertEqual(engine.displayValue, "1")
        engine.inputDigit("2")
        XCTAssertEqual(engine.displayValue, "3")
        // The operand keeps growing: `23` folds to `24` live.
        engine.inputDigit("3")
        XCTAssertEqual(engine.displayValue, "24")
        engine.inputEquals()
        XCTAssertEqual(engine.displayValue, "24")
        XCTAssertEqual(engine.entry, "24")
    }

    func testLiveDisplayChainsAndPercent() {
        var engine = CalculatorEngine(initialText: "8")
        engine.inputOperation(.multiply)
        XCTAssertEqual(engine.displayValue, "8")
        engine.inputDigit("5")
        XCTAssertEqual(engine.displayValue, "40")
        engine.inputPercent()
        XCTAssertEqual(engine.displayValue, "0.4")
    }

    func testLiveDisplayDivisionByZeroPreviewsErrorThenRecovers() {
        var engine = CalculatorEngine()
        engine.inputDigit("1")
        engine.inputOperation(.divide)
        engine.inputDigit("0")
        XCTAssertNil(engine.displayValue)
        // Growing the divisor to `0.5` recovers the preview without AC.
        engine.inputDecimal()
        engine.inputDigit("5")
        XCTAssertEqual(engine.displayValue, "2")
    }

    func testCommitPendingFoldsIntoEntry() {
        var engine = CalculatorEngine()
        engine.inputDigit("1")
        engine.inputOperation(.add)
        engine.inputDigit("2")
        engine.commitPending()
        XCTAssertEqual(engine.entry, "3")
        XCTAssertTrue(engine.hint == nil)
        // Committing with nothing pending is a no-op.
        engine.commitPending()
        XCTAssertEqual(engine.entry, "3")
    }

    func testHintShowsFullFormula() {
        var engine = CalculatorEngine()
        engine.inputDigit("3")
        engine.inputOperation(.add)
        XCTAssertEqual(engine.hint, "3 +")
        engine.inputDigit("1")
        XCTAssertEqual(engine.hint, "3 + 1")
        XCTAssertEqual(engine.displayValue, "4")
        engine.inputEquals()
        XCTAssertTrue(engine.hint == nil)
        XCTAssertEqual(engine.displayValue, "4")
        XCTAssertEqual(engine.entry, "4")
    }

    func testOperatorFoldsAndShowsResultWithNewSymbol() {
        var engine = CalculatorEngine()
        engine.inputDigit("1")
        engine.inputDigit("4")
        engine.inputOperation(.add)
        engine.inputDigit("5")
        engine.inputDigit("8")
        XCTAssertEqual(engine.hint, "14 + 58")
        XCTAssertEqual(engine.displayValue, "72")
        // A second operator auto-calculates: the first line becomes the
        // result plus the new symbol.
        engine.inputOperation(.subtract)
        XCTAssertEqual(engine.hint, "72 −")
        XCTAssertEqual(engine.displayValue, "72")
        XCTAssertEqual(engine.entry, "72")
    }

    func testBackspaceClearsPendingOperandThenOperation() {
        var engine = CalculatorEngine()
        engine.inputDigit("1")
        engine.inputDigit("4")
        engine.inputOperation(.add)
        engine.inputDigit("5")
        engine.inputDigit("8")
        // 58 → 5: trim the operand.
        engine.inputBackspace()
        XCTAssertEqual(engine.hint, "14 + 5")
        XCTAssertEqual(engine.displayValue, "19")
        // 5 → operand dropped, back to the not-started state.
        engine.inputBackspace()
        XCTAssertEqual(engine.hint, "14 +")
        XCTAssertEqual(engine.displayValue, "14")
        // Pending operation dropped entirely.
        engine.inputBackspace()
        XCTAssertTrue(engine.hint == nil)
        XCTAssertEqual(engine.displayValue, "14")
        XCTAssertEqual(engine.entry, "14")
        // Plain entry backspace.
        engine.inputBackspace()
        XCTAssertEqual(engine.displayValue, "1")
    }

    func testClearedOperandKeepsAccumulatorForNewSymbolOrOperand() {
        var engine = CalculatorEngine()
        engine.inputDigit("1")
        engine.inputDigit("4")
        engine.inputOperation(.add)
        engine.inputDigit("5")
        engine.inputDigit("8")
        engine.inputBackspace()
        engine.inputBackspace()
        // Replacing the symbol keeps the 14.
        engine.inputOperation(.multiply)
        XCTAssertEqual(engine.hint, "14 ×")
        XCTAssertEqual(engine.displayValue, "14")
        engine.inputDigit("2")
        XCTAssertEqual(engine.displayValue, "28")
        engine.inputEquals()
        XCTAssertEqual(engine.entry, "28")

        // Typing a fresh operand after clearing works the same way.
        engine.inputOperation(.add)
        engine.inputDigit("1")
        engine.inputBackspace()
        XCTAssertEqual(engine.hint, "28 +")
        engine.inputDigit("3")
        XCTAssertEqual(engine.displayValue, "31")
    }

    func testCommitPendingSkipsUnstartedOperand() {
        var engine = CalculatorEngine()
        engine.inputDigit("1")
        engine.inputDigit("4")
        engine.inputOperation(.add)
        engine.commitPending()
        XCTAssertEqual(engine.entry, "14")
        XCTAssertEqual(engine.hint, "14 +")
    }

    func testFormatTrimsTrailingZerosAndNoise() {
        XCTAssertEqual(CalculatorEngine.format(0.1 + 0.2), "0.3")
        XCTAssertEqual(CalculatorEngine.format(12), "12")
        XCTAssertEqual(CalculatorEngine.format(10.0 / 3), "3.333333")
        XCTAssertEqual(CalculatorEngine.format(.infinity), "0")
        // 1e303 × 1e6 overflows past DBL_MAX; the guard must fall back to "0"
        // instead of letting NumberFormatter render "+∞".
        XCTAssertEqual(CalculatorEngine.format(1e303), "0")
        XCTAssertNotEqual(CalculatorEngine.format(1e302), "0")
    }

    func testCommittedEntryParsesAsAmount() {
        var engine = CalculatorEngine(initialText: "8")
        engine.inputOperation(.add)
        engine.inputDigit("4")
        engine.inputPercent()
        engine.inputEquals()
        XCTAssertEqual(Double(engine.entry) ?? 0, 8.04, accuracy: 0.000001)
    }
}
