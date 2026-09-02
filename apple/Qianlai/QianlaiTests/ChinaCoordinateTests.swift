//
//  ChinaCoordinateTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/2.
//

import CoreLocation
import XCTest
@testable import Qianlai

final class ChinaCoordinateTests: XCTestCase {
    func testOutsideChinaPassesThrough() {
        // San Francisco
        let converted = ChinaCoordinate.toGCJ02(latitude: 37.7793, longitude: -122.4192)
        XCTAssertEqual(converted.latitude, 37.7793, accuracy: 1e-9)
        XCTAssertEqual(converted.longitude, -122.4192, accuracy: 1e-9)
    }

    func testInsideChinaDeviationIsPlausible() {
        // Beijing — the GCJ-02 offset is typically ~100–700 m.
        let converted = ChinaCoordinate.toGCJ02(latitude: 39.9042, longitude: 116.4074)
        let distance = CLLocation(latitude: 39.9042, longitude: 116.4074)
            .distance(from: CLLocation(latitude: converted.latitude, longitude: converted.longitude))
        XCTAssertNotEqual(converted.latitude, 39.9042)
        XCTAssertNotEqual(converted.longitude, 116.4074)
        XCTAssertGreaterThan(distance, 50)
        XCTAssertLessThan(distance, 1000)
    }

    func testDisplayLocationOutsideChinaIsIdentity() {
        let location = CLLocation(latitude: 35.6762, longitude: 139.6503) // Tokyo
        let display = ChinaCoordinate.displayLocation(location)
        XCTAssertEqual(display.coordinate.latitude, location.coordinate.latitude, accuracy: 1e-9)
        XCTAssertEqual(display.coordinate.longitude, location.coordinate.longitude, accuracy: 1e-9)
    }
}
