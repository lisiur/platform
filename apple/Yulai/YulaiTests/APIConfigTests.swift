import XCTest
@testable import Yulai

final class APIConfigTests: XCTestCase {
    private let base = URL(string: "https://api.example.com")!

    func testURLWithoutQuery() {
        let config = APIConfig(appCode: "x", baseURL: base)
        XCTAssertEqual(
            config.url(forPath: "collection/items"),
            URL(string: "https://api.example.com/api/collection/items")
        )
    }

    func testURLWithQueryKeepsPercentEncoding() {
        let config = APIConfig(appCode: "x", baseURL: base)
        XCTAssertEqual(
            config.url(forPath: "collection/items?limit=24&q=a%2Bb"),
            URL(string: "https://api.example.com/api/collection/items?limit=24&q=a%2Bb")
        )
    }

    func testResolveUsesDefaultWhenOverrideMissing() {
        let defaults = isolatedDefaults()
        let config = APIConfig.resolve(appCode: "x", defaultBaseURL: base, userDefaults: defaults)
        XCTAssertEqual(config.baseURL, base)
    }

    func testResolveHonorsOverrideWithScheme() {
        let defaults = isolatedDefaults()
        defaults.set("http://192.168.1.10:3000", forKey: APIConfig.baseURLOverrideKey)
        let config = APIConfig.resolve(appCode: "x", defaultBaseURL: base, userDefaults: defaults)
        XCTAssertEqual(config.baseURL.absoluteString, "http://192.168.1.10:3000")
    }

    func testResolveRejectsSchemelessOverride() {
        let defaults = isolatedDefaults()
        defaults.set("192.168.1.10:3000", forKey: APIConfig.baseURLOverrideKey)
        let config = APIConfig.resolve(appCode: "x", defaultBaseURL: base, userDefaults: defaults)
        XCTAssertEqual(config.baseURL, base)
    }

    /// A fresh UserDefaults suite so tests never touch the real one.
    private func isolatedDefaults() -> UserDefaults {
        let suiteName = "YulaiTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return defaults
    }
}
