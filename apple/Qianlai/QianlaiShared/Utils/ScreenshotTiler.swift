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

/// Splits a payment screenshot into model-sized JPEG tiles.
///
/// The recognition model reads images at 800×800, so a full-height screenshot
/// squashed into one frame blurs its text beyond recognition. Tiling keeps
/// every row legible: scale to 800 wide, slice vertically with a 10% overlap
/// so a line straddling a cut survives whole in at least one tile. Extremely
/// tall captures step down a width ladder instead of growing the tile count
/// past the request cap.
enum ScreenshotTiler {
    static let maxEdge = 800
    /// Hard cap on tiles per recognition — the service rejects more.
    static let maxTileCount = 6
    /// Overlap between consecutive tiles, in target pixels.
    static let overlap: CGFloat = 80
    /// The shrink-to-fit ladder: the first width whose full-height slicing
    /// fits in `maxTileCount` wins. Never upscaled past the source width.
    static let candidateWidths: [CGFloat] = [800, 640, 512, 400, 320, 240, 160, 120]

    /// Pure geometry: target-scale tile frames (top-left origin) for a
    /// source image. Unit-tested without any image decoding.
    static func plan(sourceWidth: Int, sourceHeight: Int) -> Plan? {
        guard sourceWidth > 0, sourceHeight > 0 else { return nil }
        let width = CGFloat(sourceWidth)
        for candidate in candidateWidths where candidate <= width {
            let frames = scaledFrames(targetWidth: candidate, sourceWidth: sourceWidth, sourceHeight: sourceHeight)
            if frames.count <= maxTileCount {
                return Plan(targetWidth: candidate, frames: frames)
            }
        }
        // Nothing fit (extremely narrow source): take the smallest ladder
        // step the source can hold without upscaling, truncated to the cap —
        // a bounded request beats none.
        let fallbackWidth = min(candidateWidths.last!, CGFloat(sourceWidth))
        let frames = scaledFrames(
            targetWidth: fallbackWidth,
            sourceWidth: sourceWidth,
            sourceHeight: sourceHeight
        )
        return Plan(targetWidth: fallbackWidth, frames: Array(frames.prefix(maxTileCount)))
    }

    struct Plan: Equatable {
        let targetWidth: CGFloat
        /// Tile frames in target pixels, top to bottom; x is always 0.
        let frames: [CGRect]
    }

    private static func scaledFrames(
        targetWidth: CGFloat,
        sourceWidth: Int,
        sourceHeight: Int
    ) -> [CGRect] {
        let scale = targetWidth / CGFloat(sourceWidth)
        let targetHeight = (CGFloat(sourceHeight) * scale).rounded(.up)
        if targetHeight <= CGFloat(maxEdge) {
            return [CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight)]
        }
        let step = CGFloat(maxEdge) - overlap
        var frames: [CGRect] = []
        var y: CGFloat = 0
        while y < targetHeight {
            let height = min(CGFloat(maxEdge), targetHeight - y)
            frames.append(CGRect(x: 0, y: y, width: targetWidth, height: height))
            y += step
        }
        return frames
    }

    /// Decodes `data`, slices it per `plan`, and re-encodes each tile as
    /// JPEG (quality 0.8). Returns nil when the image can't be decoded or
    /// rendered — the caller surfaces a recognition error.
    static func jpegTiles(from data: Data) -> [Data]? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let plan = plan(sourceWidth: image.width, sourceHeight: image.height)
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
}
