#if os(macOS)
import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.servicesProvider = TextServiceProvider.shared
    }
}

final class TextServiceProvider: NSObject {
    static let shared = TextServiceProvider()

    @objc(collectTextService:userData:error:)
    func collectTextService(
        _ pboard: NSPasteboard,
        userData: String?,
        error: AutoreleasingUnsafeMutablePointer<NSString?>?
    ) {
        guard
            let text = pboard.string(forType: .string)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !text.isEmpty
        else {
            error?.pointee = NSString(string: "No text selected")
            return
        }
        TextServiceCoordinator.shared.collect(text)
    }
}

@MainActor
final class TextServiceCoordinator {
    static let shared = TextServiceCoordinator()

    enum Feedback {
        case collecting
        case success(CollectionItemType)
        case loginRequired
        case failure(String)
    }

    private var authManager: AuthManager?
    private var store: CollectionStore?
    private var panel: NSPanel?
    private var dismissTask: Task<Void, Never>?
    private var generation = 0

    func configure(authManager: AuthManager, store: CollectionStore) {
        self.authManager = authManager
        self.store = store
    }

    func collect(_ text: String) {
        guard let authManager, let store else { return }
        guard authManager.isLoggedIn else {
            show(.loginRequired)
            return
        }
        show(.collecting)
        Task {
            do {
                let item = try await store.add(text)
                await store.reloadQuietly()
                show(.success(item.type))
            } catch {
                show(.failure(error.localizedDescription))
            }
        }
    }

    private func show(_ feedback: Feedback) {
        generation += 1
        let current = generation
        dismissTask?.cancel()

        let panel = self.panel ?? makePanel()
        let host = NSHostingController(rootView: ServiceFeedbackView(feedback: feedback))
        panel.contentViewController = host
        let size = host.preferredContentSize
        panel.setContentSize(
            size.width > 1 ? size : NSSize(width: 220, height: 48)
        )
        if let screen = NSScreen.main {
            let visible = screen.visibleFrame
            panel.setFrameOrigin(
                NSPoint(
                    x: visible.midX - panel.frame.width / 2,
                    y: visible.maxY - panel.frame.height - 16
                )
            )
        }
        panel.alphaValue = 1
        panel.orderFrontRegardless()

        switch feedback {
        case .collecting:
            break
        case .success, .loginRequired, .failure:
            dismissTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(2.4))
                guard !Task.isCancelled else { return }
                self?.hide(current)
            }
        }
    }

    private func hide(_ generation: Int) {
        guard generation == self.generation, let panel else { return }
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.3
            panel.animator().alphaValue = 0
        }, completionHandler: {
            panel.orderOut(nil)
        })
    }

    private func makePanel() -> NSPanel {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 220, height: 48),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.ignoresMouseEvents = true
        panel.isReleasedWhenClosed = false
        self.panel = panel
        return panel
    }
}

private struct ServiceFeedbackView: View {
    let feedback: TextServiceCoordinator.Feedback

    var body: some View {
        HStack(spacing: 8) {
            switch feedback {
            case .collecting:
                ProgressView()
                    .controlSize(.small)
                Text("Collecting…")
            case .success(let type):
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Added to collection (\(type.label)）")
            case .loginRequired:
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.red)
                Text("Not signed in. Please open Yulai to sign in.")
            case .failure(let message):
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.red)
                Text(message)
            }
        }
        .font(.footnote.weight(.medium))
        .lineLimit(1)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: 380)
        .background(
            Capsule(style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(.quaternary)
                )
        )
        .fixedSize()
    }
}
#endif
