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
final class QuickAddTabBarProxy: NSObject, UITabBarControllerDelegate {
    /// SwiftUI's original delegate; everything unintercepted forwards here.
    weak var original: NSObject?
    /// Runs when the pill is tapped; the interception then returns false,
    /// so the pill never becomes the selected tab.
    var pillTapped: (() -> Void)?

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        original
    }

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
            installedController = tabBarController
            return
        }
        if installedController == nil, let root = window?.rootViewController {
            if let tabBarController = findTabBarController(in: root) {
                proxy?.original = tabBarController.delegate as? NSObject
                tabBarController.delegate = proxy
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
