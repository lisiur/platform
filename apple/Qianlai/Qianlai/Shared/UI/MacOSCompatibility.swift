//
//  MacOSCompatibility.swift
//  Qianlai
//
//  macOS stand-ins for the iOS-only SwiftUI modifiers the surfaces use.
//  Each shim exists ONLY under os(macOS) — on iOS the SDK's own modifier
//  resolves (this module's same-signature extension would shadow it, so
//  the guard is what keeps iOS behavior byte-identical). The mac
//  presentation chrome differs (a sheet stands in for a full-screen
//  cover); the surfaces' logic is untouched. Full mac UX parity is not a
//  deliverable of ISSUE-141 — these shims make the mac target COMPILE
//  and run; presentation polish lands with a dedicated mac adaptation
//  task if one ever opens.
//

import SwiftUI

#if os(macOS)

extension View {
    /// iOS's fullScreenCover is unavailable on macOS — a sheet presents
    /// the same content with standard chrome.
    nonisolated func fullScreenCover<Content: View>(
        isPresented: Binding<Bool>,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        sheet(isPresented: isPresented, onDismiss: onDismiss, content: content)
    }

    /// The item-keyed variant of the sheet stand-in.
    nonisolated func fullScreenCover<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        sheet(item: item, onDismiss: onDismiss, content: content)
    }
}

extension ToolbarItemPlacement {
    /// The toolbar edge placements, per platform: iOS's topBar* pair,
    /// macOS's navigation zone (leading) and action zone (trailing).
    static var platformTopBarLeading: ToolbarItemPlacement {
        .navigation
    }

    static var platformTopBarTrailing: ToolbarItemPlacement {
        .primaryAction
    }
}

extension View {
    /// `.navigationBarTitleDisplayMode(.inline)`'s macOS stand-in (the
    /// modifier and its enum are iOS-only).
    func inlineTitleCompat() -> some View {
        self
    }
}

/// The macOS share surface: NSSharingServicePicker hosted off a zero
/// frame view (the picker anchors to it when it presents). The iOS twin
/// is CommonViews' UIViewControllerRepresentable.
struct ShareSheet: NSViewRepresentable {
    let items: [Any]

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            NSSharingServicePicker(items: items)
                .show(relativeTo: view.bounds, of: view, preferredEdge: .minY)
        }
        return view
    }

    func updateNSView(_ view: NSView, context: Context) {}
}

#else

extension View {
    /// The iOS twin — see the macOS branch for the rationale.
    func inlineTitleCompat() -> some View {
        navigationBarTitleDisplayMode(.inline)
    }
}

extension ToolbarItemPlacement {
    /// iOS twins of the placement helpers.
    static var platformTopBarLeading: ToolbarItemPlacement {
        .topBarLeading
    }

    static var platformTopBarTrailing: ToolbarItemPlacement {
        .topBarTrailing
    }
}

#endif
