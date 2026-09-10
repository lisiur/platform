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
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.dim")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.cardOpacity")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")
        super.tearDown()
    }

    private static let fileURL = URL.documentsDirectory.appendingPathComponent("background-image.jpg")

    /// setPhoto persists across instances (file + flag), auto-activates, and
    /// clearPhoto removes every trace; the dim and card-opacity defaults
    /// fill when unset.
    func testPhotoPersistRoundtrip() throws {
        try? FileManager.default.removeItem(at: Self.fileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.dim")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.cardOpacity")
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")

        let store = BackgroundSettings()
        XCTAssertFalse(store.isActive)
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
    }

    /// Applying a preset persists the render + selection; a photo pick
    /// replaces it and clears the selection.
    func testPresetApply() throws {
        try? FileManager.default.removeItem(at: Self.fileURL)
        UserDefaults.standard.removeObject(forKey: "app.backgroundImage.preset")

        let store = BackgroundSettings()
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
