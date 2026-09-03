//
//  InviteQRCode.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/2.
//

import CoreImage
import SwiftUI

#if canImport(UIKit)
import UIKit
typealias PlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
typealias PlatformImage = NSImage
#endif

/// Invite-code <-> QR payload codec. Codes ride inside an app URL scheme
/// (`qianlai://join?c=CODE`) so a scan can be recognized as a Qianlai
/// invite; decoding stays lenient — any plain text is treated as a raw
/// code — so old text-only share codes keep working.
enum InviteCode {
    /// The QR payload encoding `code`.
    static func payload(for code: String) -> String {
        var components = URLComponents()
        components.scheme = "qianlai"
        components.host = "join"
        components.queryItems = [URLQueryItem(name: "c", value: code)]
        return components.url?.absoluteString ?? code
    }

    /// The share code behind a scanned `payload`, or nil for empty input.
    /// Accepts app-scheme payloads and bare codes alike.
    static func code(from payload: String) -> String? {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let url = URL(string: trimmed),
           url.scheme?.lowercased() == "qianlai",
           let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems {
            return items.first { $0.name == "c" || $0.name == "code" }?.value
        }
        return trimmed
    }
}

/// QR code image rendered through CoreImage. Pre-scaled by an integer
/// factor so modules stay square and crisp under `.interpolation(.none)`.
struct QRCodeView: View {
    let payload: String
    /// Display side length in points.
    var side: CGFloat = 220

    var body: some View {
        Image(platform: Self.image(for: payload))
            .interpolation(.none)
            .resizable()
            .scaledToFit()
            .frame(width: side, height: side)
    }

    /// Generated bitmap for display and sharing.
    static func image(for payload: String) -> PlatformImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(Data(payload.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage, !output.extent.isEmpty else { return nil }
        // Integer up-scale keeps every module a whole pixel.
        let factor = max(1, Int(640 / output.extent.width))
        let scaled = output.transformed(
            by: CGAffineTransform(scaleX: CGFloat(factor), y: CGFloat(factor))
        )
        guard let cgImage = sharedContext.createCGImage(scaled, from: scaled.extent) else {
            return nil
        }
        #if canImport(UIKit)
        return UIImage(cgImage: cgImage)
        #else
        return NSImage(
            cgImage: cgImage,
            size: NSSize(width: scaled.extent.width, height: scaled.extent.height)
        )
        #endif
    }

    private static let sharedContext = CIContext()
}

extension Image {
    /// `Image(decorative:)` / `Image(nsImage:)` across platforms.
    init(platform image: PlatformImage?) {
        #if canImport(UIKit)
        self.init(uiImage: image ?? UIImage())
        #else
        self.init(nsImage: image ?? NSImage())
        #endif
    }
}

/// White card holding a QR code — QR modules render black-on-transparent,
/// so without a light backdrop they vanish in dark mode.
struct QRCodeCard: View {
    let payload: String
    var side: CGFloat = 200

    var body: some View {
        QRCodeView(payload: payload, side: side)
            .padding(14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// Share sheet for a generated invite code: scannable QR plus the raw code
/// (copy / system share). Used for ledger share codes and project invites.
/// Self-refreshing invite QR. Codes are stateless tokens that expire after
/// one minute, so while this view is visible it mints a fresh one on
/// appear and again every REFRESH_INTERVAL seconds — slightly before the
/// current token dies, so a scan never lands on an expired code.
struct LiveInviteQR: View {
    /// Mints a fresh invite from the server.
    let mint: () async throws -> ShareCode

    @State private var invite: ShareCode?
    @State private var errorText: String?

    /// Re-mint cadence: the token lives 60s server-side; refresh at 50s
    /// leaves a buffer for a scan in flight at the swap.
    private static let refreshInterval: Duration = .seconds(50)

    var body: some View {
        VStack(spacing: 18) {
            if let invite {
                QRCodeCard(payload: InviteCode.payload(for: invite.code))
                Text(L10n.string("invite.scanToJoin", defaultValue: "Scan to join"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ProgressView()
                    .frame(height: 240)
            }
            if let errorText {
                Label(errorText, systemImage: "exclamationmark.circle")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: 420)
        .task {
            await refreshLoop()
        }
    }

    /// Mints immediately, then again every interval until the view leaves
    /// the hierarchy (`.task` cancels on disappear). A failed mint keeps
    /// the last QR on screen and surfaces the error; the next tick retries.
    private func refreshLoop() async {
        while !Task.isCancelled {
            do {
                invite = try await mint()
                errorText = nil
            } catch {
                errorText = error.localizedDescription
            }
            try? await Task.sleep(for: Self.refreshInterval)
        }
    }
}

#if canImport(UIKit)
@preconcurrency import AVFoundation

/// Live camera preview reporting QR payloads. Delivery happens once per
/// presented scanner; the caller dismisses to stop the session.
struct QRScannerView: UIViewControllerRepresentable {
    /// Fired on the main actor with the raw QR string.
    let onDetected: (String) -> Void
    /// Fired when the camera cannot start (permission denied, no device).
    let onUnavailable: () -> Void

    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.onDetected = onDetected
        controller.onUnavailable = onUnavailable
        return controller
    }

    func updateUIViewController(_ controller: ScannerController, context: Context) {}

    @MainActor
    final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
        var onDetected: ((String) -> Void)?
        var onUnavailable: (() -> Void)?

        private let session = AVCaptureSession()
        private var hasStarted = false
        /// Frames keep arriving until the caller's dismissal tears the
        /// cover down; only the first detection is delivered so a single
        /// scan can't trigger a burst of joins.
        private var hasDelivered = false

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device),
                  session.canAddInput(input)
            else {
                onUnavailable?()
                return
            }
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else {
                onUnavailable?()
                return
            }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.layer.bounds
            view.layer.insertSublayer(preview, at: 0)
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            view.layer.sublayers?.first?.frame = view.layer.bounds
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard !hasStarted else { return }
            hasStarted = true
            // `startRunning` blocks; keep it off the main thread.
            let session = session
            DispatchQueue.global(qos: .userInitiated).async {
                session.startRunning()
            }
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            let session = session
            DispatchQueue.global(qos: .userInitiated).async {
                session.stopRunning()
            }
        }

        nonisolated func metadataOutput(
            _ output: AVCaptureMetadataOutput,
            didOutput metadataObjects: [AVMetadataObject],
            from connection: AVCaptureConnection
        ) {
            guard let object = metadataObjects
                .compactMap({ $0 as? AVMetadataMachineReadableCodeObject })
                .first(where: { $0.type == .qr }),
                let payload = object.stringValue
            else { return }
            Task { @MainActor in
                guard !hasDelivered else { return }
                hasDelivered = true
                onDetected?(payload)
            }
        }
    }
}

/// Full-screen scanning UI: camera preview, dimmed surround with a
/// cut-out frame, hint caption, and cancel. Reports each scanned payload
/// through `onDetected`; by default the first detection dismisses the
/// screen, or the caller can stay up and keep scanning.
struct QRScanScreen: View {
    let onDetected: (String) -> Void
    /// A detection normally dismisses the screen right away. Pass `false`
    /// when the caller acts on the payload first and dismisses itself —
    /// e.g. redeem-on-scan join, which stays up to surface errors.
    var dismissesOnDetect = true

    @Environment(\.dismiss) private var dismiss
    @State private var isUnavailable = false
    /// Re-keys the scanner after a delivered scan so a caller that stays
    /// up (no dismiss) gets a fresh session — and thus a fresh delivery —
    /// for the next scan (e.g. re-scanning after a failed redeem).
    @State private var scanEpoch = 0

    /// Scan window side length, shared by the stroke frame and the
    /// cut-out in `surround` so the two can't drift apart.
    private static let frameSize: CGFloat = 260

    var body: some View {
        // Toolbar items (the Cancel button) only render inside a
        // navigation context — a bare `fullScreenCover` would otherwise
        // strand the user on the camera with no way out.
        NavigationStack {
            scanContent
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private var scanContent: some View {
        ZStack {
            if isUnavailable {
                Color(.systemBackground)
                VStack(spacing: 12) {
                    Image(systemName: "camera.badge.ellipsis")
                        .font(.largeTitle)
                        .foregroundStyle(.tertiary)
                    Text(L10n.string("invite.cameraUnavailable", defaultValue: "Camera is unavailable"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                QRScannerView(
                    onDetected: { payload in
                        onDetected(payload)
                        if dismissesOnDetect {
                            dismiss()
                        } else {
                            // Staying up: re-key the scanner so the next
                            // scan delivers again (one delivery per
                            // session).
                            scanEpoch += 1
                        }
                    },
                    onUnavailable: { isUnavailable = true }
                )
                .id(scanEpoch)
                surround
                scanFrame
            }
        }
        // One full-screen coordinate space for every layer: the cut-out in
        // `surround` and the stroke in `scanFrame` must center over the
        // same bounds. With safe-area insets in play (nav bar, status bar,
        // home indicator) the two centers diverge by (topInset -
        // bottomInset) / 2 and the stroke drifts off the hole.
        .ignoresSafeArea()
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .foregroundStyle(.white)
            }
        }
    }

    /// The scan window stroke and hint caption. The stroke is centered by
    /// the ZStack so it lines up exactly with the hole punched in
    /// `surround`; the caption hangs off it as an overlay, which never
    /// affects layout — otherwise the frame+caption *group* would center
    /// and the frame would drift above the cut-out.
    private var scanFrame: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(Color.white, lineWidth: 3)
            .frame(width: Self.frameSize, height: Self.frameSize)
            .overlay(alignment: .top) {
                Text(L10n.string("invite.scanHint", defaultValue: "Point the camera at the invite QR code"))
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Self.frameSize + 28)
            }
    }

    /// Dimmed backdrop with the scan window punched out. Lives inside the
    /// ZStack's full-screen bounds (see `.ignoresSafeArea` there), so the
    /// hole centers on the true screen center — same as the stroke.
    private var surround: some View {
        Color.black.opacity(0.5)
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .frame(width: Self.frameSize, height: Self.frameSize)
                    .blendMode(.destinationOut)
            }
            .compositingGroup()
            .allowsHitTesting(false)
    }
}
#endif
