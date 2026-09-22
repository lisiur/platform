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
/// The proxy also owns the pill's LONG PRESS: a bar-level
/// UILongPressGestureRecognizer (see installLongPressIfNeeded) hit-tests
/// the hold to the trailing capsule and runs `pillLongPressed`. A
/// recognized hold cancels the button's touch, so a hold never leaks into
/// the tap interception above, and a quick lift fails the recognizer, so
/// taps never leak into it either.
final class QuickAddTabBarProxy: NSObject, UITabBarControllerDelegate, UIGestureRecognizerDelegate {
    /// SwiftUI's original delegate; everything unintercepted forwards here.
    weak var original: NSObject?
    /// Runs when the pill is tapped; the interception then returns false,
    /// so the pill never becomes the selected tab.
    var pillTapped: (() -> Void)?
    /// Runs when the pill is long-pressed (~0.5 s hold). A recognized hold
    /// cancels the button's touch, so the tap interception above never
    /// fires for it — tap and long press are cleanly exclusive.
    var pillLongPressed: (() -> Void)?
    /// The bar our recognizer lives on (re-resolved per install pass).
    private weak var tabBar: UITabBar?
    /// Our long-press recognizer, tracked on the PROXY, not on the finder
    /// view: every tab page carries its own introspection view, so the
    /// finder is recreated on each page switch — a finder-tracked
    /// recognizer would duplicate on every switch.
    private var longPress: UILongPressGestureRecognizer?

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        original
    }

    // MARK: - Long press on the pill

    /// Installs the bar-level long-press recognizer (idempotent — tracked
    /// on the proxy) and re-asserts the failure relationships. Probe
    /// findings (2026-09-22, iOS 26.5 + 27.0 simulators):
    ///  - The liquid-glass bar ships its own recognizers, among them
    ///    native UILongPressGestureRecognizers — presence-by-type can
    ///    never be the "already installed" check.
    ///  - Without `require(toFail:)` the bar's
    ///    _UIContinuousSelectionGestureRecognizer recognizes a hold on a
    ///    NORMAL tab first and switches tabs. The failure relationship
    ///    hands holds to us; a quick lift fails our recognizer instantly,
    ///    so ordinary taps are unimpaired (probe regression steps).
    ///
    /// The recognizer must stay scoped to the pill — see
    /// gestureRecognizerShouldBegin. A bar-wide armed hold would deny the
    /// native continuous selection its shot at normal-tab holds.
    func installLongPressIfNeeded(on bar: UITabBar) {
        tabBar = bar
        if longPress == nil {
            let recognizer = UILongPressGestureRecognizer(
                target: self,
                action: #selector(tabBarLongPressed(_:))
            )
            recognizer.minimumPressDuration = 0.5
            recognizer.delegate = self
            bar.addGestureRecognizer(recognizer)
            longPress = recognizer
        }
        // Re-applied per pass: SwiftUI can install fresh recognizers on
        // bar updates, and the call is harmless to repeat.
        if let longPress {
            for other in bar.gestureRecognizers ?? [] where other !== longPress {
                other.require(toFail: longPress)
            }
        }
    }

    /// Arms the hold only when it started on the pill. Without this, a
    /// ≥0.5 s hold on a normal tab would begin OUR recognizer (hit-test
    /// miss → no-op) while the require(toFail:) relationship permanently
    /// denies the bar's _UIContinuousSelectionGestureRecognizer — native
    /// hold-to-switch would silently die, and slow lifts would do nothing.
    /// Failing here unblocks the dependent recognizers mid-touch, so the
    /// native recognizer still recognizes the ongoing press.
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === longPress, let tabBar else { return true }
        return pillHitTest(gestureRecognizer.location(in: tabBar), in: tabBar)
    }

    @objc private func tabBarLongPressed(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, let tabBar else { return }
        guard pillHitTest(gesture.location(in: tabBar), in: tabBar) else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        pillLongPressed?()
    }

    /// True when the press landed on the pill. The liquid-glass bar
    /// (iOS 26+, both the search and prominent roles) has NO
    /// UITabBarButton subviews — the pill is the trailing accessory
    /// capsule: a direct bar subview sitting right of the main platter.
    /// The classic button list is kept as the pre-26 fallback; anything
    /// unrecognized (no platter anchor, no capsule) degrades to "no long
    /// press" — never a wrong hit.
    private func pillHitTest(_ point: CGPoint, in bar: UITabBar) -> Bool {
        let className: (UIView) -> String = { String(describing: type(of: $0)) }
        let directSubviews = bar.subviews
        if let pill = directSubviews.last(where: { className($0).hasPrefix("UITabBarButton") }) {
            return pill.frame.contains(point)
        }
        let platters = directSubviews.filter { className($0).contains("Platter") }
        // No platter anchor → the layout isn't the probed shape (early
        // pass or a future bar redesign); refusing beats guessing.
        guard let platterMaxX = platters.map(\.frame.maxX).max(), platterMaxX > 0 else {
            return false
        }
        let capsule = directSubviews
            .filter {
                !className($0).contains("Platter")
                    && $0.frame.minX >= platterMaxX - 1
                    && $0.frame.width < bar.bounds.width
            }
            .min { $0.frame.minX < $1.frame.minX }
        return capsule?.frame.contains(point) ?? false
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        false
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
            proxy?.installLongPressIfNeeded(on: tabBarController.tabBar)
            installedController = tabBarController
            return
        }
        if installedController == nil, let root = window?.rootViewController {
            if let tabBarController = findTabBarController(in: root) {
                proxy?.original = tabBarController.delegate as? NSObject
                tabBarController.delegate = proxy
                proxy?.installLongPressIfNeeded(on: tabBarController.tabBar)
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
