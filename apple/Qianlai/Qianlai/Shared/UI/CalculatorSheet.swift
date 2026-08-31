//
//  CalculatorSheet.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/28.
//

import SwiftUI

/// Immediate-execution four-function calculator engine behind
/// `CalculatorSheet`: digits accumulate in `entry`; an operator snapshots
/// the entry into `accumulator` (folding any pending pair first) and `=`
/// completes it. A pure value type, so the entry form owns it as `@State`
/// and hands it to the keypad sheet by binding.
struct CalculatorEngine {
    enum Operation {
        case add, subtract, multiply, divide

        var symbol: String {
            switch self {
            case .add: "+"
            case .subtract: "−"
            case .multiply: "×"
            case .divide: "÷"
            }
        }

        func apply(_ lhs: Double, _ rhs: Double) -> Double {
            switch self {
            case .add: lhs + rhs
            case .subtract: lhs - rhs
            case .multiply: lhs * rhs
            case .divide: lhs / rhs
            }
        }
    }

    /// The number under construction, plain dot-decimal text.
    private(set) var entry = "0"
    private(set) var accumulator: Double?
    private(set) var pending: Operation?
    /// Set after an operator, `=` or clear: the next digit replaces `entry`
    /// instead of appending to it.
    private(set) var startsNewEntry = true
    /// Separate from `startsNewEntry`: true while the current entry is a
    /// deliberately entered operand (typed or pasted). `%` completes a term —
    /// the next digit starts fresh — yet a following operator still folds the
    /// percented value (`2 + 50 % +` → `2.5 +`).
    private(set) var hasEnteredOperand = false
    private(set) var isError = false

    /// Seeds the entry from an already-typed amount so it can be adjusted
    /// rather than retyped; unparseable text (blank) starts at zero.
    init(initialText: String = "") {
        if let value = Double(initialText.replacingOccurrences(of: ",", with: ".")) {
            entry = Self.format(value)
        }
    }

    /// The formula so far, rendered above the live total: `3 +` before the
    /// next operand starts, then `3 + 1` as it is typed. Cleared by `=`,
    /// which commits the fold into the entry.
    var hint: String? {
        guard let accumulator, let pending else { return nil }
        if startsNewEntry, !hasEnteredOperand {
            return "\(Self.format(accumulator)) \(pending.symbol)"
        }
        return "\(Self.format(accumulator)) \(pending.symbol) \(entry)"
    }

    /// What the display shows: while an operation is pending it previews
    /// the fold live — `1 + 2` reads `3` before `=` is pressed, and keeps
    /// updating as the entry grows (`23` reads `24`). Before the next
    /// operand starts (`1 +`) the running total shows. `nil` marks an
    /// unusable state — an error, or a non-finite preview like `1 ÷ 0` —
    /// for callers to render as error text.
    var displayValue: String? {
        guard !isError else { return nil }
        guard let accumulator, let pending else { return entry }
        if startsNewEntry, !hasEnteredOperand {
            return Self.format(accumulator)
        }
        let result = pending.apply(accumulator, Double(entry) ?? 0)
        return result.isFinite ? Self.format(result) : nil
    }

    mutating func inputDigit(_ digit: String) {
        guard !isError else { return }
        if startsNewEntry || entry == "0" {
            entry = digit
            startsNewEntry = false
        } else if entry.count < 12 {
            entry += digit
        }
        hasEnteredOperand = true
    }

    mutating func inputDecimal() {
        guard !isError else { return }
        if startsNewEntry {
            entry = "0."
            startsNewEntry = false
        } else if !entry.contains(".") {
            entry += "."
        }
        hasEnteredOperand = true
    }

    /// Chained operations fold left-to-right — `2 + 3 ×` computes `5 ×`
    /// first, matching a hand-held calculator.
    mutating func inputOperation(_ operation: Operation) {
        guard !isError else { return }
        let current = Double(entry) ?? 0
        if let pendingOperation = pending, let storedAccumulator = accumulator, hasEnteredOperand {
            let result = pendingOperation.apply(storedAccumulator, current)
            guard result.isFinite else {
                fail()
                return
            }
            accumulator = result
            entry = Self.format(result)
        } else {
            accumulator = current
        }
        pending = operation
        startsNewEntry = true
        hasEnteredOperand = false
    }

    mutating func inputEquals() {
        guard !isError, let pendingOperation = pending, let storedAccumulator = accumulator else { return }
        let result = pendingOperation.apply(storedAccumulator, Double(entry) ?? 0)
        guard result.isFinite else {
            fail()
            return
        }
        entry = Self.format(result)
        accumulator = nil
        pending = nil
        startsNewEntry = true
        hasEnteredOperand = false
    }

    /// Folds any pending operation into the entry without needing `=`;
    /// a no-op when nothing is pending or the next operand hasn't started
    /// (`14 +` keeps `14` and stays pending). The sheet calls this on
    /// dismissal so the total the display previewed is what the form keeps.
    mutating func commitPending() {
        guard pending != nil, hasEnteredOperand else { return }
        inputEquals()
    }

    /// Immediate: turns the entry into its hundredth (`15` → `0.15`) and
    /// completes the term — the next digit starts a fresh number.
    mutating func inputPercent() {
        guard !isError else { return }
        entry = Self.format((Double(entry) ?? 0) / 100)
        startsNewEntry = true
        hasEnteredOperand = true
    }

    /// Tiered deletion while an operation is pending: first it trims the
    /// operand (`14 + 58` → `14 + 5`), then — once nothing is left to
    /// trim — drops just the operand (`14 + 5` → `14 +`, entry back to the
    /// running total), then drops the whole pending operation (`14 +` →
    /// plain `14`, first line empty). With nothing pending it edits the
    /// entry directly (`14` → `1`).
    mutating func inputBackspace() {
        guard !isError else { return }
        if let storedAccumulator = accumulator, pending != nil {
            if startsNewEntry, !hasEnteredOperand {
                entry = Self.format(storedAccumulator)
                accumulator = nil
                pending = nil
                startsNewEntry = true
                hasEnteredOperand = false
            } else if entry.count > 1 {
                entry.removeLast()
                startsNewEntry = false
                hasEnteredOperand = true
            } else {
                entry = Self.format(storedAccumulator)
                startsNewEntry = true
                hasEnteredOperand = false
            }
        } else {
            if entry.count > 1 {
                entry.removeLast()
            } else {
                entry = "0"
            }
            startsNewEntry = false
            hasEnteredOperand = true
        }
    }

    /// Replaces the entry with clipboard text; junk (blank or non-numeric)
    /// is ignored so the pad keeps its current value. Comma is accepted as a
    /// decimal separator. Any pending operation is kept — the pasted number
    /// becomes the active operand (`2 +` paste `50` `=` → `52`).
    mutating func pasteEntry(_ text: String) {
        guard !isError else { return }
        let normalized = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")
        guard let value = Double(normalized), value.isFinite else { return }
        entry = Self.format(value)
        startsNewEntry = false
        hasEnteredOperand = true
    }

    /// AC: also the only way out of the error state.
    mutating func clearAll() {
        self = CalculatorEngine()
    }

    private mutating func fail() {
        entry = ""
        accumulator = nil
        pending = nil
        isError = true
    }

    /// Machine-readable dot-decimal text — the committed string feeds
    /// `Double.init` downstream, so no grouping separators. Rounded to six
    /// fraction digits to drop binary noise (`0.1 + 0.2`) before trimming
    /// trailing zeros.
    static func format(_ value: Double) -> String {
        let rounded = (value * 1_000_000).rounded() / 1_000_000
        guard rounded.isFinite else { return "0" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 6
        formatter.usesGroupingSeparator = false
        formatter.decimalSeparator = "."
        return formatter.string(from: NSNumber(value: rounded)) ?? "0"
    }
}

/// The calculator's screen: pending-operation formula above the big live
/// total (or error text) — no background chrome, the host row supplies the
/// look. Both lines carry fixed heights so the layout never shifts when the
/// formula appears. Split from the pad so a form can embed just the display —
/// quick entry uses it as its amount field — while `CalculatorPad`
/// supplies the keys.
struct CalculatorDisplay: View {
    let engine: CalculatorEngine

    /// ISO currency code whose symbol leads the amount ("¥24"); nil or
    /// empty renders the bare number, matching `Money.format`'s rule for
    /// surfaces without a single ledger currency.
    var currency: String?

    var body: some View {
        display
    }

    private var errorText: String? {
        engine.displayValue == nil
            ? L10n.string("calculator.error", defaultValue: "Error") : nil
    }

    private var display: some View {
        VStack(alignment: .trailing, spacing: 4) {
            // Always laid out at opacity zero when idle so the display
            // keeps a fixed height and the layout never jumps when the
            // formula ("3 + 1") appears.
            Text(engine.hint ?? " ")
                .font(.system(size: 11).monospacedDigit())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(height: 12)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .opacity(engine.hint == nil ? 0 : 1)
            amountLine
                .foregroundStyle(errorText == nil ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.red))
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .frame(height: 45)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        // Hit-test the whole rectangle, not just the glyphs — the display
        // doubles as the form's tappable amount field, so a tap anywhere
        // in the row opens the keypad.
        .contentShape(Rectangle())
    }

    /// The big line — the currency symbol leading the live total in the
    /// accent color at a slightly smaller size, or the error word. Built
    /// as a `Text` concatenation so the symbol can be styled independently
    /// while sharing scale/shrink behavior with the number.
    private var amountLine: Text {
        if let errorText {
            return Text(errorText)
                .font(.system(size: 36, weight: .semibold, design: .rounded))
        }
        let number = Text(engine.displayValue ?? "")
            .font(.system(size: 36, weight: .semibold, design: .rounded).monospacedDigit())
        guard let currency, !currency.isEmpty else { return number }
        return Text(Money.symbol(for: currency))
            .font(.system(size: 32, weight: .semibold, design: .rounded).monospacedDigit()) + number
    }
}

/// Amount calculator keypad: digits, `+ −`, backspace, and a check key
/// that closes the host — buttons only, no display. The presenting form
/// owns the engine and shows `CalculatorDisplay`; the pad mutates the
/// shared engine through the binding, so edits land in the form live.
/// Hosted by `CalculatorSheet`.
struct CalculatorPad: View {
    @Binding var engine: CalculatorEngine

    /// Check key: closes the hosting sheet. The pending operation settles
    /// through the sheet's `onDisappear`, so what the live display showed
    /// is what the form keeps.
    let onClose: () -> Void

    var body: some View {
        pad
    }

    /// Column-major (four equal-width columns) so the check key can fill
    /// two key rows — `Grid` cannot span rows vertically. HStack splits
    /// the width evenly across the four flexible columns, and matching key
    /// heights keep the rows aligned: it is exactly `2 × 46 + 10` tall.
    private var pad: some View {
        HStack(spacing: 10) {
            padColumn {
                key("7", role: .digit) { engine.inputDigit("7") }
                key("4", role: .digit) { engine.inputDigit("4") }
                key("1", role: .digit) { engine.inputDigit("1") }
                key(".", role: .digit) { engine.inputDecimal() }
            }
            padColumn {
                key("8", role: .digit) { engine.inputDigit("8") }
                key("5", role: .digit) { engine.inputDigit("5") }
                key("2", role: .digit) { engine.inputDigit("2") }
                key("0", role: .digit) { engine.inputDigit("0") }
            }
            padColumn {
                key("9", role: .digit) { engine.inputDigit("9") }
                key("6", role: .digit) { engine.inputDigit("6") }
                key("3", role: .digit) { engine.inputDigit("3") }
                key(
                    systemImage: "delete.left",
                    role: .function,
                    accessibilityLabel: "Backspace"
                ) { engine.inputBackspace() }
            }
            padColumn {
                key(.subtract) { engine.inputOperation(.subtract) }
                key(.add) { engine.inputOperation(.add) }
                key(
                    systemImage: "checkmark",
                    role: .commit,
                    height: 46 * 2 + 10,
                    accessibilityLabel: "Done"
                ) { onClose() }
            }
        }
    }

    private func padColumn(@ViewBuilder content: () -> some View) -> some View {
        VStack(spacing: 10) { content() }
    }

    private func key(
        _ operation: CalculatorEngine.Operation,
        action: @escaping () -> Void
    ) -> some View {
        key(operation.symbol, role: .operation, action: action)
    }

    private func key(
        _ label: String,
        role: KeyRole,
        height: CGFloat = 46,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(.title2, design: .rounded, weight: .semibold))
                .foregroundStyle(role.foreground)
                .frame(maxWidth: .infinity, minHeight: height)
                .background(
                    role.background,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(KeyPressStyle())
    }

    private func key(
        systemImage: String,
        role: KeyRole,
        height: CGFloat = 46,
        accessibilityLabel: LocalizedStringKey,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title3.weight(.medium))
                .foregroundStyle(role.foreground)
                .frame(maxWidth: .infinity, minHeight: height)
                .background(
                    role.background,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(KeyPressStyle())
        .accessibilityLabel(Text(accessibilityLabel))
    }

    private enum KeyRole {
        case function, digit, operation, commit

        var foreground: Color {
            switch self {
            case .commit: .white
            case .operation: .accentColor
            case .function, .digit: .primary
            }
        }

        var background: Color {
            switch self {
            case .commit: .accentColor
            case .operation: .accentColor.opacity(0.14)
            case .function: .primary.opacity(0.08)
            case .digit: .primary.opacity(0.05)
            }
        }
    }
}

/// Keypad touch feedback: the key shrinks while pressed and springs back
/// on release.
private struct KeyPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/// The keypad hosted in a bare sheet: the display stays in the presenting
/// form, so the sheet is keys only. Keys mutate the shared engine live —
/// the form's display reflects every tap — and the check key (or
/// swipe-to-dismiss) closes the sheet: pending operations settle into the
/// entry on the way out.
struct CalculatorSheet: View {
    @Binding var engine: CalculatorEngine

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        CalculatorPad(engine: $engine) { dismiss() }
            .padding(14)
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
            // Settle any pending operation on dismissal so the live total
            // the display previewed (`1 + 2` reading `3`) is what the form
            // keeps.
            .onDisappear { engine.commitPending() }
        #if os(iOS)
        // Fixed height sized to the four key rows — no `.large` detent, so
        // the sheet can't be dragged bigger; only swipe-to-dismiss remains.
        // The drag indicator is hidden to match the non-resizable sheet.
        // Fully opaque background — nothing shows through the sheet.
            .presentationDetents([.height(242)])
            .presentationDragIndicator(.hidden)
            .presentationBackground(Color(uiColor: .systemBackground))
        #endif
    }
}
