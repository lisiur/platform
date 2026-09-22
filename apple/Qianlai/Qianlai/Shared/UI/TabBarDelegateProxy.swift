//
//  TabBarDelegateProxy.swift
//  Qianlai
//

import SwiftUI
#if canImport(UIKit)

/// Intercepts taps on the quick-add pill at the UITabBarControllerDelegate
/// level — the one layer where a tab selection can actually be REFUSED.
/// Refusing at SwiftUI's selection binding cannot do this: fighting the
/// iOS 26 search-role activation left the bar desynced, and on iOS 27 the
/// legacy `tabBarController(_:shouldSelect:)` fires but its `false` is
/// ignored for selection — the honored decision point is
/// `tabBarController(_:shouldSelectTab:)` (the UITab API form, iOS 18+).
/// The proxy implements both, returns false for the pill, and forwards
/// everything else to whatever delegate SwiftUI had installed.
///
/// This replaces the old park/unpark choreography entirely: the pill page
/// (a blank Color.clear) is never selected, never mounts, and the selected
/// tab never leaves the origin — no deferred parking, no highlight
/// resync, no dismissal branches.
///
/// The pill's LONG PRESS lives on the pill capsule itself (see
/// installPillGestureIfNeeded): a 0.5 s hold whose touchdown suppresses
/// the bar-subtree recognizers for that touch only — the native
/// continuous-selection recognizer would otherwise begin on the pill and
/// commit a pill selection mid-hold, leaking the tap action into the
/// hold. This replaces the earlier bar-level recognizer + bar-wide
/// require(toFail:) web, which gated EVERY bar touch behind the pill's
/// long press: the bar's press highlight could not begin until the hold
/// failed at lift, so every tab press ran mute, and on iOS 27 the same
/// replay chain cost ~20-30 ms of post-lift commit (2026-09-22 probe,
/// 26.5 + 27.0 simulators). A quick pill lift is the TAP: it commits
/// through the same native path as before and lands in the delegate
/// interception below — with suppression active the native pill commit
/// still fires at lift, because it is not one of the suppressible
/// recognizers (probe-verified). The capsule's UITapGestureRecognizer is
/// a backstop for OS versions where that native path stops firing;
/// whichever of the two wins cancels the other, and the app-level
/// pillTapped is idempotent if both ever fire.
final class QuickAddTabBarProxy: NSObject, UITabBarControllerDelegate, UIGestureRecognizerDelegate {
    /// SwiftUI's original delegate; everything unintercepted forwards here.
    weak var original: NSObject?
    /// Runs when the pill is tapped; the interception then returns false,
    /// so the pill never becomes the selected tab.
    var pillTapped: (() -> Void)?
    /// Runs when the pill is long-pressed (~0.5 s hold).
    var pillLongPressed: (() -> Void)?

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        original
    }

    // MARK: - Pill gestures (scoped to the capsule)

    /// Installs the pill's hold + tap recognizers. Deduped against the
    /// capsule ITSELF, not a remembered reference: relayouts can hand the
    /// same capsule view back after a different view was installed in
    /// between (A→B→A), and a remembered-reference check would attach a
    /// second pair to the live view — duplicate haptics, double fires.
    /// A missing capsule (an unprobed bar shape) installs nothing: taps
    /// still work through the delegate interception and only the long
    /// press goes quiet — degrade, never a wrong hit.
    func installPillGestureIfNeeded(on bar: UITabBar) {
        guard let capsule = pillCapsuleView(in: bar),
            capsule.gestureRecognizers?.contains(where: { $0 is PillHoldGestureRecognizer }) != true
        else { return }
        let hold = PillHoldGestureRecognizer(
            target: self,
            action: #selector(pillLongPressed(_:))
        )
        hold.minimumPressDuration = 0.5
        hold.bar = bar
        hold.delegate = self
        capsule.addGestureRecognizer(hold)
        let tap = UITapGestureRecognizer(
            target: self,
            action: #selector(pillTappedBackstop(_:))
        )
        tap.require(toFail: hold)
        tap.delegate = self
        capsule.addGestureRecognizer(tap)
    }

    @objc private func pillLongPressed(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        pillLongPressed?()
    }

    /// Backstop tap path — see the class comment. The recognizer's
    /// lift-time Began cancels the capsule's own touch stream, so when
    /// this fires the native commit does not.
    @objc private func pillTappedBackstop(_ gesture: UITapGestureRecognizer) {
        pillTapped?()
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        false
    }

    /// The pill's own view — the same anatomy walk the old pillHitTest
    /// used. The liquid-glass bar (iOS 26+, both the search and prominent
    /// roles) has NO UITabBarButton subviews: the pill is the trailing
    /// accessory capsule, a direct bar subview sitting right of the main
    /// platter. The classic button list is kept as the pre-26 fallback;
    /// anything unrecognized (no platter anchor, no capsule) returns nil.
    private func pillCapsuleView(in bar: UITabBar) -> UIView? {
        let className: (UIView) -> String = { String(describing: type(of: $0)) }
        let directSubviews = bar.subviews
        if let pill = directSubviews.last(where: { className($0).hasPrefix("UITabBarButton") }) {
            return pill
        }
        let platters = directSubviews
            .filter { className($0).contains("Platter") }
        // No platter anchor → the layout isn't the probed shape (early
        // pass or a future bar redesign); refusing beats guessing.
        guard let platterMaxX = platters.map(\.frame.maxX).max(), platterMaxX > 0 else {
            return nil
        }
        return directSubviews
            .filter {
                !className($0).contains("Platter")
                    && $0.frame.minX >= platterMaxX - 1
                    && $0.frame.width < bar.bounds.width
            }
            .min { $0.frame.minX < $1.frame.minX }
    }

    // MARK: - Tap interception

    private func forwardShouldSelect(_ tabBarController: UITabBarController, viewController: UIViewController) -> Bool {
        if let delegate = original as? UITabBarControllerDelegate,
            delegate.responds(to: #selector(tabBarController(_:shouldSelect:)))
        {
            return delegate.tabBarController?(tabBarController, shouldSelect: viewController) ?? true
        }
        return true
    }

    private func forwardShouldSelectTab(_ tabBarController: UITabBarController, tab: UITab) -> Bool {
        if let delegate = original as? UITabBarControllerDelegate,
            delegate.responds(to: #selector(tabBarController(_:shouldSelectTab:)))
        {
            return delegate.tabBarController?(tabBarController, shouldSelectTab: tab) ?? true
        }
        return true
    }

    func tabBarController(_ tabBarController: UITabBarController, shouldSelect viewController: UIViewController) -> Bool {
        // The pill is appended after every configurable tab, so it is the
        // controller's last entry.
        if viewController == tabBarController.viewControllers?.last {
            pillTapped?()
            return false
        }
        return forwardShouldSelect(tabBarController, viewController: viewController)
    }

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        if tab === tabBarController.tabs.last {
            pillTapped?()
            return false
        }
        return forwardShouldSelectTab(tabBarController, tab: tab)
    }
}

/// The pill's hold recognizer. Attached to the pill capsule, so it only
/// ever sees pill touches. On touchdown it suppresses every gesture
/// recognizer in the bar's tree for as long as the sequence runs (the
/// liquid-glass bar keeps selection recognizers on the item subviews too,
/// so the walk is recursive): the native continuous-selection recognizer
/// would otherwise begin on the pill and commit a pill selection
/// mid-hold, leaking the tap action into the hold. Everything attached
/// within the capsule's own subtree — our sibling backstop tap included —
/// stays live; the capsule's non-gesture selection path dies at the
/// hold's Began via cancelsTouchesInView instead. Batches from overlapping
/// touches MERGE (already-disabled recognizers are naturally skipped), so
/// a second finger can never strand the first batch disabled, and one
/// restore when the sequence closes puts everything back. That restore
/// rides the next runloop because a synchronous one let the closing touch
/// stream leak back into the just-revived recognizers and commit a stray
/// pill selection at lift (probe-verified); recognizers disabled while a
/// later touch began had their touches cancelled at that touch's start,
/// so the early restore cannot inject them into an in-flight touch. A
/// quick lift fails this recognizer and restores everything before the
/// next touch — normal tabs are never gated on anything.
final class PillHoldGestureRecognizer: UILongPressGestureRecognizer {
    /// The bar whose subtree gets suppressed for the current sequence.
    weak var bar: UITabBar?
    private var suppressed: [UIGestureRecognizer] = []

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        suppressBarRecognizers()
    }

    override func reset() {
        let suppressed = self.suppressed
        self.suppressed = []
        DispatchQueue.main.async { suppressed.forEach { $0.isEnabled = true } }
        super.reset()
    }

    private func suppressBarRecognizers() {
        guard let bar else { return }
        let capsule = self.view
        var found: [UIGestureRecognizer] = []
        var stack: [UIView] = [bar]
        while let view = stack.popLast() {
            if view !== capsule {
                for recognizer in view.gestureRecognizers ?? []
                where recognizer !== self && recognizer.isEnabled {
                    found.append(recognizer)
                }
                stack.append(contentsOf: view.subviews)
            }
        }
        // Merge, not replace: an overlapping touch must not drop the
        // first batch from the restore set.
        suppressed.append(contentsOf: found)
        found.forEach { $0.isEnabled = false }
    }
}

/// Drop this into any page inside the TabView: it walks the responder
/// chain to the backing UITabBarController and installs the proxy over
/// SwiftUI's own delegate (the original survives behind the forwarder).
/// Installation is idempotent and re-runs on every update and layout
/// pass — SwiftUI can reinstall its own delegate on tab-structure
/// updates, and the walk may only succeed once the controller exists.
struct QuickAddTabBarIntrospection: UIViewRepresentable {
    let proxy: QuickAddTabBarProxy

    func makeUIView(context: Context) -> FinderUIView {
        let view = FinderUIView(frame: .zero)
        view.isHidden = true
        view.proxy = proxy
        return view
    }

    func updateUIView(_ uiView: FinderUIView, context: Context) {
        uiView.proxy = proxy
        uiView.installIfNeeded()
    }
}

final class FinderUIView: UIView {
    var proxy: QuickAddTabBarProxy?
    private var installedController: UITabBarController?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        installIfNeeded()
    }

    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        installIfNeeded()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        installIfNeeded()
    }

    func installIfNeeded() {
        guard window != nil else { return }
        var responder: UIResponder? = self
        while let current = responder {
            guard let tabBarController = current as? UITabBarController else {
                responder = current.next
                continue
            }
            if tabBarController.delegate !== proxy {
                proxy?.original = tabBarController.delegate as? NSObject
                tabBarController.delegate = proxy
            }
            proxy?.installPillGestureIfNeeded(on: tabBarController.tabBar)
            installedController = tabBarController
            return
        }
        if installedController == nil, let root = window?.rootViewController {
            if let tabBarController = findTabBarController(in: root) {
                proxy?.original = tabBarController.delegate as? NSObject
                tabBarController.delegate = proxy
                proxy?.installPillGestureIfNeeded(on: tabBarController.tabBar)
                installedController = tabBarController
            }
        }
    }

    private func findTabBarController(in viewController: UIViewController) -> UITabBarController? {
        if let tabBarController = viewController as? UITabBarController {
            return tabBarController
        }
        for child in viewController.children {
            if let found = findTabBarController(in: child) {
                return found
            }
        }
        if let presented = viewController.presentedViewController {
            return findTabBarController(in: presented)
        }
        return nil
    }
}

#endif
