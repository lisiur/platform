//
//  AppLock.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/26.
//

import LocalAuthentication
import SwiftUI

/// The shield window's three appearances: nothing (normal foreground),
/// the switcher/Control Center blur curtain (no auth), or the lock screen.
enum ShieldMode {
    case hidden
    case curtain
    case lock
}

/// The app-lock gate behind 应用锁: TRUE backgrounding arms the lock, and
/// returning to the active scene runs one owner evaluation (biometrics
/// with the system's device-passcode fallback — no separate in-app
/// passcode exists to set up, forget, or reset). Control Center and the
/// app switcher hold the scene merely inactive and do NOT lock — they
/// raise the blur curtain instead (it lifts on its own when the scene
/// returns to active), which is also what the switcher's card captures,
/// since its snapshot is taken at deactivation. The curtain belongs to
/// privacy mode as a whole — it arms when EITHER toggle is on — while the
/// lock itself follows 应用锁 only. The state machine is UIKit-free; the
/// shield window lives in `AppLockShieldWindow`, driven by `shieldMode`.
@MainActor @Observable
final class AppLockController {
    /// What the shield window is showing right now.
    private(set) var shieldMode: ShieldMode = .hidden

    /// Whether the lock screen is up and an unlock is required.
    var isLocked: Bool { shieldMode == .lock }

    /// True while an unlock evaluation is in flight. The system auth
    /// dialog itself makes the scene inactive on some OS versions, so
    /// scene transitions observed mid-evaluation must not re-enter.
    private(set) var isUnlocking = false

    /// Screenshot-harness pin (`lockForScreenshots`): scene transitions
    /// leave the shield alone while set — the launch sequence passes
    /// through an `.active` transition whose isEnabled=false wipe would
    /// otherwise undo the armed lock before it ever renders.
    private var isPinnedForScreenshots = false

    /// One-shot auto-prompt permit, armed by every lock event and consumed
    /// by the `.active` handler. The system auth dialog itself bounces the
    /// scene through inactive→active (visible on cancel: the dialog's
    /// dismissal lands as an `.active`), so a plain "prompt on every
    /// .active while locked" would re-present the prompt forever — a
    /// cancel could never cancel. Only a NEW lock event re-arms it.
    private var pendingAutoUnlock = false

    /// Injectable so tests exercise the state machine without LocalAuth.
    private let authenticate: @Sendable () async -> Bool

    init(authenticate: @escaping @Sendable () async -> Bool = {
        await AppLockController.evaluateDeviceOwner()
    }) {
        self.authenticate = authenticate
    }

    /// One `.deviceOwnerAuthentication` round — the pre-check plus the
    /// prompt, shared by unlock and arming. The pre-check's error code
    /// travels separately because only the arming flow points at the
    /// fixable cause (no device passcode); every other failure collapses
    /// to a plain one.
    private enum OwnerEvaluationOutcome {
        case succeeded
        case failed(preCheck: LAError.Code?)
    }

    private static func runOwnerEvaluation() async -> OwnerEvaluationOutcome {
        let context = LAContext()
        var evaluateError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &evaluateError) else {
            return .failed(preCheck: LAError.Code(rawValue: evaluateError?.code ?? 0))
        }
        do {
            try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: L10n.string("profile.privacy.authReason", defaultValue: "Unlock Qianlai to continue.")
            )
            return .succeeded
        } catch {
            return .failed(preCheck: nil)
        }
    }

    /// Production check: `.deviceOwnerAuthentication` asks for biometrics
    /// and falls back to the device passcode by itself. Cancellations and
    /// sensor failures both count as failures — the shield stays up with
    /// its manual unlock button.
    static func evaluateDeviceOwner() async -> Bool {
        return switch await runOwnerEvaluation() {
        case .succeeded: true
        case .failed: false
        }
    }

    func handleSceneChange(
        _ phase: ScenePhase,
        lockEnabled: Bool,
        curtainEnabled: Bool,
        isLoggedIn: Bool
    ) {
        guard !isPinnedForScreenshots else { return }
        guard lockEnabled || curtainEnabled, isLoggedIn else {
            // No privacy protection on, logged out, or mid-onboarding:
            // never lock, never curtain, and release a lock a toggle-off
            // may have raced.
            shieldMode = .hidden
            pendingAutoUnlock = false
            return
        }
        switch phase {
        case .background:
            // Lock ONLY on true backgrounding — Control Center and the
            // app switcher keep the scene merely `.inactive` and get the
            // curtain instead. Backgrounding mid-evaluation (user swipes
            // home while the prompt is up) re-arms the auto-prompt
            // harmlessly: the lock is already armed either way. With only
            // 隐藏金额 on there is nothing to arm — the curtain raised at
            // .inactive already covers the card.
            if lockEnabled {
                shieldMode = .lock
                pendingAutoUnlock = true
            }
        case .inactive:
            // The blur curtain rises without locking — unless the lock
            // screen is already up: the auth dialog's own deactivation
            // lands here too, and it must not swap the shield for the
            // curtain.
            if shieldMode != .lock {
                shieldMode = .curtain
            }
        case .active:
            // A mere inactive round trip lifts the curtain by itself —
            // no auth. A lock event (background) armed the one-shot
            // prompt instead.
            if shieldMode == .curtain {
                shieldMode = .hidden
            }
            guard isLocked, pendingAutoUnlock, !isUnlocking else { return }
            pendingAutoUnlock = false
            Task { await unlock() }
        @unknown default:
            break
        }
    }

    /// Cold-launch lock: the app starts already active, so no scene
    /// transition will fire — a restored session arms the lock itself and
    /// kicks the first evaluation.
    func lockAtLaunch() {
        guard !isLocked, !isUnlocking else { return }
        shieldMode = .lock
        Task { await unlock() }
    }

    /// Screenshot harness (`--privacy-locked`): arm the shield without
    /// evaluating, so the lock screen stays up for the capture instead of
    /// racing a Face ID prompt. The pin keeps scene transitions — the
    /// launch sequence's own `.active` included — from wiping the armed
    /// lock (see `isPinnedForScreenshots`).
    func lockForScreenshots() {
        isPinnedForScreenshots = true
        shieldMode = .lock
    }

    /// Screenshot harness (`--privacy-curtain`): pin the blur curtain up
    /// for the capture — scene transitions can't lift it while pinned.
    func curtainForScreenshots() {
        isPinnedForScreenshots = true
        shieldMode = .curtain
    }

    /// The shield's 解锁 button — a manual biometric retry after a
    /// cancelled or failed evaluation (which leaves the lock armed).
    func unlock() async {
        guard isLocked, !isUnlocking else { return }
        isUnlocking = true
        defer { isUnlocking = false }
        if await authenticate() {
            shieldMode = .hidden
        }
    }

    /// The settings toggle's arming check: one owner evaluation that
    /// reports WHY it failed, so the copy can point at the fixable cause
    /// (no device passcode) apart from cancels and sensor failures. Not
    /// routed through the injected closure — arming is a production-only
    /// flow with no test surface beyond the state machine above.
    func verifyForEnable() async -> AppLockEnableResult {
        switch await Self.runOwnerEvaluation() {
        case .succeeded:
            return .success
        case .failed(let preCheck) where preCheck == .passcodeNotSet:
            return .passcodeNotSet
        case .failed:
            return .failed
        }
    }
}

enum AppLockEnableResult {
    case success
    case passcodeNotSet
    case failed
}

#if os(iOS)
/// Hosts the app-lock surfaces in their own UIWindow: the switcher/Control
/// Center blur curtain and the lock screen. No SwiftUI overlay attached to
/// the root can cover the quick-entry cover while it is up (presented
/// content renders above the main window's content), and the app-switcher
/// snapshot captures whatever is on screen — the curtain has to live at
/// window level to land in the card. Hidden (not transparent) in
/// `.hidden`, so it never sits in the hit-test path. The window sits
/// outside the app's environment tree, so the controller its root
/// observes is injected onto the root view.
@MainActor
final class AppLockShieldWindow {
    private let appLock: AppLockController
    private var window: UIWindow?

    init(appLock: AppLockController) {
        self.appLock = appLock
    }

    func setMode(_ mode: ShieldMode) {
        switch mode {
        case .hidden:
            window?.isHidden = true
        case .curtain, .lock:
            let window = self.window ?? makeWindow()
            window.isHidden = false
            window.makeKeyAndVisible()
        }
    }

    private func makeWindow() -> UIWindow {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else {
            // No scene to host the shield in (never expected on a live
            // app) — stay windowless; the lock state itself is unaffected.
            return UIWindow()
        }
        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert
        window.rootViewController = UIHostingController(
            rootView: LockShieldRoot().environment(appLock)
        )
        self.window = window
        return window
    }
}

/// The shield window's root: swaps curtain and lock screen off the
/// controller's mode — the window itself only toggles visibility.
private struct LockShieldRoot: View {
    @Environment(AppLockController.self) private var appLock

    var body: some View {
        switch appLock.shieldMode {
        case .curtain:
            PrivacyCurtainView()
        case .lock:
            LockShieldView()
        case .hidden:
            // Transient — the window is hidden in this mode anyway.
            Color.clear
        }
    }
}

/// The switcher/Control Center curtain: a full-screen material blurring
/// the app behind it — what the app-switcher card captures — WITHOUT
/// locking; it lifts by itself when the scene returns to active. The
/// logo centers the blur so the card reads as deliberate, not glitched.
private struct PrivacyCurtainView: View {
    var body: some View {
        Rectangle()
            .fill(.thickMaterial)
            .ignoresSafeArea()
            .overlay {
                Image("Logo")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
    }
}

/// The lock screen: opaque canvas, app logo with a lock badge, and the
/// manual unlock button (the automatic Face ID prompt appears over it on
/// its own). Rendered outside the app's environment tree — the controller
/// is injected by `AppLockShieldWindow`, the accent comes from stored
/// settings, and strings go straight through L10n (the override bundle is
/// process-global).
private struct LockShieldView: View {
    @Environment(AppLockController.self) private var appLock

    private let accent = AppAccent.stored()

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 24) {
                Image("Logo")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "lock.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(7)
                            .background(Circle().fill(accent.color))
                            .overlay(Circle().stroke(.background, lineWidth: 2))
                            .offset(x: 6, y: 6)
                    }
                Text(L10n.string("profile.privacy.lockedTitle", defaultValue: "Locked"))
                    .font(.title3.weight(.semibold))
                Button {
                    Task { await appLock.unlock() }
                } label: {
                    Label(
                        L10n.string("profile.privacy.unlock", defaultValue: "Unlock"),
                        systemImage: biometryIcon
                    )
                }
                .buttonStyle(.borderedProminent)
                .tint(accent.color)
            }
        }
    }

    private var biometryIcon: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        return switch context.biometryType {
        case .faceID: "faceid"
        case .touchID: "touchid"
        case .opticID: "opticid"
        default: "lock.open"
        }
    }
}
#endif
