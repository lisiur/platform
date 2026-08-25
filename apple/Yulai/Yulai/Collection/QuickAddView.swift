import SwiftUI

/// Dedicated quick-add page behind the "Add" tab: paste or type any
/// word, phrase, or sentence — the type is detected automatically.
struct QuickAddView: View {
    @Environment(CollectionStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var source = ""
    @State private var isAdding = false
    @State private var feedback: Feedback?
    @FocusState private var isSourceFocused: Bool

    enum Feedback: Equatable {
        case success(CollectionItemType)
        case emptyPasteboard
        case failure(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Enter a word, phrase, or sentence — the type will be detected automatically.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            sourceField
            if let detectedType {
                Text("Detected: \(detectedType.label)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            controlsRow
            feedbackView
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .animation(.snappy(duration: 0.2), value: feedback)
        #if os(macOS)
        .onAppear { isSourceFocused = true }
        #endif
    }

    /// A vertical-axis `TextField` renders its own placeholder, so the
    /// cursor and placeholder are always aligned — unlike a `TextEditor`
    /// with a hand-drawn overlay, whose insets never quite match.
    private var sourceField: some View {
        TextField(
            "Paste or type a word, phrase, or sentence…",
            text: $source,
            axis: .vertical
        )
        .lineLimit(3...)
        .font(.body)
        .focused($isSourceFocused)
        .autocorrectionDisabled()
        #if os(iOS)
        .textInputAutocapitalization(.never)
        #else
        .textFieldStyle(.plain)
        #endif
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(
            maxWidth: .infinity,
            maxHeight: .infinity,
            alignment: .topLeading
        )
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                #if os(macOS)
                .fill(.quaternary)
                #else
                .fill(Color(.secondarySystemBackground))
                #endif
        )
    }

    private var controlsRow: some View {
        HStack(spacing: 12) {
            Button {
                pasteIntoField()
            } label: {
                Label("Paste", systemImage: "doc.on.clipboard")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(isAdding)

            addButton
        }
    }

    private var addButton: some View {
        Button {
            add()
        } label: {
            Group {
                if isAdding {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    Text("Add")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isAdding || trimmedSource.isEmpty)
    }

    @ViewBuilder
    private var feedbackView: some View {
        if let feedback {
            switch feedback {
            case .success(let type):
                Label("Added to collection (\(type.label)）", systemImage: "checkmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.green)
                    .transition(.opacity)
            case .emptyPasteboard:
                Label("Nothing on the clipboard to paste", systemImage: "exclamationmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .transition(.opacity)
            case .failure(let message):
                Label(message, systemImage: "exclamationmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .transition(.opacity)
            }
        }
    }

    private var trimmedSource: String {
        source.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var detectedType: CollectionItemType? {
        trimmedSource.isEmpty ? nil : CollectionItemType.detect(trimmedSource)
    }

    private func pasteIntoField() {
        guard
            let text = clipboardText?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !text.isEmpty
        else {
            feedback = .emptyPasteboard
            return
        }
        source = text
        feedback = nil
        isSourceFocused = true
    }

    private func add() {
        let trimmed = trimmedSource
        guard !trimmed.isEmpty, !isAdding else { return }
        feedback = nil
        isAdding = true
        Task {
            do {
                _ = try await store.add(trimmed)
                await store.reloadQuietly()
                #if os(iOS)
                // On iOS quick-add lives in a sheet — close it after a
                // successful add. (macOS shows it as a page/menu item.)
                dismiss()
                #endif
            } catch {
                feedback = .failure(error.localizedDescription)
                isAdding = false
                isSourceFocused = true
            }
        }
    }

    private var clipboardText: String? {
        #if os(macOS)
        NSPasteboard.general.string(forType: .string)
        #else
        UIPasteboard.general.string
        #endif
    }
}

#Preview {
    NavigationStack {
        QuickAddView()
            .navigationTitle("Add")
    }
    .environment(CollectionStore())
}
