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
}

/// Icon + label + tabular amount, used by the dashboard and real-accounts
/// totals rows.
struct StatCard: View {
    var icon: String?
    let label: LocalizedStringKey
    let value: Double?
    var tone: Tone = .default

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
        HStack(spacing: 12) {
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
                .fill(Color.cardSurface)
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

/// Locale month names and the year sweep for `FilterSheetButton`'s
/// Date/Month/Year presets; file-scoped because generic types can't hold
/// static stored properties. Computed per access (cheap) so an in-app
/// language switch re-resolves without relaunch.
private enum FilterPickerData {
    /// Standalone month names in the app's effective language — the device
    /// locale alone ignores the in-app override.
    static var monthSymbols: [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = AppLanguage.preferredLocale
        return calendar.standaloneMonthSymbols
    }

    static var currentYear: Int { Calendar.current.component(.year, from: .now) }

    /// A reasonable sweep of years for month/year selection.
    static var selectableYears: [Int] { Array((currentYear - 25)...(currentYear + 2)) }
}

/// Toolbar filter button whose tap presents the full filter form in a sheet,
/// shared by the Journal and Reports screens. The button itself is only a
/// trigger; inside the sheet a segmented control chooses between preset
/// windows (Date / Month / Year — each with a natural picker that constructs
/// From/To automatically) and an explicit Range mode. Edits accumulate in
/// drafts and commit to the bound dates when Done is tapped.
///
/// The trigger always renders the SAME symbol — activity is conveyed by tint
/// alone. Swapping `systemName` conditions tears down the toolbar item on
/// iOS 26, re-laying-out the adjacent bottom search bar mid-list-update and
/// visibly flashing placeholder chrome.
struct FilterSheetButton<FilterFields: View>: View {
    /// Inclusive date window: `start` and `end` are local midnights.
    private struct Window {
        let start: Date
        let end: Date

        /// Locale text like "Aug 24 – Aug 30, 2026" for section footers.
        var text: String {
            "\(start.formatted(date: .abbreviated, time: .omitted)) – \(end.formatted(date: .abbreviated, time: .omitted))"
        }
    }

    private enum PresetMode: Hashable {
        case date, month, year, range

        var label: String {
            switch self {
            case .date: L10n.string("filters.date", defaultValue: "Date")
            case .month: L10n.string("filters.month", defaultValue: "Month")
            case .year: L10n.string("filters.year", defaultValue: "Year")
            case .range: L10n.string("filters.range", defaultValue: "Range")
            }
        }
    }

    @Binding var fromDate: Date?
    @Binding var toDate: Date?
    /// Whether any filter anywhere is active — tints the (never swapped)
    /// toolbar symbol and controls the sheet's Clear button.
    let isActive: Bool
    /// Single, stable symbol — never conditionally replaced, or the iOS 26
    /// toolbar tears its item down and flashes the search chrome beneath it.
    let icon: String
    /// Custom clear action replacing the built-in one (which resets just the
    /// date bounds); e.g. the Journal also clears search and member filters.
    private let onClear: (() -> Void)?
    private let filterFields: FilterFields

    @State private var isPresented = false
    @State private var mode: PresetMode = .range
    @State private var dayPick = Date.now
    @State private var monthIndex = 0
    @State private var monthYear = Calendar.current.component(.year, from: .now)
    @State private var yearPick = Calendar.current.component(.year, from: .now)
    @State private var draftFrom: Date?
    @State private var draftTo: Date?

    init(
        fromDate: Binding<Date?>,
        toDate: Binding<Date?>,
        isActive: Bool,
        icon: String,
        onClear: (() -> Void)? = nil,
        @ViewBuilder filterFields: () -> FilterFields
    ) {
        _fromDate = fromDate
        _toDate = toDate
        self.isActive = isActive
        self.icon = icon
        self.onClear = onClear
        self.filterFields = filterFields()
    }

    /// With a custom clear the caller owns the precondition via `isActive`;
    /// otherwise show the control once either date bound is set.
    private var showsClear: Bool {
        onClear != nil ? isActive : (fromDate != nil || toDate != nil)
    }

    var body: some View {
        Button {
            isPresented = true
        } label: {
            Image(systemName: icon)
                .foregroundStyle(isActive ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(Color.primary))
        }
        .sheet(isPresented: $isPresented) {
            NavigationStack {
                Form {
                    Section {
                        Picker("Period", selection: $mode) {
                            ForEach(
                                [PresetMode.date, .month, .year, .range],
                                id: \.self
                            ) { m in
                                Text(m.label).tag(m)
                            }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                    }
                    optionsSection
                    filterFields
                }
                .navigationTitle(Text("Filters"))
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    if showsClear {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(role: .destructive) {
                                if let onClear {
                                    onClear()
                                } else {
                                    fromDate = nil
                                    toDate = nil
                                }
                                isPresented = false
                            } label: {
                                Text("Clear")
                            }
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            commit()
                            isPresented = false
                        }
                    }
                }
                .onAppear { syncDrafts() }
                .onChange(of: mode) { oldValue, newValue in
                    // Dropping into Range inherits the preset being viewed so
                    // the manual pickers start where the preset left off.
                    if newValue == .range, oldValue != .range,
                       let window = window(for: oldValue) {
                        draftFrom = window.start
                        draftTo = window.end
                    }
                }
            }
            #if os(iOS)
            .presentationDetents([.medium, .large])
            #endif
        }
    }

    // MARK: Sheet sections

    @ViewBuilder
    private var optionsSection: some View {
        switch mode {
        case .date:
            Section {
                DatePicker(
                    L10n.string("filters.pickDate", defaultValue: "Pick a date"),
                    selection: $dayPick,
                    displayedComponents: .date
                )
            } header: {
                Text(L10n.string("filters.pickDateHeader", defaultValue: "Single day"))
            }
        case .month:
            Section {
                Picker(
                    L10n.string("filters.month", defaultValue: "Month"),
                    selection: $monthIndex
                ) {
                    ForEach(FilterPickerData.monthSymbols.indices, id: \.self) { index in
                        Text(FilterPickerData.monthSymbols[index]).tag(index)
                    }
                }
                Picker(L10n.string("filters.year", defaultValue: "Year"), selection: $monthYear) {
                    ForEach(FilterPickerData.selectableYears, id: \.self) { year in
                        Text(String(year)).tag(year)
                    }
                }
            } header: {
                Text(L10n.string("filters.pickMonthHeader", defaultValue: "Pick a month"))
            } footer: {
                if let window = window(for: .month) {
                    Text(window.text)
                }
            }
        case .year:
            Section {
                Picker(L10n.string("filters.year", defaultValue: "Year"), selection: $yearPick) {
                    ForEach(FilterPickerData.selectableYears, id: \.self) { year in
                        Text(String(year)).tag(year)
                    }
                }
            } header: {
                Text(L10n.string("filters.pickYearHeader", defaultValue: "Pick a year"))
            } footer: {
                if let window = window(for: .year) {
                    Text(window.text)
                }
            }
        case .range:
            Section {
                rangeRow(
                    titleKey: "From",
                    value: $draftFrom,
                    fallbackTo: draftTo ?? Date.now
                )
                rangeRow(
                    titleKey: "To",
                    value: $draftTo,
                    fallbackTo: draftFrom ?? Date.now
                )
            } header: {
                Text(L10n.string("filters.customRange", defaultValue: "Custom range"))
            }
        }
    }

    /// One Range-mode field: a plain date selector over an optional draft.
    /// Displays the sibling draft (or today) until touched, so opening the
    /// sheet and hitting Done applies nothing new.
    private func rangeRow(
        titleKey: LocalizedStringKey,
        value: Binding<Date?>,
        fallbackTo fallback: Date
    ) -> some View {
        DatePicker(
            titleKey,
            selection: Binding(
                get: { value.wrappedValue ?? fallback },
                set: { value.wrappedValue = $0 }
            ),
            displayedComponents: .date
        )
    }

    // MARK: Window math

    /// The concrete window behind each non-range mode.
    private func window(for target: PresetMode) -> Window? {
        let calendar = Calendar.current
        func wrapping(_ interval: DateInterval?) -> Window? {
            guard let interval else { return nil }
            let inclusiveEnd = calendar.date(byAdding: .day, value: -1, to: interval.end)
            return inclusiveEnd.map { Window(start: interval.start, end: $0) }
        }
        switch target {
        case .date:
            let start = calendar.startOfDay(for: dayPick)
            return Window(start: start, end: start)
        case .month:
            let date = calendar.date(
                from: DateComponents(year: monthYear, month: monthIndex + 1, day: 1)
            )
            return wrapping(date.flatMap { calendar.dateInterval(of: .month, for: $0) })
        case .year:
            let date = calendar.date(from: DateComponents(year: yearPick, month: 1, day: 1))
            return wrapping(date.flatMap { calendar.dateInterval(of: .year, for: $0) })
        case .range:
            return nil
        }
    }

    /// Copies the live filters into the sheet's drafts and re-derives the
    /// most specific matching tab (single day, exact month/year boundaries
    /// win, otherwise the explicit Range editor). Bounds are the picked
    /// local instants, straight through.
    private func syncDrafts() {
        let calendar = Calendar.current
        draftFrom = fromDate
        draftTo = toDate

        let reference = fromDate ?? toDate ?? Date.now
        dayPick = reference
        let components = calendar.dateComponents([.month, .year], from: reference)
        monthIndex = (components.month ?? 1) - 1
        monthYear = components.year ?? FilterPickerData.currentYear
        yearPick = monthYear

        if let from = fromDate, let to = toDate {
            func matches(_ unit: Calendar.Component) -> Bool {
                guard let interval = calendar.dateInterval(of: unit, for: from),
                      let inclusiveEnd = calendar.date(byAdding: .day, value: -1, to: interval.end)
                else { return false }
                return calendar.isDate(interval.start, inSameDayAs: from)
                    && calendar.isDate(inclusiveEnd, inSameDayAs: to)
            }
            if calendar.isDate(from, inSameDayAs: to) {
                mode = .date
            } else if matches(.year) {
                mode = .year
            } else if matches(.month) {
                mode = .month
            } else {
                mode = .range
            }
        } else {
            mode = .range
        }
    }

    /// Writes the drafts back to the bound filters: presets always fill both
    /// ends, Range keeps optional bounds independently. Bounds are the
    /// picked local instants; the store's query adds the day's end for `to`.
    private func commit() {
        if let window = window(for: mode) {
            fromDate = window.start
            toDate = window.end
        } else {
            fromDate = draftFrom
            toDate = draftTo
        }
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
