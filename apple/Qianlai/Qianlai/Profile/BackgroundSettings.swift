//
//  BackgroundSettings.swift
//  Qianlai
//

import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// Global background-image customization, stored on this device only.
/// Two file slots on disk:
///
/// - `activeFileURL` is the wallpaper currently shown on screen. Picked
///   photos and rendered presets both write here; one or the other owns
///   the slot at any moment.
/// - `photoFileURL` is the picked photo's permanent home. It is never
///   overwritten by a preset selection, so the wallpaper picker's "my
///   photo" tile can keep showing the last-picked thumbnail even while
///   a preset is currently the active background. An enable switch
///   (`enabledKey`) hides the background without touching either slot.
///   Nothing syncs to the server. The dim level, frost tier, card
///   opacity, active preset, and enable flag live in UserDefaults.
@MainActor @Observable
final class BackgroundSettings {
    static let defaults = UserDefaults.standard
    static let dimKey = "app.backgroundImage.dim"
    static let cardOpacityKey = "app.backgroundImage.cardOpacity"
    static let frostKey = "app.backgroundImage.frost"
    static let presetKey = "app.backgroundImage.preset"
    static let enabledKey = "app.backgroundImage.enabled"
    static let activeFileURL = URL.documentsDirectory.appendingPathComponent("background-image.jpg")
    static let photoFileURL = URL.documentsDirectory.appendingPathComponent("background-photo.jpg")

    /// Fullscreen render headroom: the tallest current phone is 2868px.
    nonisolated static let maxDimension: CGFloat = 2868
    nonisolated static let dimRange: ClosedRange<Double> = 0.05...0.95
    nonisolated static let defaultDim: Double = 0.25
    nonisolated static let cardOpacityRange: ClosedRange<Double> = 0.3...1.0
    nonisolated static let defaultCardOpacity: Double = 0.75

    /// The picked custom photo. Survives preset selections — the "my
    /// photo" tile in the wallpaper picker reads this directly, so it
    /// always shows the last-picked thumbnail even when a preset is
    /// currently the active background. Mirrors `photoFileURL`.
    private(set) var image: UIImage?
    private(set) var dim: Double
    private(set) var cardOpacity: Double
    /// The frosted-glass tier layered over the wallpaper; `.off`
    /// renders it sharp.
    private(set) var frost: Frost
    /// The wallpaper currently shown on screen: the picked photo when
    /// it owns the slot, else the rendered preset, else nothing.
    /// Mirrors `activeFileURL`.
    private(set) var activeImage: UIImage?
    /// Set when the active slot came from a preset; a photo pick or a
    /// photo removal (when the photo was active) clears it.
    private(set) var selectedPresetID: String?
    /// Whether the wallpaper feature is on. Toggling off only hides the
    /// background — the photo file, the active slot, and the preset
    /// selection all survive for the next enable. Toggling on with an
    /// empty active slot applies the first built-in preset, so the
    /// switch never yields an "on but blank" state. Defaults to off:
    /// the wallpaper only shows after the user enables it.
    private(set) var enabled: Bool

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
        if let stored = Self.defaults.string(forKey: Self.frostKey),
            let stored = Frost(rawValue: stored)
        {
            frost = stored
        } else {
            frost = .off
        }
        let preset = Self.defaults.string(forKey: Self.presetKey)
        if let preset, BackgroundPresetCatalog.all.contains(where: { $0.id == preset }) {
            selectedPresetID = preset
        } else {
            selectedPresetID = nil
        }
        enabled = (Self.defaults.object(forKey: Self.enabledKey) as? Bool) ?? false
        image = UIImage(contentsOfFile: Self.photoFileURL.path)
        // Migration for installs that pre-date the photo-slot split:
        // before, a picked photo and the active wallpaper shared one
        // file, so applying a preset overwrote the photo. If we find
        // an active wallpaper with no preset tag and no photo slot
        // yet, that file is a legacy picked photo — copy it into the
        // new slot so the user doesn't lose it on the first run after
        // this change.
        if image == nil,
           selectedPresetID == nil,
           FileManager.default.fileExists(atPath: Self.activeFileURL.path),
           let legacy = UIImage(contentsOfFile: Self.activeFileURL.path)
        {
            try? FileManager.default.copyItem(at: Self.activeFileURL, to: Self.photoFileURL)
            image = legacy
        }
        activeImage = UIImage(contentsOfFile: Self.activeFileURL.path)
    }

    /// A background shows exactly while the switch is on and an active
    /// wallpaper exists.
    var isActive: Bool { enabled && activeImage != nil }

    /// Enables or disables the wallpaper feature. Turning it on with an
    /// empty active slot — first use, or after the wallpaper was
    /// removed — applies the first built-in preset so the switch never
    /// yields an "on but blank" state; throws only if that default
    /// preset fails to render.
    func setEnabled(_ value: Bool) throws {
        enabled = value
        Self.defaults.set(value, forKey: Self.enabledKey)
        if value, activeImage == nil, let first = BackgroundPresetCatalog.all.first {
            try applyPreset(first)
        }
    }

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

    func setFrost(_ value: Frost) {
        frost = value
        Self.defaults.set(value.rawValue, forKey: Self.frostKey)
    }

    /// Downsamples and stores the picked photo. Picking one is an
    /// explicit intent to show it: both slots update, and any preset
    /// selection clears. The photo slot is written first so a failed
    /// active-slot write still leaves the picked photo recoverable
    /// for the next attempt.
    func setPhoto(_ data: Data) throws {
        guard let jpeg = Self.downsampledJPEG(data) else {
            throw BackgroundError.cannotProcess
        }
        try jpeg.write(to: Self.photoFileURL, options: .atomic)
        try storeActive(jpeg)
        guard let photo = UIImage(contentsOfFile: Self.photoFileURL.path) else {
            throw BackgroundError.cannotProcess
        }
        image = photo
        clearSelectedPreset()
    }

    /// Renders the preset at screen resolution, stores it in the active
    /// slot, and remembers the selection for the picker's highlight.
    /// The photo slot is untouched — the picked photo stays available
    /// even while this preset is showing on screen.
    func applyPreset(_ preset: BackgroundPreset) throws {
        let rendered = BackgroundPresetCatalog.render(preset, size: Self.sharedScreenSize)
        guard let jpeg = rendered.jpegData(compressionQuality: 0.75) else {
            throw BackgroundError.cannotProcess
        }
        try storeActive(jpeg)
        selectedPresetID = preset.id
        Self.defaults.set(preset.id, forKey: Self.presetKey)
    }

    /// Re-selects the already-picked photo as the active wallpaper after
    /// a preset took the slot — the wallpaper tile's first tap in its
    /// two-phase interaction. The photo bytes are copied into the active
    /// slot (no re-encode) and the preset selection clears. No-op when
    /// nothing has been picked yet.
    func selectPhoto() throws {
        guard image != nil else { return }
        try storeActive(Data(contentsOf: Self.photoFileURL))
        clearSelectedPreset()
    }

    /// Removes the picked photo. The dim and card-opacity levels stay
    /// for the next one. If the photo was the active wallpaper, the
    /// active slot goes with it (the on-disk JPEG would be stale); if
    /// a preset is currently active, the active slot is left alone.
    func clearPhoto() {
        try? FileManager.default.removeItem(at: Self.photoFileURL)
        image = nil
        if selectedPresetID == nil {
            try? FileManager.default.removeItem(at: Self.activeFileURL)
            activeImage = nil
        }
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

    /// One write path for the active wallpaper file: atomic write,
    /// then reload from disk so `activeImage` always mirrors what was
    /// stored.
    private func storeActive(_ jpeg: Data) throws {
        try jpeg.write(to: Self.activeFileURL, options: .atomic)
        guard let stored = UIImage(contentsOfFile: Self.activeFileURL.path) else {
            throw BackgroundError.cannotProcess
        }
        activeImage = stored
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

/// The frosted-glass treatment layered over the wallpaper: one system
/// material tier, or none. Materials expose no blur radius, so strength
/// is a stepped slider (five stops) rather than a continuous dial — the
/// tiers step the material's tint (their blur amount sits at fixed
/// system-bar strength). Stored by rawValue in defaults; unknown stored
/// values fall back to `.off`.
enum Frost: String, CaseIterable, Identifiable {
    case off
    case ultraThin
    case thin
    case regular
    case thick

    var id: Self { self }

    /// The SwiftUI material for the tier; nil for `.off`, so the off
    /// tier is unrenderable by construction — no call-site gate needed.
    var material: Material? {
        switch self {
        case .off: nil
        case .ultraThin: .ultraThinMaterial
        case .thin: .thinMaterial
        case .regular: .regularMaterial
        case .thick: .thickMaterial
        }
    }

    var label: String {
        switch self {
        case .off: L10n.string("profile.theme.frost.none", defaultValue: "None")
        case .ultraThin: L10n.string("profile.theme.frost.ultraThin", defaultValue: "Ultra Thin")
        case .thin: L10n.string("profile.theme.frost.thin", defaultValue: "Thin")
        case .regular: L10n.string("profile.theme.frost.regular", defaultValue: "Regular")
        case .thick: L10n.string("profile.theme.frost.thick", defaultValue: "Thick")
        }
    }
}
