//
//  LocationPickerSheet.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/1.
//

import CoreLocation
import MapKit
import SwiftUI

/// Sheet for choosing an entry's place — modern Apple Maps–style picker: a
/// full-bleed SwiftUI `Map` with `.standard(elevation: .realistic)` and
/// the standard scale control, with POI search split into a separate
/// bottom sheet that opens from a toolbar button. The bottom sheet starts
/// at a compact detent and grows to full for searching. Tapping a search
/// hit (or current location) drops the pin on the main map and shrinks
/// the sheet back to its compact detent; the keyword and its results are
/// kept so the user can re-select. Without a
/// preselected place the pin fixes at the current location; every
/// selection keeps the sheet's list led by the selected point's address
/// followed by POIs near it.
struct LocationPickerSheet: View {
    /// Place to preselect — editing an existing entry's place.
    var initialLocation: EntryLocationBody?

    var onPick: (EntryLocationBody) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var recorder = LocationRecorder()
    @State private var coordinate: CLLocationCoordinate2D?
    @State private var camera: MapCameraPosition
    @State private var preview: EntryLocationBody?
    @State private var isResolving = false
    @State private var didApplyInitial = false
    @State private var didCaptureLocation = false
    @State private var nearbyPOIs: [EntryLocationBody] = []
    @State private var nearbyRevision = 0
    /// Which detent the search sheet sits at. A pick collapses it back to
    /// the compact height so the map leads again.
    @State private var searchDetent: PresentationDetent = .height(166)
    /// The map's real camera, reported by `onMapCameraChange`. The position
    /// binding alone can't be trusted for zoom: while a follow camera
    /// manages the map, pinch zooms never show up in the binding, so
    /// recentering from it would silently fall back to a fixed span.
    @State private var liveCamera: MapCamera?

    /// Zoom used when there is no user-chosen zoom to preserve yet: the
    /// sheet's opening framing for a preselected place, or the take-over
    /// zoom when a target must pull the camera out of follow mode.
    private static let defaultSpan = MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)

    /// With a preselected place the map must OPEN centered on it — seeding
    /// the camera state here means the very first frame carries the right
    /// position; starting from a follow camera and reassigning later loses
    /// the race against the map's internal user tracking, which drags the
    /// view to the user's location instead.
    init(initialLocation: EntryLocationBody?, onPick: @escaping (EntryLocationBody) -> Void) {
        self.initialLocation = initialLocation
        self.onPick = onPick
        if let initialLocation, let latitude = initialLocation.latitude,
            let longitude = initialLocation.longitude
        {
            let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            _camera = State(
                initialValue: .region(
                    MKCoordinateRegion(center: coordinate, span: Self.defaultSpan)
                )
            )
        } else {
            _camera = State(initialValue: .userLocation(fallback: .automatic))
        }
    }

    var body: some View {
        NavigationStack {
            map
                .navigationTitle(Text(L10n.string("quick.location.pick", defaultValue: "Choose Place")))
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: toolbarCancelPlacement) {
                        Button(L10n.string("quick.location.cancel", defaultValue: "Cancel")) {
                            dismiss()
                        }
                    }
                    ToolbarItem(placement: toolbarConfirmPlacement) {
                        Button(L10n.string("quick.location.use", defaultValue: "Use Place"), action: confirm)
                            .disabled(preview == nil)
                    }
                }
        }
        #if os(macOS)
            .frame(minWidth: 620, minHeight: 560)
        #endif
        .sheet(isPresented: Binding(get: { true }, set: { _ in })) {
            LocationSearchSheet(
                nearbyResults: nearbyPOIs,
                biasRegion: visibleRegion,
                selected: preview,
                onSearchFocus: { focused in
                    // Touching the search field pulls the sheet up to full
                    // height; picking a hit collapses it again.
                    if focused {
                        searchDetent = .large
                    }
                }
            ) { place in
                guard let latitude = place.latitude,
                    let longitude = place.longitude
                else { return }
                select(
                    CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                    resolved: place,
                    recenter: true
                )
                searchDetent = .height(166)
            }
            #if os(iOS)
            .presentationDetents([.height(166), .large], selection: $searchDetent)
            .presentationDragIndicator(.visible)
            .presentationBackgroundInteraction(.enabled)
            .interactiveDismissDisabled(true)
            #endif
        }
        .onAppear {
            applyInitialIfNeeded()
            // No preselected place: fix the pin at the current location.
            if coordinate == nil {
                startCurrentLocationCapture()
            }
        }
        .onChange(of: recorder.state) { _, state in
            switch state {
            case .captured(let place):
                guard let latitude = place.latitude,
                    let longitude = place.longitude
                else { return }
                select(
                    CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                    resolved: place,
                    recenter: true
                )
            case .failed, .idle, .locating:
                break
            }
        }
        .onDisappear {
            recorder.reset()
        }
    }

    #if os(iOS)
    private var toolbarCancelPlacement: ToolbarItemPlacement { .cancellationAction }
    private var toolbarConfirmPlacement: ToolbarItemPlacement { .confirmationAction }
    #else
    private var toolbarCancelPlacement: ToolbarItemPlacement { .navigation }
    private var toolbarConfirmPlacement: ToolbarItemPlacement { .primaryAction }
    #endif

    // MARK: - Pieces

    private var map: some View {
        MapReader { proxy in
            Map(position: $camera) {
                UserAnnotation()
                if let coordinate {
                    Annotation(
                        L10n.string("quick.location.pin", defaultValue: "Chosen place"),
                        coordinate: coordinate
                    ) {
                        SelectedPlaceMarker()
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .mapControls {
                MapScaleView()
            }
            .onMapCameraChange(frequency: .onEnd) { context in
                liveCamera = context.camera
            }
            .safeAreaInset(edge: .bottom) { currentLocationBar }
            .onTapGesture(coordinateSpace: .local) { point in
                guard let coord = proxy.convert(point, from: .local) else { return }
                select(coord, recenter: true)
            }
        }
    }

    /// Bottom-left "use my location" button: requests a one-shot GPS fix
    /// via `LocationRecorder` and drops the pin there (also centers the
    /// camera).
    private var currentLocationBar: some View {
        HStack {
            Button {
                recorder.capture()
            } label: {
                Image(systemName: "location.fill")
                    .font(.title3)
                    .foregroundStyle(.red)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.regularMaterial))
                    .overlay(Circle().stroke(.separator, lineWidth: 0.5))
            }
            .buttonStyle(.plain)
            .disabled(recorder.state == .locating)
            .accessibilityLabel(L10n.string("quick.location.current", defaultValue: "Current Location"))
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Actions

    private func applyInitialIfNeeded() {
        guard !didApplyInitial else { return }
        didApplyInitial = true
        guard let initialLocation, let latitude = initialLocation.latitude,
            let longitude = initialLocation.longitude
        else { return }
        // The camera already opens on the place (seeded in `init`); here we
        // only drop the pin and resolve its preview/nearby list.
        select(
            CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
            resolved: initialLocation,
            recenter: false
        )
    }

    /// Drops/moves the pin and refreshes the preview. A `resolved` payload
    /// skips the reverse-geocode round-trip (used by completions and the
    /// initial place). With `recenter: true` the camera pans to center on
    /// the new coordinate without changing the zoom — a selection never
    /// re-scales the map. Every selection also rebuilds the search sheet's
    /// list: the selected point's address leads, followed by POIs near it.
    private func select(
        _ newCoordinate: CLLocationCoordinate2D,
        resolved: EntryLocationBody? = nil,
        recenter: Bool = false
    ) {
        coordinate = newCoordinate
        preview = resolved
        isResolving = resolved == nil
        if recenter, let position = pannedCamera(on: newCoordinate) {
            withAnimation { camera = position }
        }
        if resolved != nil {
            refreshNearby(around: newCoordinate, leading: resolved)
            return
        }
        Task { @MainActor in
            let body = await EntryLocationGeocoder.body(at: newCoordinate)
            guard isSameCoordinate(coordinate, newCoordinate) else { return }
            preview = body
            isResolving = false
            refreshNearby(around: newCoordinate, leading: body)
        }
    }

    /// Region to bias free-text searches — the visible map, approximated
    /// from the live camera's distance (or the seeded region before the
    /// first camera change event).
    private var visibleRegion: MKCoordinateRegion? {
        if let region = camera.region {
            return region
        }
        guard let liveCamera else { return nil }
        let delta = liveCamera.distance * 2 / 111_320
        return MKCoordinateRegion(
            center: liveCamera.centerCoordinate,
            span: MKCoordinateSpan(latitudeDelta: delta, longitudeDelta: delta)
        )
    }

    /// A camera that pans to `coordinate` while pinning the current zoom —
    /// a selection must never re-scale the map, however the user arrived at
    /// the zoom (pinch, double-tap, programmatic). The zoom comes from the
    /// live camera; the binding's region/rect are only a fallback for the
    /// brief window before the first change event. A follow camera is left
    /// untouched when the target is the user's own fix — it already frames
    /// it.
    private func pannedCamera(on coordinate: CLLocationCoordinate2D) -> MapCameraPosition? {
        if camera.followsUserLocation, isUserLocation(coordinate) {
            return nil
        }
        if let live = liveCamera {
            return .camera(
                MapCamera(
                    centerCoordinate: coordinate,
                    distance: live.distance,
                    heading: live.heading,
                    pitch: live.pitch
                )
            )
        }
        if let region = camera.region {
            return .region(MKCoordinateRegion(center: coordinate, span: region.span))
        }
        if let rect = camera.rect {
            let here = MKMapPoint(x: rect.midX, y: rect.midY)
            let there = MKMapPoint(coordinate)
            var moved = rect
            moved.origin.x += there.x - here.x
            moved.origin.y += there.y - here.y
            return .rect(moved)
        }
        return .region(MKCoordinateRegion(center: coordinate, span: Self.defaultSpan))
    }

    /// Whether `coordinate` is exactly the recorder's captured fix — the
    /// captured flow passes the fix's own values, so exact equality holds.
    private func isUserLocation(_ coordinate: CLLocationCoordinate2D) -> Bool {
        guard case .captured(let place) = recorder.state,
            let latitude = place.latitude,
            let longitude = place.longitude
        else { return false }
        return latitude == coordinate.latitude && longitude == coordinate.longitude
    }

    /// Rebuilds the search sheet's list for a manually selected point: the
    /// point's own address first, then POIs near it. A revision counter
    /// drops results from superseded selections.
    private func refreshNearby(around center: CLLocationCoordinate2D, leading: EntryLocationBody?) {
        nearbyRevision += 1
        let revision = nearbyRevision
        Task { @MainActor in
            var items = await Self.scanNearbyPOIs(near: center)
            if items.isEmpty {
                items = await Self.searchNearbyCategories(near: center)
            }
            guard revision == nearbyRevision else { return }
            var bodies = items.compactMap { EntryLocationGeocoder.body(from: $0) }
            if let leading {
                bodies.removeAll { isSamePlace($0, leading) }
                bodies.insert(leading, at: 0)
            }
            nearbyPOIs = bodies
        }
    }

    /// Once per show: a one-shot capture of the current location. The fix
    /// pins the map (and anchors the nearby list); the pin never jumps to
    /// a search result on its own.
    private func startCurrentLocationCapture() {
        guard !didCaptureLocation else { return }
        didCaptureLocation = true
        recorder.capture()
    }

    /// Radius scan via `MKLocalPointsOfInterestRequest` — the canonical
    /// nearby-POI API where the maps backend supports it.
    private static func scanNearbyPOIs(near center: CLLocationCoordinate2D) async -> [MKMapItem] {
        let request = MKLocalPointsOfInterestRequest(center: center, radius: 500)
        guard let response = try? await MKLocalSearch(request: request).start() else { return [] }
        return response.mapItems
    }

    /// Category-keyword fan-out for backends that reject radius scans:
    /// a few spending-relevant categories searched region-biased to the
    /// fix, merged, deduped and sorted by distance from the fix.
    private static func searchNearbyCategories(near center: CLLocationCoordinate2D) async -> [MKMapItem] {
        let isChinese = Locale.current.language.languageCode?.identifier == "zh"
        let keywords = isChinese ? ["美食", "咖啡", "购物", "生活服务"] : ["food", "coffee", "shopping", "services"]
        let centerLocation = CLLocation(latitude: center.latitude, longitude: center.longitude)
        let region = MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
        )

        return await withTaskGroup(of: [MKMapItem].self) { group in
            for keyword in keywords {
                group.addTask { @MainActor in
                    let request = MKLocalSearch.Request()
                    request.naturalLanguageQuery = keyword
                    request.resultTypes = [.pointOfInterest]
                    request.region = region
                    guard let response = try? await MKLocalSearch(request: request).start() else { return [] }
                    return response.mapItems
                }
            }
            var merged: [MKMapItem] = []
            for await items in group {
                merged.append(contentsOf: items)
            }
            var seen = Set<String>()
            let unique = merged.filter { item in
                guard let name = item.name, !name.isEmpty else { return false }
                let coordinate = item.location.coordinate
                let key = "\(name)|\(Int(coordinate.latitude * 1000))|\(Int(coordinate.longitude * 1000))"
                guard !seen.contains(key) else { return false }
                seen.insert(key)
                return true
            }
            return Array(
                unique
                .sorted {
                    $0.location.distance(from: centerLocation)
                        < $1.location.distance(from: centerLocation)
                }
                .prefix(20)
            )
        }
    }

    private func confirm() {
        guard let preview else { return }
        onPick(preview)
        dismiss()
    }

    private func isSameCoordinate(_ lhs: CLLocationCoordinate2D?, _ rhs: CLLocationCoordinate2D) -> Bool {
        guard let lhs else { return false }
        return lhs.latitude == rhs.latitude && lhs.longitude == rhs.longitude
    }
}

/// Matches two payloads to the same real-world place: same name and
/// within 25 m. Shared by the picker's nearby scan and the search sheet's
/// selection marking.
private func isSamePlace(_ lhs: EntryLocationBody, _ rhs: EntryLocationBody) -> Bool {
    guard let lhsLatitude = lhs.latitude,
        let lhsLongitude = lhs.longitude,
        let rhsLatitude = rhs.latitude,
        let rhsLongitude = rhs.longitude
    else { return false }
    return (lhs.addressName ?? "") == (rhs.addressName ?? "")
        && CLLocation(latitude: lhsLatitude, longitude: lhsLongitude)
            .distance(from: CLLocation(latitude: rhsLatitude, longitude: rhsLongitude)) < 25
}

/// Map marker for the chosen place: an accent bubble floating above a
/// tiny dot that sits exactly on the selected coordinate. A small tip at
/// the bubble's bottom points at the dot.
private struct SelectedPlaceMarker: View {
    var body: some View {
        VStack(spacing: 2) {
            MarkerBubbleShape()
                .fill(Color.accentColor)
                .frame(width: 40, height: 50)
                .overlay {
                    Image(systemName: "mappin")
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(.white)
                }
                .overlay {
                    MarkerBubbleShape()
                        .stroke(.white, lineWidth: 1.5)
                }
                .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
            Circle()
                .fill(Color.accentColor)
                .frame(width: 10, height: 10)
                .overlay {
                    Circle()
                        .stroke(.white, lineWidth: 1.5)
                }
                .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
        }
        // 50 + 2 + 10 = 62pt tall; the dot's center sits 26pt below the
        // view's center, so shift up to land it on the annotation anchor.
        .offset(y: -26)
    }
}

/// A circle with a pointed tip extending from its bottom, aiming at the
/// dot below. The frame is taller than wide: the circle fills the top
/// `width` points and the tip reaches down to `maxY`, so a taller frame
/// draws a longer pointer without distorting the circle. Each side of
/// the pointer leaves the circle exactly along its tangent and sweeps
/// concavely onto the tip — a soft water-drop flow, no triangular crease.
private struct MarkerBubbleShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let radius = rect.width / 2
        let center = CGPoint(x: rect.midX, y: radius)
        let tip = CGPoint(x: rect.midX, y: rect.maxY)
        // Angular half-spread of where the sides leave the circle.
        let corner = 0.5
        let dx = sin(corner)
        let dy = cos(corner)

        let left = CGPoint(
            x: center.x - radius * dx,
            y: center.y + radius * dy
        )
        path.move(to: left)
        path.addArc(
            center: center,
            radius: radius,
            startAngle: Angle(radians: .pi / 2 + corner),
            endAngle: Angle(radians: .pi / 2 - corner + 2 * .pi),
            clockwise: false
        )
        // Tangent-intersection control point: quads through it depart
        // both junctions exactly along the circle's tangent, so the
        // pointer flows out of the bubble with no visible crease.
        let meet = CGPoint(x: rect.midX, y: center.y + radius / dy)
        path.addQuadCurve(to: tip, control: meet)
        path.addQuadCurve(to: left, control: meet)
        path.closeSubpath()
        return path
    }
}

/// Standalone POI search sheet shown alongside the picker map — a system
/// `.searchable` whose list swaps between `MKLocalSearchCompleter`
/// suggestions (while the query is non-empty) and the picker's
/// `nearbyResults` — the selected point's address first, then POIs near
/// it. Full `MKLocalSearch` runs on submit or when a suggestion is tapped.
/// Focusing the search field reports back via `onSearchFocus` so the
/// picker can pull the sheet to full height. Picking any hit resolves the
/// place, drops the pin on the parent map and collapses the sheet back to
/// its compact detent (the picker owns that via the detent selection),
/// while the query and results list stay put for re-selection; the sheet
/// itself never dismisses.
struct LocationSearchSheet: View {
    var nearbyResults: [EntryLocationBody] = []
    /// Region to bias free-text searches — the picker's visible map.
    var biasRegion: MKCoordinateRegion? = nil
    /// The picker's currently selected place; rows matching it show a
    /// trailing check icon.
    var selected: EntryLocationBody? = nil
    /// Reports search-field focus changes; the picker expands the sheet to
    /// full height while the user is typing.
    var onSearchFocus: (Bool) -> Void = { _ in }
    var onPick: (EntryLocationBody) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchModel = LocationSearchCompleterModel()
    @State private var query: String = ""
    @FocusState private var isSearchFocused: Bool

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(Text(L10n.string("quick.location.searchTitle", defaultValue: "Search")))
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                #if os(iOS)
                .searchable(
                    text: $query,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: Text(L10n.string(
                        "quick.location.searchPlaceholder",
                        defaultValue: "Search places or addresses"
                    ))
                )
                #else
                .searchable(
                    text: $query,
                    prompt: Text(L10n.string(
                        "quick.location.searchPlaceholder",
                        defaultValue: "Search places or addresses"
                    ))
                )
                #endif
                .searchFocused($isSearchFocused)
                .onSubmit(of: .search) {
                    Task { await runFullSearch(for: query) }
                }
        }
        .onChange(of: query) { _, new in
            searchModel.scheduleUpdate(query: new)
        }
        .onChange(of: isSearchFocused) { _, focused in
            onSearchFocus(focused)
        }
        .onDisappear {
            searchModel.cancel()
        }
    }

    /// While the query is non-empty the list leads with the completer's
    /// suggestions; otherwise it shows the nearby/resolved list. Rendering
    /// suggestions as plain rows — not the system `.searchSuggestions`
    /// panel — keeps their tap handling under our control; the panel
    /// intercepts taps and at best merely fills the field.
    private var showsCompletions: Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !searchModel.completions.isEmpty
    }

    private var content: some View {
        List {
            if showsCompletions {
                ForEach(searchModel.completions, id: \.self) { completion in
                    Button {
                        Task { await pickCompletion(completion) }
                    } label: {
                        HStack {
                            LocationSearchSuggestionRow(completion: completion)
                            Spacer(minLength: 8)
                            if isSelected(completion) {
                                selectionCheckmark
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .contentShape(Rectangle())
                }
            } else {
                ForEach(Array(nearbyResults.enumerated()), id: \.offset) { _, place in
                    Button {
                        pick(place)
                    } label: {
                        HStack {
                            LocationResultRow(place: place)
                            Spacer(minLength: 8)
                            if let selected, isSamePlace(place, selected) {
                                selectionCheckmark
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .contentShape(Rectangle())
                }
            }
        }
        .listStyle(.plain)
    }

    /// Trailing marker on the row matching the current selection.
    private var selectionCheckmark: some View {
        Image(systemName: "checkmark.circle.fill")
            .foregroundStyle(Color.accentColor)
            .font(.title3)
    }

    /// Whether the completion corresponds to the currently selected place
    /// — matched by name, the stable piece between a completion and its
    /// resolved map item.
    private func isSelected(_ completion: MKLocalSearchCompletion) -> Bool {
        guard let selected else { return false }
        return selected.addressName == completion.title
    }

    /// Resolves the completion to a concrete place and picks it. The
    /// completion request carries no region override — completions already
    /// encode their own geographic context, and forcing one makes the
    /// search come back empty. If the resolve fails, fall back to a full
    /// text search so a tap always lands the pin.
    private func pickCompletion(_ completion: MKLocalSearchCompletion) async {
        let request = MKLocalSearch.Request(completion: completion)
        if let response = try? await MKLocalSearch(request: request).start(),
            let item = response.mapItems.first,
            let place = EntryLocationGeocoder.body(from: item)
        {
            pick(place)
            return
        }
        await runFullSearch(for: [completion.title, completion.subtitle]
            .filter { !$0.isEmpty }
            .joined(separator: " "))
    }

    /// Hands the place to the picker — which drops the pin, rebuilds the
    /// nearby list and collapses the sheet — then blurs the field. The
    /// query and completion list are deliberately kept so the user can
    /// re-select: dragging the sheet back up shows the same results.
    private func pick(_ place: EntryLocationBody) {
        onPick(place)
        isSearchFocused = false
    }

    // MARK: - Search

    private func runFullSearch(for query: String) async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = trimmed
        request.resultTypes = [.address, .pointOfInterest]
        if let biasRegion {
            request.region = biasRegion
        }
        await runSearch(request: request)
    }

    private func runSearch(request: MKLocalSearch.Request) async {
        do {
            let response = try await MKLocalSearch(request: request).start()
            guard let item = response.mapItems.first,
                let place = EntryLocationGeocoder.body(from: item)
            else { return }
            pick(place)
        } catch {
            // Swallow: the user can keep typing or try again.
        }
    }
}

/// A row for a typed-query completion — title + subtitle.
private struct LocationSearchSuggestionRow: View {
    let completion: MKLocalSearchCompletion

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(completion.title)
            if !completion.subtitle.isEmpty {
                Text(completion.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// A row for a nearby-POI search result — POI name + address.
private struct LocationResultRow: View {
    let place: EntryLocationBody

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(place.addressName ?? place.address ?? "")
                .lineLimit(1)
            if let address = place.address, !address.isEmpty {
                Text(address)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

/// Wraps `MKLocalSearchCompleter` with its delegate plumbing and debounces
/// `queryFragment` updates so each keystroke doesn't trigger a network
/// round-trip.
@MainActor
@Observable
final class LocationSearchCompleterModel: NSObject, MKLocalSearchCompleterDelegate {
    var completions: [MKLocalSearchCompletion] = []

    private let completer: MKLocalSearchCompleter
    private var pendingQuery: String = ""
    private var debounceTask: Task<Void, Never>?

    override init() {
        completer = MKLocalSearchCompleter()
        super.init()
        completer.delegate = self
        completer.resultTypes = [.address, .pointOfInterest]
    }

    /// Updates the search completer with `query` after a ~300 ms idle
    /// window — the documented best practice for `MKLocalSearchCompleter`
    /// so a fast typist doesn't fire a request per keystroke.
    func scheduleUpdate(query: String) {
        pendingQuery = query
        debounceTask?.cancel()
        if query.isEmpty {
            completer.queryFragment = ""
            completions = []
            return
        }
        debounceTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            guard self.pendingQuery == query else { return }
            self.completer.queryFragment = query
        }
    }

    func cancel() {
        debounceTask?.cancel()
        debounceTask = nil
        completer.cancel()
    }

    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        let results = completer.results
        Task { @MainActor in
            self.completions = results
        }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        Task { @MainActor in
            self.completions = []
        }
    }
}
