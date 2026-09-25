//
//  AttachmentImageCache.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/25.
//

import SwiftUI

/// Session-scoped in-memory cache for private entry attachments (photo
/// receipts). Their bytes live behind signed urls that expire within the
/// hour and cost a sign call each, so a fetch-per-view would re-sign and
/// re-download on every appearance; this cache collapses that to one
/// sign+fetch per attachment per session, with concurrent first loads
/// coalesced into the single fetch (best-effort: NSCache may evict under
/// memory pressure, and the next appearance then simply re-signs).
///
/// The cache key is the attachment id, never the signed url: urls are
/// minted fresh each view, but the bytes behind an id never change —
/// uploads are content-addressed on the server, and an entry's receipt
/// set is replaced at save time rather than edited in place.
@MainActor
final class AttachmentImageCache {
    static let shared = AttachmentImageCache()

    private let images = NSCache<NSString, UIImage>()
    /// Settled fetches are removed as soon as they finish; a lookup that
    /// arrives while one is still running awaits it instead of stacking a
    /// second sign+fetch for the same attachment.
    private var inflight: [String: Task<UIImage?, Never>] = [:]

    /// Private attachments are served off the signed url with no auth —
    /// a plain session works where the API client would attach one.
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
        images.countLimit = 100
    }

    /// The cached image for an attachment id, signing + fetching it once
    /// on first ask. Failures are not cached — the next caller retries,
    /// and views show their placeholder in the meantime.
    func image(for attachmentId: String) async -> UIImage? {
        if let cached = images.object(forKey: attachmentId as NSString) {
            return cached
        }
        if let running = inflight[attachmentId] {
            return await running.value
        }
        let task = Task<UIImage?, Never> {
            defer { inflight.removeValue(forKey: attachmentId) }
            guard let url = await Self.signedURL(attachmentId) else { return nil }
            let data = (try? await session.data(from: url))?.0
            let image = data.flatMap(UIImage.init(data:))
            if let image {
                images.setObject(image, forKey: attachmentId as NSString)
            }
            return image
        }
        inflight[attachmentId] = task
        return await task.value
    }

    /// Signs the attachment and resolves the signed path (a relative
    /// "/api/…" url) against the API origin — the same resolution the
    /// avatar urls get.
    private static func signedURL(_ attachmentId: String) async -> URL? {
        guard
            let signed: SignedAttachmentURL = try? await APIClient.shared.request(
                "POST",
                "attachment/\(attachmentId)/sign"
            )
        else { return nil }
        return URL(string: signed.url, relativeTo: APIConfig.app.baseURL)?.absoluteURL
    }
}

/// Private-attachment image with a loading placeholder, fed by
/// `AttachmentImageCache` — the receipt counterpart of `CachedAvatarImage`.
/// Styling (frame, clip) stays with the caller; `contentMode` picks
/// aspect-fill (thumbnails, the default) or aspect-fit (the viewer).
struct CachedAttachmentImage: View {
    let attachmentId: String
    var contentMode: ContentMode = .fill

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                ZStack {
                    Color.primary.opacity(0.06)
                    Image(systemName: "photo")
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .task(id: attachmentId) {
            // A changed id must not keep showing the previous receipt
            // past this frame.
            image = nil
            image = await AttachmentImageCache.shared.image(for: attachmentId)
        }
    }
}
