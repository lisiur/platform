//
//  BackgroundSettings.swift
//  Qianlai
//

import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// Global background-image customization, stored on this device only: a
/// photo-library pick is downsampled and re-encoded to JPEG in Documents,
/// while the dim level, card opacity, and applied preset live in
/// UserDefaults. Nothing syncs to the server. The background shows exactly
/// when an image exists — there is no separate enable switch.
@MainActor @Observable
final class BackgroundSettings {
    static let defaults = UserDefaults.standard
    static let dimKey = "app.backgroundImage.dim"
    static let cardOpacityKey = "app.backgroundImage.cardOpacity"
    static let presetKey = "app.backgroundImage.preset"
    static let fileURL = URL.documentsDirectory.appendingPathComponent("background-image.jpg")

    /// Fullscreen render headroom: the tallest current phone is 2868px.
    nonisolated static let maxDimension: CGFloat = 2868
    nonisolated static let dimRange: ClosedRange<Double> = 0.05...0.95
    nonisolated static let defaultDim: Double = 0.25
    nonisolated static let cardOpacityRange: ClosedRange<Double> = 0.3...1.0
    nonisolated static let defaultCardOpacity: Double = 0.75

    private(set) var image: UIImage?
    private(set) var dim: Double
    private(set) var cardOpacity: Double
    /// Set when the current background came from a preset; a photo pick
    /// or removal clears it.
    private(set) var selectedPresetID: String?

    init() {
        if let stored = Self.defaults.object(forKey: Self.dimKey) as? Double,
            Self.dimRange.contains(stored)
        {
            dim = stored
        } else {
            dim = Self.defaultDim
        }
        if let stored = Self.defaults.object(forKey: Self.cardOpacityKey) as? Double,
            Self.cardOpacityRange.contains(stored)
        {
            cardOpacity = stored
        } else {
            cardOpacity = Self.defaultCardOpacity
        }
        let preset = Self.defaults.string(forKey: Self.presetKey)
        if let preset, BackgroundPresetCatalog.all.contains(where: { $0.id == preset }) {
            selectedPresetID = preset
        } else {
            selectedPresetID = nil
        }
        image = UIImage(contentsOfFile: Self.fileURL.path)
    }

    /// A background shows exactly while an image exists.
    var isActive: Bool { image != nil }

    /// Screen points, resolved lazily (the window scene is connected by
    /// first render) and cached — the pinned wallpaper layer never
    /// re-flows. Portrait-only app; a rotation would need invalidation.
    static let sharedScreenSize: CGSize = {
        let scenes = UIApplication.shared.connectedScenes.compactMap {
            ($0 as? UIWindowScene)?.screen.bounds.size
        }
        return scenes.first ?? CGSize(width: 393, height: 852)
    }()

    func setDim(_ value: Double) {
        dim = min(max(value, Self.dimRange.lowerBound), Self.dimRange.upperBound)
        Self.defaults.set(dim, forKey: Self.dimKey)
    }

    func setCardOpacity(_ value: Double) {
        cardOpacity = min(max(value, Self.cardOpacityRange.lowerBound), Self.cardOpacityRange.upperBound)
        Self.defaults.set(cardOpacity, forKey: Self.cardOpacityKey)
    }

    /// Downsamples and stores the picked photo. Picking one is an explicit
    /// intent to show it, and replaces any applied preset.
    func setPhoto(_ data: Data) throws {
        guard let jpeg = Self.downsampledJPEG(data) else {
            throw BackgroundError.cannotProcess
        }
        try storeJPEG(jpeg)
        clearSelectedPreset()
    }

    /// Renders the preset at screen resolution, stores it like a picked
    /// photo, and remembers the selection for the picker's highlight.
    func applyPreset(_ preset: BackgroundPreset) throws {
        let rendered = BackgroundPresetCatalog.render(preset, size: Self.sharedScreenSize)
        guard let jpeg = rendered.jpegData(compressionQuality: 0.75) else {
            throw BackgroundError.cannotProcess
        }
        try storeJPEG(jpeg)
        selectedPresetID = preset.id
        Self.defaults.set(preset.id, forKey: Self.presetKey)
    }

    /// Removes the photo; the dim and card-opacity levels stay for the
    /// next one.
    func clearPhoto() {
        try? FileManager.default.removeItem(at: Self.fileURL)
        image = nil
        clearSelectedPreset()
    }

    enum BackgroundError: LocalizedError {
        case cannotProcess

        var errorDescription: String? {
            switch self {
            case .cannotProcess:
                return L10n.string(
                    "profile.theme.cannotProcess",
                    defaultValue: "That image can't be used as a background."
                )
            }
        }
    }

    /// The one write path for the wallpaper file: atomic write, then
    /// reload from disk so `image` always mirrors what was stored.
    private func storeJPEG(_ jpeg: Data) throws {
        try jpeg.write(to: Self.fileURL, options: .atomic)
        guard let stored = UIImage(contentsOfFile: Self.fileURL.path) else {
            throw BackgroundError.cannotProcess
        }
        image = stored
    }

    private func clearSelectedPreset() {
        selectedPresetID = nil
        Self.defaults.removeObject(forKey: Self.presetKey)
    }

    /// ImageIO downsample to `maxDimension` on the longest side, JPEG at
    /// the given quality — the wallpaper only ever renders fullscreen, so
    /// it never needs more pixels than the tallest screen.
    nonisolated static func downsampledJPEG(
        _ data: Data,
        maxDimension: CGFloat = BackgroundSettings.maxDimension,
        quality: Double = 0.75
    ) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension,
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        CGImageDestinationAddImage(
            destination, thumbnail,
            [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
        )
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
