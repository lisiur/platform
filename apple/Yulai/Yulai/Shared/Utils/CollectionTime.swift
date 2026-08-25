import Foundation

enum CollectionTime {
    static func relative(_ date: Date) -> String {
        let interval = Date.now.timeIntervalSince(date)
        if interval < 60 { return "just now" }
        let minutes = Int(interval / 60)
        if minutes < 60 { return "\(minutes) min ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours) h ago" }
        let days = hours / 24
        if days < 7 { return "\(days) d ago" }
        return date.formatted(.dateTime.year().month().day())
    }

    static func full(_ date: Date) -> String {
        date.formatted(
            .dateTime.year().month().day().hour().minute().second()
        )
    }
}
