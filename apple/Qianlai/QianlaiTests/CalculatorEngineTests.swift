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
