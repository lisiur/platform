//
//  ShareViewController.swift
//  QianlaiShare
//
//  Created by Lisiur Day on 2026/9/21.
//

import UIKit
import UniformTypeIdentifiers

/// Share-extension principal: stages the shared image into the App Group
/// container and hands off to the main app via deep link. The extension is
/// deliberately dumb — no network, no auth, no billing; the app runs the
/// tile-recognize-prefill flow when the deep link opens it.
///
/// It defines the staging constants inline because this target does not
/// compile the app's shared folder — keep them in sync with
/// `ScreenshotHandoff` in the app target.
final class ShareViewController: UIViewController {
    private static let appGroupSuite = "group.top.hapaul.qianlai"
    /// Must match `ScreenshotHandoff.pendingFilename` in the app target.
    private static let pendingFilename = "pending-screenshot.img"
    /// The handoff link: opens the recognition page, which consumes the
    /// staged image on its first load.
    private static let deepLink = URL(string: "qianlai://recognize")

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        stageSharedImage()
    }

    private func stageSharedImage() {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let provider = item.attachments?.first(where: {
                  $0.hasItemConformingToTypeIdentifier(UTType.image.identifier)
              })
        else {
            complete()
            return
        }
        provider.loadDataRepresentation(
            forTypeIdentifier: UTType.image.identifier
        ) { data, _ in
            guard let data, !data.isEmpty,
                  let container = FileManager.default.containerURL(
                      forSecurityApplicationGroupIdentifier: Self.appGroupSuite
                  )
            else {
                self.complete()
                return
            }
            do {
                try data.write(
                    to: container.appendingPathComponent(Self.pendingFilename),
                    options: .atomic
                )
            } catch {
                self.complete()
                return
            }
            self.openHostApp()
        }
    }

    /// Opening the containing app dismisses the extension as part of the
    /// launch handoff; if the system refuses the open (rare), complete
    /// explicitly so the share sheet doesn't hang. `completeRequest` after
    /// a successful open is the system's job.
    private func openHostApp() {
        guard let deepLink = Self.deepLink else {
            complete()
            return
        }
        extensionContext?.open(deepLink) { success in
            guard !success else { return }
            self.complete()
        }
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
