//
//  ScreenshotTilerTests.swift
//  QianlaiTests
//

import XCTest
@testable import Qianlai

final class ScreenshotTilerTests: XCTestCase {
    /// A full-height iPhone screenshot tiles at its native width — inside
    /// the model's no-resize budget, no resampling — into three ≤1300-tall
    /// slices with a 130px overlap between consecutive frames.
    func testTallScreenshotSlicesWithOverlap() {
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 2556)
        XCTAssertNotNil(plan)
        XCTAssertEqual(plan?.targetWidth, 1179)

        let frames = plan?.frames ?? []
        XCTAssertEqual(frames.count, 3)
        // Every frame stays inside the model's ~1300×1300 pixel budget.
        for frame in frames {
            XCTAssertLessThanOrEqual(frame.height, CGFloat(ScreenshotTiler.maxEdge))
            XCTAssertEqual(frame.width, 1179)
            XCTAssertLessThanOrEqual(
                frame.width * frame.height,
                CGFloat(ScreenshotTiler.maxEdge * ScreenshotTiler.maxEdge)
            )
        }
        // Consecutive frames share exactly the configured overlap band.
        XCTAssertEqual(frames[0].maxY - frames[1].minY, ScreenshotTiler.overlap, accuracy: 1)
        XCTAssertEqual(frames[1].maxY - frames[2].minY, ScreenshotTiler.overlap, accuracy: 1)
        // The tiles cover the scaled height top to bottom without a gap.
        XCTAssertEqual(frames.last?.maxY ?? 0, 2556, accuracy: 1)
    }

    /// A remainder slice no taller than the overlap is fully duplicated in
    /// the previous tile's bottom band, so it folds in instead of shipping
    /// a sliver tile: 2400 tall slices into two frames, the second one
    /// stretched to the bottom edge (y: 0–1300, 1170–2400).
    func testRemainderShorterThanOverlapFoldsIntoPreviousTile() {
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 2400)
        XCTAssertNotNil(plan)
        let frames = plan?.frames ?? []
        XCTAssertEqual(frames.count, 2)
        for frame in frames {
            XCTAssertGreaterThanOrEqual(frame.height, ScreenshotTiler.overlap)
            XCTAssertLessThanOrEqual(frame.height, CGFloat(ScreenshotTiler.maxEdge))
        }
        // Coverage stays exact through the fold.
        XCTAssertEqual(frames.last?.maxY ?? 0, 2400, accuracy: 1)
    }

    /// A short payment-result screenshot fits in one tile — the common case
    /// pays no extra tokens.
    func testShortScreenshotIsSingleTile() {
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 1000)
        XCTAssertEqual(plan?.frames.count, 1)
        XCTAssertEqual(plan?.targetWidth, 1179)
        XCTAssertEqual(plan?.frames.first?.width, 1179)
    }

    /// Small images are never upscaled.
    func testSmallScreenshotKeepsNativeWidth() {
        let plan = ScreenshotTiler.plan(sourceWidth: 400, sourceHeight: 300)
        XCTAssertEqual(plan?.targetWidth, 400)
        XCTAssertEqual(plan?.frames.count, 1)
    }

    /// An extreme capture (monthly bill page) steps down the width ladder
    /// until the whole height fits in the capped tile count.
    func testExtremelyTallScreenshotShrinksToFitCap() {
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 12000)
        XCTAssertNotNil(plan)
        let frames = plan?.frames ?? []
        XCTAssertLessThanOrEqual(frames.count, ScreenshotTiler.maxTileCount)
        XCTAssertLessThan(plan?.targetWidth ?? 800, 800)
        // Still covers the full scaled height.
        let scale = (plan?.targetWidth ?? 0) / 1179
        XCTAssertEqual(frames.last?.maxY ?? 0, (12000 * scale).rounded(.up), accuracy: 1)
    }

    /// Degenerate inputs produce no plan.
    func testInvalidDimensionsReturnNil() {
        XCTAssertNil(ScreenshotTiler.plan(sourceWidth: 0, sourceHeight: 100))
        XCTAssertNil(ScreenshotTiler.plan(sourceWidth: 100, sourceHeight: 0))
        XCTAssertNil(ScreenshotTiler.plan(sourceWidth: -1, sourceHeight: -1))
    }

    /// A source narrower than the smallest ladder step still gets a plan at
    /// its native width (never upscaled), truncated to the tile cap.
    func testUltraNarrowSourceFallsBackToNativeWidth() {
        let plan = ScreenshotTiler.plan(sourceWidth: 100, sourceHeight: 20000)
        XCTAssertEqual(plan?.targetWidth, 100)
        XCTAssertEqual(plan?.frames.count, ScreenshotTiler.maxTileCount)
    }

    /// End-to-end through ImageIO: a generated gradient PNG tiles into
    /// decodable JPEG bytes in the planned order.
    func testJpegTilesRoundTrip() throws {
        let data = try Self.makePNG(width: 600, height: 1200)
        let tiles = try XCTUnwrap(ScreenshotTiler.jpegTiles(from: data))
        // 600 wide tiles at its native width (≤1300, no resampling) and
        // the 1200 height fits a single slice — one tile, no seams.
        XCTAssertEqual(tiles.count, 1)
        for tile in tiles {
            let source = CGImageSourceCreateWithData(tile as CFData, nil)
            XCTAssertNotNil(source)
            XCTAssertEqual(
                CGImageSourceGetType(source!) as String?, "public.jpeg"
            )
            let image = CGImageSourceCreateImageAtIndex(source!, 0, nil)
            XCTAssertNotNil(image)
            // The tile is the full image at native size, inside the budget.
            XCTAssertEqual(image!.width, 600)
            XCTAssertEqual(image!.height, 1200)
            XCTAssertLessThanOrEqual(max(image!.width, image!.height), 1300)
        }
    }

    /// Multi-tile round-trip through ImageIO: a tall gradient PNG slices
    /// into decodable JPEG bytes whose seams match the plan — the first
    /// tile is full-height, the second the shorter remainder (600 wide is
    /// native, 2000 tall → y: 0–1300, 1170–2000).
    func testJpegTilesMultiTileRoundTrip() throws {
        let data = try Self.makePNG(width: 600, height: 2000)
        let tiles = try XCTUnwrap(ScreenshotTiler.jpegTiles(from: data))
        XCTAssertEqual(tiles.count, 2)
        var heights: [Int] = []
        for tile in tiles {
            let source = try XCTUnwrap(CGImageSourceCreateWithData(tile as CFData, nil))
            XCTAssertEqual(CGImageSourceGetType(source) as String?, "public.jpeg")
            let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
            XCTAssertEqual(image.width, 600)
            XCTAssertLessThanOrEqual(image.height, ScreenshotTiler.maxEdge)
            heights.append(image.height)
        }
        XCTAssertEqual(heights, [ScreenshotTiler.maxEdge, 830])
    }

    /// Garbage bytes fail cleanly instead of throwing.
    func testJpegTilesRejectsGarbage() {
        XCTAssertNil(ScreenshotTiler.jpegTiles(from: Data("not an image".utf8)))
    }

    /// Renders a solid-gradient PNG via ImageIO so the tiler always has real
    /// decodable input regardless of platform image frameworks.
    private static func makePNG(width: Int, height: Int) throws -> Data {
        let context = try XCTUnwrap(
            CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        )
        context.setFillColor(CGColor(srgbRed: 0.9, green: 0.4, blue: 0.2, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try XCTUnwrap(context.makeImage())
        let output = NSMutableData()
        let destination = try XCTUnwrap(
            CGImageDestinationCreateWithData(
                output, "public.png" as CFString, 1, nil
            )
        )
        CGImageDestinationAddImage(destination, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return output as Data
    }
}

/// Decoding and derived values of the recognition payload.
final class ScreenshotRecognitionTests: XCTestCase {
    private let json = """
    {
      "recognized": true,
      "kind": "expense",
      "amount": 45.5,
      "amountAlternatives": [49.9, 12],
      "occurredAt": "2026-09-21T14:32:00",
      "merchant": "盒马鲜生",
      "memo": "生鲜订单",
      "categoryName": "餐饮",
      "categoryAlternatives": ["买菜", "食品"],
      "confidence": "high"
    }
    """.data(using: .utf8)!

    func testDecodeFullPayload() throws {
        let recognition = try JSONDecoder().decode(ScreenshotRecognition.self, from: json)
        XCTAssertTrue(recognition.recognized)
        XCTAssertEqual(recognition.kind, "expense")
        XCTAssertEqual(recognition.amount, 45.5)
        XCTAssertEqual(recognition.amountSuggestions, [49.9, 12])
        XCTAssertEqual(recognition.merchant, "盒马鲜生")
        XCTAssertEqual(recognition.categorySuggestions, ["买菜", "食品"])
        XCTAssertEqual(recognition.confidence, "high")
    }

    /// The server fills the alternate arrays by default, but a payload
    /// without them decodes as empty rather than failing.
    func testDecodeWithoutAlternates() throws {
        let minimal = """
        {"recognized": false, "kind": null, "amount": null, "occurredAt": null,
         "merchant": null, "memo": null, "categoryName": null, "confidence": null}
        """.data(using: .utf8)!
        let recognition = try JSONDecoder().decode(ScreenshotRecognition.self, from: minimal)
        XCTAssertFalse(recognition.recognized)
        XCTAssertTrue(recognition.amountSuggestions.isEmpty)
        XCTAssertTrue(recognition.categorySuggestions.isEmpty)
        XCTAssertNil(recognition.occurredDate)
    }

    /// The contract's offset-less local time parses in the device timezone:
    /// the same string reads as the same wall clock regardless of zone.
    func testOccurredDateParsesAsLocalWallClock() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current
        let recognition = try JSONDecoder().decode(ScreenshotRecognition.self, from: json)
        let date = try XCTUnwrap(recognition.occurredDate)
        let components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute], from: date
        )
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 9)
        XCTAssertEqual(components.day, 21)
        XCTAssertEqual(components.hour, 14)
        XCTAssertEqual(components.minute, 32)
    }
}
