//
//  APIClient.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import os

/// Reusable HTTP client for the platform service. Owns request building
/// (JSON headers, `X-App-Code`, session cookie) and error mapping, so feature
/// modules only deal with typed requests/responses.
final class APIClient {
    /// The app-wide client. One instance = one keychain-backed session token
    /// and one URLSession, shared by every feature module.
    nonisolated static let shared = APIClient(config: .app, keychainService: APIConfig.keychainService)

    let config: APIConfig
    let session: URLSession

    /// Invoked whenever a non-auth endpoint answers 401 — i.e. the stored
    /// session expired. Wired by `AuthManager` to drop session state and
    /// bounce the user back to the login screen.
    var onSessionExpired: (@MainActor () -> Void)?

    private let keychain: KeychainStore
    private let tokenAccount: String

    private let tokenLock = NSLock()
    private var cachedToken: String?
    private var didLoadToken = false

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(
        config: APIConfig,
        keychainService: String,
        tokenAccount: String = "session-token",
        session: URLSession = .shared
    ) {
        self.config = config
        self.keychain = KeychainStore(service: keychainService)
        self.tokenAccount = tokenAccount
        self.session = session
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = Self.iso8601WithFractionalSeconds.date(from: raw)
                ?? Self.iso8601.date(from: raw)
            {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO8601 date: \(raw)"
            )
        }
        encoder.dateEncodingStrategy = .iso8601
    }

    private static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// The current session token, persisted in the Keychain and cached in
    /// memory so requests don't hit the Keychain on every send.
    var sessionToken: String? {
        get {
            tokenLock.lock()
            defer { tokenLock.unlock() }
            if !didLoadToken {
                cachedToken = keychain.readString(account: tokenAccount)
                didLoadToken = true
            }
            return cachedToken
        }
        set {
            tokenLock.lock()
            defer { tokenLock.unlock() }
            keychain.writeString(newValue, account: tokenAccount)
            cachedToken = newValue
            didLoadToken = true
        }
    }

    /// Sends a request and decodes a `Decodable` response.
    func request<T: Decodable>(
        _ method: String,
        _ path: String
    ) async throws -> T {
        try await request(method, path, body: EmptyBody?.none)
    }

    func request<T: Decodable, Body: Encodable>(
        _ method: String,
        _ path: String,
        body: Body?
    ) async throws -> T {
        let data: Data
        do {
            (data, _) = try await send(method, path, body: body)
        } catch let error as APIError {
            throw error
        } catch let error as URLError {
            throw APIError.transport(error)
        } catch {
            throw APIError.invalidResponse
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            Self.logger.error(
                "Decoding \(String(describing: T.self), privacy: .public) failed: \(String(describing: error), privacy: .public)"
            )
            throw APIError.decodingFailed
        }
    }

    /// Sends a request and returns the raw response.
    func send(
        _ method: String,
        _ path: String
    ) async throws -> (Data, URLResponse) {
        try await send(method, path, body: EmptyBody?.none)
    }

    func send<Body: Encodable>(
        _ method: String,
        _ path: String,
        body: Body?
    ) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: config.url(forPath: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.appCode, forHTTPHeaderField: "X-App-Code")
        if let sessionToken {
            request.setValue("session_token=\(sessionToken)", forHTTPHeaderField: "Cookie")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401, !path.hasPrefix("auth/"), let onSessionExpired {
                Self.logger.info("Session expired (\(path, privacy: .public))")
                onSessionExpired()
            }
            throw APIError.server(
                status: http.statusCode,
                message: Self.errorMessage(from: data, status: http.statusCode, path: path)
            )
        }
        return (data, response)
    }

    /// Uploads one file as `multipart/form-data` under the field name "file"
    /// and decodes the JSON response. Used by the avatar uploader.
    func uploadMultipart<T: Decodable>(
        _ path: String,
        fileData: Data,
        fileName: String,
        mimeType: String
    ) async throws -> T {
        let boundary = "Qianlai.boundary.\(UUID().uuidString)"
        var request = URLRequest(url: config.url(forPath: path))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(config.appCode, forHTTPHeaderField: "X-App-Code")
        if let sessionToken {
            request.setValue("session_token=\(sessionToken)", forHTTPHeaderField: "Cookie")
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401, let onSessionExpired {
                onSessionExpired()
            }
            throw APIError.server(
                status: http.statusCode,
                message: Self.errorMessage(from: data, status: http.statusCode, path: path)
            )
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            Self.logger.error(
                "Decoding \(String(describing: T.self), privacy: .public) failed: \(String(describing: error), privacy: .public)"
            )
            throw APIError.decodingFailed
        }
    }

    private static let logger = Logger(subsystem: "top.hapaul.qianlai", category: "APIClient")

    private static func errorMessage(from data: Data, status: Int, path: String) -> String {
        struct ServerError: Decodable {
            let message: String?
        }
        if let decoded = try? JSONDecoder().decode(ServerError.self, from: data), let message = decoded.message {
            return message
        }
        switch status {
        case 401:
            return (path == "auth/sign-in" || path == "auth/sign-up")
                ? L10n.string("api.error.invalidCredentials", defaultValue: "Incorrect email or password.")
                : L10n.string("api.error.sessionExpired", defaultValue: "Your session has expired. Please sign in again.")
        case 403:
            return L10n.string("api.error.forbidden", defaultValue: "You don't have permission to perform this action.")
        default:
            return L10n.string("api.error.requestFailed", defaultValue: "Request failed (%lld).", status)
        }
    }
}

/// Placeholder body type for the no-body overloads.
private struct EmptyBody: Encodable {}

/// Type-erases an `Encodable` value so `httpBody` can be set from a generic
/// parameter (`some Encodable` can't be encoded directly).
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void

    init(_ wrapped: some Encodable) {
        encodeFunc = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}
