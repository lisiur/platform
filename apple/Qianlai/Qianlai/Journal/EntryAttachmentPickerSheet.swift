//
//  EntryAttachmentPickerSheet.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/25.
//

import ImageIO
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// The quick entry's photo-receipt picker: the picked receipts as a grid —
/// existing ones fetched through the signed-url cache, fresh picks straight
/// from their compressed upload bytes — each removable, plus the trailing
/// photos-library cell. Compression to the final upload bytes happens at
/// pick time, so the draft carries exactly what will upload.
struct EntryAttachmentPickerSheet: View {
    @Binding var attachments: [QuickEntryAttachment]
    @Environment(\.dismiss) private var dismiss

    /// The photos-library selection, consumed into the draft by
    /// `consumePickedItems` (which also compresses to the upload bytes).
    /// PhotosPicker replaces the whole selection on every pick, so the
    /// task drains it and clears it — the draft list is the one source.
    @State private var pickerItems: [PhotosPickerItem] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 96), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(attachments) { attachment in
                        attachmentCell(attachment)
                    }
                    photosPickerCell
                }
                .padding(16)
            }
            .navigationTitle(Text(L10n.string("quick.attachments", defaultValue: "Attachments")))
            .inlineNavigationBarTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.string("common.done", defaultValue: "Done")) { dismiss() }
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
        .onChange(of: pickerItems) {
            Task { await consumePickedItems() }
        }
    }

    private static let maxAttachmentCount = 9

    private var remainingSlots: Int {
        max(0, Self.maxAttachmentCount - attachments.count)
    }

    private func attachmentCell(_ attachment: QuickEntryAttachment) -> some View {
        Group {
            switch attachment.source {
            case .existing(let ref):
                CachedAttachmentImage(attachmentId: ref.id)
            case .local(let data):
                if let image = UIImage(data: data) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    // Undecodable bytes — the placeholder keeps the cell
                    // sized; the upload would surface the real problem.
                    Color.primary.opacity(0.06)
                }
            }
        }
        .frame(width: 96, height: 96)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .topTrailing) {
            Button {
                attachments.removeAll { $0.id == attachment.id }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.white, .secondary.opacity(0.9))
            }
            .buttonStyle(.plain)
            .offset(x: 6, y: -6)
        }
    }

    private var photosPickerCell: some View {
        PhotosPicker(
            selection: $pickerItems,
            maxSelectionCount: remainingSlots,
            matching: .images
        ) {
            VStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.title3.weight(.medium))
                Text(L10n.string("quick.attachments.add", defaultValue: "Add Photos"))
                    .font(.caption2)
            }
            .foregroundStyle(.secondary)
            .frame(width: 96, height: 96)
            .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        }
        .disabled(remainingSlots == 0)
    }

    /// Drains the picker's selection into the draft: each photo compresses
    /// to its final upload bytes (see `receiptJPEG`) and joins the list,
    /// capped at the remaining slots. The selection resets so picking the
    /// same photo again still fires a change.
    private func consumePickedItems() async {
        let items = pickerItems
        guard !items.isEmpty else { return }
        pickerItems = []
        var picked: [QuickEntryAttachment] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let jpeg = Self.receiptJPEG(data) {
                picked.append(.local(data: jpeg))
            }
        }
        let room = remainingSlots
        if room > 0 {
            attachments.append(contentsOf: picked.prefix(room))
        }
    }

    /// Compresses a picked photo to its final upload bytes: downsample to
    /// at most 1600px on the longest side and re-encode as JPEG q0.8 —
    /// clear enough to read a receipt, small enough to sit far under the
    /// 5MB upload cap. ImageIO keeps this identical on iOS and macOS (the
    /// same pipeline `ProfileStore.avatarJPEG` uses, sized for receipts).
    nonisolated static func receiptJPEG(_ data: Data, maxDimension: CGFloat = 1600) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let width = properties?[kCGImagePropertyPixelWidth] as? CGFloat ?? 0
        let height = properties?[kCGImagePropertyPixelHeight] as? CGFloat ?? 0
        guard max(width, height) > maxDimension else {
            return Self.reencode(data, source: source)
        }
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
            [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary
        )
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }

    /// Already at or under the size cap — still re-encode as JPEG so every
    /// upload carries the same mime type regardless of the source format.
    private nonisolated static func reencode(_ data: Data, source: CGImageSource) -> Data? {
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        CGImageDestinationAddImageFromSource(
            destination, source, 0,
            [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary
        )
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
