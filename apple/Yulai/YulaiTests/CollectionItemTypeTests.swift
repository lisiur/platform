import XCTest
@testable import Yulai

final class CollectionItemTypeTests: XCTestCase {
    func testDetectWord() {
        XCTAssertEqual(CollectionItemType.detect("hello"), .word)
        XCTAssertEqual(CollectionItemType.detect("  hello  "), .word)
        XCTAssertEqual(CollectionItemType.detect("hello-world"), .word)
        XCTAssertEqual(CollectionItemType.detect("https://example.com/a?b=c"), .word)
    }

    func testDetectPhrase() {
        XCTAssertEqual(CollectionItemType.detect("give up"), .phrase)
        XCTAssertEqual(CollectionItemType.detect("a b c d e"), .phrase)
    }

    func testDetectSentence() {
        XCTAssertEqual(CollectionItemType.detect("This is a sentence."), .sentence)
        // Six words without ending punctuation: too long for a phrase.
        XCTAssertEqual(CollectionItemType.detect("one two three four five six"), .sentence)
    }

    func testDetectLongText() {
        let words = (1...41).map(String.init).joined(separator: " ")
        XCTAssertEqual(CollectionItemType.detect(words), .sentence)
        let forty = (1...40).map(String.init).joined(separator: " ")
        XCTAssertEqual(CollectionItemType.detect(forty), .sentence)
    }
}
