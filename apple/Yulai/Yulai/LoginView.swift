//
//  LoginView.swift
//  Yulai
//
//  Created by Lisiur Day on 2026/8/19.
//

import AuthenticationServices
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
    @State private var appleNonce = ""
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email
        case password
    }

    private static let appleSignInEnabled = true

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                header

                VStack(spacing: 16) {
                    FormField(title: "Email", error: emailError) {
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

                    FormField(title: "Password", error: passwordError) {
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
                    .alert("Reset password", isPresented: $isShowingResetAlert) {
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
                            Text(isSubmitting ? "Signing in…" : "Sign in")
                                .font(.headline)
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(isSubmitting)

                    if let email = auth.quickLoginEmail, auth.isBiometricsAvailable {
                        VStack(spacing: 6) {
                            Button {
                                Task { await unlockWithBiometrics() }
                            } label: {
                                Label("Used \(biometryName)", systemImage: biometryIcon)
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 48)
                                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            Text("Sign in as \(email)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if Self.appleSignInEnabled {
                        SignInWithAppleButton(.signIn) { request in
                            request.requestedScopes = [.fullName, .email]
                            let nonce = Self.randomNonce()
                            appleNonce = nonce
                            request.nonce = nonce
                        } onCompletion: { result in
                            Task { await handleAppleSignIn(result) }
                        }
                        .signInWithAppleButtonStyle(.black)
                        .frame(height: 50)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .disabled(isSubmitting)
                    }
                }

                HStack(spacing: 4) {
                    Text("No account yet?")
                    Button("Sign up") {
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
            Text("Yulai")
                .font(.largeTitle.bold())
            Text("Welcome back! Sign in to continue.")
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
        default: "Device passcode"
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

    private static func randomNonce() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "SecRandomCopyBytes failed with status \(status)")
        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let error):
            // User closing the Apple sheet is not an error worth showing.
            if let asError = error as? ASAuthorizationError, asError.code == .canceled {
                return
            }
            formError = error.localizedDescription

        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8)
            else {
                formError = "Apple Sign-In didn't return credentials. Please try again."
                return
            }

            isSubmitting = true
            defer { isSubmitting = false }

            do {
                try await auth.loginWithApple(
                    identityToken: identityToken,
                    nonce: appleNonce,
                    firstName: credential.fullName?.givenName,
                    lastName: credential.fullName?.familyName
                )
            } catch {
                formError = error.localizedDescription
            }
        }
    }

    private func signIn() async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        if !LoginValidator.isValidEmail(trimmedEmail) {
            emailError = "Please enter a valid email address."
            focusedField = .email
            return
        }
        if password.isEmpty {
            passwordError = "Please enter your password."
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
                Text("Create account")
                    .font(.title2.bold())

                VStack(spacing: 16) {
                    FormField(title: "Nickname", error: nameError) {
                        TextField("Your nickname", text: $name)
                            .textFieldStyle(.plain)
                            .textContentType(.name)
                            .focused($focusedField, equals: .name)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .email }
                    }

                    FormField(title: "Email", error: emailError) {
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

                    FormField(title: "Password", error: passwordError) {
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
                            Text(isSubmitting ? "Creating…" : "Sign up")
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
            nameError = "Please enter a nickname."
            focusedField = .name
            return
        }
        if !LoginValidator.isValidEmail(trimmedEmail) {
            emailError = "Please enter a valid email address."
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
