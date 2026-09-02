//
//  ChinaCoordinate.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/2.
//

import CoreLocation

/// Coordinate-system helpers for mainland China. CoreLocation reports
/// WGS-84 (true GPS), but maps rendered in mainland China — including
/// Apple Maps, which is served by AutoNavi (高德) — use the mandated
/// GCJ-02 ("Mars") datum. Plotting a raw GPS fix on those tiles offsets
/// the pin by a few hundred meters, so captures inside mainland China
/// are converted to GCJ-02 before anything downstream (pin, nearby
/// list, saved place) consumes them.
enum ChinaCoordinate {
    private static let a = 6378245.0
    private static let ee = 0.00669342162296594323

    /// GCJ-02 only applies inside mainland China — outside these rough
    /// bounds the coordinates pass through unchanged.
    static func isOutOfChina(latitude: Double, longitude: Double) -> Bool {
        longitude < 72.004 || longitude > 137.8347
            || latitude < 0.8293 || latitude > 55.8271
    }

    /// WGS-84 → GCJ-02. Identity outside mainland China.
    static func toGCJ02(latitude: Double, longitude: Double) -> (latitude: Double, longitude: Double) {
        guard !isOutOfChina(latitude: latitude, longitude: longitude) else {
            return (latitude, longitude)
        }
        var dLat = transformLat(latitude: latitude - 35.0, longitude: longitude - 105.0)
        var dLng = transformLng(latitude: latitude - 35.0, longitude: longitude - 105.0)
        let radLat = latitude / 180.0 * .pi
        var magic = sin(radLat)
        magic = 1 - ee * magic * magic
        let sqrtMagic = sqrt(magic)
        dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * .pi)
        dLng = (dLng * 180.0) / (a / sqrtMagic * cos(radLat) * .pi)
        return (latitude + dLat, longitude + dLng)
    }

    private static func transformLat(latitude: Double, longitude: Double) -> Double {
        var result = -100.0 + 2.0 * longitude + 3.0 * latitude
            + 0.2 * latitude * latitude + 0.1 * longitude * latitude
            + 0.2 * sqrt(abs(longitude))
        result += (20.0 * sin(6.0 * longitude * .pi) + 20.0 * sin(2.0 * longitude * .pi)) * 2.0 / 3.0
        result += (20.0 * sin(latitude * .pi) + 40.0 * sin(latitude / 3.0 * .pi)) * 2.0 / 3.0
        result += (160.0 * sin(latitude / 12.0 * .pi) + 320.0 * sin(latitude * .pi / 30.0)) * 2.0 / 3.0
        return result
    }

    private static func transformLng(latitude: Double, longitude: Double) -> Double {
        var result = 300.0 + longitude + 2.0 * latitude + 0.1 * longitude * longitude
            + 0.1 * longitude * latitude + 0.1 * sqrt(abs(longitude))
        result += (20.0 * sin(6.0 * longitude * .pi) + 20.0 * sin(2.0 * longitude * .pi)) * 2.0 / 3.0
        result += (20.0 * sin(longitude * .pi) + 40.0 * sin(longitude / 3.0 * .pi)) * 2.0 / 3.0
        result += (150.0 * sin(longitude / 12.0 * .pi) + 300.0 * sin(longitude / 30.0 * .pi)) * 2.0 / 3.0
        return result
    }

    /// Convenience for a `CLLocation`: the same point expressed in the
    /// map datum used for display (GCJ-02 in mainland China, WGS-84
    /// elsewhere).
    static func displayLocation(_ location: CLLocation) -> CLLocation {
        let converted = toGCJ02(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude
        )
        return CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: converted.latitude, longitude: converted.longitude),
            altitude: location.altitude,
            horizontalAccuracy: location.horizontalAccuracy,
            verticalAccuracy: location.verticalAccuracy,
            timestamp: location.timestamp
        )
    }
}
