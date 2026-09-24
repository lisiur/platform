//
//  ScreenshotTiler.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Splits a payment screenshot into model-sized tiles, shaped by the
/// model's `RecognitionBudget`.
///
/// Vision models auto-resize oversized input before inference, and a model
/// shrink is exactly what tiling exists to prevent — every tile is kept
/// inside the budget so it reaches inference at native sharpness. Two
/// budget shapes drive the geometry (see `RecognitionBudget`):
///
/// - Edge budget (DeepSeek, ~1300×1300): tile at the source's own width
///   when it fits the edge, slice vertically with a 10% overlap so a line
///   straddling a cut survives whole in at least one tile; extremely tall
///   captures step down a width ladder instead of growing the tile count
///   past the request cap.
/// - Pixel budget (Qwen VL): mild overflow (≤ 2× the budget — a one-screen
///   capture at ~0.9×) ships as ONE uniformly scaled image, the vision-token
///   floor; severe overflow slices at the largest width whose per-tile area
///   stays inside the budget, so the model never resizes at all.
enum ScreenshotTiler {
    /// EXPERIMENT (concluded 2026-09-23): lossless PNG tiles — no
    /// observable recognition difference vs JPEG 0.8 on real captures, so
    /// the encode step is not a recognition bottleneck at native
    /// resolution. `false` is the shipped behavior (JPEG 0.8, smaller
    /// payloads, same geometry); the whole-request JPEG fallback below
    /// still guards the server's size caps should this be retried.
    static let losslessTiles = false
    /// Total-payload budget for the PNG experiment: under both server caps
    /// (5MB per file, 6MB body incl. multipart overhead).
    private static let pngTotalBudget = 5_000_000

    /// One upload-ready recognition image plus the media type its bytes
    /// actually are — the model decodes by the annotation, so it must match
    /// the encode (the budget's media types decide which encoders run).
    struct RecognitionTile {
        let data: Data
        let mediaType: String
        var fileExtension: String { mediaType == "image/png" ? "png" : "jpg" }
    }

    /// EXPERIMENT (concluded 2026-09-23): single-image recognition — the
    /// whole screenshot as ONE full-resolution JPEG — tested WORSE than
    /// tiling on real captures: the model's own auto-resize shrinks tall
    /// screenshots below legibility, which is exactly what tiling exists
    /// to prevent. `false` is the shipped behavior; `recognitionTiles`
    /// remains the pipeline's single entry should this ever be retried.
    static let singleImageMode = false

    /// The fixed shrink stops beneath any budget cap — the budget's own
    /// width limit leads the candidates; these only kick in for extreme
    /// aspect ratios whose slicing would blow the tile count.
    private static let shrinkLadder: [CGFloat] = [
        1024, 800, 640, 512, 400, 320, 240, 160, 120,
    ]

    /// Pure geometry: target-scale tile frames (top-left origin) for a
    /// source image, shaped by the model budget. Unit-tested without any
    /// image decoding.
    static func plan(
        sourceWidth: Int,
        sourceHeight: Int,
        budget: RecognitionBudget = .shipped
    ) -> Plan? {
        guard sourceWidth > 0, sourceHeight > 0 else { return nil }
        if let pixels = budget.maxPixelsPerImage, budget.maxImageEdge == nil {
            return pixelPlan(
                sourceWidth: sourceWidth,
                sourceHeight: sourceHeight,
                pixels: pixels,
                maxTileCount: budget.maxTileCount
            )
        }
        // Edge shape (the edge wins when both shapes are set), or no model
        // geometry at all: the shipped edge ladder.
        let edge = budget.maxImageEdge ?? RecognitionBudget.defaultEdgeBudget
        return firstFittingPlan(
            sourceWidth: sourceWidth,
            sourceHeight: sourceHeight,
            maxWidth: CGFloat(edge),
            tileHeight: { _ in CGFloat(edge) },
            maxTileCount: budget.maxTileCount
        )
    }

    struct Plan: Equatable {
        let targetWidth: CGFloat
        /// Tile frames in target pixels, top to bottom; x is always 0.
        let frames: [CGRect]
    }

    /// Pixel-budget shape (Qwen VL): the model scales any image over the
    /// budget down to it, so the tiler keeps that resize either invisible
    /// or absent. The 2× threshold balances the singleImageMode experiment's
    /// lesson (model-side shrinks cost legibility) against the token floor
    /// of one-image requests: a one-screen capture lands at ~0.9×, invisible
    /// to recognition, while genuinely tall captures slice instead.
    private static func pixelPlan(
        sourceWidth: Int,
        sourceHeight: Int,
        pixels: Int,
        maxTileCount: Int
    ) -> Plan {
        let budgetPixels = CGFloat(pixels)
        let sourcePixels = CGFloat(sourceWidth) * CGFloat(sourceHeight)
        if sourcePixels <= 2 * budgetPixels {
            let scale = min(1, (budgetPixels / sourcePixels).squareRoot())
            let targetWidth = (CGFloat(sourceWidth) * scale).rounded(.up)
            let targetHeight = (CGFloat(sourceHeight) * scale).rounded(.up)
            return Plan(targetWidth: targetWidth, frames: [
                CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight),
            ])
        }
        // Severe overflow: slice at the largest width whose full-budget
        // tile is still square (nothing gains resolution past √budget) —
        // every tile lands at or under the budget, so the model keeps it
        // pixel-for-pixel. Tile height floors to whole pixels so a tile
        // never rounds itself past the budget.
        return firstFittingPlan(
            sourceWidth: sourceWidth,
            sourceHeight: sourceHeight,
            maxWidth: budgetPixels.squareRoot().rounded(.down),
            tileHeight: { (budgetPixels / $0).rounded(.down) },
            maxTileCount: maxTileCount
        )
    }

    /// The shrink-to-fit search both budget shapes share: candidates are
    /// the budget's width cap followed by the ladder stops under it, with
    /// the source's own width leading when it fits (resampling down to a
    /// stop would only spend pixels the model would have kept). The first
    /// width whose full-height slicing fits `maxTileCount` wins. Nothing
    /// fitting (extremely narrow source): the smallest usable stop,
    /// truncated to the cap — a bounded request beats none.
    private static func firstFittingPlan(
        sourceWidth: Int,
        sourceHeight: Int,
        maxWidth: CGFloat,
        tileHeight: (CGFloat) -> CGFloat,
        maxTileCount: Int
    ) -> Plan {
        let width = CGFloat(sourceWidth)
        var candidates = shrinkLadder.filter { $0 <= maxWidth }
        candidates.insert(maxWidth, at: 0)
        if width <= maxWidth {
            candidates.insert(width, at: 0)
        }
        for candidate in candidates where candidate <= width {
            let frames = scaledFrames(
                targetWidth: candidate,
                sourceWidth: sourceWidth,
                sourceHeight: sourceHeight,
                tileHeight: tileHeight(candidate)
            )
            if frames.count <= maxTileCount {
                return Plan(targetWidth: candidate, frames: frames)
            }
        }
        let fallbackWidth = min(candidates.last!, width)
        let frames = scaledFrames(
            targetWidth: fallbackWidth,
            sourceWidth: sourceWidth,
            sourceHeight: sourceHeight,
            tileHeight: tileHeight(fallbackWidth)
        )
        return Plan(targetWidth: fallbackWidth, frames: Array(frames.prefix(maxTileCount)))
    }

    private static func scaledFrames(
        targetWidth: CGFloat,
        sourceWidth: Int,
        sourceHeight: Int,
        tileHeight: CGFloat
    ) -> [CGRect] {
        // 10% of the tile height — one text row plus margin at capture
        // scale, whichever shape produced the tile.
        let overlap = tileHeight / 10
        let scale = targetWidth / CGFloat(sourceWidth)
        let targetHeight = (CGFloat(sourceHeight) * scale).rounded(.up)
        if targetHeight <= tileHeight {
            return [CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight)]
        }
        let step = tileHeight - overlap
        var frames: [CGRect] = []
        var y: CGFloat = 0
        while y < targetHeight {
            let height = min(tileHeight, targetHeight - y)
            frames.append(CGRect(x: 0, y: y, width: targetWidth, height: height))
            y += step
        }
        // A remainder no taller than the overlap sits fully inside the
        // previous tile's bottom band — fold it in rather than ship a
        // sliver tile that mostly duplicates its neighbor. The folded
        // frame stays ≤ tileHeight: targetHeight ≤ prev.maxY ≤ prev.y + tileHeight.
        if frames.count > 1, let last = frames.last, last.height <= overlap {
            frames.removeLast()
            let prev = frames[frames.count - 1]
            frames[frames.count - 1] = CGRect(
                x: prev.minX,
                y: prev.minY,
                width: prev.width,
                height: targetHeight - prev.minY
            )
        }
        return frames
    }

    /// The recognition pipeline's single entry — geometry comes from
    /// `budget`'s shape, the encode from the media types the model accepts
    /// (JPEG by default; PNG when the model narrowed to PNG only, or while
    /// the `losslessTiles` experiment holds and the payload fits).
    static func recognitionTiles(
        from data: Data,
        budget: RecognitionBudget = .shipped
    ) -> [RecognitionTile]? {
        var encoders = allowedEncoders(for: budget)
        if !encoders.jpeg, !encoders.png {
            // The model admits nothing this client encodes: fall back to
            // the shipped encode instead of failing locally — the server's
            // media-type guard then rejects the upload with the precise
            // type message, which surfaces as recognition guidance rather
            // than a bogus "couldn't read the image".
            encoders = (jpeg: true, png: true)
        }
        if singleImageMode {
            guard let whole = jpegWholeImage(from: data) else { return nil }
            return [RecognitionTile(data: whole, mediaType: "image/jpeg")]
        }
        if losslessTiles, encoders.png, let png = pngTiles(from: data, budget: budget),
           png.map(\.count).reduce(0, +) <= pngTotalBudget {
            return png.map { RecognitionTile(data: $0, mediaType: "image/png") }
        }
        if encoders.jpeg, let jpeg = jpegTiles(from: data, budget: budget), !jpeg.isEmpty {
            return jpeg.map { RecognitionTile(data: $0, mediaType: "image/jpeg") }
        }
        // The model narrowed to PNG only: ship PNG tiles without the
        // experiment's whole-request JPEG fallback — the model would 415
        // JPEG parts. At tiling budgets each PNG sits far under the server's
        // per-file cap on its own.
        if encoders.png, let png = pngTiles(from: data, budget: budget), !png.isEmpty {
            return png.map { RecognitionTile(data: $0, mediaType: "image/png") }
        }
        return nil
    }

    /// Which of the client's two encoders the model accepts. An empty
    /// budget list means "no model constraint" — the platform default set
    /// (jpeg/png/webp) admits both.
    private static func allowedEncoders(for budget: RecognitionBudget) -> (jpeg: Bool, png: Bool) {
        if budget.mediaTypes.isEmpty {
            return (true, true)
        }
        return (
            budget.mediaTypes.contains("image/jpeg"),
            budget.mediaTypes.contains("image/png")
        )
    }

    /// EXPERIMENT companion: the decoded screenshot re-drawn at its own
    /// width — no resample at native sizes, the model's auto-resize is
    /// exactly what this experiment runs against — and encoded as one JPEG
    /// (quality 0.8, same as tiles; re-encoding also keeps PNG originals
    /// under the server's 5MB per-file cap). Extremely tall scroll-captures
    /// halve their width until the encode fits instead of failing the
    /// upload.
    static func jpegWholeImage(from data: Data) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { return nil }
        var width = CGFloat(image.width)
        while true {
            let scale = width / CGFloat(image.width)
            let targetWidth = width.rounded(.up)
            let targetHeight = (CGFloat(image.height) * scale).rounded(.up)
            guard let context = CGContext(
                data: nil,
                width: Int(targetWidth),
                height: Int(targetHeight),
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return nil }
            context.interpolationQuality = .high
            context.translateBy(x: 0, y: targetHeight)
            context.scaleBy(x: 1, y: -1)
            context.draw(
                image,
                in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight)
            )
            guard let drawn = context.makeImage(), let encoded = encodeJPEG(drawn) else {
                return nil
            }
            if encoded.count <= 4_500_000 || width <= 320 { return encoded }
            width /= 2
        }
    }

    /// EXPERIMENT companion: the tiled path with lossless PNG encodes —
    /// same plan, same draw, same pixels `jpegTiles` produces before its
    /// encode step.
    static func pngTiles(
        from data: Data,
        budget: RecognitionBudget = .shipped
    ) -> [Data]? {
        guard let images = renderedTileImages(from: data, budget: budget) else { return nil }
        var tiles: [Data] = []
        for image in images {
            guard let encoded = encodePNG(image) else { return nil }
            tiles.append(encoded)
        }
        return tiles
    }

    /// Decodes `data` and renders every plan tile at full quality — the
    /// shared front half of `jpegTiles`/`pngTiles`.
    private static func renderedTileImages(
        from data: Data,
        budget: RecognitionBudget
    ) -> [CGImage]? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let plan = plan(
                sourceWidth: image.width,
                sourceHeight: image.height,
                budget: budget
              )
        else { return nil }

        let scale = plan.targetWidth / CGFloat(image.width)
        var tiles: [CGImage] = []
        for frame in plan.frames {
            // Crop and scale in one draw: the context is the tile's bounds,
            // the full image draws at target scale offset by the frame's
            // top-left. Flipping the context makes frame.y measure from the
            // top like the plan's frames.
            guard let context = CGContext(
                data: nil,
                width: Int(frame.width.rounded()),
                height: Int(frame.height.rounded()),
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return nil }
            context.interpolationQuality = .high
            context.translateBy(x: 0, y: frame.height)
            context.scaleBy(x: 1, y: -1)
            let drawRect = CGRect(
                x: -frame.origin.x,
                y: -frame.origin.y,
                width: CGFloat(image.width) * scale,
                height: CGFloat(image.height) * scale
            )
            context.draw(image, in: drawRect)
            guard let tile = context.makeImage() else {
                return nil
            }
            tiles.append(tile)
        }
        return tiles
    }

    /// Decodes `data`, slices it per `plan`, and re-encodes each tile as
    /// JPEG (quality 0.8). Returns nil when the image can't be decoded or
    /// rendered — the caller surfaces a recognition error.
    static func jpegTiles(
        from data: Data,
        budget: RecognitionBudget = .shipped
    ) -> [Data]? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let plan = plan(
                sourceWidth: image.width,
                sourceHeight: image.height,
                budget: budget
              )
        else { return nil }

        let scale = plan.targetWidth / CGFloat(image.width)
        var tiles: [Data] = []
        for frame in plan.frames {
            // Crop and scale in one draw: the context is the tile's bounds,
            // the full image draws at target scale offset by the frame's
            // top-left. Flipping the context makes frame.y measure from the
            // top like the plan's frames.
            guard let context = CGContext(
                data: nil,
                width: Int(frame.width.rounded()),
                height: Int(frame.height.rounded()),
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return nil }
            context.interpolationQuality = .high
            context.translateBy(x: 0, y: frame.height)
            context.scaleBy(x: 1, y: -1)
            let drawRect = CGRect(
                x: -frame.origin.x,
                y: -frame.origin.y,
                width: CGFloat(image.width) * scale,
                height: CGFloat(image.height) * scale
            )
            context.draw(image, in: drawRect)
            guard let tile = context.makeImage(), let encoded = encodeJPEG(tile) else {
                return nil
            }
            tiles.append(encoded)
        }
        return tiles
    }

    private static func encodeJPEG(_ image: CGImage) -> Data? {
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        CGImageDestinationAddImage(
            destination, image,
            [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary
        )
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }

    private static func encodePNG(_ image: CGImage) -> Data? {
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, UTType.png.identifier as CFString, 1, nil
        ) else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
