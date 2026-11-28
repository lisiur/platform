//
//  LocalIdentity.swift
//  Qianlai
//

import Foundation

/// The per-install identity every local-ledger row is stamped with (C8):
/// a UUID generated once per install, persisted in the App Group suite.
/// Local data belongs to THIS DEVICE + the user's iCloud, never to the
/// signed-in app account — login/logout/account switches never touch it.
/// Only the upgrade-to-cloud path remaps it (every row's creator/payer/
/// participant ids are rewritten to the signed-in user at transfer time).
///
/// The ref renders like a member row without a roster: the display name is
/// a fixed placeholder (the local member is never listed anywhere — the
/// members surface is cloud-only), and the email stays nil because there
/// is nothing to resolve against while signed out.
nonisolated enum LocalIdentity {
    /// App Group so a future widget/sharing surface could read it; the
    /// standard defaults would also do today, but the ledger file already
    /// lives in the App Group container and the identity should travel
    /// with it.
    private static let key = "local.userId"

    /// The stable id, creating it on first use.
    static var userId: String {
        if let stored = defaults()?.string(forKey: key) {
            return stored
        }
        let fresh = UUID().uuidString
        defaults()?.set(fresh, forKey: key)
        return fresh
    }

    /// Test seam: resets the stored id (suite injection keeps tests off the
    /// real App Group).
    static func reset(defaults: UserDefaults? = nil) {
        (defaults ?? Self.defaults())?.removeObject(forKey: key)
    }

    /// The user ref embedded in entry participants / creator / payer
    /// payloads built from local rows.
    static func userRef(id: String = userId) -> EntryUserRef {
        EntryUserRef(id: id, name: displayName, email: nil, avatar: nil, isVirtual: false)
    }

    /// Localized label for surfaces that must show the local identity
    /// (e.g. the upgrade preview's member list). Never shown as a member.
    static var displayName: String {
        L10n.string("local.identity.me", defaultValue: "我")
    }

    /// App Group suite, or nil when the entitlement is missing — then the
    /// id still works but lives in standard defaults (identity stability
    /// degrades gracefully instead of crashing).
    private static func defaults() -> UserDefaults? {
        WidgetAppGroup.defaults ?? .standard
    }
}
