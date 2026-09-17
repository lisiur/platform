//
//  BackgroundSettingsView.swift
//  Qianlai
//

import PhotosUI
import SwiftUI

/// Theme settings: the accent color, the in-app appearance override,
/// the "border highlight" entry (its sub-page owns the live preview
/// and the strength slider), and the wallpaper — an enable switch on
/// its own row, then (while enabled) the built-in presets plus a
/// custom photo picked from the library, with the dim and card-opacity
/// sliders for whichever wallpaper is active. The border-highlight
/// entry sits directly below Appearance.
struct BackgroundSettingsView: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings
    @Environment(AppearanceSettings.self) private var appearanceSettings
    @Environment(AccentSettings.self) private var accentSettings

    @State private var photoItem: PhotosPickerItem?
    @State private var adjustTarget: AdjustTarget?
    @State private var setError: Error?

    var body: some View {
        List {
            appearanceSection
            rimSection
            accentSection
            wallpaperEnabledSection
            if backgroundSettings.enabled {
                wallpaperSection
                if backgroundSettings.isActive {
                    photoAdjustSection
                }
                if backgroundSettings.image != nil {
                    removePhotoSection
                }
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

    // MARK: - Sections

    private var appearanceSection: some View {
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
            // The system-rendered picker value reads the env-bridged
            // accentColor, which goes stale on accent change; a concrete
            // local tint plus an identity rebuild keeps the value live.
            .tint(accentSettings.accent.color)
            .id(accentSettings.accent)
            .appCardRow()
        }
    }

    private var accentSection: some View {
        Section(L10n.string("profile.theme.accent", defaultValue: "Accent Color")) {
            accentSwatches
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
        }
    }

    /// The wallpaper enable switch, on its own row so it reads as an
    /// independent setting rather than fusing with the picker card
    /// below. Enabling with no active wallpaper default-applies the
    /// first built-in preset (see `BackgroundSettings.setEnabled`).
    private var wallpaperEnabledSection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { backgroundSettings.enabled },
                set: { newValue in
                    do {
                        try backgroundSettings.setEnabled(newValue)
                    } catch {
                        setError = error
                    }
                }
            )) {
                Label(
                    L10n.string("profile.theme.enable", defaultValue: "Enable Wallpaper"),
                    systemImage: "photo.on.rectangle"
                )
            }
            .appCardRow()
        }
    }

    /// Wallpaper picker: the first tile is the "custom photo" entry,
    /// followed by the built-in presets. The custom tile is selected
    /// while a picked photo is active and no preset is applied; preset
    /// tiles carry the same accent-border selection signal. Selecting
    /// a preset applies it; tapping the custom tile opens the system
    /// photo picker in place (the photo sub-page was folded into this
    /// page). Only mounted while the switch above is on.
    private var wallpaperSection: some View {
        Section(L10n.string("profile.theme.presets", defaultValue: "Wallpaper")) {
            wallpaperRow
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
        }
    }

    /// The dim and card-opacity sliders live next to the wallpaper row
    /// so the user can tune whatever wallpaper is showing — built-in
    /// preset or picked photo alike — without leaving the page. They
    /// only render while a wallpaper is active, and the persisted
    /// levels carry over to the next pick.
    private var photoAdjustSection: some View {
        Section {
            sliderRow(
                label: L10n.string("profile.theme.dim", defaultValue: "Dimming"),
                range: BackgroundSettings.dimRange,
                value: { backgroundSettings.dim },
                set: { backgroundSettings.setDim($0) }
            )
            sliderRow(
                label: L10n.string("profile.theme.cardOpacity", defaultValue: "Card Opacity"),
                range: BackgroundSettings.cardOpacityRange,
                value: { backgroundSettings.cardOpacity },
                set: { backgroundSettings.setCardOpacity($0) }
            )
        }
    }

    /// A labelled slider row that reads/writes through closures so the
    /// `Slider`'s `Binding` survives without storing one on the view.
    private func sliderRow(
        label: String,
        range: ClosedRange<Double>,
        value: @escaping () -> Double,
        set: @escaping (Double) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
            Slider(value: Binding(get: value, set: set), in: range)
        }
        .appCardRow()
    }

    private var removePhotoSection: some View {
        Section {
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
    }

    /// The border highlight entry — opens its own sub-page where the
    /// live preview and the slider actually live.
    private var rimSection: some View {
        Section {
            NavigationLink {
                RimSettingsView()
            } label: {
                Label(
                    L10n.string("profile.theme.rim.title", defaultValue: "Border Highlight"),
                    systemImage: "circle.dashed"
                )
            }
            .appCardRow()
        }
    }

    // MARK: - Wallpaper row

    /// Horizontal picker of wallpapers. The custom tile opens the
    /// system photo picker in place; each preset tile applies it on
    /// tap. The applied preset carries an accent border — the same
    /// visual signal the custom tile shares when a photo is active and
    /// no preset is applied, so the row reads as one family.
    private var wallpaperRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                customTile
                ForEach(BackgroundPresetCatalog.all) { preset in
                    presetTile(preset)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
    }

    /// The leading "custom photo" entry — a tile identical in size and
    /// selection signal to the presets; selected while the photo itself
    /// is the active background. The tap is two-phase: while a preset
    /// owns the background, the first tap re-selects the photo; once
    /// the photo is active, a tap opens the system photo picker to
    /// re-pick.
    @ViewBuilder
    private var customTile: some View {
        if backgroundSettings.image != nil, backgroundSettings.selectedPresetID != nil {
            Button {
                do {
                    try backgroundSettings.selectPhoto()
                } catch {
                    setError = error
                }
            } label: {
                customTileContent
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(L10n.string("profile.theme.myPhoto", defaultValue: "My Photo")))
        } else {
            PhotosPicker(selection: $photoItem, matching: .images) {
                customTileContent
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(L10n.string("profile.theme.myPhoto", defaultValue: "My Photo")))
        }
    }

    private var customTileContent: some View {
        let isSelected = backgroundSettings.selectedPresetID == nil && backgroundSettings.image != nil
        return VStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(backgroundSettings.image != nil
                          ? AnyShapeStyle(Color.clear)
                          : AnyShapeStyle(Color.primary.opacity(0.06)))
                if let image = backgroundSettings.image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 64, height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                } else {
                    Image(systemName: "photo.badge.plus")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 64, height: 120)
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(
                        isSelected ? Color.accentColor : .clear,
                        lineWidth: 2
                    )
            }
            Text(L10n.string("profile.theme.myPhoto", defaultValue: "My Photo"))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func presetTile(_ preset: BackgroundPreset) -> some View {
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

    // MARK: - Accent swatches (unchanged)

    /// Horizontal row of the preset system colors; the applied one carries
    /// a checkmark and a same-color ring, mirroring the wallpaper row's
    /// accent-border selection signal.
    private var accentSwatches: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(AppAccent.allCases, id: \.self) { accent in
                    Button {
                        accentSettings.set(accent)
                    } label: {
                        Circle()
                            .fill(accent.color)
                            .frame(width: 36, height: 36)
                            .overlay {
                                if accentSettings.accent == accent {
                                    Image(systemName: "checkmark")
                                        .font(.footnote.weight(.bold))
                                        .foregroundStyle(.white)
                                }
                            }
                            .padding(3)
                            .overlay {
                                Circle().strokeBorder(
                                    accentSettings.accent == accent ? accent.color : .clear,
                                    lineWidth: 2
                                )
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(accent.label))
                    .accessibilityAddTraits(
                        accentSettings.accent == accent ? [.isSelected] : []
                    )
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
    }
}

/// Identifiable wrapper so the adjust step can present via
/// `fullScreenCover(item:)`.
private struct AdjustTarget: Identifiable {
    let id = UUID()
    let image: UIImage
}