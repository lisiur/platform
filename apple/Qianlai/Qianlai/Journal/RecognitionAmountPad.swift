//
//  RecognitionAmountPad.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/22.
//

import SwiftUI

/// The AI-mode amount keypad: the recognized amount and its alternatives as
/// one-tap rows — one option per row, up to four — a manual-edit key
/// falling back to the regular keypad, and the confirm key sitting in the
/// regular calculator's exact ✓ slot (one column wide, two key rows tall,
/// bottom right). The whole pad mirrors the regular keypad's footprint —
/// same 12pt corners, same 8pt gutters, same 216pt key field + 10pt bottom
/// inset — so swapping it in never shifts the sheet's layout.
///
/// ```text
/// ┌───────────────────────────┬──────────┐
/// │ 推荐  ¥42.00              │          │
/// ├───────────────────────────┤ 手动编辑  │ ← 104pt
/// │ ¥42.50                    │          │
/// ├───────────────────────────┼──────────┤
/// │ ¥40.00                    │    ✓     │
/// ├───────────────────────────┤   确认    │ ← 104pt,原 ✓ 键位
/// │ ¥45.00                    │          │
/// └───────────────────────────┴──────────┘
/// 高 4×48+3×8 = 216(+10 底 inset = 226),与原键盘逐像素一致
/// ```
struct RecognitionAmountPad: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings
    @Environment(AccentSettings.self) private var accentSettings
    @Environment(RimSettings.self) private var rimSettings
    @Environment(\.colorScheme) private var colorScheme

    /// The recognition's primary amount, pre-selected; nil renders no
    /// recommended row.
    let recommended: Double?
    /// The recognition's alternative amounts (the model excludes the
    /// primary already; de-duplicated here defensively).
    let alternatives: [Double]
    /// ISO currency code whose symbol leads each amount — the calculator
    /// display's rule.
    let currency: String?
    @Binding var engine: CalculatorEngine
    /// The amount currently loaded into the engine — the highlighted row.
    @Binding var selectedAmount: Double?
    let onConfirm: () -> Void
    /// Dims and inactivates the confirm key while the commit can't run
    /// (posting in flight, form pre-validation, no amount yet).
    var isConfirmDisabled = false
    /// Swaps the confirm glyph for a spinner while posting.
    var isCommitting = false
    /// Falls back to the regular numeric keypad — one-way.
    let onManualEdit: () -> Void

    /// The concrete accent, not `Color.accentColor`: same presentation-time
    /// environment flip the calculator documented.
    private var accent: Color {
        accentSettings.accent.color
    }

    /// The pad reads as four columns of the regular keypad; the amount rows
    /// span three of them and the right column (manual edit / confirm) is
    /// the fourth.
    private static let rowCount = 4
    private static let rowHeight: CGFloat = 48
    /// The manual-edit and confirm keys fill two key rows each — the
    /// regular ✓ key's exact height.
    private static let tallKeyHeight: CGFloat = rowHeight * 2 + 8
    /// The key field's fixed height: four regular rows.
    private static let keyFieldHeight: CGFloat = rowHeight * CGFloat(rowCount) + 8 * CGFloat(rowCount - 1)

    @State private var tapCount = 0

    var body: some View {
        GeometryReader { geo in
            // The right column is one of the pad's four columns, so it
            // stays exactly the regular ✓ key's width regardless of the
            // host's width — the amount rows span the other three.
            let rightColumnWidth = (geo.size.width - 3 * 8) / 4
            HStack(spacing: 8) {
                amountRowsArea
                VStack(spacing: 8) {
                    manualEditKey
                    confirmKey
                }
                .frame(width: rightColumnWidth)
            }
        }
        .frame(height: Self.keyFieldHeight)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
        .sensoryFeedback(.selection, trigger: tapCount)
        // Keep the pad aligned with the form and calculator on wide surfaces.
        .frame(maxWidth: 420)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Amount rows

    /// The engine's text form for an amount — no grouping separator, so
    /// post()'s Double parsing round-trips.
    private func formatted(_ amount: Double) -> String {
        String(format: "%.2f", amount)
    }

    /// Same money value (the model's floats carry display-order noise, so
    /// exact equality is the wrong question).
    private func isSameAmount(_ lhs: Double, _ rhs: Double) -> Bool {
        abs(lhs - rhs) < 0.001
    }

    /// Recommended amount first, then the alternatives — duplicates of the
    /// recommendation dropped, order kept.
    private var amounts: [Double] {
        var result: [Double] = []
        for amount in [recommended].compactMap({ $0 }) + alternatives {
            if !result.contains(where: { isSameAmount($0, amount) }) {
                result.append(amount)
            }
        }
        return result
    }

    /// Recommended amount first, then the alternatives — duplicates of the
    /// recommendation dropped, order kept, at most four rendered (the
    /// recommendation + the first three alternatives); trailing slots stay
    /// empty so the right column's two tall keys never move.
    private var amountRows: [Double?] {
        var keys = Array(amounts.prefix(Self.rowCount)).map(Optional.init)
        keys.append(contentsOf: Array<Double?>(repeating: nil, count: Self.rowCount - keys.count))
        return keys
    }

    private var amountRowsArea: some View {
        VStack(spacing: 8) {
            ForEach(amountRows.indices, id: \.self) { index in
                if let amount = amountRows[index] {
                    amountRowKey(amount, isRecommended: amount == recommended)
                } else {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: Self.rowHeight)
                }
            }
        }
    }

    private func amountRowKey(_ amount: Double, isRecommended: Bool) -> some View {
        let isSelected = selectedAmount.map { isSameAmount($0, amount) } ?? false
        return Button {
            tapCount += 1
            engine = CalculatorEngine(initialText: formatted(amount))
            selectedAmount = amount
        } label: {
            amountText(amount)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .frame(maxWidth: .infinity, minHeight: Self.rowHeight)
                // The 推荐 badge overlays the leading edge instead of
                // sharing the row's width — the amount always lays out
                // across the full key and never shrinks for the badge.
                .overlay(alignment: .leading) {
                    if isRecommended {
                        Text(L10n.string("quick.amount.recommended", defaultValue: "Suggested"))
                            .font(.caption2.weight(.medium))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(
                                Capsule().fill(accent.opacity(backgroundSettings.isActive ? 0.22 : 0.14))
                            )
                            .foregroundStyle(accent)
                            .padding(.leading, 12)
                    }
                }
                .foregroundStyle(isSelected ? accent : .primary)
                // The digit keys' own surface, selected or not — selection
                // reads from the text color alone.
                .background(keySurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    if rimSettings.intensity > 0 { surfaceBorderStroke }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(PadPressStyle())
        .accessibilityLabel(Text(accessibilityLabel(amount, isRecommended: isRecommended)))
    }

    /// The big line — the currency symbol leading the amount, built as one
    /// interpolated `Text` like the calculator display so the symbol and
    /// number share the scale.
    private func amountText(_ amount: Double) -> Text {
        let font = Font.system(.title2, design: .rounded, weight: .semibold).monospacedDigit()
        let number = Text(formatted(amount)).font(font)
        guard let currency, !currency.isEmpty else { return number }
        let symbol = Text(Money.symbol(for: currency)).font(font)
        return Text("\(symbol)\(number)")
    }

    private func accessibilityLabel(_ amount: Double, isRecommended: Bool) -> String {
        isRecommended
            ? L10n.string("quick.amount.recommended", defaultValue: "Suggested") + " \(formatted(amount))"
            : formatted(amount)
    }

    // MARK: - Manual edit

    private var manualEditKey: some View {
        Button {
            tapCount += 1
            onManualEdit()
        } label: {
            VStack(spacing: 4) {
                Image(systemName: "keyboard")
                    .font(.title3.weight(.medium))
                Text(L10n.string("quick.amount.manualEdit", defaultValue: "Edit Manually"))
                    .font(.caption2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, minHeight: Self.tallKeyHeight)
            .background(keySurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { if rimSettings.intensity > 0 { surfaceBorderStroke } }
            .contentShape(Rectangle())
        }
        .buttonStyle(PadPressStyle())
        .accessibilityLabel(Text(L10n.string("quick.amount.manualEdit", defaultValue: "Edit Manually")))
    }

    // MARK: - Confirm

    /// The regular keypad's ✓ key, labeled: accent fill, white glyph,
    /// spinner while posting, dimmed while the commit can't run.
    private var confirmKey: some View {
        Button {
            tapCount += 1
            onConfirm()
        } label: {
            Group {
                if isCommitting {
                    ProgressView()
                        .tint(.white)
                } else {
                    VStack(spacing: 2) {
                        Image(systemName: "checkmark")
                            .font(.title3.weight(.medium))
                        Text(L10n.string("quick.amount.confirm", defaultValue: "Confirm"))
                            .font(.caption2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                }
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, minHeight: Self.tallKeyHeight)
            .background(
                accent,
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(PadPressStyle())
        .disabled(isConfirmDisabled)
        .opacity(isConfirmDisabled ? 0.4 : 1)
        .accessibilityLabel(Text(L10n.string("quick.amount.confirm", defaultValue: "Confirm")))
    }

    // MARK: - Shared chrome

    /// The digit/function keys' surface: the cards' fill over an active
    /// wallpaper, a whisper of primary on the plain canvas.
    private var keySurface: AnyShapeStyle {
        backgroundSettings.isActive
            ? AnyShapeStyle(backgroundSettings.cardSurface)
            : AnyShapeStyle(Color.primary.opacity(0.05))
    }

    /// The keys' glass rim, inset within the fill — the calculator's exact
    /// treatment.
    private var surfaceBorderStroke: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .strokeBorder(
                LinearGradient.glassRim(intensity: rimSettings.intensity, colorScheme: colorScheme),
                lineWidth: 1
            )
    }
}

/// The calculator keys' touch feedback, replicated: the key shrinks while
/// pressed and springs back on release.
private struct PadPressStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(
                        (colorScheme == .dark ? Color.white : Color.black)
                            .opacity(configuration.isPressed ? 0.14 : 0)
                    )
            }
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
