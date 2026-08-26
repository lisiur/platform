//
//  APIConfigTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/8/26.
//

import XCTest
@testable import Qianlai

final class APIConfigTests: XCTestCase {
    private let base = URL(string: "https://api.example.com")!

    func testURLWithoutQuery() {
        let config = APIConfig(appCode: "qianlai", baseURL: base)
        XCTAssertEqual(
            config.url(forPath: "bookkeeping/ledgers"),
            URL(string: "https://api.example.com/api/bookkeeping/ledgers")
        )
    }

    func testURLWithQueryKeepsPercentEncoding() {
        let config = APIConfig(appCode: "qianlai", baseURL: base)
        XCTAssertEqual(
            config.url(forPath: "bookkeeping/ledgers/l1/entries?limit=20&q=a%2Bb"),
            URL(string: "https://api.example.com/api/bookkeeping/ledgers/l1/entries?limit=20&q=a%2Bb")
        )
    }

    func testAppIdentity() {
        XCTAssertEqual(APIConfig.appCode, "qianlai")
        XCTAssertEqual(APIConfig.defaultBaseURL.absoluteString, "https://platform.hapaul.top")
        XCTAssertEqual(APIConfig.keychainService, "top.hapaul.qianlai.auth")
    }
}
