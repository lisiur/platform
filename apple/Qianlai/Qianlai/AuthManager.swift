//
//  AuthManager.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import LocalAuthentication
import Observation

struct User: Equatable, Codable {
    /// Set on self-registered users (email/WeChat/Apple) until the
    /// first-login guide is completed or skipped.
    static let onboardingPendingFlag = "onboarding-pending"

    let id: String
    var name: String?
    var email: String?
    var emailVerified: Bool?
    var avatar: String?
    var flags: [String]?

    var greetingName: String {
        name ?? email ?? "there"
    }

    var isOnboardingPending: Bool {
        flags?.contains(Self.onboardingPendingFlag) ?? false
    }
}

struct AuthSession: Codable {
    let id: String
    let token: String
    let userId: String
    var expiresAt: String?
}

struct SignInResponse: Codable {
    let user: User
    let session: AuthSession
}

struct SessionInfoResponse: Codable {
    let user: User?
    let session: AuthSession?
    let permissions: [String]?
}

struct UserMutationResponse: Codable {
    let user: User
}

@MainActor
@Observable
final class AuthManager {
    private static let quickLoginEmailKey = "auth.quickLogin.email"
    private static let quickLoginHasPasswordKey = "auth.quickLogin.hasPassword"
    private static let keychainService = APIConfig.keychainService
    private static let passwordAccount = "quick-login-password"

    let client: APIClient
    private let keychain: KeychainStore
    private let decoder = JSONDecoder()

    private(set) var currentUser: User?
    private(set) var permissions: [String] = []

    /// True while the signed-in user still carries the onboarding-pending
    /// flag — the app shows the first-login guide instead of the main tabs
    /// until it is completed or skipped.
    private(set) var isOnboardingPending = false

    /// True while a stored session token is being validated on launch. The
    /// login screen waits for this to become false so a valid restore lands
    /// on the home view instead of flashing the login form. With a cached
    /// session (see `restoreSession`) the home view wins the gate before
    /// this flag matters — the flag then only steers the no-cache path.
    private(set) var isRestoringSession: Bool

    /// The snapshot-cache binding for the optimistic-restore seed — one
    /// key per install (the keychain holds a single token; sign-out sweeps
    /// the whole cache).
    private static let cache = SnapshotCache.namespace("auth", schema: 1)
    private static let sessionKey = "session"

    /// The pieces of a validated session the app's first frame gates on.
    /// The session token itself deliberately stays out — the keychain is
    /// its only home, and rotation is the network validation's business.
    private struct CachedSession: Codable {
        var user: User
        var permissions: [String]
    }

    var isLoggedIn: Bool {
        currentUser != nil
    }

    var apiBaseURL: URL {
        client.config.baseURL
    }

    init(client: APIClient = .shared) {
        self.client = client
        keychain = KeychainStore(service: Self.keychainService)
        isRestoringSession = client.sessionToken != nil
        client.onSessionExpired = { [weak self] in
            self?.clearSession()
        }
    }

    var isBiometricsAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    }

    var biometryType: LABiometryType {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        return context.biometryType
    }

    /// Whether quick login is offered. Deliberately reads a UserDefaults flag
    /// instead of `keychain.contains` — the password item is `.userPresence`
    /// protected, and querying it from a view render raises a Face ID prompt
    /// on device (twice per Apple sign-in, once per logout).
    var quickLoginEmail: String? {
        guard UserDefaults.standard.bool(forKey: Self.quickLoginHasPasswordKey) else { return nil }
        return UserDefaults.standard.string(forKey: Self.quickLoginEmailKey)
    }

    // MARK: - API

    func login(email: String, password: String) async throws {
        let response: SignInResponse = try await client.request(
            "POST", "auth/sign-in/email",
            body: ["email": email, "password": password]
        )
        acceptSession(response)
        storeQuickLogin(email: email, password: password)
    }

    func signUp(name: String, email: String, password: String) async throws {
        let response: SignInResponse = try await client.request(
            "POST", "auth/sign-up/email",
            body: ["name": name, "email": email, "password": password]
        )
        acceptSession(response)
        storeQuickLogin(email: email, password: password)
    }

    private struct AppleSignInBody: Encodable {
        struct User: Encodable {
            let firstName: String?
            let lastName: String?
        }

        let identityToken: String
        let nonce: String
        let user: User?
    }

    /// Sign in (or register) with a Sign in with Apple identity token obtained
    /// via `ASAuthorizationAppleIDRequest`. The server verifies the token's
    /// signature against Apple's JWKS, its audience (this app's bundle ID must
    /// be listed in the platform's `apple.appAudiences` config), and the nonce.
    func loginWithApple(
        identityToken: String,
        nonce: String,
        firstName: String?,
        lastName: String?
    ) async throws {
        let hasName = firstName != nil || lastName != nil
        let response: SignInResponse = try await client.request(
            "POST", "auth/sign-in/apple",
            body: AppleSignInBody(
                identityToken: identityToken,
                nonce: nonce,
                user: hasName ? .init(firstName: firstName, lastName: lastName) : nil
            )
        )
        acceptSession(response)
    }

    func restoreSession() async {
        defer { isRestoringSession = false }
        guard client.sessionToken != nil, currentUser == nil else { return }

        // Optimistic restore: a cached validated session publishes the user
        // immediately, so `isLoggedIn` wins the app root's gate and the
        // home view paints this frame — with every store's snapshot cache
        // hydrating behind it — instead of spinning on the round-trip below.
        // The get-session keeps running as the silent validator: it corrects
        // drifted profiles/permissions (and rotated tokens), and a rejected
        // token lands in `clearSession`, which drops the optimistic user and
        // the root gate falls through to the login screen. No cache (first
        // launch after install, or after a fresh login that never restored)
        // falls through to the classic spinner-while-validating path.
        if let cached: CachedSession = Self.cache.read(key: Self.sessionKey, as: CachedSession.self) {
            currentUser = cached.user
            permissions = cached.permissions
            isOnboardingPending = cached.user.isOnboardingPending
        }

        let data: Data
        do {
            (data, _) = try await client.send("GET", "auth/get-session")
        } catch let error as APIError {
            // The server rejected the token — drop it so the login screen
            // starts clean. Any other failure (transport, 5xx) keeps the
            // token; a later launch or manual login retries with it.
            if case let APIError.server(status, _) = error, status == 401 || status == 403 {
                clearSession()
            }
            return
        } catch {
            return
        }

        guard let info = try? decoder.decode(SessionInfoResponse.self, from: data) else {
            if String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) == "null" {
                clearSession()
            }
            return
        }

        guard let user = info.user, let session = info.session else {
            clearSession()
            return
        }

        if client.sessionToken != session.token {
            client.sessionToken = session.token
        } else {
            // The validated token is rewritten (idempotently) so installs
            // that predate widget sharing move it into the shared keychain
            // access group the widget reads.
            client.sessionToken = client.sessionToken
        }
        currentUser = user
        permissions = info.permissions ?? []
        isOnboardingPending = user.isOnboardingPending
        // Server-confirmed session — seed the next cold start's optimistic
        // restore.
        Self.cache.write(
            key: Self.sessionKey,
            payload: CachedSession(user: user, permissions: permissions)
        )
    }

    func loginWithBiometrics() async throws {
        guard let email = quickLoginEmail else {
            throw QuickLoginError.noStoredCredentials
        }

        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else {
            throw QuickLoginError.biometricsUnavailable
        }

        // .deviceOwnerAuthentication keeps Touch ID as the primary method but
        // lets the system's "Use Password..." fallback authenticate with the
        // device password instead of throwing .userFallback.
        try await context.evaluatePolicy(
            .deviceOwnerAuthentication,
            localizedReason: L10n.string("auth.biometricReason", defaultValue: "Unlock your Qianlai account.")
        )

        // The keychain item is user-presence protected; passing the context
        // that just succeeded reuses its evaluation instead of re-prompting.
        guard
            let data = keychain.read(account: Self.passwordAccount, authenticationContext: context),
            let password = String(data: data, encoding: .utf8)
        else {
            throw QuickLoginError.noStoredCredentials
        }

        try await login(email: email, password: password)
    }

    func logout() async {
        await signOutOnServer()
    }

    /// Applies a locally-updated user (profile name/avatar edits) without a
    /// session round-trip.
    func applyUser(_ user: User) {
        currentUser = user
        // The edit already landed server-side — refresh the optimistic-
        // restore seed so the next cold start doesn't flash the old profile
        // for a beat before the validation corrects it.
        Self.cache.write(
            key: Self.sessionKey,
            payload: CachedSession(user: user, permissions: permissions)
        )
    }

    private func signOutOnServer() async {
        if client.sessionToken != nil {
            _ = try? await client.send("POST", "auth/sign-out")
        }
        clearSession()
    }

    private func clearSession() {
        client.sessionToken = nil
        currentUser = nil
        permissions = []
        isOnboardingPending = false
        // No session, nothing for the widget to show.
        WidgetDataStore.clearAll()
        WidgetSync.reloadTimelines()
        // The render-seed snapshots describe the signed-out account's
        // ledgers — the next sign-in must start cold, not on stale rows.
        SnapshotCache.clearAll()
    }

    private func acceptSession(_ response: SignInResponse) {
        client.sessionToken = response.session.token
        currentUser = response.user
        isOnboardingPending = response.user.isOnboardingPending
    }

    // MARK: - Onboarding

    /// Clears the onboarding-pending flag on the server and locally.
    func completeOnboarding() async throws {
        let response: UserMutationResponse = try await client.request(
            "POST", "auth/complete-onboarding"
        )
        // applyUser also refreshes the optimistic-restore seed — without
        // it, the first cold start after onboarding would flash the
        // onboarding guide until get-session corrected the flag.
        applyUser(response.user)
        isOnboardingPending = response.user.isOnboardingPending
    }

    // MARK: - Quick login storage

    private func storeQuickLogin(email: String, password: String) {
        let defaults = UserDefaults.standard
        defaults.set(email, forKey: Self.quickLoginEmailKey)
        // Only keep a password copy when biometrics can later unlock it;
        // otherwise it's a credential copy nothing can use.
        guard isBiometricsAvailable else {
            keychain.write(nil, account: Self.passwordAccount)
            defaults.set(false, forKey: Self.quickLoginHasPasswordKey)
            return
        }
        keychain.write(
            Data(password.utf8),
            account: Self.passwordAccount,
            requiresUserPresence: true
        )
        defaults.set(true, forKey: Self.quickLoginHasPasswordKey)
    }
}

enum QuickLoginError: LocalizedError {
    case noStoredCredentials
    case biometricsUnavailable

    var errorDescription: String? {
        switch self {
        case .noStoredCredentials:
            L10n.string("auth.quickLogin.noStoredCredentials", defaultValue: "No saved account. Please sign in with your password first.")
        case .biometricsUnavailable:
            L10n.string("auth.quickLogin.biometricsUnavailable", defaultValue: "Biometrics aren't set up on this device.")
        }
    }
}

enum LoginValidator {
    static func isValidEmail(_ value: String) -> Bool {
        value.range(of: #"\S+@\S+\.\S+"#, options: .regularExpression) != nil
    }
}
