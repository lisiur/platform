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

    private let images = NSCache<NSURL, PlatformImage>()
    /// Settled fetches are removed as soon as they finish; a lookup that
    /// arrives while one is still running awaits it instead of stacking a
    /// second request for the same URL.
    private var inflight: [URL: Task<PlatformImage?, Never>] = [:]

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
    func image(for url: URL) async -> PlatformImage? {
        if let cached = images.object(forKey: url as NSURL) {
            return cached
        }
        if let running = inflight[url] {
            return await running.value
        }
        let task = Task<PlatformImage?, Never> {
            defer { inflight.removeValue(forKey: url) }
            let data = (try? await session.data(from: url))?.0
            let image = data.flatMap(PlatformImage.init(data:))
            if let image {
                images.setObject(image, forKey: url as NSURL)
            }
            return image
        }
        inflight[url] = task
        return await task.value
    }

    /// The photo only if it is already in the cache — the synchronous read
    /// for surfaces that snapshot at presentation (menus): an async fetch
    /// would land after their frame is taken.
    func synchronousImage(for url: URL?) -> PlatformImage? {
        guard let url else { return nil }
        return images.object(forKey: url as NSURL)
    }
}

/// Menu items draw only `Image` values — SwiftUI-drawn views (the monogram
/// circle, `CachedAvatarImage`) never render inside a menu, and the menu
/// snapshot is taken synchronously at presentation, so an avatar not
/// already warm in the session cache can't be fetched in time. This
/// produces the same two states `CachedAvatarImage` renders, as one
/// PlatformImage sized for the menu's icon slot: the cached photo circle-clipped,
/// else the initial on the accent circle.
@MainActor
enum MenuAvatarImage {
    /// The menu icon slot's point size — the system scales images down to
    /// fit, so there is no headroom to buy.
    static let pointSize: CGFloat = 20

    static func image(url: URL?, initial: String) -> PlatformImage {
        if let url,
           let photo = AvatarImageCache.shared.synchronousImage(for: url) {
            return circleClipped(photo)
        }
        return monogram(initial)
    }

    /// Aspect-fill the square and clip to the circle — the SwiftUI render
    /// of `scaledToFill` + `clipShape(Circle())`. (The pre-macOS build drew
    /// this with UIGraphicsImageRenderer; ImageRenderer renders the same
    /// thing on both platforms and keeps one code path.)
    private static func circleClipped(_ photo: PlatformImage) -> PlatformImage {
        PlatformCanvas.renderImage(
            Image(platformImage: photo)
                .resizable()
                .scaledToFill()
                .frame(width: pointSize, height: pointSize)
                .clipShape(Circle()),
            scale: 2
        )
    }

    private static func monogram(_ initial: String) -> PlatformImage {
        PlatformCanvas.renderImage(
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.85))
                Text(initial)
                    .font(.system(size: pointSize * 0.55, weight: .semibold))
                    .foregroundColor(.white)
            }
            .frame(width: pointSize, height: pointSize),
            scale: 2
        )
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

    @State private var image: PlatformImage?

    var body: some View {
        Group {
            if let image {
                Image(platformImage: image)
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
