//
//  DateRangePicker.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/10.
//

import Observation
import SwiftUI

/// Locale month names and the year sweep for the date-range picker's
/// Date/Month/Year modes; file-scoped because generic types can't hold
/// static stored properties. Computed per access (cheap) so an in-app
/// language switch re-resolves without relaunch.
private enum DateRangePickerData {
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

/// The preset shape behind a date window: a single day, a calendar month,
/// a calendar year, or the explicit Range editor. The segmented control in
/// `DateRangeSheet` picks between them.
enum DateRangeMode: Hashable {
    case date, month, year, range

    var label: String {
        switch self {
        case .date: L10n.string("filters.date", defaultValue: "Date")
        case .month: L10n.string("filters.month", defaultValue: "Month")
        case .year: L10n.string("filters.year", defaultValue: "Year")
        case .range: L10n.string("filters.range", defaultValue: "Range")
        }
    }

    /// The most specific preset whose boundaries exactly match both bounds
    /// (single day wins, then year, then month); nil when the bounds are
    /// not a preset window.
    static func preset(from: Date, to: Date) -> DateRangeMode? {
        let calendar = Calendar.current
        if calendar.isDate(from, inSameDayAs: to) { return .date }
        func matches(_ unit: Calendar.Component) -> Bool {
            guard let interval = calendar.dateInterval(of: unit, for: from),
                  let inclusiveEnd = calendar.date(byAdding: .day, value: -1, to: interval.end)
            else { return false }
            return calendar.isDate(interval.start, inSameDayAs: from)
                && calendar.isDate(inclusiveEnd, inSameDayAs: to)
        }
        if matches(.year) { return .year }
        if matches(.month) { return .month }
        return nil
    }
}

/// A concrete inclusive day window behind a preset mode: local midnights
/// plus the locale text the sheet footers show.
struct DateRangeWindow {
    let start: Date
    let end: Date

    /// Locale text like "Aug 24 – Aug 30, 2026" for section footers.
    /// Formatted in the app's effective language — bare `.formatted`
    /// follows the device locale and ignores the in-app override.
    var text: String {
        let style = Date.FormatStyle(date: .abbreviated, time: .omitted)
            .locale(AppLanguage.preferredLocale)
        return "\(start.formatted(style)) – \(end.formatted(style))"
    }
}

/// Draft state for the date-range sheet: the picked preset mode plus the
/// per-mode picks, edited freely in the sheet and committed to the bound
/// From/To only on Done. The journal edits its window inline instead
/// (tabs + stepper); this sheet is the reports toolbar's picker.
@MainActor
@Observable
final class DateRangeDraft {
    var mode: DateRangeMode = .range
    var dayPick = Date.now
    var monthIndex = 0
    var monthYear = Calendar.current.component(.year, from: .now)
    var yearPick = Calendar.current.component(.year, from: .now)
    var draftFrom: Date?
    var draftTo: Date?

    /// Copies the live filters into the drafts and re-derives the most
    /// specific matching tab (single day, exact month/year boundaries win,
    /// otherwise the explicit Range editor). Bounds are the picked local
    /// instants, straight through.
    func sync(from: Date?, to: Date?) {
        let calendar = Calendar.current
        draftFrom = from
        draftTo = to

        let reference = from ?? to ?? Date.now
        dayPick = reference
        let components = calendar.dateComponents([.month, .year], from: reference)
        monthIndex = (components.month ?? 1) - 1
        monthYear = components.year ?? DateRangePickerData.currentYear
        yearPick = monthYear

        if let from, let to {
            mode = DateRangeMode.preset(from: from, to: to) ?? .range
        } else {
            mode = .range
        }
    }

    /// The concrete window behind each non-range mode.
    func window(for target: DateRangeMode) -> DateRangeWindow? {
        let calendar = Calendar.current
        func wrapping(_ interval: DateInterval?) -> DateRangeWindow? {
            guard let interval else { return nil }
            let inclusiveEnd = calendar.date(byAdding: .day, value: -1, to: interval.end)
            return inclusiveEnd.map { DateRangeWindow(start: interval.start, end: $0) }
        }
        switch target {
        case .date:
            let start = calendar.startOfDay(for: dayPick)
            return DateRangeWindow(start: start, end: start)
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

    /// Dropping into Range inherits the preset being viewed so the manual
    /// pickers start where the preset left off.
    func inheritPresetIntoRange(from oldValue: DateRangeMode) {
        guard mode == .range, oldValue != .range, let window = window(for: oldValue) else {
            return
        }
        draftFrom = window.start
        draftTo = window.end
    }

    /// Writes the drafts back to the caller's bindings: presets always fill
    /// both ends, Range keeps optional bounds independently. Bounds are the
    /// picked local instants; the store's query adds the day's end for `to`.
    func commit() -> (from: Date?, to: Date?) {
        if let window = window(for: mode) {
            return (window.start, window.end)
        }
        return (draftFrom, draftTo)
    }
}

/// The date-window picker sheet: a segmented control chooses between preset
/// windows (Date / Month / Year — each with a natural picker that constructs
/// From/To automatically) and an explicit Range mode. Edits accumulate in a
/// `DateRangeDraft` and commit to the bound dates when Done is tapped;
/// Clear lifts the bounds outright. Presented from the reports toolbar's
/// calendar button.
struct DateRangeSheet: View {
    @Binding var fromDate: Date?
    @Binding var toDate: Date?
    @Environment(\.dismiss) private var dismiss

    @State private var draft = DateRangeDraft()

    /// Shown while either bound is set — the sheet's own Clear only lifts
    /// the date window.
    private var showsClear: Bool { fromDate != nil || toDate != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(L10n.string("filters.period", defaultValue: "Period"), selection: $draft.mode) {
                        ForEach(
                            [DateRangeMode.date, .month, .year, .range],
                            id: \.self
                        ) { m in
                            Text(m.label).tag(m)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }
                optionsSection
            }
            .navigationTitle(Text(L10n.string("filters.dateRange", defaultValue: "Date Range")))
            .inlineNavigationBarTitle()
            .toolbar {
                if showsClear {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(role: .destructive) {
                            fromDate = nil
                            toDate = nil
                            dismiss()
                        } label: {
                            Text(L10n.string("filters.clear", defaultValue: "Clear"))
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.string("common.done", defaultValue: "Done")) {
                        let committed = draft.commit()
                        fromDate = committed.from
                        toDate = committed.to
                    }
                }
            }
            .onAppear { draft.sync(from: fromDate, to: toDate) }
            .onChange(of: draft.mode) { oldValue, _ in
                draft.inheritPresetIntoRange(from: oldValue)
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }

    // MARK: Sheet sections

    @ViewBuilder
    private var optionsSection: some View {
        switch draft.mode {
        case .date:
            Section {
                DatePicker(
                    L10n.string("filters.pickDate", defaultValue: "Pick a date"),
                    selection: $draft.dayPick,
                    displayedComponents: .date
                )
            } header: {
                Text(L10n.string("filters.pickDateHeader", defaultValue: "Single day"))
            }
        case .month:
            Section {
                Picker(
                    L10n.string("filters.month", defaultValue: "Month"),
                    selection: $draft.monthIndex
                ) {
                    ForEach(DateRangePickerData.monthSymbols.indices, id: \.self) { index in
                        Text(DateRangePickerData.monthSymbols[index]).tag(index)
                    }
                }
                Picker(L10n.string("filters.year", defaultValue: "Year"), selection: $draft.monthYear) {
                    ForEach(DateRangePickerData.selectableYears, id: \.self) { year in
                        Text(String(year)).tag(year)
                    }
                }
            } header: {
                Text(L10n.string("filters.pickMonthHeader", defaultValue: "Pick a month"))
            } footer: {
                if let window = draft.window(for: .month) {
                    Text(window.text)
                }
            }
        case .year:
            Section {
                Picker(L10n.string("filters.year", defaultValue: "Year"), selection: $draft.yearPick) {
                    ForEach(DateRangePickerData.selectableYears, id: \.self) { year in
                        Text(String(year)).tag(year)
                    }
                }
            } header: {
                Text(L10n.string("filters.pickYearHeader", defaultValue: "Pick a year"))
            } footer: {
                if let window = draft.window(for: .year) {
                    Text(window.text)
                }
            }
        case .range:
            Section {
                rangeRow(
                    titleKey: L10n.string("filters.from", defaultValue: "From"),
                    value: $draft.draftFrom,
                    fallbackTo: draft.draftTo ?? Date.now
                )
                rangeRow(
                    titleKey: L10n.string("filters.to", defaultValue: "To"),
                    value: $draft.draftTo,
                    fallbackTo: draft.draftFrom ?? Date.now
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
        titleKey: String,
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
}
