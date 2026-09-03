//
//  QianlaiApp.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

@main
struct QianlaiApp: App {
    @State private var authManager: AuthManager
    @State private var ledgerStore: LedgerStore
    @State private var realAccountStore: RealAccountStore
    @State private var journalStore = JournalStore()
    @State private var reportStore = ReportStore()
    @State private var projectStore = ProjectStore()
    @State private var toast: ToastCenter
    @State private var localeSettings = LocaleSettings.shared

    init() {
        let authManager = AuthManager()
        self.authManager = authManager
        self.ledgerStore = LedgerStore()
        self.realAccountStore = RealAccountStore()
        self.toast = ToastCenter()
    }

    var body: some Scene {
        WindowGroup(id: "main") {
            Group {
                if ProcessInfo.processInfo.arguments.contains("--ui-demo-location-picker") {
                    LocationPickerSheet(initialLocation: nil) { _ in }
                } else if authManager.isLoggedIn {
                    // First-login guide: self-registered users (flag still
                    // set) see onboarding instead of the main tabs.
                    if authManager.isOnboardingPending {
                        OnboardingView()
                    } else {
                        ContentView()
                    }
                } else if authManager.isRestoringSession {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    LoginView()
                }
            }
            .environment(authManager)
            .environment(ledgerStore)
            .environment(realAccountStore)
            .environment(journalStore)
            .environment(reportStore)
            .environment(projectStore)
            .environment(toast)
            .environment(localeSettings)
            .environment(\.locale, localeSettings.preferredLocale)
            #if os(macOS)
            .frame(minWidth: 640, minHeight: 640)
            #endif
            .task {
                await authManager.restoreSession()
            }
            .task(id: authManager.isLoggedIn) {
                // Ledgers load once per login; the switcher and views refresh
                // from there.
                if authManager.isLoggedIn {
                    await ledgerStore.load()
                }
            }
        }
        #if os(macOS)
        .windowResizability(.contentMinSize)
        #endif
    }
}
