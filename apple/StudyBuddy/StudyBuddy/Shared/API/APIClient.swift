//
//  APIClient.swift
//  StudyBuddy
//
//  Created by Lisiur Day on 2026/8/19.
//

import Foundation

/// Reusable HTTP client for the platform service. Owns request building
/// (JSON headers, `X-App-Code`, session cookie) and error mapping, so feature
/// modules only deal with typed requests/responses.
///
///     let client = APIClient(config: .resolve(appCode: "studybuddy",
///                                             defaultBaseURL: ...))
///     let exams: [Exam] = try await client.request("GET", "exams")
final class APIClient {
    /// The app-wide client. One instance = one keychain-backed session token
    /// and one URLSession, shared by every feature module.
    nonisolated static let shared = APIClient(config: .app, keychainService: APIConfig.keychainService)

    let config: APIConfig
    let session: URLSession

    private let keychain: KeychainStore
    private let tokenAccount: String

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

    /// The current session token, persisted in the Keychain.
    var sessionToken: String? {
        get { keychain.readString(account: tokenAccount) }
        set { keychain.writeString(newValue, account: tokenAccount) }
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
        } catch {
            throw APIError.notConnected
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.invalidResponse
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
            throw APIError.server(
                status: http.statusCode,
                message: Self.errorMessage(from: data, status: http.statusCode)
            )
        }
        return (data, response)
    }

    private static func errorMessage(from data: Data, status: Int) -> String {
        struct ServerError: Decodable {
            let message: String?
        }
        if let decoded = try? JSONDecoder().decode(ServerError.self, from: data), let message = decoded.message {
            return message
        }
        switch status {
        case 401: return "Invalid email or password."
        default: return "Request failed (\(status))."
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
