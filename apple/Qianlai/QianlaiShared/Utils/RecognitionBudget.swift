//
//  RecognitionBudget.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/23.
//

import Foundation

/// The vision-input budget of whichever model the recognition agent
/// resolves to — served by `GET bookkeeping/recognition/config` so that
/// switching models stays a data operation and the tiler follows without an
/// app update. A nil field means "no model-specific constraint" on that
/// axis; consumers keep the shipped behavior for it.
///
/// Two budget shapes exist in the wild:
/// - Edge budget (DeepSeek): an image at or under a ~square edge passes the
///   model's auto-resize untouched, anything bigger is scaled down to it.
///   Slicing keeps every tile inside the edge at native sharpness.
/// - Pixel budget (Qwen VL): a total-pixel cap per image (32×32 px = one
///   vision token); the model scales an oversized image down to the cap.
struct RecognitionBudget: Codable, Equatable {
    /// No-resize edge per image, px (DeepSeek shape). Wins when both shapes
    /// are set — the edge constraint implies the per-dimension one.
    var maxImageEdge: Int?
    /// Total-pixel cap per image, px (Qwen shape).
    var maxPixelsPerImage: Int?
    /// Tiles per recognition — the model's per-request image cap, clamped
    /// to the platform's structural 6-file cap (`file0…file5`): tiles past
    /// it would be silently dropped by the server's form, corrupting the
    /// document the model reads.
    var maxTileCount: Int
    /// Media types the model decodes, as MIME strings; empty = no model
    /// constraint (the platform default set admits both client encoders).
    var mediaTypes: [String]

    /// The shipped no-resize edge — the geometry every budget without its
    /// own shape (nil edge, nil pixels) falls back to.
    static let defaultEdgeBudget = 1300

    /// Byte-for-byte the pre-metadata hardcodes (1300 edge ladder, 6 tiles,
    /// JPEG/PNG encoders) — the shipped behavior, and the fallback for a
    /// missing mirror or undecodable data.
    static let shipped = RecognitionBudget(
        maxImageEdge: defaultEdgeBudget,
        maxPixelsPerImage: nil,
        maxTileCount: 6,
        mediaTypes: ["image/jpeg", "image/png"]
    )
}

/// GET bookkeeping/recognition/config — the resolved model's budget. Fields
/// arrive null when the model row carries no constraint; decoding maps them
/// onto `RecognitionBudget`'s fallback rules in one place.
struct RecognitionConfigResponse: Decodable {
    var maxImageEdge: Int?
    var maxPixelsPerImage: Int?
    var maxImagesPerRequest: Int?
    var imageMediaTypes: [String]?
}

extension RecognitionBudget {
    /// Maps a config payload onto a budget. Nil only when NOTHING is set —
    /// the row carries no constraint at all, so callers keep `.shipped`.
    /// A payload with narrowed media types but no geometry is still a real
    /// budget: the encode must honor the narrowing while `plan` keeps the
    /// shipped edge geometry (a geometry-less budget dropped here would
    /// have the client encode types the server's guard rejects — a
    /// guaranteed 415 loop).
    init?(response: RecognitionConfigResponse) {
        if response.maxImageEdge == nil,
           response.maxPixelsPerImage == nil,
           response.maxImagesPerRequest == nil,
           (response.imageMediaTypes ?? []).isEmpty {
            return nil
        }
        self.init(
            maxImageEdge: response.maxImageEdge,
            maxPixelsPerImage: response.maxPixelsPerImage,
            maxTileCount: min(
                max(response.maxImagesPerRequest ?? RecognitionBudget.shipped.maxTileCount, 1),
                RecognitionBudget.shipped.maxTileCount
            ),
            mediaTypes: response.imageMediaTypes ?? []
        )
    }
}
