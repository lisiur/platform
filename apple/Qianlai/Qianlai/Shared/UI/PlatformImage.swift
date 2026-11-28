//
//  PlatformImage.swift
//  Qianlai
//
//  The one cross-platform image seam: `PlatformImage` is UIImage on
//  iOS/xrOS (and Mac Catalyst) and NSImage on macOS. Every view model,
//  cache, and renderer that holds a decoded bitmap holds a PlatformImage;
//  views construct SwiftUI `Image` values through `Image(platformImage:)`
//  instead of the per-platform initializers. `PlatformImage(data:)` and
//  `PlatformImage(contentsOfFile:)` work unchanged on both sides (both
//  frameworks carry those initializers), so most call sites are a pure
//  UIImage → PlatformImage rename.
//

import SwiftUI

#if canImport(UIKit)
import UIKit
typealias PlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
typealias PlatformImage = NSImage
#endif

extension Image {
    /// The cross-platform image constructor.
    init(platformImage: PlatformImage) {
        #if canImport(UIKit)
        self = Image(uiImage: platformImage)
        #elseif canImport(AppKit)
        self = Image(nsImage: platformImage)
        #endif
    }
}

#if canImport(AppKit) && !canImport(UIKit)
extension PlatformImage {
    /// The AppKit JPEG encode — iOS ships `UIImage.jpegData` natively, and
    /// redeclaring the same signature here would shadow it (and recurse).
    func jpegData(compressionQuality: CGFloat) -> Data? {
        guard
            let tiff = tiffRepresentation,
            let rep = NSBitmapImageRep(data: tiff)
        else { return nil }
        return rep.representation(
            using: .jpeg,
            properties: [.compressionFactor: compressionQuality]
        )
    }
}
#endif
