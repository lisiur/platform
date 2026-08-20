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
        case .transport: "网络连接失败，请检查网络后重试。"
        case .invalidResponse: "服务器响应异常，请稍后重试。"
        case .decodingFailed: "无法解析服务器返回的数据。"
        }
    }
}
