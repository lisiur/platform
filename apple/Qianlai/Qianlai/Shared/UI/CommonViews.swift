//
//  CommonViews.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif
import Observation
import SwiftUI

struct BadgeView: View {
    let text: String
    var color: Color = .accentColor
    var outlined = false
    var font: Font = .caption2.weight(.medium)

    var body: some View {
        Text(text)
            .font(font)
            .foregroundStyle(outlined ? .secondary : color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule().fill(
                    outlined
                        ? AnyShapeStyle(Color.primary.opacity(0.06))
                        : AnyShapeStyle(color.opacity(0.15))
                )
            )
    }
}

/// Label + boxed input + inline validation error, shared by the auth and
/// bookkeeping forms.
struct FormField<Content: View>: View {
    let title: LocalizedStringKey
    let error: String?
    private let content: () -> Content

    init(
        title: LocalizedStringKey,
        error: String? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.error = error
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            content()
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(error == nil ? AnyShapeStyle(.quaternary) : AnyShapeStyle(Color.red.opacity(0.1)))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(error == nil ? AnyShapeStyle(.clear) : AnyShapeStyle(Color.red.opacity(0.5)), lineWidth: 1)
                )
            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }
}

/// Icon + label + tabular amount, used by the dashboard and real-accounts
/// totals rows.
struct StatCard: View {
    let icon: String
    let label: LocalizedStringKey
    let value: Double?
    var tone: Tone = .default

    enum Tone {
        case `default`, positive, negative

        var color: Color? {
            switch self {
            case .default: nil
            case .positive: .green
            case .negative: .red
            }
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(Color.accentColor)
                .frame(width: 40, height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.accentColor.opacity(0.12))
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(value.map(Money.format) ?? "—")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(tone.color ?? Color.primary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.quaternary.opacity(0.5))
        )
    }
}

/// Placeholder for lists and reports with nothing to show.
struct EmptyStateView: View {
    let message: String
    var systemImage: String? = nil

    var body: some View {
        VStack(spacing: 8) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.title)
                    .foregroundStyle(.tertiary)
            }
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }
}

/// Inline error with a retry button for failed loads.
struct ErrorRetryView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark")
                .font(.title)
                .foregroundStyle(.tertiary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry", action: retry)
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }
}

/// App-wide lightweight toast, surfaced once by `ContentView` as an alert.
/// Feature stores and views call `toast.show(...)` after mutations.
@MainActor
@Observable
final class ToastCenter {
    var message: String?

    func show(_ text: String) {
        message = text
    }

    func clear() {
        message = nil
    }
}

#if canImport(UIKit)
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(
            activityItems: items,
            applicationActivities: nil
        )
    }

    func updateUIViewController(
        _ controller: UIActivityViewController,
        context: Context
    ) {}
}
#endif

/// Cross-platform clipboard write.
enum Clipboard {
    static func copy(_ text: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #elseif canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }
}

extension View {
    /// `.navigationBarTitleDisplayMode(.inline)`, no-op where unavailable.
    @ViewBuilder
    func inlineNavigationBarTitle() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }
}
