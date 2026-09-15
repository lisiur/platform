//
//  AvatarImageCache.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/15.
//

import SwiftUI

/// Session-scoped in-memory cache for avatar photos. List rows are torn
/// down and rebuilt on every scroll pass and list reload, and the server
/// serves avatar attachments with `Cache-Control: no-cache`, so a bare
/// `AsyncImage` re-issues a revalidating request for the same member on
/// every row appearance — a long journal of multi-member entries fans out
/// to hundreds of requests and trips the API's global rate limit. This
/// cache collapses that fan-out to one request per distinct avatar URL per
/// session (best-effort: NSCache may evict under memory pressure, and the
/// next appearance then simply re-fetches), with concurrent first loads
/// coalesced into the single fetch.
///
/// Caching for the whole session is safe precisely because an avatar's URL
/// is minted fresh on every replacement (the old attachment is deleted and
/// the replacement gets a new id), so the bytes behind a URL never change;
/// the accepted cost is that another member's mid-session avatar swap shows
/// up here on the next app launch, not on the next row rebuild.
@MainActor
final class AvatarImageCache {
    static let shared = AvatarImageCache()

    private let images = NSCache<NSURL, UIImage>()
    /// Settled fetches are removed as soon as they finish; a lookup that
    /// arrives while one is still running awaits it instead of stacking a
    /// second request for the same URL.
    private var inflight: [URL: Task<UIImage?, Never>] = [:]

    /// Avatar attachments are public — the server serves them with no auth,
    /// so a plain session works where the API client would attach one.
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
        images.countLimit = 200
    }

    /// The cached photo for `url`, fetching it once on first ask. Failures
    /// are not cached — the next caller retries, and views fall back to
    /// their initial in the meantime.
    func image(for url: URL) async -> UIImage? {
        if let cached = images.object(forKey: url as NSURL) {
            return cached
        }
        if let running = inflight[url] {
            return await running.value
        }
        let task = Task<UIImage?, Never> {
            defer { inflight.removeValue(forKey: url) }
            let data = (try? await session.data(from: url))?.0
            let image = data.flatMap(UIImage.init(data:))
            if let image {
                images.setObject(image, forKey: url as NSURL)
            }
            return image
        }
        inflight[url] = task
        return await task.value
    }
}

/// Avatar photo with the initial-letter fallback, fed by `AvatarImageCache`
/// in place of the bare `AsyncImage` that re-requested on every appearance.
/// Renders exactly the two states that block did — the photo once loaded,
/// the initial while loading, on failure, and when there is no URL at all —
/// and leaves the styling (font, frame, circle clip) to the caller, the way
/// the `AsyncImage` result was styled.
struct CachedAvatarImage: View {
    let url: URL?
    let initial: String

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(initial)
            }
        }
        .task(id: url) {
            // A changed (or vanished) URL must not keep showing the
            // previous member's photo past this frame.
            image = nil
            guard let url else { return }
            image = await AvatarImageCache.shared.image(for: url)
        }
    }
}
