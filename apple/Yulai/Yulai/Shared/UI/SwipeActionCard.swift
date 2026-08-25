import SwiftUI

/// A swipe action revealed behind a `SwipeActionCard`.
struct SwipeAction: Identifiable {
    let id = UUID()
    let icon: String
    let color: Color
    /// Optional caption rendered below the icon.
    let title: String?
    let handler: () -> Void

    init(
        icon: String,
        color: Color,
        title: String? = nil,
        handler: @escaping () -> Void
    ) {
        self.icon = icon
        self.color = color
        self.title = title
        self.handler = handler
    }
}

/// iMessage-style swipe card with two stages: a short swipe slides the card
/// aside and settles it open, revealing the actions behind it (tap an action
/// to run it); continuing into a long swipe past `triggerDistance` auto-runs
/// that side's action and springs the card closed. Swiping right reveals
/// `leading`; swiping left reveals `trailing`; swiping the opposite way
/// closes an open card. A side with no action can't be swiped toward.
/// Vertical drags pass through to the enclosing scroll view. Only one card
/// should be revealed at a time — the owner drives `isRevealed` so opening
/// a card closes its siblings.
struct SwipeActionCard<Content: View>: View {
    enum RevealSide {
        case leading
        case trailing
    }

    enum DragAxis {
        case horizontal
        case vertical
    }

    let leadingAction: SwipeAction?
    let trailingAction: SwipeAction?
    @Binding var isRevealed: Bool
    @ViewBuilder let content: Content

    @State private var offsetX: CGFloat = 0
    @State private var revealSide: RevealSide?
    @GestureState private var isDragging = false
    @State private var hasAutoTriggered = false
    @State private var dragAxis: DragAxis?
    /// Translation captured when horizontal tracking starts, subtracted from
    /// later translations so the card eases out of the gesture's dead zone
    /// instead of jumping by it on the first tracked frame.
    @State private var dragAnchor: CGFloat?
    /// True once onEnded ran, distinguishing a normal end from a system
    /// cancellation (scroll view stealing the touch).
    @State private var didEndDrag = false
    /// Whether the action pills are present in the backgrounds. Set as soon
    /// as a horizontal drag locks (the delayed progress mapping keeps them
    /// invisible at first) and cleared inside the spring animation that
    /// closes the card, so removal plays a scale-and-fade exit transition
    /// instead of vanishing instantly.
    @State private var showsActions = false
    /// Bumped each time the card settles open, retriggering the revealed
    /// pill's pop keyframes (grow to full size, overshoot to 105%, settle).
    @State private var revealPopTrigger = 0

    /// Diameter of the circular action revealed behind the card.
    private let actionWidth: CGFloat = 44
    /// Gap kept between the revealed action and the slid card.
    private let actionMargin: CGFloat = 12
    /// Inset on the pill's outer edge so the 105% pop overshoot (56 * 0.05
    /// / 2 ≈ 1.4pt per side) isn't truncated by the cell's `clipped()`.
    private let popOverscan: CGFloat = 2
    /// Distance the card settles at when open: the action plus its margin
    /// plus the pop overscan.
    private var revealDistance: CGFloat {
        actionWidth + actionMargin + popOverscan
    }
    /// A swipe past this distance auto-triggers the revealed action.
    private var triggerDistance: CGFloat { revealDistance + 160 }

    var body: some View {
        content
            // Tap-to-dismiss while revealed. Kept in a lightweight overlay
            // so the card content keeps a stable view identity — swapping
            // `content` between gesture/no-gesture branches rebuilt the
            // whole card and caused a visible flash at drag end.
            .overlay {
                if isRevealed {
                    Color.clear.onTapGesture { resetOffset() }
                }
            }
            .offset(x: offsetX)
            .background(alignment: .leading) {
                if showsActions, let leadingAction {
                    actionHint(leadingAction, reveal: max(offsetX, 0))
                        .padding(.leading, popOverscan)
                        .transition(
                            .scale(scale: 0.3, anchor: .center)
                                .combined(with: .opacity)
                        )
                }
            }
            .background(alignment: .trailing) {
                if showsActions, let trailingAction {
                    actionHint(trailingAction, reveal: max(-offsetX, 0))
                        .padding(.trailing, popOverscan)
                        .transition(
                            .scale(scale: 0.3, anchor: .center)
                                .combined(with: .opacity)
                        )
                }
            }
            // Keep the slid card inside its own grid cell so it never
            // overlaps the neighboring column on multi-column layouts.
            .clipped()
            .gesture(
                DragGesture(minimumDistance: 20)
                    .updating($isDragging) { _, state, _ in state = true }
                    .onChanged { value in
                        guard !hasAutoTriggered else { return }
                        lockDragAxisIfNeeded(value)
                        guard dragAxis == .horizontal else { return }
                        if dragAnchor == nil { dragAnchor = value.translation.width }
                        showsActions = true
                        // Track the finger directly — spring-animating every
                        // drag frame makes the action morph lag and flicker.
                        offsetX = dragOffset(value.translation.width)
                        if offsetX > triggerDistance {
                            hasAutoTriggered = true
                            leadingAction?.handler()
                            resetOffset()
                        } else if offsetX < -triggerDistance {
                            hasAutoTriggered = true
                            trailingAction?.handler()
                            resetOffset()
                        }
                    }
                    .onEnded { value in
                        defer {
                            hasAutoTriggered = false
                            dragAxis = nil
                            dragAnchor = nil
                            didEndDrag = true
                        }
                        guard !hasAutoTriggered, dragAxis == .horizontal else { return }
                        let final = dragOffset(value.translation.width)
                        if final > revealDistance / 2 {
                            open(.leading)
                        } else if final < -revealDistance / 2 {
                            open(.trailing)
                        } else {
                            resetOffset()
                        }
                    }
            )
            // onEnded is skipped when the system cancels the gesture (e.g.
            // the scroll view claims the touch), so also reset the drag
            // state whenever the drag stops being active. A cancellation
            // never ran onEnded, so spring the card back closed.
            .onChange(of: isDragging) {
                if isDragging {
                    didEndDrag = false
                } else {
                    hasAutoTriggered = false
                    dragAxis = nil
                    dragAnchor = nil
                    if !didEndDrag { resetOffset() }
                }
            }
            // A sibling card opening flips this binding back to false.
            .onChange(of: isRevealed) {
                if !isRevealed, offsetX != 0 {
                    revealSide = nil
                    withAnimation(.spring(duration: 0.3)) {
                        showsActions = false
                        offsetX = 0
                    }
                }
            }
    }

    /// An action pill revealed behind the card. It scales up from its
    /// center, but its appearance is delayed until the opened gap is wide
    /// enough to contain the scaled pill plus the margin, so it never shows
    /// beneath the card; swiping past the reveal stretches it toward the
    /// card, always keeping the margin between them.
    @ViewBuilder
    private func actionHint(_ action: SwipeAction, reveal: CGFloat) -> some View {
        // The pill is centered in its 56pt square, so its scaled half-width
        // is actionWidth / 2 * progress. It stays hidden until the card has
        // opened actionWidth / 2 + margin, then grows to full size exactly
        // as the gap reaches the settle distance.
        let progress = min(
            max(reveal - actionWidth / 2 - actionMargin, 0) / (actionWidth / 2),
            1
        )
        KeyframeAnimator(initialValue: 1.0, trigger: revealPopTrigger) { pop in
            Button {
                action.handler()
                resetOffset()
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: action.icon)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(
                            width: max(actionWidth, reveal - actionMargin - popOverscan),
                            height: actionWidth
                        )
                        .background(Capsule().fill(action.color))
                    if let title = action.title {
                        Text(title)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            .buttonStyle(.plain)
            .frame(maxHeight: .infinity)
            .scaleEffect(progress, anchor: .center)
            .scaleEffect(pop, anchor: .center)
            .opacity(min(progress * 1.5, 1))
            .allowsHitTesting(isRevealed)
        } keyframes: { _ in
            // Rides the 0.3s settle spring (progress scale above): the
            // pop starts while the card is still moving and peaks near
            // the spring's own overshoot, so card and pill come to rest
            // together at 0.3s.
            KeyframeTrack(\.self) {
                CubicKeyframe(1.0, duration: 0.1)
                CubicKeyframe(1.05, duration: 0.08)
                CubicKeyframe(1.0, duration: 0.12)
            }
        }
    }

    /// Tracks the finger from either the closed or the revealed position.
    /// From an open card, dragging the opposite way only closes — it never
    /// crosses over into the other side's reveal. Sides without an action
    /// can't be dragged toward at all.
    private func dragOffset(_ translation: CGFloat) -> CGFloat {
        let base = revealSide.map { $0 == .leading ? revealDistance : -revealDistance } ?? 0
        var offset = base + translation - (dragAnchor ?? 0)
        if isRevealed, let side = revealSide {
            switch side {
            case .leading: offset = max(offset, 0)
            case .trailing: offset = min(offset, 0)
            }
        }
        if leadingAction == nil { offset = min(offset, 0) }
        if trailingAction == nil { offset = max(offset, 0) }
        return offset
    }

    private func open(_ side: RevealSide) {
        guard action(for: side) != nil else { return }
        revealPopTrigger += 1
        withAnimation(.spring(duration: 0.3)) {
            revealSide = side
            isRevealed = true
            offsetX = side == .leading ? revealDistance : -revealDistance
        }
    }

    private func resetOffset() {
        withAnimation(.spring(duration: 0.3)) {
            showsActions = false
            revealSide = nil
            isRevealed = false
            offsetX = 0
        }
    }

    private func action(for side: RevealSide) -> SwipeAction? {
        side == .leading ? leadingAction : trailingAction
    }

    /// Locks the drag axis once the movement is unambiguous, so a wiggling
    /// finger can't flip it mid-gesture (which made the revealed action
    /// flash on and off).
    private func lockDragAxisIfNeeded(_ value: DragGesture.Value) {
        guard dragAxis == nil else { return }
        let width = abs(value.translation.width)
        let height = abs(value.translation.height)
        guard max(width, height) > 12 else { return }
        dragAxis = width > height ? .horizontal : .vertical
    }
}
