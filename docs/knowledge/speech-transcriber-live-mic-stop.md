# SpeechAnalyzer 活麦转写的停止管线

## 问题

iOS 26 `SpeechAnalyzer` / `SpeechTranscriber` 活麦（AVAudioEngine tap 喂 `AsyncStream<AnalyzerInput>`）的停止，有三个真机实测的深坑：

1. `analyzer.finalizeAndFinishThroughEndOfInput()` 的语义是「finalize 并在**到达输入末尾**后 finish」——活麦的输入流永不自然结束，这个调用**永不返回**；results AsyncSequence 不终止，等待它的 `stop()` 永久挂起，UI 冻在录音态。
2. 挂起连锁：`stop()` 入口已把 `isRecording` 翻 false → 带 `guard isRecording` 的 `cancel()` 静默 no-op → 整个拆除被跳过 → **分析器实例泄漏**；几次重试后 `analyzer.start` 抛 `Maximum number of recognizers reached`（并发分析器上限）。
3. **抬指即断流会吃掉最后一个字。** hold-to-talk 的使用场景里，用户习惯「说到末字的同时松手」，于是三件事叠在一起：末字的韵母衰减（汉字约 150–300ms）**整段发生在松手之后**；抬指瞬间 `inputContinuation.finish()` 把流永久关掉，仍在跑的 tap 后续 `yield()` 打在已 finish 的流上**静默丢弃**；即便侥幸送进去，也是切在音节起点、没有尾随静音提交该段——恰是端上识别最易退化的形态。记账话术里被截断的通常正是**金额**（「三十五」→「三十」），且截断不产生歧义候选，`amountAlternatives` 兜不住，只会被模型自信地解析成一个错账。

## 方案

- **结束信号 = 结束输入流**：`inputContinuation.finish()`；再在 Task 里补一发 `finalizeAndFinishThroughEndOfInput()`（不阻塞调用方——部分设备上结果流在输入结束后不主动冲刷，双保险）。
- **尾音补采（hangover）**：`stop()` 不立刻 finish，先挂一个 400ms 的 Task 再关流。这段时间 tap 照常喂音频，末字衰减与尾随静音得以进 analyzer，让末段被正常提交。代价为零——`stop()` 返回前状态机仍在 `.recording`，卡片继续显示实时转写，用户看到最后一个字「落」下来而非界面变慢。补采任务由 `teardown()` 取消，放弃路径不会 finalize。**看门狗从补采结束后才起算**，2 秒预算完整留给 finalize 冲刷，不被补采切走。
- **`stop()` 加看门狗**（按代计数防陈旧）：到期未收到完成信号就强制 resume 等待者 → teardown → 带已有转写收尾——后端无论如何异常，停止管线都不楔死 UI。
- **取消/放弃路径去守卫化**：无条件 `backendDone = true; stopWaiter?.resume(); teardown()`（全部幂等）；每次 start 重置 `backendDone` / `stopWaiter`。
- 启动在途时的松手要挂起（start 落地后回收——典型场景是首次权限弹窗）；start 失败要清掉挂起；start 落地发现已放弃则自行 stop，不留活引擎。
- `AVAudioSession` 同步 `setActive` 在主线程触发 SessionCore 「UI unresponsiveness」警告；**异步 `activate(options:)/deactivate(options:)` 是 iOS 27+**，低部署目标用 `Task.detached` 跑同步调用（AVAudioSession 线程安全，警告只针对主线程）。

实现对照：`Journal/VoiceTranscriber.swift`。
