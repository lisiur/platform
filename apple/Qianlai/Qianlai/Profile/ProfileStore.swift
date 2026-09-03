//
//  ProfileStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import CoreTransferable
import Foundation
import ImageIO
import Observation
import UniformTypeIdentifiers

/// Loads photo-library items as JPEG bytes regardless of the source format
/// (HEIC, PNG, …) — the service only accepts bitmap MIME types.
struct AvatarImage: Transferable {
    let data: Data

    static let transferRepresentation: some TransferRepresentation =
        DataRepresentation(contentType: .jpeg) { image in
            image.data
        } importing: { data in
            Self(data: data)
        }
}

/// Profile mutations: display-name update, password change, avatar upload.
@MainActor
@Observable
final class ProfileStore {
    let client = APIClient.shared

    private(set) var isSaving = false
    private(set) var isUploading = false

    func updateName(_ name: String, auth: AuthManager) async throws {
        isSaving = true
        defer { isSaving = false }
        _ = try await client.send(
            "POST",
            "auth/update-user",
            body: UpdateUserBody(name: name)
        )
        if var user = auth.currentUser {
            user.name = name
            auth.applyUser(user)
        }
    }

    func changePassword(current: String, new: String) async throws {
        isSaving = true
        defer { isSaving = false }
        _ = try await client.send(
            "POST",
            "auth/change-password",
            body: ChangePasswordBody(currentPassword: current, newPassword: new)
        )
    }

    /// Uploads avatar image bytes; updates the current user on success.
    func uploadAvatar(
        data: Data,
        fileName: String,
        mimeType: String,
        auth: AuthManager
    ) async throws {
        isUploading = true
        defer { isUploading = false }
        let response: UploadAvatarResponse = try await client.uploadMultipart(
            "users/upload-avatar",
            fileData: data,
            fileName: fileName,
            mimeType: mimeType
        )
        if var user = auth.currentUser {
            user.avatar = response.url
            auth.applyUser(user)
        }
    }

    /// The avatar URL is a relative path (e.g. "/api/attachment/...") — make
    /// it absolute against the API origin for AsyncImage.
    nonisolated static func absoluteAvatarURL(_ path: String?, baseURL: URL) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if let url = URL(string: path), url.scheme != nil {
            return url
        }
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
    }

    /// Downsamples to at most 256px on the longest side and re-encodes as
    /// JPEG — mirrors the admin web app's 128×128 crop with retina headroom.
    /// ImageIO keeps this identical on iOS and macOS (no UIKit dependency).
    nonisolated static func avatarJPEG(_ data: Data, maxDimension: CGFloat = 256) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let width = properties?[kCGImagePropertyPixelWidth] as? CGFloat ?? 0
        let height = properties?[kCGImagePropertyPixelHeight] as? CGFloat ?? 0
        guard max(width, height) > maxDimension else { return data }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension,
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        CGImageDestinationAddImage(
            destination, thumbnail,
            [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary
        )
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
