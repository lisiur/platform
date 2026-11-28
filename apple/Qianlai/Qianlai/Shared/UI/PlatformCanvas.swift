//
//  PlatformCanvas.swift
//  Qianlai
//
//  Cross-platform raster helpers: SwiftUI-view → bitmap (ImageRenderer's
//  uiImage/nsImage fork, once) and CGContext → bitmap (UIGraphicsImage-
//  Renderer's twin for pure-CG drawing). Both return `PlatformImage`.
//

import SwiftUI

#if canImport(UIKit)
import UIKit
typealias PlatformColor = UIColor
#elseif canImport(AppKit)
import AppKit
typealias PlatformColor = NSColor
#endif

@MainActor
enum PlatformCanvas {
    /// Renders a SwiftUI view into a bitmap. `scale` nil uses the
    /// renderer's screen-scale default.
    static func renderImage(
        _ view: some View, scale: CGFloat? = nil
    ) -> PlatformImage {
        let renderer = ImageRenderer(content: view)
        if let scale { renderer.scale = scale }
        #if canImport(UIKit)
        return renderer.uiImage ?? PlatformImage()
        #elseif canImport(AppKit)
        return renderer.nsImage ?? PlatformImage()
        #endif
    }

    /// Pure-CoreGraphics drawing into an opaque bitmap of `size` points
    /// at `scale` pixels per point — UIGraphicsImageRenderer's
    /// cross-platform twin (the draw closure sees the CG context only).
    nonisolated static func render(
        size: CGSize,
        scale: CGFloat? = nil,
        opaque: Bool = true,
        draw: (CGContext) -> Void
    ) -> PlatformImage {
        let effectiveScale = scale ?? 1
        #if canImport(UIKit)
        let format = UIGraphicsImageRendererFormat()
        format.scale = effectiveScale
        format.opaque = opaque
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            draw(context.cgContext)
        }
        #elseif canImport(AppKit)
        let pixelsWide = max(Int(size.width * effectiveScale), 1)
        let pixelsHigh = max(Int(size.height * effectiveScale), 1)
        let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelsWide,
            pixelsHigh: pixelsHigh,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: !opaque,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        )!
        rep.size = size
        let context = NSGraphicsContext(bitmapImageRep: rep)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        draw(context.cgContext)
        NSGraphicsContext.restoreGraphicsState()
        return NSImage(cgImage: rep.cgImage!, size: size)
        #endif
    }
}
