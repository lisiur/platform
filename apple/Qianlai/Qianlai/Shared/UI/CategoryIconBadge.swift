//
//  CategoryIconBadge.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import SwiftUI

/// A category's emoji in a disc, with the parent category's emoji in a
/// smaller, darker disc overlaid at the bottom-trailing corner so
/// same-named leaves under different parents read as distinct. Where the
/// two discs cross, a badge-sized bite (plus a gap) is taken out of the
/// main disc so the seam reads as the surface the disc sits on.
///
/// One anatomy at one scale: the caller picks the main disc's `diameter`
/// and every other metric derives from it (main emoji ×0.55, fallback
/// symbol ×0.45, parent disc ×0.44, parent emoji ×0.30, cutout gap
/// ×0.06 — ratios lifted from the 36pt journal-card badge where the look
/// was approved). Call sites keep whatever host frame their row layout
/// needs.
struct CategoryIconBadge: View {
    let icon: String?
    /// SF Symbol shown when `icon` is nil or empty.
    let fallbackSymbol: String
    let parentIcon: String?
    /// Main disc diameter; the emoji centers in it.
    var diameter: CGFloat

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let icon, !icon.isEmpty {
                    Text(icon)
                        .font(.system(size: diameter * 0.55))
                } else {
                    Image(systemName: fallbackSymbol)
                        .font(.system(size: diameter * 0.45, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: diameter, height: diameter)
            .background {
                if showsParentBadge {
                    DiscWithBadgeCutout(
                        badgeDiameter: parentBadgeDiameter,
                        gap: cutoutGap,
                        shift: badgeShift
                    )
                    .fill(
                        Color.primary.opacity(0.06),
                        style: FillStyle(eoFill: true)
                    )
                } else {
                    Circle().fill(Color.primary.opacity(0.06))
                }
            }
            if let parentIcon, !parentIcon.isEmpty {
                Text(parentIcon)
                    .font(.system(size: parentBadgeFontSize))
                    .frame(width: parentBadgeDiameter, height: parentBadgeDiameter)
                    .background(Circle().fill(Color.primary.opacity(0.30)))
                    // Out of the leaf glyph's corner: the emoji reaches
                    // into the badge's in-frame position, and a notch left
                    // there is painted over — shifting the whole badge
                    // (and its hole) outward diagonally is what makes the
                    // seam read.
                    .offset(x: badgeShift, y: badgeShift)
                    .accessibilityHidden(true)
            }
        }
    }

    private var parentBadgeDiameter: CGFloat { diameter * 0.44 }
    private var parentBadgeFontSize: CGFloat { diameter * 0.30 }
    private var cutoutGap: CGFloat { diameter * 0.06 }
    /// Outward diagonal shift of the parent badge and its cutout, large
    /// enough that the seam ring clears the leaf emoji's glyph (estimated
    /// at ~0.45em visual radius, centered in the disc).
    private var badgeShift: CGFloat { diameter * 0.12 }

    private var showsParentBadge: Bool {
        guard let parentIcon else { return false }
        return !parentIcon.isEmpty
    }
}

/// The main disc with a badge-sized bite (plus a fixed gap) taken out at
/// the badge's shifted position — the ZStack places the badge's center at
/// `diameter - badge/2` on both axes and the badge renders `shift` further
/// out, which is exactly where the cutout circle centers. Two ellipse
/// subpaths + even-odd fill = disc minus hole.
private struct DiscWithBadgeCutout: Shape {
    let badgeDiameter: CGFloat
    let gap: CGFloat
    let shift: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addEllipse(in: rect)
        let center = rect.width - badgeDiameter / 2 + shift
        let radius = badgeDiameter / 2 + gap
        path.addEllipse(in: CGRect(
            x: center - radius,
            y: center - radius,
            width: radius * 2,
            height: radius * 2
        ))
        return path
    }
}
