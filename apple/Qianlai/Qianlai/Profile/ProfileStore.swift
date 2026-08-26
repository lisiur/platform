//
//  ProfileStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

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
}
