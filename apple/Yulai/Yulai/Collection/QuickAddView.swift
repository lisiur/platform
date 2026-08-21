import SwiftUI

/// Dedicated quick-add page behind the "添加" tab: paste or type any
/// word, phrase, or sentence — the type is detected automatically.
struct QuickAddView: View {
    @Environment(CollectionStore.self) private var store

    @State private var source = ""
    @State private var isAdding = false
    @State private var feedback: Feedback?
    @FocusState private var isSourceFocused: Bool

    enum Feedback: Equatable {
        case success(CollectionItemType)
        case failure(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("输入单词、短语或句子，类型将自动识别。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            sourceField
            if let detectedType {
                Text("识别为 \(detectedType.label)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            controlsRow
            feedbackView
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .animation(.snappy(duration: 0.2), value: feedback)
        .onAppear { isSourceFocused = true }
    }

    /// A vertical-axis `TextField` renders its own placeholder, so the
    /// cursor and placeholder are always aligned — unlike a `TextEditor`
    /// with a hand-drawn overlay, whose insets never quite match.
    private var sourceField: some View {
        TextField(
            "粘贴或输入单词、短语或句子…",
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
                Label("粘贴", systemImage: "doc.on.clipboard")
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
                    Text("添加")
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
                Label("已加入收藏（\(type.label)）", systemImage: "checkmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.green)
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
            feedback = .failure("剪贴板没有可粘贴的内容")
            return
        }
        source = text
        feedback = nil
        isSourceFocused = true
    }

    private func add() {
        let trimmed = trimmedSource
        guard !trimmed.isEmpty, !isAdding else { return }
        let type = CollectionItemType.detect(trimmed)
        feedback = nil
        isAdding = true
        Task {
            do {
                _ = try await store.add(trimmed)
                source = ""
                feedback = .success(type)
                await store.reloadQuietly()
            } catch {
                feedback = .failure(error.localizedDescription)
            }
            isAdding = false
            isSourceFocused = true
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
            .navigationTitle("添加")
    }
    .environment(CollectionStore())
}
