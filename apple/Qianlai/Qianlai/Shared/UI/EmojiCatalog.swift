//
//  EmojiCatalog.swift
//  Qianlai
//

import Foundation

/// One titled section of the icon picker: a localized header plus the
/// emoji grid it contains.
struct EmojiGroup: Identifiable {
    let l10nKey: String
    let fallback: String
    let icons: [String]

    var id: String { l10nKey }

    var title: String {
        L10n.string(l10nKey, defaultValue: fallback)
    }
}

/// Static icon catalog behind the account/category icon picker. Every icon
/// seeded by the server's `STARTER_ACCOUNTS` (plus the balance-offset ⚖️)
/// must stay reachable here, so editing a seeded category can re-pick its
/// original icon. Icons are unique across groups (enforced by tests).
enum EmojiCatalog {
    static let groups: [EmojiGroup] = [
        EmojiGroup(
            l10nKey: "icon.group.common",
            fallback: "Common",
            icons: ["💰", "💳", "👛", "👜", "💵", "💴", "💶", "💷", "🪙", "💎", "🧾", "🧮", "🏦", "💱", "🏧", "💲"]
        ),
        EmojiGroup(
            l10nKey: "icon.group.food",
            fallback: "Food & Drink",
            icons: [
                "🍜", "🍚", "🍿", "🍎", "🥬", "🍕", "🍔", "🍣", "🍰", "🍦",
                "☕", "🍺", "🍵", "🥤", "🍱", "🍲", "🍞", "🥐", "🥖", "🥨",
                "🧀", "🍳", "🥓", "🍖", "🍗", "🌭", "🌮", "🌯", "🥗", "🍝",
                "🍩", "🍪", "🎂", "🍫", "🍬", "🧋",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.transport",
            fallback: "Transport",
            icons: [
                "🚌", "✈️", "🚗", "🚕", "🚙", "🚄", "⛴️", "🚲", "🛵", "⛽",
                "🅿️", "🚏", "🚦", "🛫", "🚂", "🚆", "🚇", "🚊", "🚉", "🚁",
                "🛶", "🚤", "🛳️", "🛴", "🚐", "🏍️", "🗺️", "🧳",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.shopping",
            fallback: "Shopping",
            icons: [
                "👕", "🎊", "🛍️", "🎁", "👟", "💄", "🧴", "🧼", "👗", "👖",
                "🧥", "👔", "🥾", "👒", "🧢", "🎒", "👑", "🕶️", "💍", "🩳",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.home",
            fallback: "Home",
            icons: [
                "🏠", "🍼", "🛋️", "🛏️", "🚿", "🚽", "🔧", "💡", "🪑", "🧹",
                "🚪", "🔑", "🌿", "🏡", "🏢", "🏘️", "🛁", "🧻", "🪟", "🛎️",
                "🧺", "🕯️", "🪴", "🗄️",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.tech",
            fallback: "Tech",
            icons: [
                "📱", "💻", "⌚", "🎧", "📷", "🖥️", "🖱️", "⌨️", "🖨️", "📺",
                "📻", "📸", "🎙️", "🔋", "🔌", "🤖",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.fun",
            fallback: "Entertainment",
            icons: [
                "🎬", "🎮", "🎤", "🎫", "🎸", "🎪", "🎨", "🎡", "🎭", "🎰",
                "🎳", "🎲", "🧸", "🎢", "🎠", "🎼", "🎹", "🥁", "🎺", "🎻",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.sports",
            fallback: "Sports",
            icons: [
                "⚽", "🏀", "🏋️", "🎯", "⛷️", "🏊", "⚾", "🎾", "🏐", "🏓",
                "🥊", "🥋", "⛳", "🏄", "🚴", "🏃", "🧗", "🤿", "🛹", "🏸",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.health",
            fallback: "Health",
            icons: [
                "🩺", "💊", "🏥", "🦷", "👀", "🚑", "💉", "🩹", "🧘", "🌡️",
                "🦴", "🦠", "🧬", "🩸", "🫀", "🫁", "🧠", "👂", "👄", "💆",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.education",
            fallback: "Education",
            icons: [
                "📚", "✏️", "🎓", "🧩", "🖍️", "📐", "🔬", "🗒️", "📓", "📖",
                "📰", "🖊️", "✂️", "📏", "🔭", "🧪", "📒",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.pets",
            fallback: "Pets",
            icons: [
                "🐾", "🐶", "🐱", "🐟", "🐦", "🐢", "🐰", "🐹", "🐭", "🐮",
                "🐷", "🐸", "🐔", "🦜", "🦎", "🐍",
            ]
        ),
        EmojiGroup(
            l10nKey: "icon.group.income",
            fallback: "Income",
            icons: ["💼", "🏆", "🌙", "🧧", "🧑‍💻", "🚀", "📈", "🎉", "✨", "🤑", "💹", "📊", "💸", "🏅", "🥇"]
        ),
        EmojiGroup(
            l10nKey: "icon.group.other",
            fallback: "Other",
            icons: [
                "⚖️", "⭐", "🌟", "🔥", "🌈", "❤️", "🎈", "🕐", "📌", "🌍",
                "❄️", "☀️", "🌊", "🍀", "🌸", "🌺", "🌻", "🌴", "⛰️", "🔔",
            ]
        ),
    ]
}
