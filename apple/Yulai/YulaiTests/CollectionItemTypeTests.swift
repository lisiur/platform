import XCTest
@testable import Yulai

final class CollectionItemTypeTests: XCTestCase {
    func testDetectLink() {
        XCTAssertEqual(CollectionItemType.detect("https://example.com/a?b=c"), .link)
        XCTAssertEqual(CollectionItemType.detect("HTTP://Example.com"), .link)
        XCTAssertEqual(CollectionItemType.detect("  https://example.com  "), .link)
    }

    func testDetectWord() {
        XCTAssertEqual(CollectionItemType.detect("hello"), .word)
        XCTAssertEqual(CollectionItemType.detect("  hello  "), .word)
        XCTAssertEqual(CollectionItemType.detect("hello-world"), .word)
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

    func testDetectArticle() {
        let words = (1...41).map(String.init).joined(separator: " ")
        XCTAssertEqual(CollectionItemType.detect(words), .article)
        // Exactly 40 words is still a sentence; 41 crosses the threshold.
        let forty = (1...40).map(String.init).joined(separator: " ")
        XCTAssertEqual(CollectionItemType.detect(forty), .sentence)
    }
}
