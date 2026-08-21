//
//  AuthManager.swift
//  Yulai
//
//  Created by Lisiur Day on 2026/8/19.
//

import Foundation
import LocalAuthentication
import Observation

struct User: Equatable, Codable {
    let id: String
    var name: String?
    var email: String?
    var emailVerified: Bool?
    var avatar: String?

    var greetingName: String {
        name ?? email ?? "there"
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

@MainActor
@Observable
final class AuthManager {
    private static let quickLoginEmailKey = "auth.quickLogin.email"
    private static let keychainService = APIConfig.keychainService
    private static let passwordAccount = "quick-login-password"

    let client: APIClient
    private let keychain: KeychainStore
    private let decoder = JSONDecoder()

    private(set) var currentUser: User?
    private(set) var permissions: [String] = []

    /// True right after an explicit log out, so the login screen offers the
    /// biometric button but does not auto-prompt. Reset on next app launch.
    private(set) var suppressBiometricAutoPrompt = false

    /// True while a stored session token is being validated on launch. The
    /// login screen (and its auto biometric prompt) must wait until this is
    /// false, otherwise Touch ID pops even when a valid session restores.
    private(set) var isRestoringSession: Bool

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

    var quickLoginEmail: String? {
        guard keychain.contains(account: Self.passwordAccount) else { return nil }
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
        }
        currentUser = user
        permissions = info.permissions ?? []
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
            localizedReason: "解锁你的语来账号。"
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
        suppressBiometricAutoPrompt = true
        await signOutOnServer()
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
    }

    private func acceptSession(_ response: SignInResponse) {
        client.sessionToken = response.session.token
        currentUser = response.user
    }

    // MARK: - Quick login storage

    private func storeQuickLogin(email: String, password: String) {
        UserDefaults.standard.set(email, forKey: Self.quickLoginEmailKey)
        // Only keep a password copy when biometrics can later unlock it;
        // otherwise it's a credential copy nothing can use.
        guard isBiometricsAvailable else {
            keychain.write(nil, account: Self.passwordAccount)
            return
        }
        keychain.write(
            Data(password.utf8),
            account: Self.passwordAccount,
            requiresUserPresence: true
        )
    }
}

enum QuickLoginError: LocalizedError {
    case noStoredCredentials
    case biometricsUnavailable

    var errorDescription: String? {
        switch self {
        case .noStoredCredentials: "没有已保存的账号，请先用密码登录。"
        case .biometricsUnavailable: "此设备未设置生物识别。"
        }
    }
}

enum LoginValidator {
    static func isValidEmail(_ value: String) -> Bool {
        value.range(of: #"\S+@\S+\.\S+"#, options: .regularExpression) != nil
    }
}
