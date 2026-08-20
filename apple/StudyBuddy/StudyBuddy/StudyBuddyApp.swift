//
//  StudyBuddyApp.swift
//  StudyBuddy
//
//  Created by Lisiur Day on 2026/8/19.
//

import SwiftUI

@main
struct StudyBuddyApp: App {
    @State private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isLoggedIn {
                    ContentView()
                } else {
                    LoginView()
                }
            }
            .environment(authManager)
            .task {
                await authManager.restoreSession()
            }
        }
    }
}
