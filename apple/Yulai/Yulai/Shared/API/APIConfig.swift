//
//  APIConfig.swift
//  Yulai
//
//  Created by Lisiur Day on 2026/8/19.
//

import Foundation

/// Per-app API configuration: which backend to talk to and which app code
/// identifies this client to the platform gateway.
struct APIConfig: Equatable, Sendable {
    let appCode: String
    let baseURL: URL

    /// UserDefaults key whose value overrides `defaultBaseURL`. It doubles as
    /// a launch-argument override, since Foundation parses `-key value` pairs
    /// from the command line into UserDefaults — e.g. launching with
    /// `-api.baseURL http://192.168.1.10:3000` to point a real device at a
    /// dev machine on the LAN.
    static let baseURLOverrideKey = "api.baseURL"

    static func resolve(
        appCode: String,
        defaultBaseURL: URL,
        userDefaults: UserDefaults = .standard
    ) -> APIConfig {
        if
            let raw = userDefaults.string(forKey: baseURLOverrideKey),
            let url = URL(string: raw),
            url.scheme != nil
        {
            return APIConfig(appCode: appCode, baseURL: url)
        }
        return APIConfig(appCode: appCode, baseURL: defaultBaseURL)
    }

    func url(forPath path: String) -> URL {
        guard let separator = path.firstIndex(of: "?") else {
            return baseURL.appendingPathComponent("api/\(path)")
        }
        let filePath = String(path[..<separator])
        let query = String(path[path.index(after: separator)...])
        guard
            var components = URLComponents(
                url: baseURL.appendingPathComponent("api/\(filePath)"),
                resolvingAgainstBaseURL: false
            )
        else {
            return baseURL.appendingPathComponent("api/\(path)")
        }
        components.percentEncodedQuery = query
        return components.url ?? baseURL.appendingPathComponent("api/\(path)")
    }
}

extension APIConfig {
    /// App identity + defaults for Yulai. Modules should use
    /// `APIClient.shared` instead of re-declaring any of these.
    nonisolated static let appCode = "studybuddy"
    nonisolated static let defaultBaseURL = URL(string: "https://platform.hapaul.top")!
    nonisolated static let keychainService = "top.hapaul.Yulai.auth"

    /// The resolved app-wide configuration (honors the `api.baseURL` override).
    nonisolated static let app = APIConfig.resolve(appCode: appCode, defaultBaseURL: defaultBaseURL)
}
