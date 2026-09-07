//
//  AccountTreeRow.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/7.
//

import SwiftUI

/// One chart-of-accounts row shared by the accounts and categories
/// management screens: emoji icon, display name, system/archived badges,
/// and the trailing more menu. `disclosesExpansion` renders the collapsible
/// screen's leading chevron (rotated when `isExpanded`, parents only);
/// what a tap or long-press does belongs to the owning screen.
struct AccountTreeRow<MenuItems: View>: View {
    let account: BookAccount
    /// Whether the row parents sub-rows; only visible under
    /// `disclosesExpansion`.
    var hasChildren = false
    var disclosesExpansion = false
    var isExpanded = false
    let canManage: Bool
    let menuItems: MenuItems
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            if disclosesExpansion {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    .opacity(hasChildren ? 1 : 0)
            }
            if let icon = account.icon, !icon.isEmpty {
                Text(icon)
            }
            Text(account.displayName)
                .font(.body.weight(account.parentId == nil ? .medium : .regular))
                .strikethrough(account.isArchived)
            if account.isBuiltin {
                BadgeView(text: L10n.string("accounts.builtin", defaultValue: "System"), outlined: true)
            }
            if account.isArchived {
                BadgeView(text: L10n.string("status.archived", defaultValue: "Archived"), color: .orange)
            }
            Spacer()
            if canManage {
                RowMoreMenu { menuItems }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .contextMenu {
            if canManage {
                menuItems
            }
        }
    }
}

/// Row actions shared by both management screens' long-press context menu
/// and trailing more menu: edit, set balance (asset-like rows), add-sub,
/// archive toggle, delete. `addSubLabel` carries each screen's
/// "Add Sub-account" / "Add Sub-category" copy; the closures close over
/// the owning screen's state.
struct AccountRowMenuItems: View {
    let account: BookAccount
    let addSubLabel: String
    let onEdit: () -> Void
    let onSetBalance: () -> Void
    let onAddSub: () -> Void
    let onArchiveToggle: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button {
            onEdit()
        } label: {
            Label(
                L10n.string("accounts.edit", defaultValue: "Edit"),
                systemImage: "pencil"
            )
        }
        if account.isAssetLike {
            Button {
                onSetBalance()
            } label: {
                Label(
                    L10n.string("accounts.setBalance", defaultValue: "Set Balance"),
                    systemImage: "scalemass"
                )
            }
        }
        if account.parentId == nil, !account.isBuiltin {
            Button {
                onAddSub()
            } label: {
                Label(addSubLabel, systemImage: "arrow.turn.down.right")
            }
        }
        if !account.isBuiltin {
            Button {
                onArchiveToggle()
            } label: {
                Label(
                    L10n.string(
                        account.isArchived
                            ? L10n.Entry("accounts.unarchive", "Unarchive")
                            : .init("accounts.archive", "Archive")
                    ),
                    systemImage: account.isArchived ? "archivebox.fill" : "archivebox"
                )
            }
            Button(role: .destructive) {
                onDelete()
            } label: {
                Label(
                    L10n.string("accounts.delete", defaultValue: "Delete"),
                    systemImage: "trash"
                )
            }
        }
    }
}
