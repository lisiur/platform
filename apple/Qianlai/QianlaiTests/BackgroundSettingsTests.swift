//
//  BackgroundSettingsTests.swift
//  QianlaiTests
//

import ImageIO
import UIKit
import XCTest
@testable import Qianlai

@MainActor
final class BackgroundSettingsTests: XCTestCase {
    override func tearDown() {
        try? FileManager.default.removeItem(at: Self.fileURL)
        try? FileManager.default.removeItem(at: Self.photoFileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.dim")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.cardOpacity")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.enabled")
        super.tearDown()
    }

    private static let fileURL = URL.documentsDirectory.appendingPathComponent("background-image.jpg")
    private static let photoFileURL = URL.documentsDirectory.appendingPathComponent("background-photo.jpg")

    /// setPhoto persists across instances (file + flag), auto-activates, and
    /// clearPhoto removes every trace; the dim and card-opacity defaults
    /// fill when unset.
    func testPhotoPersistRoundtrip() throws {
        try? FileManager.default.removeItem(at: Self.fileURL)
        try? FileManager.default.removeItem(at: Self.photoFileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.dim")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.cardOpacity")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")

        let store = BackgroundSettings()
        try store.setEnabled(true)
        XCTAssertEqual(store.dim, BackgroundSettings.defaultDim)
        XCTAssertEqual(store.cardOpacity, BackgroundSettings.defaultCardOpacity)

        let jpeg = try XCTUnwrap(Self.smallJPEG())
        try store.setPhoto(jpeg)
        XCTAssertTrue(store.isActive)
        XCTAssertTrue(FileManager.default.fileExists(atPath: Self.fileURL.path))

        // A fresh instance reads the same state back from disk.
        let reloaded = BackgroundSettings()
        XCTAssertNotNil(reloaded.image)
        XCTAssertTrue(reloaded.isActive)

        reloaded.setDim(0.5)
        XCTAssertEqual(BackgroundSettings().dim, 0.5, accuracy: 0.0001)

        reloaded.setCardOpacity(0.4)
        XCTAssertEqual(BackgroundSettings().cardOpacity, 0.4, accuracy: 0.0001)

        reloaded.clearPhoto()
        XCTAssertNil(reloaded.image)
        XCTAssertFalse(reloaded.isActive)
        XCTAssertFalse(FileManager.default.fileExists(atPath: Self.fileURL.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: Self.photoFileURL.path))
    }

    /// Applying a preset persists the render + selection; a photo pick
    /// replaces it and clears the selection.
    func testPresetApply() throws {
        try? FileManager.default.removeItem(at: Self.fileURL)
        try? FileManager.default.removeItem(at: Self.photoFileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")

        let store = BackgroundSettings()
        try store.setEnabled(true)
        let preset = try XCTUnwrap(BackgroundPresetCatalog.all.first)
        try store.applyPreset(preset)
        XCTAssertEqual(store.selectedPresetID, preset.id)
        XCTAssertTrue(store.isActive)
        XCTAssertTrue(FileManager.default.fileExists(atPath: Self.fileURL.path))

        let reloaded = BackgroundSettings()
        XCTAssertEqual(reloaded.selectedPresetID, preset.id)

        try store.setPhoto(try XCTUnwrap(Self.smallJPEG()))
        XCTAssertNil(store.selectedPresetID)
        XCTAssertNil(BackgroundSettings().selectedPresetID)
    }

    /// Regression: the picked photo must survive applying a preset, so
    /// the "my photo" tile in the wallpaper picker can always show the
    /// last-picked thumbnail even while a preset is the active
    /// wallpaper.
    func testPhotoSurvivesPreset() throws {
        try? FileManager.default.removeItem(at: Self.fileURL)
        try? FileManager.default.removeItem(at: Self.photoFileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")

        let store = BackgroundSettings()
        try store.setEnabled(true)
        try store.setPhoto(try XCTUnwrap(Self.smallJPEG()))
        XCTAssertNotNil(store.image)
        let preset = try XCTUnwrap(BackgroundPresetCatalog.all.first)
        try store.applyPreset(preset)

        XCTAssertEqual(store.selectedPresetID, preset.id)
        XCTAssertTrue(store.isActive)
        XCTAssertNotNil(store.image, "picked photo must survive preset selection")
        XCTAssertTrue(FileManager.default.fileExists(atPath: Self.photoFileURL.path))
    }

    /// clearPhoto while a preset is active must leave the preset on
    /// screen — only the picked photo (and the photo file) goes away.
    func testClearPhotoLeavesPresetActive() throws {
        try? FileManager.default.removeItem(at: Self.fileURL)
        try? FileManager.default.removeItem(at: Self.photoFileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")

        let store = BackgroundSettings()
        try store.setEnabled(true)
        try store.setPhoto(try XCTUnwrap(Self.smallJPEG()))
        let preset = try XCTUnwrap(BackgroundPresetCatalog.all.first)
        try store.applyPreset(preset)

        store.clearPhoto()
        XCTAssertNil(store.image)
        XCTAssertEqual(store.selectedPresetID, preset.id, "preset must remain active after clearPhoto")
        XCTAssertTrue(store.isActive)
        XCTAssertFalse(FileManager.default.fileExists(atPath: Self.photoFileURL.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: Self.fileURL.path))
    }

    /// The tile's two-phase tap: after a preset takes the slot,
    /// selectPhoto puts the picked photo back on screen without
    /// touching the photo file (the re-pick phase); with no photo,
    /// it is a no-op rather than an error.
    func testSelectPhotoRestoresPhoto() throws {
        try? FileManager.default.removeItem(at: Self.fileURL)
        try? FileManager.default.removeItem(at: Self.photoFileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")

        let store = BackgroundSettings()
        try store.selectPhoto()
        XCTAssertFalse(store.isActive, "selectPhoto without a photo must not activate anything")

        try store.setEnabled(true)
        try store.setPhoto(try XCTUnwrap(Self.smallJPEG()))
        let preset = try XCTUnwrap(BackgroundPresetCatalog.all.first)
        try store.applyPreset(preset)
        XCTAssertEqual(store.selectedPresetID, preset.id)

        try store.selectPhoto()
        XCTAssertNil(store.selectedPresetID, "re-selecting the photo clears the preset")
        XCTAssertTrue(store.isActive)
        XCTAssertNotNil(store.activeImage)
        XCTAssertNotNil(store.image, "the photo slot survives re-selection")
        XCTAssertTrue(FileManager.default.fileExists(atPath: Self.photoFileURL.path))

        let reloaded = BackgroundSettings()
        XCTAssertNil(reloaded.selectedPresetID)
        XCTAssertNotNil(reloaded.activeImage)
        XCTAssertNotNil(reloaded.image)
    }

    /// The enable switch: defaults on, persists across instances, and
    /// hides the background without destroying the stored photo — the
    /// next enable brings it straight back. Enabling with no active
    /// wallpaper (fresh, or after removal) default-applies the first
    /// built-in preset instead of showing a blank "on" state.
    func testEnabledToggle() throws {
        try? FileManager.default.removeItem(at: Self.fileURL)
        try? FileManager.default.removeItem(at: Self.photoFileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.enabled")

        let store = BackgroundSettings()
        XCTAssertFalse(store.enabled, "the switch defaults to off")
        XCTAssertFalse(store.isActive, "nothing is active without a wallpaper")

        try store.setEnabled(false)
        XCTAssertFalse(store.isActive)
        try store.setEnabled(true)
        XCTAssertEqual(
            store.selectedPresetID,
            BackgroundPresetCatalog.all.first?.id,
            "enabling with no wallpaper applies the first preset"
        )
        XCTAssertTrue(store.isActive)
        XCTAssertNotNil(store.activeImage)

        // With a picked photo stored, disabling hides it and enabling
        // brings the photo back — no preset jumps in.
        try store.setPhoto(try XCTUnwrap(Self.smallJPEG()))
        XCTAssertNil(store.selectedPresetID)
        try store.setEnabled(false)
        XCTAssertFalse(store.isActive)
        XCTAssertNotNil(store.image, "the photo survives the toggle")
        XCTAssertTrue(FileManager.default.fileExists(atPath: Self.photoFileURL.path))
        XCTAssertFalse(BackgroundSettings().isActive, "the off state persists")

        try store.setEnabled(true)
        XCTAssertTrue(store.isActive)
        XCTAssertNil(store.selectedPresetID, "the photo, not a preset, is restored")
        XCTAssertTrue(BackgroundSettings().enabled)
    }

    /// Presets render at the requested size, stay fully opaque, and carry
    /// unique ids.
    func testPresetRender() {
        let ids = BackgroundPresetCatalog.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count, "duplicate preset ids")

        for preset in BackgroundPresetCatalog.all {
            let image = BackgroundPresetCatalog.render(preset, size: CGSize(width: 100, height: 200), scale: 1)
            XCTAssertEqual(image.size.width, 100, accuracy: 0.5)
            XCTAssertEqual(image.size.height, 200, accuracy: 0.5)
            XCTAssertNotNil(BackgroundPresetCatalog.thumbnail(for: preset))
        }
    }

    /// A tiny JPEG rendered via UIGraphicsImageRenderer at the given size.
    private static func smallJPEG(width: CGFloat = 8, height: CGFloat = 8) -> Data? {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        let image = renderer.image { context in
            UIColor.systemRed.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        return image.jpegData(compressionQuality: 0.9)
    }
}
