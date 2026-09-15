//
//  AvatarImageCacheTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/15.
//

import XCTest
@testable import Qianlai

/// Intercepts the cache session's traffic and counts every request, so the
/// tests can pin the one-request-per-URL guarantee.
private nonisolated final class CountingURLProtocol: URLProtocol {
    nonisolated(unsafe) static var requestCount = 0
    /// Per-request override: status code, content type, body. nil serves a
    /// decodable 1×1 PNG.
    nonisolated(unsafe) static var responder: ((URLRequest) -> (Int, String, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requestCount += 1
        let (statusCode, contentType, body) = Self.responder?(request)
            ?? (200, "image/png", Self.onePixelPNG)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": contentType]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static let onePixelPNG = Data(
        base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    )!
}

@MainActor
final class AvatarImageCacheTests: XCTestCase {
    override func setUp() async throws {
        try await super.setUp()
        CountingURLProtocol.requestCount = 0
        CountingURLProtocol.responder = nil
    }

    private func makeCache() -> AvatarImageCache {
        let configuration = URLSessionConfiguration.ephemeral
        // No URL cache: without this, a repeat fetch could be served by
        // URLSession's own store and the count would stay at 1 for the
        // wrong reason. Every request must reach the protocol to be counted.
        configuration.urlCache = nil
        configuration.protocolClasses = [CountingURLProtocol.self]
        return AvatarImageCache(session: URLSession(configuration: configuration))
    }

    func testSecondLoadForSameURLServesFromCache() async {
        let cache = makeCache()
        let url = URL(string: "https://avatar.test/one")!

        let first = await cache.image(for: url)
        let second = await cache.image(for: url)

        XCTAssertNotNil(first)
        XCTAssertTrue(second === first)
        XCTAssertEqual(CountingURLProtocol.requestCount, 1)
    }

    func testConcurrentLoadsForSameURLCoalesceIntoOneFetch() async {
        let cache = makeCache()
        let url = URL(string: "https://avatar.test/two")!

        async let a = cache.image(for: url)
        async let b = cache.image(for: url)
        async let c = cache.image(for: url)
        let results = await [a, b, c]

        XCTAssertTrue(results.allSatisfy { $0 != nil })
        XCTAssertEqual(CountingURLProtocol.requestCount, 1)
    }

    func testFailedLoadIsNotCachedAndRetried() async {
        let cache = makeCache()
        let url = URL(string: "https://avatar.test/three")!
        CountingURLProtocol.responder = { _ in (404, "text/plain", Data("nope".utf8)) }

        let first = await cache.image(for: url)
        let second = await cache.image(for: url)

        XCTAssertNil(first)
        XCTAssertNil(second)
        XCTAssertEqual(CountingURLProtocol.requestCount, 2)
    }
}
