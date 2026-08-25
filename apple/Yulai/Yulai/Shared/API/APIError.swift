//
//  APIError.swift
//  Yulai
//
//  Created by Lisiur Day on 2026/8/19.
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
        case .transport: "Network connection failed. Check your connection and try again."
        case .invalidResponse: "Server returned an unexpected response. Please try again later."
        case .decodingFailed: "Couldn't parse the server response."
        }
    }
}
