//
//  MonthCalendarCard.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/18.
//

import SwiftUI

/// The dashboard's month calendar card: the selected month as a
/// Monday-first grid where every day carries its 农历 label — a festival
/// name when the day is one, the lunar month's name on a lunar month's
/// first day (八月), otherwise the lunar day's short glyph (廿一). Every
/// cell is the same fixed three-line skeleton — day number, expense line,
/// income line — so amounts align across the grid: a day with activity
/// always renders both lines, zeros as −0/+0 (the reference layout), and
/// a quiet day puts its lunar label in the expense slot, leaving the
/// income slot blank. The data is the daily-summary report at the
/// `members` share mode, the same fetch the trend card charts. Today's
/// number sits on an accent dot; adjacent-month filler days render
/// dimmed, lunar label only, and tapping an in-month day pushes that
/// day's journal.
struct MonthCalendarCard: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    /// The selected month's per-day totals, keyed by the daily-summary's
    /// "yyyy-MM-dd" LOCAL day string. Days absent from it simply have no
    /// activity.
    let days: [DayIncomeExpense]
    /// The month the grid renders — the dashboard header's selected month,
    /// NOT anything echoed from the payload. Keep-previous can briefly pair
    /// a stepped month's grid with the previous payload; the day-key lookup
    /// then just finds no amounts until the reload lands.
    let month: YearMonth
    /// Threaded locale — the weekday row must follow the in-app language
    /// override, not the device language.
    let locale: Locale

    /// A tapped in-month day drills into that day's journal (the pushed
    /// day page). nil keeps the cells inert — the screenshot harness.
    var onSelectDay: ((Date) -> Void)? = nil

    /// One amount line's reserved height — the caption2 text lives in a
    /// fixed slot so every cell is the same three-line skeleton (day
    /// number, expense line, income line) and lines align across the grid.
    @ScaledMetric(relativeTo: .caption2) private var amountSlotHeight: CGFloat = 14

    /// The reference layout runs Monday-first: the locale's Sunday-led
    /// standalone symbols rotate one position so 周一…周日 / Mon…Sun lead.
    private var weekdaySymbols: [String] {
        let formatter = DateFormatter()
        formatter.locale = locale
        guard let symbols = formatter.shortStandaloneWeekdaySymbols, symbols.count == 7 else { return [] }
        return Array(symbols[1...6] + [symbols[0]])
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            LazyVGrid(columns: Self.gridColumns, spacing: 4) {
                ForEach(weekdaySymbols, id: \.self) { symbol in
                    Text(symbol)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
                let totals = Dictionary(days.map { ($0.day, $0) }, uniquingKeysWith: { first, _ in first })
                ForEach(MonthGrid.days(monthStart: month.start)) { day in
                    if day.isInMonth, let onSelectDay {
                        // In-month days drill into that day's journal via
                        // the shared tap-target (content shape + tap, no
                        // Button — the List row above would fire twice);
                        // the adjacent-month fillers stay inert.
                        dayCell(day, totals: totals)
                            .statTapTarget { onSelectDay(day.date) }
                            .accessibilityHint(Text(L10n.string(
                                "dashboard.calendarCard.dayHint",
                                defaultValue: "Open this day's entries"
                            )))
                    } else {
                        dayCell(day, totals: totals)
                    }
                }
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

    private var header: some View {
        HStack(spacing: 12) {
            ChartCardBadge(systemName: "calendar")
            Text(L10n.string("dashboard.calendarCard.title", defaultValue: "Calendar"))
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
            Spacer(minLength: 8)
        }
    }

    @ViewBuilder
    private func dayCell(_ day: MonthGrid.Day, totals: [String: DayIncomeExpense]) -> some View {
        let isToday = Calendar.current.isDateInToday(day.date)
        let dayTotals = day.isInMonth ? totals[Self.dayKey(day.date)] : nil
        VStack(spacing: 1) {
            // Today's number rides the accent dot in white; otherwise the
            // number is plain (tertiary in the filler rows).
            Text(Self.dayNumberFormatter.string(from: day.date))
                .font(.footnote.weight(.semibold).monospacedDigit())
                .foregroundStyle(
                    isToday ? AnyShapeStyle(Color.white)
                        : day.isInMonth ? AnyShapeStyle(Color.primary) : AnyShapeStyle(.tertiary)
                )
                .frame(width: 22, height: 22)
                .background {
                    if isToday {
                        Circle().fill(Color.accentColor)
                    }
                }
            // Two FIXED slots on every cell — expense leads, income trails,
            // same slot heights everywhere — so the grid's lines align
            // regardless of which days carry amounts. A day with activity
            // renders both lines, zeros as −0/+0 (the reference layout); a
            // quiet day puts its lunar label in the expense slot and leaves
            // the income slot blank.
            Group {
                if let dayTotals {
                    amountText(dayTotals.expenseCents, positive: false)
                } else {
                    Text(LunarDayLabel.label(for: day.date))
                        .font(.caption2)
                        .foregroundStyle(day.isInMonth ? AnyShapeStyle(.secondary) : AnyShapeStyle(.tertiary))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
            .frame(height: amountSlotHeight)
            Group {
                if let dayTotals {
                    amountText(dayTotals.incomeCents, positive: true)
                } else {
                    // A real view, not a bare conditional — an empty branch
                    // collapses the slot and shrinks the whole cell below
                    // the with-data height.
                    Color.clear
                }
            }
            .frame(height: amountSlotHeight)
        }
        .padding(.vertical, 3)
        .frame(maxWidth: .infinity)
        .background {
            if day.isInMonth {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.primary.opacity(0.05))
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Both amount lines build through here — one style, so the expense
    /// and income rows are typographically identical. Zeros render as the
    /// signed placeholder (−0/+0) to keep the fixed slots populated, and
    /// the value goes through abs() per the hand-signed-amount rule (a
    /// refund-heavy day can net a server total negative). Amounts only
    /// ever render for in-month days, so there is no dim variant.
    private func amountText(_ cents: Int, positive: Bool) -> some View {
        Text(verbatim: "\(positive ? "+" : "−")\(Self.amount(abs(cents), locale: locale))")
            .font(.caption2.weight(.medium).monospacedDigit())
            .foregroundStyle(positive ? AnyShapeStyle(Color.income) : AnyShapeStyle(Color.expense))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }

    private static let gridColumns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    /// The cell's daily-summary key for a grid day — built from the LOCAL
    /// calendar components (the server buckets under the request's tz
    /// offset), never by re-parsing anything into a UTC instant.
    private static func dayKey(_ date: Date) -> String {
        let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0, components.month ?? 0, components.day ?? 0
        )
    }

    private static let dayNumberFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "d"
        return formatter
    }()

    /// Cell amounts drop the currency symbol (a ~44pt column can't carry
    /// "¥1,234.56"): whole values render plain, five figures collapse to a
    /// compact magnitude ("1.2万" / "12.3K") — the exact figure lives in
    /// the stat card above and the journal below.
    nonisolated static func amount(_ cents: Int, locale: Locale) -> String {
        let value = Double(cents) / 100
        let number = value.magnitude >= 10_000
            ? value.formatted(.number.notation(.compactName).precision(.fractionLength(0...1)).locale(locale))
            : value.formatted(.number.grouping(.never).precision(.fractionLength(0...1)).locale(locale))
        return number
    }
}

/// The month grid's day list: consecutive days cut Monday-first — leading
/// filler from the previous month, trailing filler from the next, so every
/// row holds seven cells and a month that fits in four (or five) weeks
/// renders that many rows. Pure and calendar-injectable for tests.
nonisolated enum MonthGrid {
    struct Day: Identifiable, Equatable {
        let date: Date
        let isInMonth: Bool

        var id: Date { date }
    }

    static func days(monthStart: Date, calendar: Calendar = .current) -> [Day] {
        guard let monthInterval = calendar.dateInterval(of: .month, for: monthStart),
              let dayCount = calendar.range(of: .day, in: .month, for: monthStart)?.count
        else { return [] }
        // Weekday 1 = Sunday … 7 = Saturday; rotating to Monday-first
        // gives Monday 0 blanks through Sunday 6.
        let leadingBlanks = (calendar.component(.weekday, from: monthInterval.start) + 5) % 7
        let cellCount = ((leadingBlanks + dayCount + 6) / 7) * 7
        return (0..<cellCount).map { index in
            Day(
                date: calendar.date(byAdding: .day, value: index - leadingBlanks, to: monthInterval.start)
                    ?? monthInterval.start,
                isInMonth: index >= leadingBlanks && index < leadingBlanks + dayCount
            )
        }
    }
}

/// One Gregorian day's sub-label for the calendar grid — festival name
/// first (solar-date festivals, then lunar-date ones; a leap lunar month
/// never carries a lunar festival), then the 除夕 probe (the lunar year's
/// last day, which a fixed table can't hold), the lunar month's name on a
/// lunar month's first day, and finally the lunar day's short glyph. The
/// day/month glyphs are Chinese calendar notation and don't localize;
/// festival names resolve through the catalog like every other copy.
nonisolated enum LunarDayLabel {
    /// The festival's catalog key for a day, when the day is one — split
    /// from `label(for:)` so tests can pin the mapping without asserting
    /// localized strings.
    static func festivalKey(for date: Date, gregorian: Calendar = .current) -> String? {
        var chinese = Calendar(identifier: .chinese)
        chinese.timeZone = gregorian.timeZone
        let solar = gregorian.dateComponents([.month, .day], from: date)
        if let month = solar.month, let day = solar.day,
           let key = solarFestivals[month]?[day] {
            return key
        }
        let lunar = chinese.dateComponents([.month, .day], from: date)
        let isLeap = lunar.isLeapMonth ?? false
        if !isLeap,
           let month = lunar.month, let day = lunar.day,
           let key = lunarFestivals[month]?[day] {
            return key
        }
        if !isLeap, lunar.month == 12, isNewYearsEve(date, chinese: chinese) {
            return "dashboard.calendarCard.festival.newYearsEve"
        }
        return nil
    }

    static func label(for date: Date, gregorian: Calendar = .current) -> String {
        if let key = festivalKey(for: date, gregorian: gregorian) {
            return L10n.string(key, defaultValue: festivalDefaults[key] ?? key)
        }
        var chinese = Calendar(identifier: .chinese)
        chinese.timeZone = gregorian.timeZone
        let lunar = chinese.dateComponents([.month, .day], from: date)
        guard let month = lunar.month, let day = lunar.day, (1...12).contains(month), (1...30).contains(day)
        else { return "" }
        if day == 1 {
            return ((lunar.isLeapMonth ?? false) ? "闰" : "") + monthNames[month - 1]
        }
        return dayNames[day - 1]
    }

    /// 除夕 = the lunar year's last day — the day before a (non-leap)
    /// 正月初一, so it lands on 腊月三十 or 腊月廿九 depending on the year.
    private static func isNewYearsEve(_ date: Date, chinese: Calendar) -> Bool {
        guard let nextDay = chinese.date(byAdding: .day, value: 1, to: date) else { return false }
        let next = chinese.dateComponents([.month, .day], from: nextDay)
        return next.month == 1 && next.day == 1 && !(next.isLeapMonth ?? false)
    }

    static let dayNames = [
        "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
        "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
        "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
    ]

    static let monthNames = [
        "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月",
    ]

    /// Gregorian month → day → catalog key.
    static let solarFestivals: [Int: [Int: String]] = [
        1: [1: "dashboard.calendarCard.festival.newYear"],
        2: [14: "dashboard.calendarCard.festival.valentines"],
        3: [8: "dashboard.calendarCard.festival.womens"],
        5: [1: "dashboard.calendarCard.festival.labour"],
        6: [1: "dashboard.calendarCard.festival.children"],
        9: [10: "dashboard.calendarCard.festival.teachers"],
        10: [1: "dashboard.calendarCard.festival.national"],
        12: [
            24: "dashboard.calendarCard.festival.christmasEve",
            25: "dashboard.calendarCard.festival.christmas",
        ],
    ]

    /// Lunar month → day → catalog key (正月 = 1; leap months skip).
    static let lunarFestivals: [Int: [Int: String]] = [
        1: [
            1: "dashboard.calendarCard.festival.springFestival",
            15: "dashboard.calendarCard.festival.lanternFestival",
        ],
        2: [2: "dashboard.calendarCard.festival.dragonHeadraise"],
        5: [5: "dashboard.calendarCard.festival.dragonBoat"],
        7: [7: "dashboard.calendarCard.festival.qixi"],
        8: [15: "dashboard.calendarCard.festival.midAutumn"],
        9: [9: "dashboard.calendarCard.festival.doubleNinth"],
        12: [8: "dashboard.calendarCard.festival.laba"],
    ]

    /// The catalog defaults mirror the zh values — L10n.string resolves
    /// the real translation; this only keeps the fallback honest.
    static let festivalDefaults: [String: String] = [
        "dashboard.calendarCard.festival.newYear": "元旦",
        "dashboard.calendarCard.festival.valentines": "情人节",
        "dashboard.calendarCard.festival.womens": "妇女节",
        "dashboard.calendarCard.festival.labour": "劳动节",
        "dashboard.calendarCard.festival.children": "儿童节",
        "dashboard.calendarCard.festival.teachers": "教师节",
        "dashboard.calendarCard.festival.national": "国庆节",
        "dashboard.calendarCard.festival.christmasEve": "平安夜",
        "dashboard.calendarCard.festival.christmas": "圣诞节",
        "dashboard.calendarCard.festival.springFestival": "春节",
        "dashboard.calendarCard.festival.lanternFestival": "元宵节",
        "dashboard.calendarCard.festival.dragonHeadraise": "龙抬头",
        "dashboard.calendarCard.festival.dragonBoat": "端午节",
        "dashboard.calendarCard.festival.qixi": "七夕",
        "dashboard.calendarCard.festival.midAutumn": "中秋节",
        "dashboard.calendarCard.festival.doubleNinth": "重阳节",
        "dashboard.calendarCard.festival.laba": "腊八节",
        "dashboard.calendarCard.festival.newYearsEve": "除夕",
    ]
}
