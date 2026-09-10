//
//  BackgroundImageAdjustView.swift
//  Qianlai
//

import SwiftUI

/// Full-screen adjust step after picking a background photo: drag to pan,
/// pinch to zoom; Done crops exactly what the editor shows at screen
/// resolution and hands the JPEG back. The transform is baked into the
/// saved file — re-adjusting means re-picking the photo.
///
/// The editor fills the whole screen — the crop window IS the screen, so
/// what you see is exactly what gets saved (chrome floats on top).
struct BackgroundImageAdjustView: View {
    let image: UIImage
    let onConfirm: (Data) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var scale: CGFloat = 1
    @State private var scaleBase: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var offsetBase: CGSize = .zero

    private let screenSize = BackgroundSettings.sharedScreenSize

    /// The photo scaled to cover the screen at zoom 1 — the pan slack
    /// comes from this overflow plus the pinch.
    private var laidSize: CGSize {
        let fit = max(screenSize.width / image.size.width, screenSize.height / image.size.height)
        return CGSize(width: image.size.width * fit, height: image.size.height * fit)
    }

    var body: some View {
        ZStack {
            GeometryReader { geo in
                Image(uiImage: image)
                    .resizable()
                    .frame(width: laidSize.width * scale, height: laidSize.height * scale)
                    .offset(offset)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()
                    .contentShape(Rectangle())
                    .gesture(drag.simultaneously(with: magnification))
            }
            .ignoresSafeArea()

            // Floating chrome, inside the safe area: the image extends
            // under the status bar and home indicator, exactly like the
            // saved wallpaper.
            VStack(spacing: 0) {
                HStack {
                    chromeButton(
                        L10n.string("common.cancel", defaultValue: "Cancel"),
                        isDone: false
                    ) { dismiss() }
                    Spacer()
                    chromeButton(
                        L10n.string("common.done", defaultValue: "Done"),
                        isDone: true
                    ) { confirm() }
                }
                .padding(.horizontal, 20)
                Spacer()
                Text(L10n.string(
                    "profile.theme.adjustHint",
                    defaultValue: "Drag or pinch to adjust the photo."
                ))
                .font(.footnote)
                .foregroundStyle(.white)
                .shadow(radius: 2)
                .padding(.bottom, 12)
            }
        }
    }

    private func chromeButton(_ title: String, isDone: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.body.weight(isDone ? .semibold : .regular))
                .foregroundStyle(isDone ? Color.accentColor : .primary)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.regularMaterial, in: Capsule())
        }
    }

    private var magnification: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                scale = min(max(scaleBase * value, 1), 5)
                offset = clamped(offsetBase)
            }
            .onEnded { _ in
                scaleBase = scale
                offset = clamped(offset)
                offsetBase = offset
            }
    }

    private var drag: some Gesture {
        DragGesture()
            .onChanged { value in
                offset = clamped(CGSize(
                    width: offsetBase.width + value.translation.width,
                    height: offsetBase.height + value.translation.height
                ))
            }
            .onEnded { _ in
                offsetBase = offset
            }
    }

    /// Keeps the photo covering the window: panning can never pull an
    /// edge inside the crop.
    private func clamped(_ size: CGSize) -> CGSize {
        let maxX = max(0, (laidSize.width * scale - screenSize.width) / 2)
        let maxY = max(0, (laidSize.height * scale - screenSize.height) / 2)
        return CGSize(
            width: min(maxX, max(-maxX, size.width)),
            height: min(maxY, max(-maxY, size.height))
        )
    }

    /// Renders exactly what the editor shows into the saved wallpaper —
    /// screen-sized at device pixel scale, no scrim baked in (the app
    /// layers the dim live).
    private func confirm() {
        let rendered = UIGraphicsImageRenderer(size: screenSize).image { _ in
            image.draw(in: CGRect(
                x: (screenSize.width - laidSize.width * scale) / 2 + offset.width,
                y: (screenSize.height - laidSize.height * scale) / 2 + offset.height,
                width: laidSize.width * scale,
                height: laidSize.height * scale
            ))
        }
        onConfirm(rendered.jpegData(compressionQuality: 0.75) ?? Data())
        dismiss()
    }
}
