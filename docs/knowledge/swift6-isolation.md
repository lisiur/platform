# Swift 6 并发隔离迁移模式（默认 MainActor）

## 默认 MainActor 隔离下的惯例

- `@MainActor` 类里需要跨域（nonisolated 上下文）访问的常量：标 **`nonisolated static let`**。
- Codable 模型：**存储属性**可从 nonisolated 读；**计算属性**不行——需要跨域读的计算属性单独标 `nonisolated var`。
- 非 Sendable 对象（`NumberFormatter` 等）：每次调用现建（前提：调用不热），换取函数可从任意隔离调用；不要引入共享可变实例。
- 扩展/Widget 目标共享模型时**不改模型的隔离标注**，用 `@MainActor` 辅助方法包装查询。
- Widget 类 target 的 scheme 用 `generic/platform=iOS Simulator`（真实平台 scheme 编不过）。

## 编译器假错（重要）

**"failed to produce diagnostic"** = type-checker 被长内联表达式压垮后崩溃的假错，不是真错：把长表达式**拆成局部变量**即可消除。与「陈旧诊断 touch + 重编」是两回事，先拆表达式再查别的。
