#if os(macOS)
import SwiftUI

struct QuickAddMenuBarView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(CollectionStore.self) private var store
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismiss) private var dismiss

    @State private var source = ""
    @State private var isAdding = false
    @State private var feedback: Feedback?
    @FocusState private var isFieldFocused: Bool

    enum Feedback: Equatable {
        case success(CollectionItemType)
        case failure(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if authManager.isLoggedIn {
                addContent
            } else {
                loggedOutContent
            }
            Divider()
            footer
        }
        .padding(14)
        .frame(width: 340)
        .onAppear {
            isFieldFocused = true
        }
    }

    private var addContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("快速添加")
                .font(.headline)
            TextField("粘贴单词、短语、句子或链接…", text: $source, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .focused($isFieldFocused)
                .lineLimit(1...5)
                .autocorrectionDisabled()
                .onSubmit(add)
            HStack(spacing: 10) {
                if let detectedType {
                    Text("识别为 \(detectedType.label)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(action: add) {
                    if isAdding {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                    } else {
                        Text("添加")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isAdding || trimmedSource.isEmpty)
            }
            feedbackView
        }
    }

    private var loggedOutContent: some View {
        ContentUnavailableView {
            Label("未登录", systemImage: "person.crop.circle")
        } description: {
            Text("登录语来后即可快速收藏。")
        }
    }

    private var footer: some View {
        HStack {
            Text(authManager.currentUser?.greetingName ?? "语来")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer()
            Button("打开语来") {
                openWindow(id: "main")
                dismiss()
            }
        }
    }

    @ViewBuilder
    private var feedbackView: some View {
        if let feedback {
            switch feedback {
            case .success(let type):
                Label("已加入收藏（\(type.label)）", systemImage: "checkmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.green)
            case .failure(let message):
                Label(message, systemImage: "exclamationmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
    }

    private var trimmedSource: String {
        source.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var detectedType: CollectionItemType? {
        trimmedSource.isEmpty ? nil : CollectionItemType.detect(trimmedSource)
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
            isFieldFocused = true
        }
    }
}
#endif
