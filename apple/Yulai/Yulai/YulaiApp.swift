//
//  YulaiApp.swift
//  Yulai
//
//  Created by Lisiur Day on 2026/8/19.
//

import SwiftUI

@main
struct YulaiApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor private var appDelegate: AppDelegate
    #endif
    @State private var authManager: AuthManager
    @State private var collectionStore: CollectionStore
    @State private var localeSettings = LocaleSettings.shared

    init() {
        let authManager = AuthManager()
        let collectionStore = CollectionStore()
        self.authManager = authManager
        self.collectionStore = collectionStore
        #if os(macOS)
        TextServiceCoordinator.shared.configure(
            authManager: authManager,
            store: collectionStore
        )
        #endif
    }

    private var preferredLocale: Locale {
        switch localeSettings.identifier {
        case "en": Locale(identifier: "en")
        case "zh-Hans": Locale(identifier: "zh-Hans")
        default: .autoupdatingCurrent
        }
    }

    var body: some Scene {
        WindowGroup(id: "main") {
            Group {
                if authManager.isLoggedIn {
                    ContentView()
                } else if authManager.isRestoringSession {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    LoginView()
                }
            }
            .environment(authManager)
            .environment(collectionStore)
            .environment(localeSettings)
            .environment(\.locale, preferredLocale)
            #if os(macOS)
            .frame(minWidth: 520, minHeight: 520)
            #endif
            .task {
                await authManager.restoreSession()
            }
        }
        #if os(macOS)
        .windowResizability(.contentMinSize)
        #endif
        #if os(macOS)
        MenuBarExtra {
            QuickAddMenuBarView()
                .environment(authManager)
                .environment(collectionStore)
                .environment(localeSettings)
                .environment(\.locale, preferredLocale)
        } label: {
            Image("MenuBarIcon")
                .resizable()
                .renderingMode(.template)
                .frame(width: 16, height: 16)
        }
        .menuBarExtraStyle(.window)
        #endif
    }
}
