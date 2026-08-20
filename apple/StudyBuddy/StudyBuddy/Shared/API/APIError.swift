//
//  APIError.swift
//  StudyBuddy
//
//  Created by Lisiur Day on 2026/8/19.
//

import Foundation

enum APIError: LocalizedError {
    case server(status: Int, message: String)
    case invalidResponse
    case notConnected

    var errorDescription: String? {
        switch self {
        case .server(_, let message): message
        case .invalidResponse: "Unexpected response from the server."
        case .notConnected: "Could not reach the server. Check your connection."
        }
    }
}
