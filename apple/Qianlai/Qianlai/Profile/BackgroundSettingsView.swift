//
//  BackgroundSettingsView.swift
//  Qianlai
//

import PhotosUI
import SwiftUI

/// Theme settings: in-app appearance override plus the per-device
/// background image (pick, adjust, dim, card opacity). Every change takes
/// effect immediately — persistence lives in the stores, so there is no
/// save step to fail.
struct BackgroundSettingsView: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings
    @Environment(AppearanceSettings.self) private var appearanceSettings

    @State private var photoItem: PhotosPickerItem?
    @State private var adjustTarget: AdjustTarget?
    @State private var setError: Error?

    var body: some View {
        List {
            Section {
                Picker(
                    selection: Binding(
                        get: { appearanceSettings.appearance },
                        set: { appearanceSettings.setAppearance($0) }
                    )
                ) {
                    ForEach(AppAppearance.allCases, id: \.self) { appearance in
                        Text(appearance.label).tag(appearance)
                    }
                } label: {
                    Label(
                        L10n.string("profile.theme.appearance", defaultValue: "Appearance"),
                        systemImage: "circle.lefthalf.filled"
                    )
                }
                .appCardRow()
            }
            Section {
                presetsRow
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            } header: {
                Text(L10n.string("profile.theme.presets", defaultValue: "Presets"))
            }
            Section {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label(
                        L10n.string("profile.theme.pick", defaultValue: "Choose Photo"),
                        systemImage: "photo"
                    )
                }
                .appCardRow()
                if backgroundSettings.image != nil {
                    sliderRow(
                        L10n.string("profile.theme.dim", defaultValue: "Dimming"),
                        value: backgroundSettings.dim,
                        range: BackgroundSettings.dimRange,
                        set: { backgroundSettings.setDim($0) }
                    )
                    sliderRow(
                        L10n.string("profile.theme.cardOpacity", defaultValue: "Card Opacity"),
                        value: backgroundSettings.cardOpacity,
                        range: BackgroundSettings.cardOpacityRange,
                        set: { backgroundSettings.setCardOpacity($0) }
                    )
                    Button(role: .destructive) {
                        backgroundSettings.clearPhoto()
                    } label: {
                        Label(
                            L10n.string("profile.theme.remove", defaultValue: "Remove Photo"),
                            systemImage: "trash"
                        )
                        .foregroundStyle(.red)
                    }
                    .appCardRow()
                }
            } footer: {
                Text(L10n.string(
                    "profile.theme.footer",
                    defaultValue: "Pick a photo to show behind your lists. Stored on this device only."
                ))
            }
        }
        .appBackgroundCanvas()
        .navigationTitle(Text(L10n.string("profile.theme", defaultValue: "Theme")))
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            photoItem = nil
            Task {
                do {
                    guard let data = try await item.loadTransferable(type: Data.self) else {
                        throw BackgroundSettings.BackgroundError.cannotProcess
                    }
                    // Downsample before editing so a 48MP library photo
                    // never decodes whole in the adjust step.
                    guard let prepared = BackgroundSettings.downsampledJPEG(data),
                        let picked = UIImage(data: prepared)
                    else {
                        throw BackgroundSettings.BackgroundError.cannotProcess
                    }
                    adjustTarget = AdjustTarget(image: picked)
                } catch {
                    setError = error
                }
            }
        }
        .fullScreenCover(item: $adjustTarget) { target in
            BackgroundImageAdjustView(image: target.image) { jpeg in
                do {
                    try backgroundSettings.setPhoto(jpeg)
                } catch {
                    setError = error
                }
            }
        }
        .alert(
            L10n.string("profile.theme.cannotSet", defaultValue: "Can't Set Background"),
            isPresented: Binding(
                get: { setError != nil },
                set: { if !$0 { setError = nil } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {}
        } message: {
            Text(setError?.localizedDescription ?? "")
        }
    }

    /// Horizontal picker of the built-in wallpapers; the applied preset
    /// carries an accent border.
    private var presetsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(BackgroundPresetCatalog.all) { preset in
                    Button {
                        do {
                            try backgroundSettings.applyPreset(preset)
                        } catch {
                            setError = error
                        }
                    } label: {
                        VStack(spacing: 6) {
                            Image(uiImage: BackgroundPresetCatalog.thumbnail(for: preset))
                                .resizable()
                                .frame(width: 64, height: 120)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .strokeBorder(
                                            backgroundSettings.selectedPresetID == preset.id
                                                ? Color.accentColor
                                                : .clear,
                                            lineWidth: 2
                                        )
                                }
                            Text(preset.name)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(preset.name))
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
    }

    private func sliderRow(
        _ title: String,
        value: Double,
        range: ClosedRange<Double>,
        set: @escaping (Double) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
            Slider(
                value: Binding(
                    get: { value },
                    set: { set($0) }
                ),
                in: range
            )
        }
        .appCardRow()
    }
}

/// Identifiable wrapper so the adjust step can present via
/// `fullScreenCover(item:)`.
private struct AdjustTarget: Identifiable {
    let id = UUID()
    let image: UIImage
}
