//
//  LoginView.swift
//  StudyBuddy
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
                    field(title: "Email", error: emailError) {
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

                    field(title: "Password", error: passwordError) {
                        SecureField("Enter your password", text: $password)
                            .textFieldStyle(.plain)
                            .textContentType(.password)
                            .focused($focusedField, equals: .password)
                            .submitLabel(.go)
                            .onSubmit {
                                focusedField = nil
                                Task { await signIn() }
                            }
                    }

                    Button("Forgot password?") {
                        isShowingResetAlert = true
                    }
                    .font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .alert("Reset Password", isPresented: $isShowingResetAlert) {
                        Button("OK", role: .cancel) {}
                    } message: {
                        Text("Password reset is coming soon.")
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
                            Text(isSubmitting ? "Signing In…" : "Sign In")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isSubmitting)

                    if let email = auth.quickLoginEmail, auth.isBiometricsAvailable {
                        VStack(spacing: 6) {
                            Button {
                                Task { await unlockWithBiometrics() }
                            } label: {
                                Label("Use \(biometryName)", systemImage: biometryIcon)
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                            Text("Signs you in as \(email)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                HStack(spacing: 4) {
                    Text("Don't have an account?")
                    Button("Sign Up") {
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
            guard !auth.suppressBiometricAutoPrompt,
                  auth.quickLoginEmail != nil,
                  auth.isBiometricsAvailable
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
            Image(systemName: "book.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(.tint)
                .frame(width: 84, height: 84)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Color.accentColor.opacity(0.15))
                )
            Text("StudyBuddy")
                .font(.largeTitle.bold())
            Text("Welcome back! Sign in to continue.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 24)
    }

    private func field<Content: View>(
        title: String,
        error: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            content()
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(error == nil ? AnyShapeStyle(.quaternary) : AnyShapeStyle(Color.red.opacity(0.1)))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(error == nil ? AnyShapeStyle(.clear) : AnyShapeStyle(Color.red.opacity(0.5)), lineWidth: 1)
                )
            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private var biometryName: String {
        switch auth.biometryType {
        case .faceID: "Face ID"
        case .touchID: "Touch ID"
        case .opticID: "Optic ID"
        default: "Passcode"
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
            emailError = "Enter a valid email address."
            focusedField = .email
            return
        }
        if password.isEmpty {
            passwordError = "Enter your password."
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
                Text("Create Account")
                    .font(.title2.bold())

                VStack(spacing: 16) {
                    field(title: "Name", error: nameError) {
                        TextField("Your name", text: $name)
                            .textFieldStyle(.plain)
                            .textContentType(.name)
                            .focused($focusedField, equals: .name)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .email }
                    }

                    field(title: "Email", error: emailError) {
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

                    field(title: "Password", error: passwordError) {
                        SecureField("At least 10 characters", text: $password)
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
                            Text(isSubmitting ? "Creating Account…" : "Sign Up")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
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

    private func field<Content: View>(
        title: String,
        error: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            content()
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(error == nil ? AnyShapeStyle(.quaternary) : AnyShapeStyle(Color.red.opacity(0.1)))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(error == nil ? AnyShapeStyle(.clear) : AnyShapeStyle(Color.red.opacity(0.5)), lineWidth: 1)
                )
            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private func signUp() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmedName.isEmpty {
            nameError = "Enter your name."
            focusedField = .name
            return
        }
        if !LoginValidator.isValidEmail(trimmedEmail) {
            emailError = "Enter a valid email address."
            focusedField = .email
            return
        }
        if password.count < 10 {
            passwordError = "Password must be at least 10 characters."
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
