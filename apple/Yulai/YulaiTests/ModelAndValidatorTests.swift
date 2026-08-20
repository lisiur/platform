import XCTest
@testable import Yulai

final class LoginValidatorTests: XCTestCase {
    func testValidEmails() {
        XCTAssertTrue(LoginValidator.isValidEmail("user@example.com"))
        XCTAssertTrue(LoginValidator.isValidEmail("first.last@sub.example.co"))
    }

    func testInvalidEmails() {
        XCTAssertFalse(LoginValidator.isValidEmail(""))
        XCTAssertFalse(LoginValidator.isValidEmail("user@example"))
        XCTAssertFalse(LoginValidator.isValidEmail("user @example.com"))
        XCTAssertFalse(LoginValidator.isValidEmail("example.com"))
    }
}

final class UpdateItemBodyTests: XCTestCase {
    func testEmptyOptionalFieldsAreOmitted() throws {
        let body = UpdateItemBody(title: "", note: "", tags: [], status: "active", url: "")
        let object = try encodedObject(body)
        XCTAssertEqual(Set(object.keys), ["tags", "status"])
        XCTAssertEqual(object["tags"] as? [String], [])
        XCTAssertEqual(object["status"] as? String, "active")
    }

    func testNonEmptyFieldsAreEncoded() throws {
        let body = UpdateItemBody(title: "T", note: "N", tags: ["a", "b"], status: "learned", url: "https://x.dev")
        let object = try encodedObject(body)
        XCTAssertEqual(object["title"] as? String, "T")
        XCTAssertEqual(object["note"] as? String, "N")
        XCTAssertEqual(object["tags"] as? [String], ["a", "b"])
        XCTAssertEqual(object["status"] as? String, "learned")
        XCTAssertEqual(object["url"] as? String, "https://x.dev")
    }

    private func encodedObject(_ body: UpdateItemBody) throws -> [String: Any] {
        let data = try JSONEncoder().encode(body)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}

final class CollectionTimeTests: XCTestCase {
    private func relative(secondsAgo: TimeInterval) -> String {
        CollectionTime.relative(Date.now.addingTimeInterval(-secondsAgo))
    }

    func testRelativeBuckets() {
        XCTAssertEqual(relative(secondsAgo: 30), "刚刚")
        XCTAssertEqual(relative(secondsAgo: 30 * 60), "30 分钟前")
        XCTAssertEqual(relative(secondsAgo: 3 * 3600), "3 小时前")
        XCTAssertEqual(relative(secondsAgo: 2 * 86400), "2 天前")
    }

    func testOlderDatesFallBackToAbsoluteFormat() {
        let date = Date.now.addingTimeInterval(-30 * 86400)
        XCTAssertEqual(
            CollectionTime.relative(date),
            date.formatted(.dateTime.year().month().day())
        )
    }
}
