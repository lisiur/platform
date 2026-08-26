//
//  APIError.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation

enum APIError: LocalizedError {
    case server(status: Int, message: String)
    case transport(URLError)
    case invalidResponse
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .server(_, let message): message
        case .transport: L10n.string("api.error.network", defaultValue: "Network connection failed. Check your connection and try again.")
        case .invalidResponse: L10n.string("api.error.server", defaultValue: "Server returned an unexpected response. Please try again later.")
        case .decodingFailed: L10n.string("api.error.decoding", defaultValue: "Couldn't parse the server response.")
        }
    }
}
