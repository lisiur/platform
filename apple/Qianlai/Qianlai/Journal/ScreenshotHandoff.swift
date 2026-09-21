//
//  ScreenshotHandoff.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import Foundation

/// App-side reader for the share extension's staged screenshot. The
/// extension (QianlaiShare target) owns the writing side and defines the
/// same staging constants inline — it doesn't compile this file, so keep
/// the two in sync.
nonisolated enum ScreenshotHandoff {
    /// Must match `ShareViewController.pendingFilename` in the extension.
    static let pendingFilename = "pending-screenshot.img"

    /// The staged image bytes, or nil when nothing was staged. Consuming
    /// deletes the file either way — the handoff is one-shot, and a stale
    /// image must never prefill a later, unrelated quick-entry sheet.
    static func consumePendingImageData() -> Data? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: WidgetAppGroup.suiteName
        ) else { return nil }
        let url = container.appendingPathComponent(pendingFilename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        try? FileManager.default.removeItem(at: url)
        return data.isEmpty ? nil : data
    }
}
