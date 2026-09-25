//
//  ChipCustomizationTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/25.
//

import XCTest
@testable import Qianlai

final class ChipCustomizationTests: XCTestCase {
    func testChipCapableCoversEveryFieldExceptProject() {
        // The customization sheet renders from chipCapable — a field missing
        // there is invisible in the sheet even though it ships in the
        // default bar (the merchant/attachments omission shipped exactly
        // that bug). The count pins dedup too: a duplicate would collapse
        // away in the set comparison.
        let expected = Set(QuickEntryField.allCases).subtracting([.project])
        XCTAssertEqual(ChipCustomizationView.chipCapable.count, expected.count)
        XCTAssertEqual(Set(ChipCustomizationView.chipCapable), expected)
    }
}
