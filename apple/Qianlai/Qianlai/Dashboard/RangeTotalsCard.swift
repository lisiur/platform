//
//  RangeTotalsCard.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/22.
//

import SwiftUI
import Observation

/// The dashboard's today/this-week/this-year card: one row per period —
/// the iconed period label leading, the 总收入/总支出 labeled figures
/// stacked trailing in their semantic colors (the journal day headers'
/// look) — summed client-side off ONE
/// daily-summary fetch spanning the current year (widened back to the
/// week's start, for a year-boundary week). Stepper-independent like the
/// annual category budget card — 今天/本周/本年 anchor to NOW, not the
/// month header's selected month. Each row drills into that period's
/// journal (all kinds — the row carries both flows): the day push rides
/// the drill page's day path ("9月22日"), the week and year pushes
/// override the window with the same from–to rendering the journal's
/// week tab and the category budget's year drill use. Guests never mount
/// the card — the endpoint 403s them.
struct RangeTotalsCard: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    let store: RangeTotalsStore
    let currency: String
    /// Threaded locale — the period captions must follow the in-app
    /// language override, not the device language.
    let locale: Locale
    var todayAction: (() -> Void)? = nil
    var weekAction: (() -> Void)? = nil
    var yearAction: (() -> Void)? = nil

    var body: some View {
        // Headerless: the three rows are self-describing.
        VStack(spacing: 14) {
            row(
                L10n.string("dashboard.rangeCard.today", defaultValue: "Today"),
                icon: todayIcon,
                caption: todayCaption,
                period: totals?.today,
                action: todayAction
            )
            row(
                L10n.string("dashboard.rangeCard.week", defaultValue: "This week"),
                icon: "calendar",
                caption: weekCaption,
                period: totals?.week,
                action: weekAction
            )
            row(
                L10n.string("dashboard.rangeCard.year", defaultValue: "This year"),
                icon: "calendar.badge.clock",
                caption: yearCaption,
                period: totals?.year,
                action: yearAction
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(backgroundSettings.cardSurface)
        )
        .glassRim(cornerRadius: 20)
    }

    /// Today's row icon — the date-numbered calendar symbol
    /// (`1.calendar`…`31.calendar`, one per day of the month), so the
    /// glyph itself says which day it is; it refreshes whenever the body
    /// re-renders past midnight.
    private var todayIcon: String {
        "\(Calendar.current.component(.day, from: .now)).calendar"
    }

    /// The period captions — the same renderings the drill pages title
    /// with, so a row and its pushed page read alike.
    private var todayCaption: String {
        AppDates.formatEntryDay(.now, locale: locale)
    }

    private var weekCaption: String {
        guard let week = RangeTotalsMath.weekWindow(for: .now, calendar: .current) else {
            return ""
        }
        return AppDates.formatWeekTitle(
            start: Calendar.current.startOfDay(for: week.from),
            end: Calendar.current.startOfDay(for: week.to),
            locale: locale
        )
    }

    private var yearCaption: String {
        AppDates.formatYearTitle(
            Calendar.current.component(.year, from: .now), locale: locale
        )
    }

    /// nil while the day list hasn't loaded — the rows render their dash
    /// placeholders; a failed fetch keeps the previous figures (the same
    /// keep-previous rule the stats component follows).
    private var totals: RangeTotalsMath.Totals? {
        store.days.map {
            RangeTotalsMath.totals(days: $0, today: .now, calendar: .current)
        }
    }

    /// One period row — the icon spans the label+caption stack (the
    /// caption left-aligns with the label), the labeled figures trail;
    /// the whole row drills into the period's journal.
    private func row(
        _ label: String, icon: String, caption: String,
        period: RangeTotalsMath.PeriodTotals?, action: (() -> Void)?
    ) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                // The memo color on journal cards — the icon reads as
                // supporting text, not a faint watermark.
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.subheadline)
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 2) {
                amountLine(
                    L10n.string("dashboard.rangeCard.totalIncome", defaultValue: "Total income"),
                    cents: period?.incomeCents,
                    color: .income
                )
                amountLine(
                    L10n.string("dashboard.rangeCard.totalExpense", defaultValue: "Total expense"),
                    cents: period?.expenseCents,
                    color: .expense
                )
            }
        }
        .statTapTarget { action?() }
        .accessibilityHint(Text(L10n.string(
            "dashboard.rangeCard.openHint",
            defaultValue: "View entries for this period"
        )))
    }

    /// One labeled amount line — the 总收入/总支出 caption and the
    /// semibold figure beside it both ride the semantic color, exactly the
    /// journal day headers' `dayTotal` rendering. No hand-signed prefix:
    /// `Money.format` speaks for itself, and a refund-heavy day's
    /// negative shows as-is. A nil figure renders the dash placeholder at
    /// the same typographic slot.
    private func amountLine(_ label: String, cents: Int?, color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption2)
            Text(cents.map { Money.format(cents: $0, currency: currency) } ?? "–")
                .font(.footnote.weight(.semibold).monospacedDigit())
        }
        .foregroundStyle(color)
    }
}

/// One windowed daily-summary fetch for the card — the same endpoint the
/// calendar and trend cards chart, aimed at the card's own year window.
/// Keep-previous on failure like the stats component; a ledger switch
/// drops everything (stale figures from another ledger are worse than
/// dashes).
@MainActor
@Observable
final class RangeTotalsStore {
    private(set) var days: [DayIncomeExpense]?

    private var ledgerId: String?
    private var window: MonthWindow?

    /// Seeds the payload directly — the screenshot harness renders real
    /// figures without a backend; production callers start empty and load.
    init(days: [DayIncomeExpense]? = nil) {
        self.days = days
    }

    func load(ledgerId: String) async {
        let window = RangeTotalsMath.window(for: .now, calendar: .current)
        if self.ledgerId != ledgerId {
            days = nil
        }
        self.ledgerId = ledgerId
        self.window = window
        let path = StatsStore.dailySummaryPath(ledgerId: ledgerId, window: window, filters: nil)
        do {
            let response: DailySummaryResponse = try await APIClient.shared.request("GET", path)
            // Both aim fields gate the publish: a ledger switch aimed at
            // the identical year window must drop the old ledger's
            // in-flight response, not just a re-aimed window.
            guard self.ledgerId == ledgerId, self.window == window else { return }
            days = response.days
        } catch {
            // Keep the previous payload; the next reload retries.
        }
    }
}

/// The today/week/year income+expense pairs behind the card's rows, and
/// the windows the card fetches and drills with — pure and
/// calendar-injectable for tests. Weeks follow the calendar's own
/// `weekOfYear` interval (the journal week tab's convention); the year
/// splits by the day-key's year prefix, so a year-boundary week's
/// pre-January days count toward the week while staying out of the year.
nonisolated enum RangeTotalsMath {
    /// One period's income and expense pair.
    struct PeriodTotals: Equatable {
        var incomeCents: Int
        var expenseCents: Int
    }

    struct Totals: Equatable {
        var today: PeriodTotals
        var week: PeriodTotals
        var year: PeriodTotals
    }

    /// The three period pairs. `today` keys one exact day; the week keys
    /// its interval's seven days; the year keys every same-year day.
    static func totals(
        days: [DayIncomeExpense], today: Date, calendar: Calendar
    ) -> Totals {
        let todayKey = dayKey(today, calendar: calendar)
        let weekKeys: Set<String> = {
            guard let week = calendar.dateInterval(of: .weekOfYear, for: today) else { return [] }
            return Set((0..<7).compactMap {
                calendar.date(byAdding: .day, value: $0, to: week.start)
            }.map { dayKey($0, calendar: calendar) })
        }()
        let yearPrefix = "\(calendar.component(.year, from: today))-"
        var totals = Totals(
            today: PeriodTotals(incomeCents: 0, expenseCents: 0),
            week: PeriodTotals(incomeCents: 0, expenseCents: 0),
            year: PeriodTotals(incomeCents: 0, expenseCents: 0)
        )
        func add(_ period: inout PeriodTotals, _ day: DayIncomeExpense) {
            period.incomeCents += day.incomeCents
            period.expenseCents += day.expenseCents
        }
        for day in days {
            if day.day == todayKey { add(&totals.today, day) }
            if weekKeys.contains(day.day) { add(&totals.week, day) }
            if day.day.hasPrefix(yearPrefix) { add(&totals.year, day) }
        }
        return totals
    }

    /// The fetch window: the current year — widened back to the week's
    /// start when the year-boundary week reaches into the old year, so
    /// the week figure sums whole.
    static func window(for today: Date, calendar: Calendar) -> MonthWindow {
        let year = calendar.component(.year, from: today)
        let yearWindow = AppDates.yearWindow(year)
        guard let week = calendar.dateInterval(of: .weekOfYear, for: today),
              week.start < yearWindow.from
        else { return yearWindow }
        return MonthWindow(from: week.start, to: yearWindow.to)
    }

    /// The full current week — the week row's drill window, the same
    /// shape the journal's week tab renders.
    static func weekWindow(for today: Date, calendar: Calendar) -> MonthWindow? {
        guard let week = calendar.dateInterval(of: .weekOfYear, for: today) else { return nil }
        return MonthWindow(from: week.start, to: week.end.addingTimeInterval(-1))
    }

    /// The year row's drill window — the PLAIN year, never the fetch
    /// window's week-start widening: the row's total counts same-year
    /// days only, and a plain year window titles "2027年" instead of
    /// from–to.
    static func yearWindow(for today: Date, calendar: Calendar) -> MonthWindow {
        AppDates.yearWindow(calendar.component(.year, from: today))
    }

    /// A bucket's "yyyy-MM-dd" LOCAL day key, built from the passed
    /// calendar's components — the same shape the server buckets under
    /// the request's tz offset (own copy: the shared builders key off
    /// Calendar.current, and the math must stay calendar-injectable).
    private static func dayKey(_ date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0, components.month ?? 0, components.day ?? 0
        )
    }
}
