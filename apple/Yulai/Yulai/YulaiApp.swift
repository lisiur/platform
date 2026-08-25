//
//  YulaiApp.swift
//  Yulai
//
//  Created by Lisiur Day on 2026/8/19.
//

import SwiftUI

@main
struct YulaiApp: App {
    @State private var authManager = AuthManager()
    @State private var collectionStore = CollectionStore()

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
