//
//  ScreenshotTilerTests.swift
//  QianlaiTests
//

import XCTest
@testable import Qianlai

final class ScreenshotTilerTests: XCTestCase {
    /// The geometry assertions below are written against the shipped edge
    /// budget (1300 edge, 6 tiles, 10% overlap).
    private let shipped = RecognitionBudget.shipped
    private var maxEdge: Int { shipped.maxImageEdge! }
    private var overlap: CGFloat { CGFloat(maxEdge) / 10 }

    /// A full-height iPhone screenshot tiles at its native width — inside
    /// the model's no-resize budget, no resampling — into three ≤1300-tall
    /// slices with a 130px overlap between consecutive frames.
    func testTallScreenshotSlicesWithOverlap() {
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 2556, budget: shipped)
        XCTAssertNotNil(plan)
        XCTAssertEqual(plan?.targetWidth, 1179)

        let frames = plan?.frames ?? []
        XCTAssertEqual(frames.count, 3)
        // Every frame stays inside the model's ~1300×1300 pixel budget.
        for frame in frames {
            XCTAssertLessThanOrEqual(frame.height, CGFloat(maxEdge))
            XCTAssertEqual(frame.width, 1179)
            XCTAssertLessThanOrEqual(
                frame.width * frame.height,
                CGFloat(maxEdge * maxEdge)
            )
        }
        // Consecutive frames share exactly the configured overlap band.
        XCTAssertEqual(frames[0].maxY - frames[1].minY, overlap, accuracy: 1)
        XCTAssertEqual(frames[1].maxY - frames[2].minY, overlap, accuracy: 1)
        // The tiles cover the scaled height top to bottom without a gap.
        XCTAssertEqual(frames.last?.maxY ?? 0, 2556, accuracy: 1)
    }

    /// A remainder slice no taller than the overlap is fully duplicated in
    /// the previous tile's bottom band, so it folds in instead of shipping
    /// a sliver tile: 2400 tall slices into two frames, the second one
    /// stretched to the bottom edge (y: 0–1300, 1170–2400).
    func testRemainderShorterThanOverlapFoldsIntoPreviousTile() {
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 2400, budget: shipped)
        XCTAssertNotNil(plan)
        let frames = plan?.frames ?? []
        XCTAssertEqual(frames.count, 2)
        for frame in frames {
            XCTAssertGreaterThanOrEqual(frame.height, overlap)
            XCTAssertLessThanOrEqual(frame.height, CGFloat(maxEdge))
        }
        // Coverage stays exact through the fold.
        XCTAssertEqual(frames.last?.maxY ?? 0, 2400, accuracy: 1)
    }

    /// A short payment-result screenshot fits in one tile — the common case
    /// pays no extra tokens.
    func testShortScreenshotIsSingleTile() {
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 1000, budget: shipped)
        XCTAssertEqual(plan?.frames.count, 1)
        XCTAssertEqual(plan?.targetWidth, 1179)
        XCTAssertEqual(plan?.frames.first?.width, 1179)
    }

    /// Small images are never upscaled.
    func testSmallScreenshotKeepsNativeWidth() {
        let plan = ScreenshotTiler.plan(sourceWidth: 400, sourceHeight: 300, budget: shipped)
        XCTAssertEqual(plan?.targetWidth, 400)
        XCTAssertEqual(plan?.frames.count, 1)
    }

    /// An extreme capture (monthly bill page) steps down the width ladder
    /// until the whole height fits in the capped tile count.
    func testExtremelyTallScreenshotShrinksToFitCap() {
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 12000, budget: shipped)
        XCTAssertNotNil(plan)
        let frames = plan?.frames ?? []
        XCTAssertLessThanOrEqual(frames.count, shipped.maxTileCount)
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
        let plan = ScreenshotTiler.plan(sourceWidth: 100, sourceHeight: 20000, budget: shipped)
        XCTAssertEqual(plan?.targetWidth, 100)
        XCTAssertEqual(plan?.frames.count, shipped.maxTileCount)
    }

    /// Edge budgets generalize: a smaller edge caps the candidate widths
    /// (the model would resize a wider tile back down), and the overlap
    /// follows the edge at the same 10% ratio.
    func testSmallerEdgeBudgetCapsCandidateWidths() {
        let budget = RecognitionBudget(
            maxImageEdge: 800, maxPixelsPerImage: nil, maxTileCount: 6,
            mediaTypes: ["image/jpeg"]
        )
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 3000, budget: budget)
        XCTAssertNotNil(plan)
        // The native width exceeds the budget edge, so the plan lands on
        // the edge itself rather than any wider ladder stop.
        XCTAssertEqual(plan?.targetWidth, 800)
        for frame in plan?.frames ?? [] {
            XCTAssertLessThanOrEqual(frame.height, 800)
        }
    }

    // MARK: - Pixel budgets (Qwen shape)

    /// A pixel budget with the source inside it ships ONE image at native
    /// size — no scaling, no slicing, the token floor.
    func testPixelBudgetWithinBudgetIsSingleNativeImage() {
        let budget = RecognitionBudget(
            maxImageEdge: nil, maxPixelsPerImage: 2_621_440, maxTileCount: 6,
            mediaTypes: ["image/jpeg"]
        )
        let plan = ScreenshotTiler.plan(sourceWidth: 800, sourceHeight: 600, budget: budget)
        XCTAssertEqual(plan?.frames.count, 1)
        XCTAssertEqual(plan?.targetWidth, 800)
        XCTAssertEqual(plan?.frames.first?.height, 600)
    }

    /// Mild overflow (≤ 2× the budget — a one-screen capture at ~0.93×)
    /// ships as ONE uniformly scaled image: 1179×2556 (3.01M px) scales by
    /// √(2621440/3013524) ≈ 0.933 → 1100×2384.
    func testPixelBudgetMildOverflowScalesWholeImage() {
        let budget = RecognitionBudget(
            maxImageEdge: nil, maxPixelsPerImage: 2_621_440, maxTileCount: 6,
            mediaTypes: ["image/jpeg"]
        )
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 2556, budget: budget)
        XCTAssertEqual(plan?.frames.count, 1)
        XCTAssertEqual(plan?.targetWidth, 1100)
        XCTAssertEqual(plan?.frames.first?.width, 1100)
        XCTAssertEqual(plan?.frames.first?.height, 2384)
        // The scaled whole image lands (a hair over at worst — both edges
        // round up, ~0.04% here, which the model's own resize absorbs).
        let frame = plan?.frames.first
        XCTAssertLessThanOrEqual(
            (frame?.width ?? 0) * (frame?.height ?? 0),
            CGFloat(2_621_440) + 2048
        )
    }

    /// Severe overflow (> 2× the budget — the tall captures the
    /// singleImageMode experiment proved models shrink below legibility)
    /// slices at the source's native width instead: every tile's pixel area
    /// stays inside the budget, so the model never resizes at all.
    func testPixelBudgetSevereOverflowSlicesAtNativeWidth() {
        let budget = RecognitionBudget(
            maxImageEdge: nil, maxPixelsPerImage: 2_621_440, maxTileCount: 6,
            mediaTypes: ["image/jpeg"]
        )
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 6000, budget: budget)
        XCTAssertNotNil(plan)
        // Native width — zero resampling.
        XCTAssertEqual(plan?.targetWidth, 1179)
        let frames = plan?.frames ?? []
        XCTAssertEqual(frames.count, 3)
        for frame in frames {
            XCTAssertLessThanOrEqual(frame.width * frame.height, CGFloat(2_621_440) + 1)
        }
        XCTAssertEqual(frames.last?.maxY ?? 0, 6000, accuracy: 1)
    }

    /// A capture so tall that native-width slicing would blow the tile cap
    /// steps down the width ladder — 1179×20000 needs 10 native slices, but
    /// fits in 5 at 800 wide.
    func testPixelBudgetExtremelyTallShrinksToFitCap() {
        let budget = RecognitionBudget(
            maxImageEdge: nil, maxPixelsPerImage: 2_621_440, maxTileCount: 6,
            mediaTypes: ["image/jpeg"]
        )
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 20000, budget: budget)
        XCTAssertEqual(plan?.targetWidth, 800)
        XCTAssertEqual(plan?.frames.count, 5)
        for frame in plan?.frames ?? [] {
            XCTAssertLessThanOrEqual(frame.width * frame.height, CGFloat(2_621_440) + 1)
        }
    }

    /// A source wider than √budget (a photo, not a screenshot) scales down
    /// to the budget's square — the widest a full-budget tile can be — and
    /// fits one tile when the height allows.
    func testPixelBudgetWideSourceScalesToBudgetSquare() {
        let budget = RecognitionBudget(
            maxImageEdge: nil, maxPixelsPerImage: 2_621_440, maxTileCount: 6,
            mediaTypes: ["image/jpeg"]
        )
        let plan = ScreenshotTiler.plan(sourceWidth: 4000, sourceHeight: 3000, budget: budget)
        XCTAssertEqual(plan?.frames.count, 1)
        // √2621440 ≈ 1619.
        XCTAssertEqual(plan?.targetWidth, 1619)
    }

    /// End-to-end through ImageIO: a generated gradient PNG tiles into
    /// decodable JPEG bytes in the planned order.
    func testJpegTilesRoundTrip() throws {
        let data = try Self.makePNG(width: 600, height: 1200)
        let tiles = try XCTUnwrap(ScreenshotTiler.jpegTiles(from: data, budget: shipped))
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
        let tiles = try XCTUnwrap(ScreenshotTiler.jpegTiles(from: data, budget: shipped))
        XCTAssertEqual(tiles.count, 2)
        var heights: [Int] = []
        for tile in tiles {
            let source = try XCTUnwrap(CGImageSourceCreateWithData(tile as CFData, nil))
            XCTAssertEqual(CGImageSourceGetType(source) as String?, "public.jpeg")
            let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
            XCTAssertEqual(image.width, 600)
            XCTAssertLessThanOrEqual(image.height, maxEdge)
            heights.append(image.height)
        }
        XCTAssertEqual(heights, [maxEdge, 830])
    }

    /// Garbage bytes fail cleanly instead of throwing.
    func testJpegTilesRejectsGarbage() {
        XCTAssertNil(ScreenshotTiler.jpegTiles(from: Data("not an image".utf8)))
    }

    /// The pixel budget's single-image plan also flows through the encode
    /// path: a mild-overflow capture comes back as ONE decodable JPEG at
    /// the scaled-down size.
    func testPixelBudgetSingleImageEncodeRoundTrip() throws {
        let budget = RecognitionBudget(
            maxImageEdge: nil, maxPixelsPerImage: 700_000, maxTileCount: 6,
            mediaTypes: ["image/jpeg"]
        )
        // 800×1200 = 960k px > 700k, ≤ 2× → single image scaled by
        // √(700000/960000) ≈ 0.854 → 684×1025 (both edges round up).
        let data = try Self.makePNG(width: 800, height: 1200)
        let tiles = try XCTUnwrap(ScreenshotTiler.recognitionTiles(from: data, budget: budget))
        XCTAssertEqual(tiles.count, 1)
        let tile = try XCTUnwrap(tiles.first)
        XCTAssertEqual(tile.mediaType, "image/jpeg")
        let source = try XCTUnwrap(CGImageSourceCreateWithData(tile.data as CFData, nil))
        let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
        XCTAssertEqual(image.width, 684)
    }

    /// A model narrowed to PNG only gets PNG tiles — the annotation matches
    /// the encode, and JPEG never fires.
    func testMediaTypesNarrowedToPNGEncodesPNG() throws {
        let budget = RecognitionBudget(
            maxImageEdge: 1300, maxPixelsPerImage: nil, maxTileCount: 6,
            mediaTypes: ["image/png"]
        )
        let data = try Self.makePNG(width: 600, height: 1200)
        let tiles = try XCTUnwrap(ScreenshotTiler.recognitionTiles(from: data, budget: budget))
        XCTAssertEqual(tiles.count, 1)
        let tile = try XCTUnwrap(tiles.first)
        XCTAssertEqual(tile.mediaType, "image/png")
        XCTAssertEqual(tile.fileExtension, "png")
        let source = try XCTUnwrap(CGImageSourceCreateWithData(tile.data as CFData, nil))
        XCTAssertEqual(CGImageSourceGetType(source) as String?, "public.png")
    }

    /// A model accepting nothing the client can encode falls back to the
    /// shipped JPEG encode rather than failing locally — the server's
    /// media-type guard then rejects the upload with the precise type
    /// message instead of a bogus "couldn't read the image".
    func testMediaTypesWithoutClientEncodersFallBackToShippedEncoding() throws {
        let budget = RecognitionBudget(
            maxImageEdge: 1300, maxPixelsPerImage: nil, maxTileCount: 6,
            mediaTypes: ["image/webp"]
        )
        let data = try Self.makePNG(width: 600, height: 1200)
        let tiles = try XCTUnwrap(ScreenshotTiler.recognitionTiles(from: data, budget: budget))
        XCTAssertEqual(tiles.count, 1)
        let tile = try XCTUnwrap(tiles.first)
        XCTAssertEqual(tile.mediaType, "image/jpeg")
        let source = try XCTUnwrap(CGImageSourceCreateWithData(tile.data as CFData, nil))
        XCTAssertEqual(CGImageSourceGetType(source) as String?, "public.jpeg")
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
final class ScreenshotRecognitionTests: XCTestCase {    private let json = """
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

/// The config payload → budget mapping and the store's UserDefaults mirror.
@MainActor
final class RecognitionBudgetTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        let suite = "RecognitionBudgetTests"
        UserDefaults.standard.removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite)
    }

    /// A Qwen-shaped payload maps through: pixel budget kept, the image
    /// count becomes the tile cap, a missing media list means "no model
    /// constraint".
    func testMappingKeepsPixelBudgetFields() throws {
        let budget = try XCTUnwrap(RecognitionBudget(response: RecognitionConfigResponse(
            maxImageEdge: nil,
            maxPixelsPerImage: 2_621_440,
            maxImagesPerRequest: 250,
            imageMediaTypes: ["image/jpeg", "image/png", "image/webp"]
        )))
        XCTAssertNil(budget.maxImageEdge)
        XCTAssertEqual(budget.maxPixelsPerImage, 2_621_440)
        XCTAssertEqual(budget.mediaTypes, ["image/jpeg", "image/png", "image/webp"])
    }

    /// The model's per-request image cap is clamped to the platform's
    /// structural 6-file form — tiles past it would be silently dropped by
    /// the server — and never below one.
    func testMappingClampsTileCountToStructuralCap() throws {
        let generous = try XCTUnwrap(RecognitionBudget(response: RecognitionConfigResponse(
            maxImageEdge: nil, maxPixelsPerImage: 2_621_440,
            maxImagesPerRequest: 250, imageMediaTypes: []
        )))
        XCTAssertEqual(generous.maxTileCount, 6)

        let tight = try XCTUnwrap(RecognitionBudget(response: RecognitionConfigResponse(
            maxImageEdge: nil, maxPixelsPerImage: 2_621_440,
            maxImagesPerRequest: 3, imageMediaTypes: []
        )))
        XCTAssertEqual(tight.maxTileCount, 3)
    }

    /// A payload with nothing actionable (every budget field null) maps to
    /// nil so the store keeps `.shipped` instead of tiling blind.
    func testMappingAllNullReturnsNil() {
        XCTAssertNil(RecognitionBudget(response: RecognitionConfigResponse(
            maxImageEdge: nil, maxPixelsPerImage: nil,
            maxImagesPerRequest: nil, imageMediaTypes: nil
        )))
    }

    /// A geometry-less but media-narrowed budget survives the mapping: the
    /// encode must honor the narrowing while plan keeps the shipped edge
    /// geometry — dropping it here would make the client encode types the
    /// server's guard rejects, a guaranteed 415 loop.
    func testMappingMediaTypesOnlySurvivesWithShippedGeometry() throws {
        let budget = try XCTUnwrap(RecognitionBudget(response: RecognitionConfigResponse(
            maxImageEdge: nil, maxPixelsPerImage: nil,
            maxImagesPerRequest: nil, imageMediaTypes: ["image/png"]
        )))
        XCTAssertNil(budget.maxImageEdge)
        XCTAssertNil(budget.maxPixelsPerImage)
        XCTAssertEqual(budget.maxTileCount, RecognitionBudget.shipped.maxTileCount)
        XCTAssertEqual(budget.mediaTypes, ["image/png"])

        // Geometry falls back to the shipped edge ladder: a full-height
        // iPhone screenshot tiles at its native width into three slices.
        let plan = ScreenshotTiler.plan(sourceWidth: 1179, sourceHeight: 2556, budget: budget)
        XCTAssertEqual(plan?.targetWidth, 1179)
        XCTAssertEqual(plan?.frames.count, 3)
    }

    /// A fresh install has no mirror: the shipped budget tiles.
    func testFreshStoreFallsBackToShipped() {
        let store = RecognitionBudgetStore(defaults: defaults)
        XCTAssertEqual(store.budget, .shipped)
    }

    /// A fetched payload updates the budget AND persists the mirror; a new
    /// store instance (the next launch) seeds from it before any fetch.
    func testApplyPersistsMirrorAcrossInstances() throws {
        let store = RecognitionBudgetStore(defaults: defaults)
        store.apply(RecognitionConfigResponse(
            maxImageEdge: nil,
            maxPixelsPerImage: 2_621_440,
            maxImagesPerRequest: 250,
            imageMediaTypes: ["image/jpeg", "image/png"]
        ))
        XCTAssertNil(store.budget.maxImageEdge)
        XCTAssertEqual(store.budget.maxPixelsPerImage, 2_621_440)
        XCTAssertEqual(store.budget.maxTileCount, 6)

        let launched = RecognitionBudgetStore(defaults: defaults)
        XCTAssertEqual(launched.budget, store.budget)
    }

    /// Corrupt mirror data degrades to `.shipped` instead of crashing or
    /// tiling with a half-decoded budget.
    func testCorruptMirrorFallsBackToShipped() throws {
        let store = RecognitionBudgetStore(defaults: defaults)
        store.apply(RecognitionConfigResponse(
            maxImageEdge: nil, maxPixelsPerImage: 2_621_440,
            maxImagesPerRequest: 250, imageMediaTypes: []
        ))
        // Overwrite the mirror with bytes no RecognitionBudget decodes out
        // of — the next launch must not trust them.
        defaults.set(Data("garbage".utf8), forKey: "qianlai.recognition.budget")
        let launched = RecognitionBudgetStore(defaults: defaults)
        XCTAssertEqual(launched.budget, .shipped)
    }
}
