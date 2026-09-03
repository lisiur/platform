//
//  LedgerInviteView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/3.
//

import SwiftUI

/// Ledger invite page: pick the role joining members get — the live QR
/// mints a fresh code for that role and renews it on its own. Codes are
/// stateless tokens that die after a minute, so there is no list to
/// manage. Changing the role re-identifies the QR (`.id`) so a new code
/// is minted for it immediately. Owner-only; the dashboard menu gates
/// entry and the server enforces the right on mint.
struct LedgerInviteView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var auth

    let ledger: QianlaiLedger

    @State private var store = MemberStore()
    @State private var inviteRole: LedgerRole = .editor

    var body: some View {
        Form {
            inviteSection
        }
        .navigationTitle(Text(L10n.string("ledgers.invite", defaultValue: "Invite Members")))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.string("Done", defaultValue: "Done")) { dismiss() }
            }
        }
        .task {
            await store.load(ledgerId: ledger.id, myUserId: auth.currentUser?.id)
        }
    }

    @ViewBuilder
    private var inviteSection: some View {
        Section {
            if store.isOwner {
                Picker("Role", selection: $inviteRole) {
                    Text(LedgerRole.editor.label).tag(LedgerRole.editor)
                    Text(LedgerRole.viewer.label).tag(LedgerRole.viewer)
                }
                .pickerStyle(.segmented)
                LiveInviteQR(mint: { try await store.mintInvite(role: inviteRole) })
                    .id(inviteRole)
                    .frame(maxWidth: .infinity)
                    .listRowSeparator(.hidden)
            } else {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .frame(height: 240)
                .listRowBackground(Color.clear)
            }
        } footer: {
            Text(
                L10n.string(
                    "ledgers.inviteFooter",
                    defaultValue: "Let others scan this QR to join the ledger — it refreshes automatically and each code works for one minute. Editors can post entries; viewers can only browse."
                )
            )
        }
    }
}
