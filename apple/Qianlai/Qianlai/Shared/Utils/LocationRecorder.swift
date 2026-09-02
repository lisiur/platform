//
//  LocationRecorder.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/1.
//

import CoreLocation
import MapKit
import Observation

/// One-shot location capture for journal entries: requests when-in-use
/// permission on first use, fixes the current position, reverse-geocodes it
/// into a POI name + address, and stops. Purely opt-in — nothing is captured
/// until the user taps the capture button, and nothing runs in the
/// background.
@MainActor
@Observable
final class LocationRecorder: NSObject, CLLocationManagerDelegate {
    enum State: Equatable {
        case idle
        case locating
        case captured(EntryLocationBody)
        case failed(String)
    }

    private(set) var state: State = .idle

    private let manager = CLLocationManager()
    /// The in-flight reverse geocode, cancelled by `reset()` so a stale
    /// result can't land after the user dismissed the row.
    private var geocodeTask: Task<Void, Never>?
    private var geocodeRequest: MKReverseGeocodingRequest?
    /// One-shot fixes can come back stale or coarse (cached positions,
    /// Wi-Fi triangulation) — retry a few times before accepting one.
    private var fixAttempts = 0

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    /// Starts a capture: resolves permission first if needed, then a
    /// one-shot position fix.
    func capture() {
        guard state != .locating else { return }
        state = .locating
        fixAttempts = 0
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            state = .failed(L10n.string(
                "location.denied",
                defaultValue: "Location access is off. Enable it in Settings to attach a place."
            ))
        default:
            manager.requestLocation()
        }
    }

    /// Back to idle after a capture was consumed or dismissed.
    func reset() {
        geocodeTask?.cancel()
        geocodeTask = nil
        geocodeRequest?.cancel()
        geocodeRequest = nil
        state = .idle
    }

    // MARK: CLLocationManagerDelegate

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            guard self.state == .locating else { return }
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                self.manager.requestLocation()
            case .denied, .restricted:
                self.state = .failed(L10n.string(
                    "location.denied",
                    defaultValue: "Location access is off. Enable it in Settings to attach a place."
                ))
            default:
                break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            guard self.state == .locating else { return }
            self.acceptOrRetry(location)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            guard self.state == .locating else { return }
            // `locationUnknown` is transient — Apple recommends retrying.
            if (error as? CLError)?.code == .locationUnknown, fixAttempts < 3 {
                fixAttempts += 1
                manager.requestLocation()
                return
            }
            self.state = .failed(L10n.string(
                "location.unavailable",
                defaultValue: "Could not determine your location."
            ))
        }
    }

    /// Accepts the fix once it's fresh and reasonably accurate; otherwise
    /// re-requests (bounded) so the pin doesn't land on a cached position.
    private func acceptOrRetry(_ location: CLLocation) {
        let age = -location.timestamp.timeIntervalSinceNow
        let isFresh = age < 15
        let isAccurate = location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= 100
        if (isFresh && isAccurate) || fixAttempts >= 2 {
            startReverseGeocode(location)
            return
        }
        fixAttempts += 1
        manager.requestLocation()
    }

    /// Turns the fix into a display name + address and finishes the
    /// capture. The GPS fix (WGS-84) is converted to the display datum
    /// (GCJ-02 inside mainland China) first, so the pin, the nearby list
    /// and the saved place all line up with the AutoNavi-rendered map.
    /// Geocoding is best-effort: the coordinates are kept even when no
    /// placemark comes back, so the entry still records where it
    /// happened.
    private func startReverseGeocode(_ location: CLLocation) {
        geocodeTask?.cancel()
        geocodeRequest?.cancel()
        let location = ChinaCoordinate.displayLocation(location)
        let coordinate = location.coordinate
        guard let request = MKReverseGeocodingRequest(location: location) else {
            self.finish(EntryLocationBody(latitude: coordinate.latitude, longitude: coordinate.longitude))
            return
        }
        geocodeRequest = request
        geocodeTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let body = try await EntryLocationGeocoder.geocode(location, using: request)
                try Task.checkCancellation()
                self.finish(body)
            } catch is CancellationError {
                return
            } catch {
                self.finish(
                    EntryLocationBody(
                        latitude: coordinate.latitude,
                        longitude: coordinate.longitude
                    )
                )
            }
        }
    }

    /// Commits a capture result; stale results (from a cancelled or
    /// superseded geocode) are dropped.
    private func finish(_ location: EntryLocationBody) {
        guard state == .locating else { return }
        state = .captured(location)
    }
}