import XCTest
@testable import Yulai

final class EnrichValueTests: XCTestCase {
    private func decode(_ json: String) throws -> EnrichValue {
        try JSONDecoder().decode(EnrichValue.self, from: Data(json.utf8))
    }

    func testDecodeScalarKinds() throws {
        XCTAssertEqual(try decode("true"), .bool(true))
        XCTAssertEqual(try decode("1.5"), .number(1.5))
        XCTAssertEqual(try decode(#""x""#), .string("x"))
        XCTAssertEqual(try decode("null"), .null)
    }

    func testDecodeNestedContainers() throws {
        let value = try decode(#"{"b":true,"n":1.5,"s":"x","a":[1,"two"],"o":{"k":null}}"#)
        let object = try XCTUnwrap(value.objectValue)
        XCTAssertEqual(object["b"], .bool(true))
        XCTAssertEqual(object["n"], .number(1.5))
        XCTAssertEqual(object["s"], .string("x"))
        XCTAssertEqual(object["a"], .array([.number(1), .string("two")]))
        XCTAssertEqual(object["o"]?.objectValue?["k"], .null)
    }

    func testAccessorsReturnNilForWrongKind() {
        XCTAssertNil(EnrichValue.string("x").arrayValue)
        XCTAssertNil(EnrichValue.string("x").objectValue)
        XCTAssertNil(EnrichValue.array([]).stringValue)
        XCTAssertNil(EnrichValue.object([:]).arrayValue)
        XCTAssertNil(EnrichValue.bool(true).stringValue)
        XCTAssertNil(EnrichValue.null.objectValue)
    }

    func testDecodeInvalidJSONThrows() {
        XCTAssertThrowsError(try decode(#"{"a":}"#))
    }
}
