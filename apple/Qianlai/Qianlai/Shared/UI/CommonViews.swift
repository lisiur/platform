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

/// Ends editing so an open keyboard closes. For `.onSubmit` handlers whose
/// return key should only dismiss.
func dismissKeyboard() {
    #if canImport(UIKit)
    UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder),
        to: nil, from: nil, for: nil
    )
    #endif
}

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

/// Trailing "more" (ellipsis) menu that mirrors a row's long-press context
/// menu, so every action stays reachable with a single tap. Render only when
/// the caller's `items` produce at least one entry — an empty menu presents
/// nothing. Callers gate on the same conditions as their menu items.
struct RowMoreMenu<Items: View>: View {
    @ViewBuilder let items: () -> Items

    var body: some View {
        Menu {
            items()
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.body)
                .foregroundStyle(.secondary)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(L10n.string("common.more", defaultValue: "More")))
    }
}

/// Label + boxed input + inline validation error, shared by the auth and
/// bookkeeping forms.
struct FormField<Content: View>: View {
    let title: String
    let error: String?
    private let content: () -> Content

    init(
        title: String,
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

/// Chinese finance convention for money direction: income/inflows render
/// red (红涨), expenses/outflows render green (绿跌) — used everywhere an
/// amount is colored by its sign.
extension Color {
    static let income = Color.red
    static let expense = Color.green

    /// Surface of a card that sits on the grouped background — mirrors the
    /// default grouped-List row color: white in light mode, elevated
    /// near-black in dark mode.
    static var cardSurface: Color {
        #if canImport(UIKit)
        Color(uiColor: .secondarySystemGroupedBackground)
        #elseif canImport(AppKit)
        Color(nsColor: .controlBackgroundColor)
        #endif
    }

    /// Canvas a grouped list scrolls on — the counterpart of `cardSurface`:
    /// light gray in light mode, black in dark mode.
    static var groupedCanvas: Color {
        #if canImport(UIKit)
        Color(uiColor: .systemGroupedBackground)
        #elseif canImport(AppKit)
        Color(nsColor: .windowBackgroundColor)
        #endif
    }
}

/// The glass rim shared by the self-drawn surfaces — the calculator's
/// display/keys and the stat-card family: a specular highlight
/// concentrated at the top edge fading down (dark mode's visible part),
/// plus a whisper of shadow along the bottom edge for light mode, where
/// the white highlight vanishes against the light fills. `intensity` is
/// the theme page's 边框高光 value; zero means off (callers skip drawing).
extension LinearGradient {
    static func glassRim(intensity: Double, colorScheme: ColorScheme) -> LinearGradient {
        LinearGradient(
            stops: colorScheme == .dark
                ? [
                    .init(color: .white.opacity(intensity), location: 0),
                    .init(color: .white.opacity(intensity * 0.25), location: 1),
                ]
                : [
                    .init(color: .white.opacity(min(1, intensity * 2.3)), location: 0),
                    .init(color: .white.opacity(intensity * 0.25), location: 0.5),
                    .init(color: .black.opacity(intensity * 0.3), location: 1),
                ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

/// The rim as an overlay for self-drawn cards — the corner radius must
/// match the card fill's own rounded rectangle.
struct GlassRimModifier: ViewModifier {
    let cornerRadius: CGFloat

    @Environment(RimSettings.self) private var rimSettings
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content.overlay {
            if rimSettings.intensity > 0 {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(
                        LinearGradient.glassRim(intensity: rimSettings.intensity, colorScheme: colorScheme),
                        lineWidth: 1
                    )
            }
        }
    }
}

extension View {
    /// Outlines the view's rounded-rect bounds with the themed glass rim.
    func glassRim(cornerRadius: CGFloat) -> some View {
        modifier(GlassRimModifier(cornerRadius: cornerRadius))
    }
}

/// Icon + label + tabular amount, used by the dashboard and real-accounts
/// totals rows. A `currency` ISO code prefixes the amount with its symbol;
/// leave it nil on surfaces without a single currency (cross-ledger totals).
/// An optional `footer` renders as a second row inside the same card
/// chrome, under the headline (the dashboard's income/net columns).
/// An optional `action` turns the card into a drill-down control: a small
/// chevron rides the title line and taps anywhere on the card's figures
/// run the action; nil keeps the inert figure.
struct StatCard: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    var icon: String?
    let label: String
    let value: Double?
    var currency: String?
    var tone: Tone = .default
    var footer: AnyView? = nil
    var action: (() -> Void)? = nil

    enum Tone {
        case `default`, positive, negative

        var color: Color? {
            switch self {
            case .default: nil
            case .positive: .income
            case .negative: .expense
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            headline
            if let footer {
                footer
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(backgroundSettings.cardSurface)
        )
        .glassRim(cornerRadius: 20)
    }

    /// The headline row — identical styling to the inert rendering, the
    /// gray chevron aside. `action` attaches as a plain tap gesture, not a
    /// Button: the button pipeline re-tints its label content, and this
    /// module must keep the exact colors it renders when inert.
    @ViewBuilder
    private var headline: some View {
        let row = HStack(spacing: 12) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 40, height: 40)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.accentColor.opacity(0.12))
                    )
            }
            VStack(alignment: .leading, spacing: 2) {
                statTitleLine(label, showsDisclosure: action != nil)
                Text(value.map { Money.format($0, currency: currency) } ?? "—")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(tone.color ?? Color.primary)
                    .lineLimit(1)
            }
        }
        if let action {
            row.statTapTarget(action: action)
        } else {
            row
        }
    }
}

/// The stat module's title line: the caption label with the drill-down
/// chevron riding inline after it when the module is tappable. Shared by
/// `StatCard` here and `StatSummaryBlock`'s columns in Stats/.
func statTitleLine(_ label: String, showsDisclosure: Bool) -> some View {
    HStack(spacing: 4) {
        Text(label)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        if showsDisclosure {
            // Disclosure rides inline in the title's own .secondary gray
            // so the inert/tappable figure never differs in color.
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }
}

/// The whole-area tap-target wrapper: a Button's style pipeline re-tints
/// its label content, and the host must keep the exact colors it renders
/// when inert — so the tap ships as a plain gesture, with the
/// accessibility overlay (combined VoiceOver element + button trait)
/// layered on top. Used by the stat card's headline and by the
/// composition card's legend rows, both of which need a whole-region hit
/// area that's silent in color but active in a11y.
private struct StatTapTargetModifier: ViewModifier {
    let action: () -> Void

    func body(content: Content) -> some View {
        content
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
    }
}

extension View {
    func statTapTarget(action: @escaping () -> Void) -> some View {
        modifier(StatTapTargetModifier(action: action))
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

/// The chart cards' segmented-picker idiom: the title doubles as the
/// accessibility label (`labelsHidden` hides only the visible one) and
/// `fixedSize` keeps the control hugging its segments.
func segmentedPicker<T: Hashable & Identifiable>(
    _ a11yTitle: String,
    selection: Binding<T>,
    options: [T],
    label: @escaping (T) -> String
) -> some View {
    Picker(a11yTitle, selection: selection) {
        ForEach(options) { candidate in
            Text(label(candidate)).tag(candidate)
        }
    }
    .pickerStyle(.segmented)
    .labelsHidden()
    .fixedSize()
}

/// The dashboard chart cards' shared header badge: a 34×34 accent-tinted
/// rounded square behind the card's symbol.
struct ChartCardBadge: View {
    let systemName: String

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 17))
            .foregroundStyle(Color.accentColor)
            .frame(width: 34, height: 34)
            .background(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Color.accentColor.opacity(0.12))
            )
    }
}

/// The stats cards' shared empty state — the window fetched, nothing
/// drew.
struct ChartCardEmpty: View {
    let systemName: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: systemName)
                .font(.title3)
                .foregroundStyle(.tertiary)
            Text(L10n.string("dashboard.charts.empty", defaultValue: "No data"))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
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
            Button(L10n.string("common.retry", defaultValue: "Retry"), action: retry)
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }
}

/// App-wide lightweight toast, surfaced by `ContentView` as a floating
/// capsule just above the tab bar that self-dismisses — never a blocking
/// alert. Feature stores and views call `toast.show(...)` after mutations.
@MainActor
@Observable
final class ToastCenter {
    private(set) var message: String?
    /// Changes on every `show`, so a repeated identical message still resets
    /// the auto-dismiss countdown (`task(id:)` needs a distinct id).
    private(set) var token = UUID()

    func show(_ text: String) {
        message = text
        token = UUID()
    }

    func clear() {
        message = nil
    }
}

/// The floating capsule that renders `ToastCenter`: slides up from the
/// bottom, stays briefly, then fades away on its own; tapping skips the
/// wait. Mirrors Yulai's lightweight toast. No user confirmation is ever
/// required. Position with `.overlay(alignment: .bottom)`.
struct ToastOverlay: View {
    @Environment(ToastCenter.self) private var toast

    var body: some View {
        VStack(spacing: 0) {
            if let message = toast.message {
                Label(message, systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .shadow(color: .black.opacity(0.16), radius: 12, y: 6)
                    .padding(.bottom, 20)
                    .onTapGesture { toast.clear() }
                    .task(id: toast.token) {
                        try? await Task.sleep(for: .seconds(1.6))
                        guard !Task.isCancelled else { return }
                        toast.clear()
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.2), value: toast.message)
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

/// Cross-platform clipboard access.
enum Clipboard {
    /// The clipboard's string contents, or nil when it holds none.
    static var text: String? {
        #if canImport(UIKit)
        UIPasteboard.general.string
        #elseif canImport(AppKit)
        NSPasteboard.general.string(forType: .string)
        #endif
    }

    static func copy(_ text: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #elseif canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }
}

/// The 32×32 circle behind the list-header controls — the dashboard's month
/// chevrons and filter/sort menus, the journal's range and filter buttons.
/// Activity is conveyed by tint alone (accent when active, primary
/// otherwise); never swap the symbol. Disabled controls dim the glyph and
/// keep the circle. Wrap it in a `Button`/`Menu` label with
/// `.buttonStyle(.borderless)` inside List rows so a tap doesn't fire the
/// row underneath.
struct CircleIcon: View {
    let systemName: String
    var isActive = false

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Image(systemName: systemName)
            .foregroundStyle(isActive ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(Color.primary))
            .opacity(isEnabled ? 1 : 0.3)
            .frame(width: 32, height: 32)
            .background(Circle().fill(Color.primary.opacity(0.06)))
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

    /// `.navigationBarTitleDisplayMode(.large)`, no-op where unavailable.
    @ViewBuilder
    func largeNavigationBarTitle() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.large)
        #else
        self
        #endif
    }

    /// `.listSectionSpacing(.compact)`, no-op where unavailable (macOS).
    @ViewBuilder
    func compactListSectionSpacing() -> some View {
        #if os(iOS)
        self.listSectionSpacing(.compact)
        #else
        self
        #endif
    }

    /// Page-level global background while it is active (see
    /// `AppBackgroundCanvasModifier`). No-op while the background is off.
    /// Main-window pages only — sheets and covers are separate opaque
    /// surfaces.
    func appBackgroundCanvas() -> some View {
        modifier(AppBackgroundCanvasModifier())
    }

    /// Card-colored row background that turns translucent with the global
    /// background image (see `AppCardRowModifier`).
    func appCardRow() -> some View {
        modifier(AppCardRowModifier())
    }
}

extension BackgroundSettings {
    /// The wallpaper-tinted card surface, at the user's card opacity.
    private var activeCardSurface: Color {
        Color.cardSurface.opacity(cardOpacity)
    }

    /// The grouped-card surface: opaque by default, translucent while the
    /// global background is active so the wallpaper tints through the
    /// cards.
    var cardSurface: Color {
        isActive ? activeCardSurface : Color.cardSurface
    }

    /// Small-circle surface (category icons, recents, more/manage chips):
    /// a whisper of primary by default; while the background is active the
    /// circles join the cards.
    var chipSurface: Color {
        isActive ? activeCardSurface : Color.primary.opacity(0.06)
    }
}

/// Row background matching the grouped-card look — translucent while the
/// global background is active; rows otherwise keep the system's
/// opaque grouped background untouched.
private struct AppCardRowModifier: ViewModifier {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    @ViewBuilder
    func body(content: Content) -> some View {
        if backgroundSettings.isActive {
            content.listRowBackground(backgroundSettings.cardSurface)
        } else {
            content
        }
    }
}

/// Paints the global background image at page level: the iOS 26
/// TabView/NavigationStack containers draw opaque surfaces, so a single
/// layer behind the tab root never shows through — each page has to carry
/// the image itself and hide its grouped-list canvas, letting it show
/// between the cards (rows keep their opaque default). The image rides in
/// `.background` (not a wrapping ZStack) — an `ignoresSafeArea` sibling
/// inside a ZStack relaxes the safe area for the content too and collapses
/// the large-title/search layout.
///
/// The canvas greedily fills the whole screen through safe areas: the
/// backdrop covers everything behind a mounted page — nav-bar insets and
/// the home-indicator strip included — regardless of how much of the
/// screen the page's own frame reaches.
///
/// The canvas deliberately carries NO global-origin compensation: earlier
/// revisions kept the wallpaper screen-fixed through scroll by cancelling
/// the host's `.global` origin, and that read is what lost the wallpaper
/// inside navigation transitions on every OS version — the origin is a
/// moving value mid-animation, so any layout-time read bakes a
/// transitional position in. With no geometry reads left there is nothing
/// to misread: the wallpaper rides with its page through pushes, pops,
/// and sheet dismissals, motionless through scroll (a scrolling List never
/// moves its own frame).
///
/// The scrim tints toward the scheme's base color: black in dark mode
/// (darker wallpaper keeps white canvas text readable), white in light
/// mode (a pastel wash keeps black canvas text readable) — a black veil
/// under a light theme would sink exactly the text drawn on the canvas.
private struct AppBackgroundCanvasModifier: ViewModifier {
    @Environment(BackgroundSettings.self) private var backgroundSettings
    @Environment(\.colorScheme) private var colorScheme

    @ViewBuilder
    func body(content: Content) -> some View {
        if backgroundSettings.isActive, let image = backgroundSettings.activeImage {
            content
                .scrollContentBackground(.hidden)
                .background {
                    ZStack {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                        (colorScheme == .dark ? Color.black : Color.white)
                            .opacity(backgroundSettings.dim)
                    }
                    // Order is load-bearing: .clipped() must precede
                    // .ignoresSafeArea() — clipped-after re-clips the
                    // expanded region back to the content bounds, leaving
                    // the status-bar strip bare (4-variant probe,
                    // 2026-09-16).
                    .clipped()
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                }
        } else {
            content
        }
    }
}
