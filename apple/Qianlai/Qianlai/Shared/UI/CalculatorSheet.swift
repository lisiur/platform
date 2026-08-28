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
/// completes it. A pure value type, so the sheet owns it as `@State`.
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

    /// "12 +" rendered above the entry while an operation is pending.
    var hint: String? {
        guard let accumulator, let pending else { return nil }
        return "\(Self.format(accumulator)) \(pending.symbol)"
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

    /// Immediate: turns the entry into its hundredth (`15` → `0.15`) and
    /// completes the term — the next digit starts a fresh number.
    mutating func inputPercent() {
        guard !isError else { return }
        entry = Self.format((Double(entry) ?? 0) / 100)
        startsNewEntry = true
        hasEnteredOperand = true
    }

    mutating func inputBackspace() {
        guard !isError else { return }
        if entry.count > 1 {
            entry.removeLast()
        } else {
            entry = "0"
        }
        startsNewEntry = false
        hasEnteredOperand = true
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

/// Amount calculator pad: a hand-held editor (digits, `+ − × ÷`, `%`,
/// backspace, paste) with the current entry as the big display. Shared by
/// entry forms — embedded inline in quick entry, or hosted by
/// `CalculatorSheet`. The confirmation button commits `engine.entry` —
/// always plain dot-decimal text — back to the caller.
struct CalculatorPad: View {
    private let showsCommitButton: Bool
    private let onCommit: (String) -> Void

    @State private var engine: CalculatorEngine
    /// Entry size when the hint line is idle — bigger than `.largeTitle`
    /// so a lone amount gets the headline treatment, while still tracking
    /// the user's Dynamic Type setting.
    @ScaledMetric(relativeTo: .largeTitle) private var soloEntrySize = 56
    /// Total display-box height, sized for the two-line state (hint +
    /// 56pt entry + padding); scales with Dynamic Type like the fonts do.
    @ScaledMetric(relativeTo: .largeTitle) private var displayHeight = 56

    init(
        initialAmount: String = "",
        showsCommitButton: Bool = true,
        onCommit: @escaping (String) -> Void
    ) {
        self.showsCommitButton = showsCommitButton
        self.onCommit = onCommit
        _engine = State(initialValue: CalculatorEngine(initialText: initialAmount))
    }

    var body: some View {
        VStack(spacing: 14) {
            display
            pad
            if showsCommitButton {
                Button {
                    onCommit(engine.entry)
                } label: {
                    Text("Use Amount")
                        .font(.body.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 36)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.regular)
                .disabled(engine.isError)
            }
        }
    }

    private var errorText: String? {
        engine.isError ? L10n.string("calculator.error", defaultValue: "Error") : nil
    }

    /// A lone amount renders larger; once the hint line shares the display
    /// the entry drops back to `.largeTitle` so both lines fit.
    private var entryFont: Font {
        engine.hint == nil
            ? .system(size: soloEntrySize, weight: .semibold, design: .rounded)
            : .system(.largeTitle, design: .rounded, weight: .semibold)
    }

    private var display: some View {
        VStack(alignment: .trailing, spacing: 4) {
            // Always laid out at full opacity-zero when idle so the display
            // keeps a fixed height and the pad never jumps when the hint
            // ("12 +") appears.
            Text(engine.hint ?? " ")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .opacity(engine.hint == nil ? 0 : 1)
            Text(errorText ?? engine.entry)
                .font(entryFont.monospacedDigit())
                .foregroundStyle(engine.isError ? AnyShapeStyle(.red) : AnyShapeStyle(.primary))
                .lineLimit(1)
                .minimumScaleFactor(0.4)
        }
        // Hard-fixed total height: the single-line state (big entry) and
        // the two-line state (hint + entry) occupy identical space, so the
        // pad below never shifts. Bottom-aligned so digits hug the pad.
        .frame(height: displayHeight, alignment: .bottom)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.primary.opacity(0.05))
        )
    }

    private var pad: some View {
        Grid(horizontalSpacing: 10, verticalSpacing: 10) {
            GridRow {
                key("AC", role: .clear) { engine.clearAll() }
                key(
                    systemImage: "delete.left",
                    role: .function,
                    accessibilityLabel: "Backspace"
                ) { engine.inputBackspace() }
                key("%", role: .function) { engine.inputPercent() }
                key(.divide) { engine.inputOperation(.divide) }
            }
            GridRow {
                key("7", role: .digit) { engine.inputDigit("7") }
                key("8", role: .digit) { engine.inputDigit("8") }
                key("9", role: .digit) { engine.inputDigit("9") }
                key(.multiply) { engine.inputOperation(.multiply) }
            }
            GridRow {
                key("4", role: .digit) { engine.inputDigit("4") }
                key("5", role: .digit) { engine.inputDigit("5") }
                key("6", role: .digit) { engine.inputDigit("6") }
                key(.subtract) { engine.inputOperation(.subtract) }
            }
            GridRow {
                key("1", role: .digit) { engine.inputDigit("1") }
                key("2", role: .digit) { engine.inputDigit("2") }
                key("3", role: .digit) { engine.inputDigit("3") }
                key(.add) { engine.inputOperation(.add) }
            }
            GridRow {
                key(
                    systemImage: "doc.on.clipboard",
                    role: .function,
                    accessibilityLabel: "Paste"
                ) { pasteFromClipboard() }
                key("0", role: .digit) { engine.inputDigit("0") }
                key(".", role: .digit) { engine.inputDecimal() }
                key("=", role: .equals) { engine.inputEquals() }
            }
        }
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
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(.title2, design: .rounded, weight: .semibold))
                .foregroundStyle(role.foreground)
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(
                    role.background,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func key(
        systemImage: String,
        role: KeyRole,
        accessibilityLabel: LocalizedStringKey,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title3.weight(.medium))
                .foregroundStyle(role.foreground)
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(
                    role.background,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(accessibilityLabel))
    }

    /// Clipboard read is deliberately deferred to the tap — sampling it
    /// during render would trip the iOS paste-permission prompt. Junk on the
    /// clipboard is a silent no-op; the engine keeps its current entry.
    private func pasteFromClipboard() {
        guard let text = Clipboard.text?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !text.isEmpty
        else { return }
        engine.pasteEntry(text)
    }

    private enum KeyRole {
        case clear, function, digit, operation, equals

        var foreground: Color {
            switch self {
            case .clear: .red
            case .equals: .white
            case .operation: .accentColor
            case .function, .digit: .primary
            }
        }

        var background: Color {
            switch self {
            case .clear: .red.opacity(0.14)
            case .equals: .accentColor
            case .operation: .accentColor.opacity(0.14)
            case .function: .primary.opacity(0.08)
            case .digit: .primary.opacity(0.05)
            }
        }
    }
}

/// The pad hosted in a sheet with calculator chrome: medium detent by
/// default, `.large` escape hatch, Cancel backs out without committing.
struct CalculatorSheet: View {
    private let initialAmount: String
    private let onCommit: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    init(initialAmount: String, onCommit: @escaping (String) -> Void) {
        self.initialAmount = initialAmount
        self.onCommit = onCommit
    }

    var body: some View {
        NavigationStack {
            CalculatorPad(initialAmount: initialAmount) {
                onCommit($0)
                dismiss()
            }
            .padding(14)
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
            .navigationTitle(Text("Calculator"))
            .inlineNavigationBarTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        #if os(iOS)
        // Sized to the display, the five key rows, and the commit button —
        // the pad no longer fits a `.medium` detent. `.large` stays as the
        // escape hatch for Dynamic Type growth on small devices.
        .presentationDetents([.height(500), .large])
        #endif
    }
}
