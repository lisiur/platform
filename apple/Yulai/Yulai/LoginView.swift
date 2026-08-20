//
//  LoginView.swift
//  Yulai
//
//  Created by Lisiur Day on 2026/8/19.
//

import LocalAuthentication
import SwiftUI

struct LoginView: View {
    @Environment(AuthManager.self) private var auth

    @State private var email = ""
    @State private var password = ""
    @State private var emailError: String?
    @State private var passwordError: String?
    @State private var formError: String?
    @State private var isSubmitting = false
    @State private var isShowingResetAlert = false
    @State private var isShowingSignUp = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email
        case password
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                header

                VStack(spacing: 16) {
                    FormField(title: "邮箱", error: emailError) {
                        TextField("you@example.com", text: $email)
                            .textFieldStyle(.plain)
                            .textContentType(.emailAddress)
                            #if os(iOS)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            #endif
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }
                    }

                    FormField(title: "密码", error: passwordError) {
                        SecureField("输入密码", text: $password)
                            .textFieldStyle(.plain)
                            .textContentType(.password)
                            .focused($focusedField, equals: .password)
                            .submitLabel(.go)
                            .onSubmit {
                                focusedField = nil
                                Task { await signIn() }
                            }
                    }

                    Button("忘记密码？") {
                        isShowingResetAlert = true
                    }
                    .font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .alert("重置密码", isPresented: $isShowingResetAlert) {
                        Button("好", role: .cancel) {}
                    } message: {
                        Text("密码重置功能即将上线。")
                    }

                    if let formError {
                        Text(formError)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        focusedField = nil
                        Task { await signIn() }
                    } label: {
                        HStack(spacing: 8) {
                            if isSubmitting {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(.white)
                            }
                            Text(isSubmitting ? "登录中…" : "登录")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSubmitting)

                    if let email = auth.quickLoginEmail, auth.isBiometricsAvailable {
                        VStack(spacing: 6) {
                            Button {
                                Task { await unlockWithBiometrics() }
                            } label: {
                                Label("使用 \(biometryName)", systemImage: biometryIcon)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                            }
                            .buttonStyle(.bordered)
                            Text("将登录 \(email)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                HStack(spacing: 4) {
                    Text("还没有账号？")
                    Button("注册") {
                        isShowingSignUp = true
                    }
                    .bold()
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .sheet(isPresented: $isShowingSignUp) {
                    SignUpView()
                        .environment(auth)
                }
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        #if os(iOS)
        .scrollDismissesKeyboard(.interactively)
        #endif
        .task {
            // Skip the auto prompt when a stored session token exists —
            // session restore either failed on a transport/server error (a
            // biometric login would fail the same way) or is still valid.
            guard !auth.suppressBiometricAutoPrompt,
                  auth.quickLoginEmail != nil,
                  auth.isBiometricsAvailable,
                  auth.client.sessionToken == nil
            else { return }
            await unlockWithBiometrics()
        }
        .onChange(of: email) { _, _ in
            emailError = nil
            formError = nil
        }
        .onChange(of: password) { _, _ in
            passwordError = nil
            formError = nil
        }
    }

    private var header: some View {
        VStack(spacing: 12) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            Text("语来")
                .font(.largeTitle.bold())
            Text("欢迎回来！登录以继续。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 24)
    }

    private var biometryName: String {
        switch auth.biometryType {
        case .faceID: "Face ID"
        case .touchID: "Touch ID"
        case .opticID: "Optic ID"
        default: "设备密码"
        }
    }

    private var biometryIcon: String {
        switch auth.biometryType {
        case .faceID: "faceid"
        case .touchID: "touchid"
        case .opticID: "opticid"
        default: "lock"
        }
    }

    private func unlockWithBiometrics() async {
        do {
            try await auth.loginWithBiometrics()
        } catch let error as LAError where error.code == .userFallback {
            email = auth.quickLoginEmail ?? ""
            password = ""
            focusedField = .password
        } catch let error as LAError where error.code == .userCancel || error.code == .systemCancel || error.code == .appCancel {
        } catch {
            formError = error.localizedDescription
        }
    }

    private func signIn() async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        if !LoginValidator.isValidEmail(trimmedEmail) {
            emailError = "请输入有效的邮箱地址。"
            focusedField = .email
            return
        }
        if password.isEmpty {
            passwordError = "请输入密码。"
            focusedField = .password
            return
        }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            try await auth.login(email: trimmedEmail, password: password)
        } catch {
            formError = error.localizedDescription
        }
    }
}

struct SignUpView: View {
    @Environment(AuthManager.self) private var auth
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var nameError: String?
    @State private var emailError: String?
    @State private var passwordError: String?
    @State private var formError: String?
    @State private var isSubmitting = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case name
        case email
        case password
    }

    private var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && LoginValidator.isValidEmail(email)
            && password.count >= 10
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Text("创建账号")
                    .font(.title2.bold())

                VStack(spacing: 16) {
                    FormField(title: "昵称", error: nameError) {
                        TextField("你的昵称", text: $name)
                            .textFieldStyle(.plain)
                            .textContentType(.name)
                            .focused($focusedField, equals: .name)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .email }
                    }

                    FormField(title: "邮箱", error: emailError) {
                        TextField("you@example.com", text: $email)
                            .textFieldStyle(.plain)
                            .textContentType(.emailAddress)
                            #if os(iOS)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            #endif
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }
                    }

                    FormField(title: "密码", error: passwordError) {
                        SecureField("至少 10 个字符", text: $password)
                            .textFieldStyle(.plain)
                            .textContentType(.newPassword)
                            .focused($focusedField, equals: .password)
                            .submitLabel(.go)
                            .onSubmit {
                                focusedField = nil
                                Task { await signUp() }
                            }
                    }

                    if let formError {
                        Text(formError)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        focusedField = nil
                        Task { await signUp() }
                    } label: {
                        HStack(spacing: 8) {
                            if isSubmitting {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(.white)
                            }
                            Text(isSubmitting ? "创建中…" : "注册")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSubmitting)
                }
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .onChange(of: name) { _, _ in nameError = nil; formError = nil }
        .onChange(of: email) { _, _ in emailError = nil; formError = nil }
        .onChange(of: password) { _, _ in passwordError = nil; formError = nil }
    }

    private func signUp() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmedName.isEmpty {
            nameError = "请输入昵称。"
            focusedField = .name
            return
        }
        if !LoginValidator.isValidEmail(trimmedEmail) {
            emailError = "请输入有效的邮箱地址。"
            focusedField = .email
            return
        }
        if password.count < 10 {
            passwordError = "密码至少需要 10 个字符。"
            focusedField = .password
            return
        }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            try await auth.signUp(name: trimmedName, email: trimmedEmail, password: password)
            dismiss()
        } catch {
            formError = error.localizedDescription
        }
    }
}

#Preview {
    LoginView()
        .environment(AuthManager())
}
