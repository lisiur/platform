//
//  EntryLocationGeocoder.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/1.
//

import CoreLocation
import MapKit

/// Reverse geocoding shared by the location picker and the one-shot
/// current-location capture. Coordinates are always kept; name/address are
/// best-effort so a geocoding gap never blocks recording the place.
enum EntryLocationGeocoder {
    /// Throwing core so callers can distinguish cancellation. `request` is
    /// owned by the caller (and may be cancelled independently).
    static func geocode(_ location: CLLocation, using request: MKReverseGeocodingRequest) async throws
        -> EntryLocationBody
    {
        let coordinate = location.coordinate
        let items = try await request.mapItems
        let item = items.first
        let name = item?.name
        let address = item?.addressRepresentations?
            .fullAddress(includingRegion: false, singleLine: true)
            ?? item?.addressRepresentations?.cityWithContext
        return EntryLocationBody(
            address: address,
            addressName: name,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
        )
    }

    /// Non-throwing convenience: a geocode failure degrades to a
    /// coordinates-only payload.
    static func body(at coordinate: CLLocationCoordinate2D) async -> EntryLocationBody {
        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        guard let request = MKReverseGeocodingRequest(location: location) else {
            return EntryLocationBody(latitude: coordinate.latitude, longitude: coordinate.longitude)
        }
        return (try? await geocode(location, using: request))
            ?? EntryLocationBody(latitude: coordinate.latitude, longitude: coordinate.longitude)
    }

    /// Build a payload from a fully-resolved `MKMapItem` (e.g. an
    /// `MKLocalSearch` POI result) without a second round-trip.
    static func body(from item: MKMapItem) -> EntryLocationBody? {
        let coordinate = item.location.coordinate
        return EntryLocationBody(
            address: item.addressRepresentations?
                .fullAddress(includingRegion: false, singleLine: true)
                ?? item.addressRepresentations?.cityWithContext,
            addressName: item.name,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
        )
    }
}