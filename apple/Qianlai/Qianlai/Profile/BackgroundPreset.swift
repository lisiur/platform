//
//  BackgroundPreset.swift
//  Qianlai
//

import SwiftUI

/// A built-in wallpaper defined in code and rendered on demand, so no
/// binary assets ship and the render is always screen-sharp.
struct BackgroundPreset: Identifiable {
    enum Style {
        /// Soft radial color blobs over a base color.
        case blobs(base: UIColor, blobs: [(center: CGPoint, radius: CGFloat, color: UIColor)])
        /// Diagonal color bands, each holding then blending into the next.
        case stripes(colors: [UIColor], angle: CGFloat)
        /// Hard-edged diagonal color bands — solid fills, no blending.
        case hardStripes(colors: [UIColor], angle: CGFloat)
    }

    let id: String
    /// Catalog key for the display name (`profile.theme.preset.<id>`).
    let nameKey: String
    /// English fallback matching the catalog's en value.
    let nameFallback: String

    /// Display name through the shared L10n path (honors the in-app
    /// language override).
    var name: String {
        L10n.string(nameKey, defaultValue: nameFallback)
    }

    let style: Style
}

@MainActor
enum BackgroundPresetCatalog {
    static let all: [BackgroundPreset] = [
        BackgroundPreset(
            id: "aurora",
            nameKey: "profile.theme.preset.aurora",
            nameFallback: "Aurora",
            style: .blobs(
                base: UIColor(red: 0.06, green: 0.13, blue: 0.15, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.30, y: 0.20), 0.50, UIColor(red: 0.20, green: 0.83, blue: 0.60, alpha: 0.60)),
                    (CGPoint(x: 0.70, y: 0.45), 0.55, UIColor(red: 0.13, green: 0.83, blue: 0.93, alpha: 0.55)),
                    (CGPoint(x: 0.40, y: 0.80), 0.60, UIColor(red: 0.65, green: 0.55, blue: 0.98, alpha: 0.60)),
                ]
            )
        ),
        BackgroundPreset(
            id: "candy",
            nameKey: "profile.theme.preset.candy",
            nameFallback: "Candy",
            style: .stripes(
                colors: [
                    UIColor(red: 1.00, green: 0.75, blue: 0.85, alpha: 1),
                    UIColor(red: 0.80, green: 0.72, blue: 0.98, alpha: 1),
                    UIColor(red: 0.65, green: 0.90, blue: 0.85, alpha: 1),
                    UIColor(red: 1.00, green: 0.88, blue: 0.70, alpha: 1),
                ],
                angle: 55
            )
        ),
        BackgroundPreset(
            id: "dawn",
            nameKey: "profile.theme.preset.dawn",
            nameFallback: "Dawn",
            style: .blobs(
                base: UIColor(red: 1.00, green: 0.95, blue: 0.90, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.20, y: 0.15), 0.50, UIColor(red: 1.00, green: 0.73, blue: 0.54, alpha: 0.90)),
                    (CGPoint(x: 0.85, y: 0.35), 0.55, UIColor(red: 1.00, green: 0.56, blue: 0.64, alpha: 0.80)),
                    (CGPoint(x: 0.30, y: 0.75), 0.60, UIColor(red: 0.79, green: 0.71, blue: 0.96, alpha: 0.80)),
                ]
            )
        ),
        BackgroundPreset(
            id: "dusk",
            nameKey: "profile.theme.preset.dusk",
            nameFallback: "Dusk",
            style: .blobs(
                base: UIColor(red: 0.17, green: 0.14, blue: 0.31, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.25, y: 0.25), 0.60, UIColor(red: 0.55, green: 0.36, blue: 0.96, alpha: 0.70)),
                    (CGPoint(x: 0.85, y: 0.45), 0.55, UIColor(red: 0.96, green: 0.45, blue: 0.71, alpha: 0.65)),
                    (CGPoint(x: 0.35, y: 0.85), 0.60, UIColor(red: 0.30, green: 0.11, blue: 0.58, alpha: 0.80)),
                ]
            )
        ),
        BackgroundPreset(
            id: "forest",
            nameKey: "profile.theme.preset.forest",
            nameFallback: "Forest",
            style: .blobs(
                base: UIColor(red: 0.94, green: 0.97, blue: 0.93, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.25, y: 0.25), 0.55, UIColor(red: 0.53, green: 0.79, blue: 0.61, alpha: 0.85)),
                    (CGPoint(x: 0.80, y: 0.60), 0.60, UIColor(red: 0.24, green: 0.61, blue: 0.42, alpha: 0.70)),
                    (CGPoint(x: 0.40, y: 0.90), 0.50, UIColor(red: 0.77, green: 0.88, blue: 0.48, alpha: 0.70)),
                ]
            )
        ),
        BackgroundPreset(
            id: "graphite",
            nameKey: "profile.theme.preset.graphite",
            nameFallback: "Graphite",
            style: .blobs(
                base: UIColor(red: 0.95, green: 0.95, blue: 0.96, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.30, y: 0.30), 0.50, UIColor(red: 0.78, green: 0.80, blue: 0.82, alpha: 0.70)),
                    (CGPoint(x: 0.80, y: 0.70), 0.60, UIColor(red: 0.60, green: 0.63, blue: 0.66, alpha: 0.50)),
                ]
            )
        ),
        BackgroundPreset(
            id: "ice",
            nameKey: "profile.theme.preset.ice",
            nameFallback: "Ice",
            style: .blobs(
                base: UIColor(red: 0.94, green: 0.97, blue: 0.98, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.30, y: 0.20), 0.50, UIColor(red: 0.66, green: 0.85, blue: 0.94, alpha: 0.90)),
                    (CGPoint(x: 0.75, y: 0.50), 0.55, UIColor(red: 0.49, green: 0.76, blue: 0.91, alpha: 0.85)),
                    (CGPoint(x: 0.40, y: 0.85), 0.60, UIColor(red: 0.82, green: 0.93, blue: 0.97, alpha: 0.90)),
                ]
            )
        ),
        BackgroundPreset(
            id: "lavender",
            nameKey: "profile.theme.preset.lavender",
            nameFallback: "Lavender",
            style: .blobs(
                base: UIColor(red: 0.96, green: 0.94, blue: 0.99, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.30, y: 0.20), 0.50, UIColor(red: 0.79, green: 0.72, blue: 0.96, alpha: 0.90)),
                    (CGPoint(x: 0.80, y: 0.50), 0.55, UIColor(red: 0.65, green: 0.55, blue: 0.98, alpha: 0.85)),
                    (CGPoint(x: 0.35, y: 0.85), 0.60, UIColor(red: 0.85, green: 0.78, blue: 1.00, alpha: 0.90)),
                ]
            )
        ),
        BackgroundPreset(
            id: "midnight",
            nameKey: "profile.theme.preset.midnight",
            nameFallback: "Midnight",
            style: .stripes(
                colors: [
                    UIColor(red: 0.10, green: 0.16, blue: 0.42, alpha: 1),
                    UIColor(red: 0.18, green: 0.30, blue: 0.65, alpha: 1),
                    UIColor(red: 0.09, green: 0.20, blue: 0.31, alpha: 1),
                    UIColor(red: 0.24, green: 0.49, blue: 0.69, alpha: 1),
                ],
                angle: 60
            )
        ),
        BackgroundPreset(
            id: "ocean",
            nameKey: "profile.theme.preset.ocean",
            nameFallback: "Ocean",
            style: .stripes(
                colors: [
                    UIColor(red: 0.11, green: 0.42, blue: 0.58, alpha: 1),
                    UIColor(red: 0.25, green: 0.65, blue: 0.77, alpha: 1),
                    UIColor(red: 0.50, green: 0.85, blue: 0.85, alpha: 1),
                    UIColor(red: 0.09, green: 0.31, blue: 0.42, alpha: 1),
                ],
                angle: 35
            )
        ),
        BackgroundPreset(
            id: "sakura",
            nameKey: "profile.theme.preset.sakura",
            nameFallback: "Sakura",
            style: .blobs(
                base: UIColor(red: 1.00, green: 0.94, blue: 0.96, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.25, y: 0.20), 0.50, UIColor(red: 1.00, green: 0.76, blue: 0.83, alpha: 0.90)),
                    (CGPoint(x: 0.80, y: 0.45), 0.55, UIColor(red: 1.00, green: 0.62, blue: 0.73, alpha: 0.85)),
                    (CGPoint(x: 0.35, y: 0.80), 0.60, UIColor(red: 0.96, green: 0.79, blue: 0.94, alpha: 0.90)),
                ]
            )
        ),
        BackgroundPreset(
            id: "sea",
            nameKey: "profile.theme.preset.sea",
            nameFallback: "Sea",
            style: .blobs(
                base: UIColor(red: 0.92, green: 0.96, blue: 1.00, alpha: 1),
                blobs: [
                    (CGPoint(x: 0.20, y: 0.20), 0.55, UIColor(red: 0.49, green: 0.78, blue: 0.96, alpha: 0.85)),
                    (CGPoint(x: 0.85, y: 0.55), 0.60, UIColor(red: 0.37, green: 0.83, blue: 0.77, alpha: 0.80)),
                    (CGPoint(x: 0.40, y: 0.90), 0.60, UIColor(red: 0.35, green: 0.56, blue: 0.94, alpha: 0.75)),
                ]
            )
        ),
        BackgroundPreset(
            id: "sunrise",
            nameKey: "profile.theme.preset.sunrise",
            nameFallback: "Sunrise",
            style: .stripes(
                colors: [
                    UIColor(red: 1.00, green: 0.54, blue: 0.36, alpha: 1),
                    UIColor(red: 1.00, green: 0.71, blue: 0.42, alpha: 1),
                    UIColor(red: 1.00, green: 0.49, blue: 0.62, alpha: 1),
                    UIColor(red: 0.84, green: 0.54, blue: 0.72, alpha: 1),
                ],
                angle: 50
            )
        ),
        BackgroundPreset(
            id: "lagoon",
            nameKey: "profile.theme.preset.lagoon",
            nameFallback: "Lagoon",
            style: .hardStripes(
                colors: [
                    UIColor(red: 0.05, green: 0.23, blue: 0.31, alpha: 1),
                    UIColor(red: 0.08, green: 0.34, blue: 0.31, alpha: 1),
                    UIColor(red: 0.11, green: 0.48, blue: 0.37, alpha: 1),
                    UIColor(red: 0.24, green: 0.63, blue: 0.53, alpha: 1),
                ],
                angle: 40
            )
        ),
        BackgroundPreset(
            id: "pop",
            nameKey: "profile.theme.preset.pop",
            nameFallback: "Pop",
            style: .hardStripes(
                colors: [
                    UIColor(red: 1.00, green: 0.32, blue: 0.32, alpha: 1),
                    UIColor(red: 1.00, green: 0.84, blue: 0.25, alpha: 1),
                    UIColor(red: 0.25, green: 0.77, blue: 1.00, alpha: 1),
                    UIColor(red: 0.41, green: 0.94, blue: 0.68, alpha: 1),
                ],
                angle: 55
            )
        ),
    ]

    /// Small cached preview for the picker row.
    static func thumbnail(for preset: BackgroundPreset) -> UIImage {
        if let cached = thumbnails[preset.id] { return cached }
        let image = render(preset, size: CGSize(width: 64, height: 120), scale: 2)
        thumbnails[preset.id] = image
        return image
    }

    private static var thumbnails: [String: UIImage] = [:]

    /// Renders the preset at `size` points; `scale` nil uses the device's
    /// main-screen scale (the fullscreen wallpaper render).
    static func render(_ preset: BackgroundPreset, size: CGSize, scale: CGFloat? = nil) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        if let scale { format.scale = scale }
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            let cg = context.cgContext
            switch preset.style {
            case let .blobs(base, blobs):
                base.setFill()
                cg.fill(CGRect(origin: .zero, size: size))
                for blob in blobs {
                    let center = CGPoint(x: blob.center.x * size.width, y: blob.center.y * size.height)
                    let colors = [blob.color.cgColor, blob.color.withAlphaComponent(0).cgColor] as CFArray
                    if let gradient = CGGradient(
                        colorsSpace: CGColorSpaceCreateDeviceRGB(),
                        colors: colors,
                        locations: [0, 1]
                    ) {
                        cg.drawRadialGradient(
                            gradient,
                            startCenter: center,
                            startRadius: 0,
                            endCenter: center,
                            endRadius: blob.radius * max(size.width, size.height),
                            options: []
                        )
                    }
                }
            case let .stripes(colors, degrees):
                // Rotated diagonal canvas covered by a multi-stop gradient:
                // each color holds through most of its band, then blends
                // into the next — the soft-stripe look.
                cg.saveGState()
                cg.translateBy(x: size.width / 2, y: size.height / 2)
                cg.rotate(by: degrees * .pi / 180)
                let span = hypot(size.width, size.height) * 1.4
                var stops: [(location: CGFloat, color: UIColor)] = []
                let band = 1.0 / CGFloat(colors.count)
                for (index, color) in colors.enumerated() {
                    let start = CGFloat(index) * band
                    stops.append((start, color))
                    stops.append((start + band * 0.65, color))
                }
                stops[0].location = 0
                stops[stops.count - 1].location = 1
                let gradient = CGGradient(
                    colorsSpace: CGColorSpaceCreateDeviceRGB(),
                    colors: stops.map { $0.color.cgColor } as CFArray,
                    locations: stops.map { $0.location }
                )!
                cg.drawLinearGradient(
                    gradient,
                    start: CGPoint(x: 0, y: -span / 2),
                    end: CGPoint(x: 0, y: span / 2),
                    options: []
                )
                cg.restoreGState()
            case let .hardStripes(colors, degrees):
                // Same rotated canvas, but each band is a solid fill —
                // crisp edges, no blending.
                cg.saveGState()
                cg.translateBy(x: size.width / 2, y: size.height / 2)
                cg.rotate(by: degrees * .pi / 180)
                let span = hypot(size.width, size.height) * 1.4
                let band = span / CGFloat(colors.count)
                for (index, color) in colors.enumerated() {
                    let y = -span / 2 + CGFloat(index) * band
                    color.setFill()
                    cg.fill(CGRect(x: -span / 2, y: y, width: span, height: band + 0.5))
                }
                cg.restoreGState()
            }
        }
    }
}
