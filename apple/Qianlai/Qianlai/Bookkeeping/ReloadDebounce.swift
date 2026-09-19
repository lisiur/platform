//
//  ReloadDebounce.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/19.
//

import Foundation

/// The one coalescing delay every debounced reload shares — the old
/// dashboard reload's rhythm, kept identical across the stores and the
/// stats component's window stepping so a rapid burst of changes fires
/// one fetch for the settled state instead of one per intermediate.
enum ReloadDebounce {
    static let interval: Duration = .milliseconds(200)
}
