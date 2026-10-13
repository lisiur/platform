# 钱来 · 语音输入 + AI 自动记账 设计方案

> 状态：**已实施（M0+M1），2026-10-09 评审裁决已回写（见 §13）**
> 目标读者：服务端 / iOS / 评审 agent
> 最后更新：2026-10-09

---

## 0. 一页速览

语音记账**不新建管线**，而是给现有截图识别换一种输入源：

```
麦克风
  → SpeechAnalyzer / SpeechTranscriber（端上，音频不出设备）
  → 转写文本
  → POST bookkeeping/ledgers/{id}/entries/recognize-voice
  → qianlai_voice agent（文本模型）
  → screenshotRecognitionSchema（复用，单笔契约）
  → RecognitionSeeding（复用，纯函数）
  → QuickEntryView（复用，AI 模式草稿）
  → 人工确认 → createEntry（复用）
```

**服务端新增**：1 个 agent code、1 条 route、1 个 prompt builder、1 个 service 函数、1 份种子数据、1 份 manual SQL。
**iOS 新增**：1 个转写器、1 个录音视图、1 处 store 方法、2 条权限文案。
**零改动**：确认流 UI、落库路径、entry schema、`RecognitionSeeding`、`RecognitionBudget`。

---

## 1. 已确认的产品决策

这四条是本方案的边界，任何评审意见若要改变它们，请显式说明原因。

| # | 决策 | 取值 |
|---|---|---|
| D1 | 覆盖端 | **仅 iOS 原生**。Web（`apps/qianlai`）不在本次范围 |
| D2 | ASR 位置 | **端上**。音频不离开设备 |
| D3 | 解析产物形态 | **完全复用现有单笔契约**。一句话 = 一笔，不支持 `entries[]` |
| D4 | 自动化程度 | **永远只生成草稿**，人工确认后落库 |

D3 的直接后果见 [§5.3](#53-一句话多笔的单笔契约降级语义) —— 这是本方案最需要评审取舍的地方。

---

## 2. 现有可复用资产盘点

评审前请确认这些坐标仍然成立，它们是本方案低成本的前提。

### 服务端

| 资产 | 位置 | 说明 |
|---|---|---|
| 单笔识别 schema | `packages/service/src/modules/bookkeeping/recognize.service.ts:26` | `screenshotRecognitionSchema`，**直接复用，不改一字** |
| Agent 解析 | `packages/service/src/modules/agent/agent-resolution.service.ts:226` | `resolveAgentModel({agentCode, subAgent, principal, requireCapability})` |
| 计费 + 额度 | `packages/service/src/modules/agent/tracked-ai-call.ts:118` | `executeTrackedAiCall`：usage event → 预留额度 → 调用 → 结算/退款 |
| 计费配置解析 | `packages/service/src/modules/billing/billing.service.ts` | `resolveBilling(BILLING_RESOURCE_AI_AGENT, agentCode)` |
| 分类清单 | `packages/service/src/modules/bookkeeping/account.repository.ts` | `listRecognitionCategoryPaths(ledgerId)` |
| 路由样板 | `packages/service/src/modules/bookkeeping/routes/journal-entry/recognizeScreenshot.ts:79` | `POST /ledgers/{id}/entries/recognize-screenshot` |
| 账本权限 | `packages/service/src/modules/bookkeeping/access.ts` | `requireLedgerAccess(userId, ledgerId, "guest")` |
| 测试样板 | `packages/service/src/modules/bookkeeping/__tests__/recognize.service.test.ts` | prompt 纯函数测 + mock + 402/502 断言 |

### iOS

| 资产 | 位置 | 说明 |
|---|---|---|
| 识别 DTO | `apple/Qianlai/QianlaiShared/BookkeepingModels.swift:1374` | `ScreenshotRecognition`，**复用，不改** |
| 草稿映射 | `apple/Qianlai/QianlaiShared/BookkeepingModels.swift:306` | `RecognitionSeeding`：纯 `nonisolated` 函数，已有单测，**复用，不改** |
| 权限门 | `apple/Qianlai/QianlaiShared/BookkeepingModels.swift:98` | `canRecognizeScreenshots == (!isGuest && canPost)` |
| 确认流 | `apple/Qianlai/Qianlai/Journal/QuickEntryView.swift` | AI 模式草稿 → 确认 → `post` |
| Store | `apple/Qianlai/Qianlai/Bookkeeping/JournalStore.swift:507` | `post(_ draft:)` → `client.send("POST", …, body: draft.body)` |
| HTTP 客户端 | `apple/Qianlai/QianlaiShared/API/APIClient.swift:113` | `request(_:_:body:)` 泛型 JSON POST |
| 部署目标 | `apple/Qianlai/Qianlai.xcodeproj/project.pbxproj:481` | `IPHONEOS_DEPLOYMENT_TARGET = 26.0` |

### 种子数据

| 资产 | 位置 |
|---|---|
| features | `packages/service/src/seed.ts:1469` |
| planFeatures | `packages/service/src/seed.ts:1491` |
| aiAgents | `packages/service/src/seed.ts:1738` |
| billingConfigs | `packages/service/src/seed.ts:1812` |
| 存量库手工迁移先例 | `packages/service/prisma/manual-20260921-qianlai-receipt.sql` |

---

## 3. 端到端时序

```
 iOS                          Service
  │                             │
  ├─ 1. 权限: 麦克风 + 语音识别   │
  ├─ 2. AssetInventory: 确保 zh-CN 资产已安装（首次需下载）
  ├─ 3. prepareToAnalyze 预热
  ├─ 4. AVAudioEngine tap ──┐
  │    ← volatile 转写文本    │ 实时刷新 UI
  │    ← VAD 静音 1.2s        │
  ├─ 5. finalize(through:)   │
  ├─ 6. 得到最终文本           │
  ├─ 7. POST recognize-voice ──→ resolveBilling(qianlai_voice)
  │      { text, now }           resolveAgentModel(qianlai_voice, 无 capability 限制)
  │                             buildVoicePrompt(categories, now)
  │                             executeTrackedAiCall → generateObject
  │        ←── ScreenshotRecognition（单笔草稿）──┤
  ├─ 8. RecognitionSeeding.* 映射
  ├─ 9. QuickEntryView（AI 模式预填）
  ├─ 10. 用户确认
  └─ 11. POST entries ────────→ createEntry（已有）
```

---

## 4. 服务端设计

### 4.1 为什么新建 `qianlai_voice`，而不是复用 `qianlai_receipt`

`recognize.service.ts:16-19` 把 agent 钉死为三件套：

```ts
export const QIANLAI_RECEIPT_AGENT_CODE = "qianlai_receipt";
const SUB_AGENT = "default";
const REQUIRED_CAPABILITY = "vision";
```

直接拿它跑纯文本有三个问题：

1. **付错模型的钱** —— `requireCapability: "vision"` 会把候选模型过滤成 vision-capable（`agent-resolution.service.ts:296-299`）。一个便宜的小文本模型会被过滤掉，你为纯文本任务按 VL 模型计价。
2. **prompt 前提全错** —— `buildRecognitionPrompt` 首句即 `The attached images are consecutive vertical tiles…`（`recognize.service.ts:104`），selection rules 整段讲截图里的交易可见性。
3. **额度池被污染** —— `resolveBilling(BILLING_RESOURCE_AI_AGENT, "qianlai_receipt")` 按 agent code 走。语音的边际成本（端上 ASR）为零，与截图共用单价会锁死定价杠杆。

**结论：复用「输出 schema + iOS 确认流」，不复用 agent 行。** 这与 D3 兼容 —— 契约指的是输出结构，不是配置行。

### 4.2 新路由

```
operationId: recognizeQianlaiVoice
method:      post
path:        /ledgers/{ledgerId}/entries/recognize-voice
tags:        ["QianlaiJournal"]
summary:     "Recognize a spoken utterance into a draft entry"
body:        application/json
responses:   200 = screenshotRecognitionSchema
             400 / 401 / 403 / 404 复用共享 error schema
             402 额度不足（由 executeTrackedAiCall 抛出）
             502 模型调用失败
```

请求体：

```jsonc
{
  "transcript": "昨天星巴克买了杯拿铁三十五",  // 必填，1..1000（ASR 转写原文）
  "now":        "2026-09-28T15:17:00"        // 必填，客户端本地墙钟，免时区偏移
}
```

**新增 `now` 字段是必要的，不是可选优化。** 截图契约里 `occurredAt` 是「图上印着的时间」，模型看得见；但语音里时间是「昨天/上周五」，必须相对某个基准解析，而 LLM 没有时钟。更不能由服务端拿自己的时区去猜 —— 部署机时区和用户时区不一致时会把每一条账的日期都写错。所以由客户端上送本地墙钟时间，无时区偏移，与 `occurredAt` 的输出格式保持对称。

> **已裁决（2026-10-09，R1/R6 of §13）**：客户端传 `now`，且为**必填** —— 服务端不实现时区回退（唯一客户端 iOS 恒发送，缺省即 400）。字段名定为 `transcript`（ASR 转写原文）。

### 4.3 新 service 函数

放在 `recognize.service.ts`（与截图同文件，共享 schema 常量），签名：

```ts
export async function recognizeVoice(params: {
  userId: string;
  ledgerId: string;
  transcript: string;
  now: string;           // 客户端本地墙钟（必填）
}): Promise<VoiceRecognition>   // = ScreenshotRecognition 的类型别名（R2）
```

实现骨架与 `recognizeScreenshot`（`recognize.service.ts:140`）一致，差异只有四处：

| 步骤 | 截图版 | 语音版 |
|---|---|---|
| 计费 | `resolveBilling(BILLING_RESOURCE_AI_AGENT, "qianlai_receipt")` | 同上，agent code 换 `qianlai_voice` |
| 模型解析 | `resolveAgentModel({…, requireCapability: "vision"})` | `resolveAgentModel({…})`，**不传 requireCapability** |
| prompt | `buildRecognitionPrompt(categories)` | `buildVoicePrompt(categories, now)` |
| 消息 | `content: [text, …tiles]` | `content: [{ type: "text", text: prompt }, { type: "text", text: utterance }]` |

**不传 `requireCapability` 是刻意的**：这样将来在 admin 里给 `qianlai_voice` 单独 pin 一个更便宜的文本模型，无需改一行代码。

### 4.4 `buildVoiceRecognitionPrompt`（核心产出）

```ts
export function buildVoiceRecognitionPrompt(
  categories: { expense: string[]; income: string[] },
  now: string,
): string
```

规则正文（**以 `recognize.service.ts` 实现为准**，2026-10-09 回写要点）：

```
The transcript below is the user speaking ONE transaction out loud, in
natural speech (usually Chinese). Extract that transaction.
Current local time (the anchor for every relative expression): {now}

Field rules:（要点，全文以 recognize.service.ts 为准）
- kind：expense 为默认方向（口语记账绝大多数是支出），收到/工资/报销等才 income。
- amount：口语数量归一化 —— 三十五块 → 35、两块五 → 2.5、一百二 → 120、五十六点五 → 56.5。
- amountAlternatives：按本节原案实施 —— 预折价、显式更正（"不对,是 53"）、被降级交易的金额；去重、保持语序、至多 4 条。
- occurredAt：相对表达对照锚点解析；口语时刻（下午 3 点 / 15:30）定时间；模糊时段映射代表时刻（凌晨→01:00、早上→08:00、中午→12:00、下午→15:00、晚上→19:00）；完全没提日期或「今天」未提时刻 → null（客户端沿用当前时刻）；**其他日期未提时刻 → 当日 00:00:00（保住日期，R4）**。
- merchant / memo：说出的对手方与事由，verbatim；没有就 null，绝不从分类编造。
- **transcript：原文以 `Transcript:` 块附在规则之后（R12）**——开头 "The transcript below" 指的就是它。
- categoryName / categoryAlternatives：与截图 prompt 同一段稳定键规则。
- confidence：high/medium/low；recognized:false 时为 null。

Selection rules:
- 一句话一笔。多笔取最完整一笔、绝不合并，被降级笔金额进 amountAlternatives（§5.3）。
- **自有账户间转账（转账、从招行转到余额宝）不可记 → recognized:false（R5，共享 schema 无 transfer kind）**。
- 完全没有交易（闲聊、提问、无金额可恢复）→ recognized:false，其余字段全 null。
- 绝不编造没说出的值 —— 用 null；只回一个合法 JSON 对象。
```

**`RECOGNITION_SHAPE_HINT` 已提取为共享常量**（`recognize.service.ts`）——两个 prompt 还共享 `renderCategorySections`（分类清单 + shape hint 尾段）与 categoryAlternatives 规则行，截图/语音不可能漂移。

### 4.5 Schema 命名（可选清理）

`screenshotRecognitionSchema` / `ScreenshotRecognition` 这个名字要开始承载语音结果。建议重命名为 `entryRecognitionSchema` / `EntryRecognition`，并保留兼容别名：

- 服务端：`export const entryRecognitionSchema = …; export const screenshotRecognitionSchema = entryRecognitionSchema;`
- iOS：`typealias ScreenshotRecognition = EntryRecognition`

成本约十行，收益是半年后不会有人以为这个类型只能喂图片。

> **已裁决（2026-10-09，R2）：不做重命名。** 保留 `screenshotRecognitionSchema` / `ScreenshotRecognition`，语音侧以 `export type VoiceRecognition = ScreenshotRecognition` 别名承载语义。

### 4.6 种子数据

**已实施（2026-10-09）**：`seed.ts` 四处数组均已落行 —— 文案以 seed 实际值为准（与本文草稿有措辞差异，无语义差别）。

原文四处追加：

**features（`:1469`）**

```ts
{
  code: "qianlai_voice",
  name: "Qianlai Voice Entry",
  description: "Record bookkeeping entries by voice.",
  status: "active",
},
```

**planFeatures（`:1491`）**

```ts
{ planCode: "basic", featureCode: "qianlai_voice" },
```

**aiAgents（`:1738`）**

```ts
{
  code: "qianlai_voice",
  name: "Qianlai Voice Entry",
  description: "Turns one spoken utterance into a draft bookkeeping entry.",
  status: "active",
  allowedApis: [] as string[],
  subAgents: {
    default: {
      label: "Voice Entry",
      description: "Extracts one transaction from a spoken utterance.",
      modelId: "deepseek-v4-flash",
      systemPrompt: [
        "You are the voice-entry engine inside Qianlai, a personal double-entry bookkeeping app.",
        "You receive ONE short spoken utterance describing a bookkeeping entry and must extract exactly one transaction from it.",
        "",
        "Respond with ONLY a single valid JSON object — no markdown, no code fences, no commentary.",
        "Never invent values the user did not speak; use null.",
      ].join("\n"),
      reasoning: "none" as const,
    },
  },
},
```

> `modelId` 暂用 `deepseek-v4-flash`（与其他 agent 一致，seed 里已有的唯一模型行）。若要更便宜的纯文本模型，需先在 admin 建一行 `ai_model`，属于**上线前置项**。

**billingConfigs（`:1812`）**

```ts
{
  resourceType: "ai_agent",
  resourceId: "qianlai_voice",
  billingType: "per_call",
  priceUnit: "credit",
  priceAmount: 1,
  status: "active",
  description: "Bill Qianlai voice entry as a fixed flat call price.",
},
```

### 4.7 存量库手工迁移

新库由 `seed.ts` 自动覆盖（`src/app.ts` 首次启动即播种），但**已存在的部署需要一份手工 SQL**，先例是 `prisma/manual-20260921-qianlai-receipt.sql`。新建：

```
packages/service/prisma/manual-20260928-qianlai-voice.sql
```

内容照抄 receipt 那份的结构：feature → plan_feature → ai_agent → billing_config 四段 INSERT + 末尾 Verification 查询块（receipt 那份的 `:85-97` 是模板）。

**已创建（2026-10-09）**。与 receipt 版的差异：无 `ai_model` capabilities 步骤 —— 语音不传 capability，无需给 `deepseek-v4-flash` 追加标签。

### 4.8 服务端测试计划

照 `__tests__/recognize.service.test.ts` 的现有模式：

| 用例 | 断言 |
|---|---|
| `buildVoicePrompt` 纯函数 | 输出含 reference time、分类清单、shape hint；不含任何 "screenshot"/"image"/"tile" 残留 |
| 分类注入 | mock `listRecognitionCategoryPaths`，断言路径进入 prompt |
| 无 `requireCapability` | 断言 `resolveAgentModel` 收到的参数里**没有** `requireCapability` 键 |
| 不传 `now` | 回退到服务端时区；prompt 仍含合法时间 |
| 402 | 透传 `HTTPException(402)`，不被包成 502 |
| 非 HTTP 异常 | 包成 `HTTPException(502)` |
| 语音不上传 | 断言传给 `executeTrackedAiCall` 的 `input.prompt` 与 `fn` 里发出的 content 都不含音频二进制 |

**已实施（2026-10-09）**：`__tests__/recognize.service.test.ts` 覆盖 —— prompt 纯函数（含锚点时间/分类清单/shape hint/降级笔金额规则）、service 级分类注入、无 `requireCapability` 键、402 透传、非 HTTP 异常包 502、body schema（含拒收带时区偏移的 `now`）。「不传 now 回退服务端时区」一行随 `now` 必填裁决作废；「语音不上传」由类型构造保证 —— `generateObject` 的 `messages` 只含 text part，无音频通道。

---

## 5. iOS 设计

### 5.1 为什么是 `SpeechAnalyzer` 而不是 `SFSpeechRecognizer`

部署目标 `26.0`（`project.pbxproj:481`）= `SpeechAnalyzer` 的引入版本 `26.0`。Apple 在 WWDC25 session 277 中明确：`SpeechAnalyzer` **replaces `SFSpeechRecognizer` introduced in iOS 10**。

因此：**无需 `@available` 分支、无需降级路径、无需兼容层**。

### 5.2 一个硬约束：`CaptureInputSequenceProvider` 不可用

Apple 官方示例 "Recognizing speech in live audio" 使用 `CaptureInputSequenceProvider`（自动配置 capture session + 音频转换），但示例文档自述该类 **introduced in macOS and iOS 27**。

26.0 够不着。必须自己搭 `AVAudioEngine` tap + `AnalyzerInputConverter`，即 WWDC 演示的路径。**实现者请不要照抄官方示例直接跑。**

### 5.3 一句话多笔的单笔契约降级语义

D3 选定单笔契约，所以「昨天星巴克35，中午麦当劳45」只能产出一笔。prompt 的处理是：**取最完整的一笔，其余的金额进 `amountAlternatives`，绝不合并**。

用户会在 `RecognitionAmountPad` 的多候选金额里看到 45，但看不到第二笔的商家和分类。这是已知的信息损失，是 D3 的直接代价。

> **已拍板（2026-10-09，R3）：接受降级并按本节原案实施** —— 取最完整一笔为主，被降级笔金额进 `amountAlternatives`（至多 4 条），prompt 已按此实现并有测试断言。用户在金额多候选里看到 45 属预期行为。

### 5.4 资产与预热

`SpeechTranscriber` 的模型由系统按语言分发，**首次使用可能未安装**。

```swift
let transcriber = SpeechTranscriber(locale: Locale(identifier: "zh-CN"),
                                     preset: .transcription)

if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
    try await request.downloadAndInstall()   // 首次几百 MB，必须有进度态
}
```

这是语音功能的第一个用户可见瞬间。产品决策待定（见 §9 Q4）：进入快速记账页时静默预热，还是拦在权限弹窗前。**倾向后者反面**：进入页面即后台预热 + 进度提示，不阻塞。

`prepareToAnalyze(in:)` 预热分析器以降低「按下麦克风 → 第一个结果」的延迟；`SpeechAnalyzer.Options` 的 model retention 可让模型常驻避免每次重载。

### 5.5 实时转写的消费方式（易错点）

`SpeechTranscriber` **不累积整段文本**，它给的是「一段时间范围上的一个结果」。官方示例要求：

> The transcriber module doesn't accumulate an overall transcription. Instead, it provides a number of results for different audio time ranges… The app uses the audio time range of each result to determine if part of the overall transcript needs to be replaced.

所以 UI 层必须维护一个整体转写，**按 `result.timeRange` 替换对应片段**，而不是 append。volatile results 先给不准的预览文本，后续被 finalized 结果替换 —— 这正是「说完立刻显示、再慢慢变准」的体验。

结束路径：

| 场景 | 调用 |
|---|---|
| 静音 1.2s 自动结束 | `finalize(through:)` |
| 30s 硬上限 | `finalizeAndFinishThroughEndOfInput()` |
| 用户主动取消 | `cancelAndFinishNow()` |

### 5.6 VAD

上一版方案建议手写静音计时器。实际上 `SpeechAnalyzer` 是可组合模块架构，除 `SpeechTranscriber` 外还有 **`SpeechDetector`（系统级 VAD）**。**优先用 `SpeechDetector` 而非手写计时器**，具体接法待实现时定。

### 5.7 权限

沿用仓库既有约定（`project.pbxproj:465-468` 已有 `INFOPLIST_KEY_NSCameraUsageDescription` 等），**不手改 Info.plist**：

```
INFOPLIST_KEY_NSSpeechRecognitionUsageDescription = "钱来用语音把你的话转成一条记账草稿，音频不会离开你的设备。"
INFOPLIST_KEY_NSMicrophoneUsageDescription          = "钱来需要麦克风来听你记账。"
```

**两个配置块（Debug 与 Release）都要加。**

### 5.8 自定义语言模型（建议提到 M1）

iOS 26 Speech 框架提供 `SFCustomLanguageModelData`（iOS 17 已有）+ `SFSpeechLanguageModel` + `.customizedLanguage(modelConfiguration:)` content hint。

**这是对本功能准确率影响最大的单项优化**：把用户自己的历史商家名和分类名（`AccountTreeEntry`、历史 `merchant`）喂进自定义语言模型，等于让端上模型学会该用户的专有名词，**在零边际成本前提下抹掉端上 ASR 的主要短板**，从而大幅降低「是否需要服务端 ASR」的必要性。

### 5.9 文件清单

| 动作 | 文件 |
|---|---|
| 新增 | `apple/Qianlai/Qianlai/Journal/VoiceTranscriber.swift`（`VoiceTranscribing` 协议 + `VoiceTranscriber` 实现 + 错误类型） |
| 新增 | `apple/Qianlai/Qianlai/Journal/VoiceEntryModel.swift`（hold-to-talk 状态机；`VoiceEntryView` 子页已随 R10 移除，语音卡由 `AIBookkeepingView` 直接驱动） |
| 改名 | `Journal/ScreenshotRecognizeView.swift` → `AIBookkeepingView.swift`（双入口页定名；`AIInputCard` 为两门共享卡片外壳，`screenshotRecognitionCover` → `aiBookkeepingCover`） |
| 修改 | `JournalStore.swift` —— 紧邻 `recognizeScreenshot` 新增： |

```swift
/// AI parsing of one spoken transaction (the on-device transcript) into
/// a draft payload — the voice sibling of `recognizeScreenshot`, same
/// result shape, billed per use. `now` is the local wall clock the
/// server resolves relative dates ("昨天早上") against.
func recognizeVoice(
    ledgerId: String,
    transcript: String,
    now: String
) async throws -> ScreenshotRecognition {
    struct VoiceRecognitionBody: Encodable {
        let transcript: String
        let now: String
    }
    return try await client.request(
        "POST",
        "bookkeeping/ledgers/\(ledgerId)/entries/recognize-voice",
        body: VoiceRecognitionBody(transcript: transcript, now: now)
    )
}
```

| 修改 | `project.pbxproj` —— 两个配置块各加两条 `INFOPLIST_KEY_NS*UsageDescription` |
| 修改 | `apple/Qianlai/QianlaiShared/Localizable.xcstrings` —— 新文案 |
| 新增测试 | `apple/Qianlai/QianlaiTests/VoiceEntryTests.swift` |

**复用不改**：`ScreenshotRecognition`、`RecognitionSeeding`、`QuickEntryView`、`QuickEntryDraft`、`canRecognizeScreenshots`（可加同条件别名 `canUseVoiceEntry`）。

### 5.10 UI 落点

**2026-10-09 产品裁决（R10）：hold-to-talk 上卡片，语音子页移除。** AI 记账页的语音卡即录音面：**触摸当下即开始录音**（`DragGesture(minimumDistance: 0)`；初版 0.3s 长按门限因「起录延迟 + 按住不动时松手事件不可靠」被推翻），转写实时显示在卡上，**手指松开即停止并解析**——不再有「点卡片 → 进语音子页 → 点麦克风 → 点完成」的层级。竞态由模型兜住：stage 在触摸瞬间同步翻转（不等 `transcriber.start()` 返回），启动未完成时的松手挂进 `pendingFinish`、由 start 完成路径回收；页面 Cancel 走 `abandon()`，启动落地时发现已放弃则自行 stop，不留活引擎。

```
AI 记账页语音卡（hold-to-talk）
  ├─ idle：mic + 「语音说一笔」+「按住说话，松开结束」
  ├─ 录音中：脉冲 mic + 实时转写 + 「松开结束」
  ├─ 松手 → 解析中：spinner
  └─ 解析完成 → RecognitionSeeding → QuickEntryView（cover 原地换装）
```

**不要**为语音再写一套确认 UI。页面外层 Cancel 兼任录音中断（`transcriber.cancel()`）。

### 5.11 测试策略

Apple 示例明确说明**该 sample 在模拟器中无法运行，必须真机**。所以 ASR 无法进现有测试体系。

做法：把转写能力抽成协议，用 fake 覆盖状态机。

```swift
@MainActor
protocol VoiceTranscribing: AnyObject {
    var partialText: String { get }   // 实时转写（@Observable 观察驱动，非 AsyncStream）
    func start() async throws          // 权限 + 资产 + 引擎
    func stop() async -> String        // 返回最终文本
    func cancel()                      // 不等最终结果直接拆
}

enum VoiceTranscriptionError: LocalizedError {
    case microphonePermissionDenied
    case speechPermissionDenied
    case assetsUnavailable
    case localeUnsupported
    case engineFailure(String)
}
```

**已实施（2026-10-09，R7）**：页面状态机抽成 `@MainActor @Observable` 的 `VoiceEntryModel`（视图只渲染），`QianlaiTests/VoiceEntryTests.swift` 以 fake 覆盖 8 个用例：进入录制/无账本不起麦/权限拒绝回落/空转写不解析/成功交接（含 ledgerId、转写、免偏移 now 格式）/软未识别回落/402 专属文案/demo 三阶段短路。

`RecognitionSeeding` 已有单测且**不需要新增**（输入结构没变）。

---

## 6. 错误与降级矩阵

| 情况 | 服务端 | iOS 行为 |
|---|---|---|
| 无麦克风权限 | — | 引导系统设置，或退回 `QuickEntryView` 键盘 |
| zh-CN 资产未安装 | — | 展示下载进度态；失败则退回键盘 |
| 空录音 / 非交易 | `recognized: false` | 「没听出要记的账」，重录或手输 |
| 金额缺失 | `amount: null` | `RecognitionAmountPad` 空态，用户手输 |
| 402 额度不足 | `HTTPException(402)` 透传 | 沿用现有错误文案 |
| 模型失败 | `HTTPException(502)` | 提示重试 |
| `now` 缺失 | 400（必填，R1） | 客户端恒发送 |

---

## 7. 隐私与安全

| 项 | 结论 |
|---|---|
| 音频是否出设备 | **否**。`SpeechAnalyzer` / `SpeechTranscriber` 转写路径完全在设备上，无网络调用 |
| 音频是否落盘 | 不落盘，只在内存 buffer 中流转 |
| 是否进日志 | 否。**写进代码注释钉死** |
| 是否进 usage event | 否。`executeTrackedAiCall` 的 `input` 只含 `systemPrompt` / `prompt`（纯文本），`fn` 内只发文本 —— 架构上不可能带音频 |
| 上送服务端的内容 | **仅转写文本 + 本地时间**。用户说「昨天星巴克35」会上送这句话，需在隐私政策/首次说明中覆盖 |

对比：老 `SFSpeechRecognizer` 在部分设备上会回落 Apple 服务器；新 API 没有这个问题。**这是一次隐私上的净提升，值得写进发版说明。**

---

## 8. 观测与指标

需要在确认流埋一个埋点：**用户在 AI 预填后修改了哪个字段**。

这是把「要不要上服务端 ASR」从猜测变成数据决策的关键依据：

| 观测 | 结论 |
|---|---|
| 「商家」修改率高 | 端上 ASR 实体识别不行 → 上服务端 ASR + 热词表，**或**先做 §5.8 自定义语言模型 |
| 「金额」修改率高 | 数值口语归一化的锅 → prompt 可修，不必加成本 |
| 「分类」修改率高 | 分类清单注入或 prompt 匹配问题 → prompt 可修 |
| 「时间」修改率高 | 相对时间解析规则有问题 → prompt 可修 |

**落点待定**（见 §9 Q3）—— 需要评审决定是写 entry 的 `meta`、新建一张表，还是客户端本地埋点后聚合。

---

## 9. 未决问题（请评审逐条表态）

| # | 问题 | 我的倾向 |
|---|---|---|
| Q1 | `qianlai_voice` 用 `deepseek-v4-flash`，还是要单独建一个更便宜的文本模型行？后者是上线前置项 | 先复用，等准确率数据出来再降本 |
| Q2 | 语音计费 1 credit（与 receipt 对齐）还是更低？端上 ASR 边际成本为零 | 可低于截图，是引导用户弃截图转语音的杠杆 |
| Q3 | per-field override 埋点落在哪？（entry meta / 新表 / 客户端本地） | 需要看 `JournalEntry` 有无可用 JSON 字段再定 |
| Q4 | 语言资产的下载时机：进快速记账页静默预热，还是主动触发？ | 进页面即后台预热 + 进度提示，不阻塞 |
| Q5 | §5.3 的多笔降级是否可接受 | 需产品拍板，这是 D3 的直接代价 |
| Q6 | §4.2 的 `now` 由客户端传，还是服务端从用户时区偏好推导 | 客户端传（无歧义） |
| Q7 | §4.5 的 schema 重命名做不做 | 做，成本十行 |
| Q8 | §5.8 的自定义语言模型放 M1 还是 M2 | M1，它直接改变「要不要上服务端 ASR」的成本判断 |

**裁决（2026-10-09，详见 §13）**：Q1 先复用 `deepseek-v4-flash`；Q2 暂与截图对齐 1 credit；Q5 接受降级（R3）；Q6 客户端传 `now` 且必填（R1）；Q7 不改名（R2）。Q3 / Q4 / Q8 仍开放，归 M2。

---

## 10. 里程碑

| 里程碑 | 内容 | 出口标准 |
|---|---|---|
| **M0** | 服务端全量：agent code、route、service、`buildVoicePrompt`、种子、manual SQL、测试 | 单元测试通过；能用 curl 打出草稿 |
| **M1** | iOS 全链路：转写器、资产、视图、store 接线、权限、文案、fake 测试 | 真机上一句话能出草稿并确认落库 |
| **M2** | 实时转写 + VAD 静音自动结束 + 自定义语言模型 + 埋点 | 手感可用；有一周准确率数据 |
| **M3** | 据 M2 数据决定：是否服务端 ASR / 是否调整定价 / 是否多笔 | 有数据支撑的决策 |

---

## 11. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| zh-CN 是否在 `SpeechTranscriber` 支持列表 | 高 | 二手资料称首发支持中文（含粤语），但**实现第一步就是运行时用 `SpeechTranscriber.supportedLocale(equivalentTo:)` 验证** |
| `SpeechAnalyzer.Options` 的 init label 未逐字核对 | 低 | 写之前开 Xcode 补全确认；`prepareToAnalyze(in:)` 等已核对的调用出自 Apple 官方示例 |
| 模拟器不可用 | 中 | 协议 + fake；真机调试预算写进 M1 |
| 语言资产首次下载体量与耗时 | 中 | 进度态 + 预热（Q4） |
| 自定义语言模型的词表生成 API 细节未验证 | 中 | M2 单独评估，可能需要研究 `SFCustomLanguageModelData` 的数据格式要求 |
| 单笔契约的信息损失（Q5） | 中 | 拍板 |

---

## 12. 明确不做

- Web 端（`apps/qianlai`）
- 多笔 `entries[]` 契约
- 多轮追问 / 改刚才那笔
- 自动落库（无人工确认）
- 服务端 ASR 与热词表
- 语音记账的附件 / 项目（project）绑定 —— 与 `canRecognizeScreenshots` 排除 guest 的理由相同，识别预填没有项目选择面

---

## 13. 实施裁决记录（2026-10-09 评审回写）

| # | 议题 | 裁决 | 理由 |
|---|---|---|---|
| R1 | §4.2 请求体 | 字段名 `transcript`（1..1000）；`now` **必填**，服务端不设时区回退 | 唯一客户端 iOS 恒发送；缺省即 400 的契约比一条永不触发的回退路径简单 |
| R2 | §4.5 schema 改名 | 不改名；语音侧 `VoiceRecognition = ScreenshotRecognition` 别名 | 别名已承载语义，省下全链路改名 churn |
| R3 | §5.3 多笔降级 | 按原案：最完整一笔为主，被降级金额进 `amountAlternatives`（≤4） | 信息不静默丢失；prompt 已实现并断言 |
| R4 | occurredAt 无时刻 | 完全无时间/今天无时刻 → null（客户端沿用当前时刻）；其他日期无时刻 → 当日 00:00:00 | null 会把「昨天」落到今天；保住口语里的日期更合记账语义 |
| R5 | 自有账户转账 | prompt 显式 `recognized:false` | 共享 schema 无 transfer kind，与截图识别口径一致 |
| R6 | SFSpeechRecognizer 回退 | **整体移除**（含资产安装失败回落）；失败改 `assetsUnavailable` / `localeUnsupported` 显式错误 | §5.1/§7：经典识别器的非端上路径会把音频送往 Apple 服务器，违背本功能唯一的隐私红线。语音识别权限申请与 plist 双 key **保留**——iOS 26 上 SpeechTranscriber 仍触发该 TCC 权限，缺 usage key 会闪退 |
| R7 | §5.9 文件布局 | 落位 `Journal/`（非 `Voice/`）；页改名 `AIBookkeepingView`；状态机抽成 `VoiceEntryModel` | 与双入口页现实一致；fake 可测（`VoiceEntryTests` 8 用例） |
| R8 | 命名 | `recognizeVoice` / `buildVoiceRecognitionPrompt` | 与 `recognizeScreenshot` / `buildRecognitionPrompt` 对仗 |
| R9 | 服务端结构 | 抽取共享 `runRecognitionAgent`（计费→解析→模型守卫→分类→generateObject→schema.parse→502 包装）+ prompt 公共段（shape hint 常量、categoryAlternatives 规则、分类清单尾段） | 两路只差四处声明式参数；shape hint 漂移风险清零 |
| R10 | 交互层级（2026-10-09 产品裁决，同日两次修正） | 语音卡 **hold-to-talk**：触摸即录、松手即停并解析；`VoiceEntryView` 子页与 `Mode` 分支移除，页面外层 Cancel 走 `abandon()`。按压追踪的**载体必须恒定不变**——Button 标签是永远不变的空卡（`Color.clear`），转写/解析等全部动态内容画在 `allowsHitTesting(false)` 的 overlay 上（真机探针实证此结构松手事件稳定送达；此前 LongPress 序列、裸 `DragGesture(minimumDistance:0)`、挂在重建内容上的 ButtonStyle 三版全部丢失抬指事件，症状「松手不结束、再点一次才停」） | 层级太深；按住说话贴合「一句话一笔」的短时长。竞态由模型兜：stage 触摸瞬间同步翻转 + `pendingFinish` 挂起回收 + start 落地后的放弃自停 |


| R11 | 结束管线（2026-10-09 真机实测缺陷） | **结束信号 = 结束输入流**（`inputContinuation.finish()`）+ Task 内显式 `finalizeAndFinishThroughEndOfInput()` 双保险（真机实测光 finish 流在部分设备不够）；`stop()` 带 2 秒看门狗（到期强制带已有转写收尾，管线永不楔死 UI）；`cancel()` 去守卫化（释放挂起的 stopWaiter 并无条件拆除）；音频会话 `setActive` 挪出主线程（`SessionCore.mm` UI-unresponsiveness 警告；异步 activate/deactivate API 是 iOS 27+，26.0 用 Task.detached 跑同步调用） | 原实现 `finalizeAndFinishThroughEndOfInput` 在活麦场景永不返回——「输入结束」正是那条从未 finish 的 `AsyncStream` → `stop()` 挂起（松手不停）→ 此刻 `cancel()` 被 `isRecording` 守卫拦下（stop 已置 false）→ **SpeechAnalyzer 泄漏**，几次即撞并发上限报 "Maximum number of recognizers reached" |


| R12 | 转写缺失（2026-10-10 用户查 AI usage 日志发现） | **transcript 拼入 prompt 末尾**（`Transcript:` 块，§4.4 开头的 "The transcript below" 由此成立）；usage 日志的 `input.prompt` 因此可完整审计 | 初版实现丢了 §4.3 草案的第二个 text part（utterance），重构与两轴评审均未抓到——模型从未见过转写，每次解析必然 `recognized:false`，真机表现为正常话术也弹「没听出可记录的交易」 |

| R13 | 末字截断（2026-10-13 使用场景推演） | **尾音补采（hangover）400ms**：抬指不立即关输入流，先挂一个 400ms Task 再 `finish()`；补采由 `teardown()` 取消，看门狗改从补采结束后起算 | hold-to-talk 的天然手势是「说到末字同时松手」，汉字韵母衰减 150–300ms 全在松手之后；抬指即 `finish()` 会让仍在跑的 tap 把后续 buffer `yield()` 到已关闭的流上**静默丢弃**，末段又恰切在音节起点、没有尾随静音可提交——记账话术里被截断的通常是**金额**，且截断不产生歧义候选、`amountAlternatives` 兜不住，会被模型自信地解析成错账。选固定补采而非 VAD 端点检测：松手语义已明确「说完了」，VAD 只会给句中停顿加延迟。400ms 按末字衰减留余量，记账是一句话，更长窗口只是白卡住卡片 |

Q3（埋点落点）、Q4（资产下载时机）、Q8（自定义语言模型）仍开放，归 M2。

---

## 参考资料

- Apple — [SpeechAnalyzer](https://developer.apple.com/documentation/speech/speechanalyzer)（iOS 26.0+，模块化 + AsyncSequence 结果流）
- Apple — [Bring advanced speech-to-text to your app with SpeechAnalyzer (WWDC25 277)](https://developer.apple.com/videos/play/wwdc2025/277/)（"replacing SFSpeechRecognizer"；完全端上；volatile results）
- Apple — [Recognizing speech in live audio](https://developer.apple.com/documentation/speech/recognizing-speech-in-live-audio)（`CaptureInputSequenceProvider` 为 iOS 27；按 timeRange 替换而非累积；真机要求）
- Apple — [Speech](https://developer.apple.com/documentation/speech)（`SpeechDetector` VAD、`SFCustomLanguageModelData`、`AssetInventory`）

> zh-CN 支持列表一项仅见于二手资料，未在 Apple 官方文档中找到静态列表页，**必须运行时验证**。
