# 分类/账户图标换成 emoji 选择器

## 现状（已核实）
- `apple/Qianlai/Qianlai/Accounts/AccountFormView.swift:125-136`：icon 是手动输入的 `TextField("Emoji, e.g. 💳")`，创建/编辑、分类/账户四种场景共用这一个表单。新建时初始为空（`:72`），保存时空白串转 nil（`:233-235`）。
- 服务端 zod 已允许 `icon: z.string().max(100).nullable()`（`packages/service/src/modules/bookkeeping/routes/account/schema.ts:75,96`），Prisma 为 `String?`，无需动服务端。
- **既有 bug**：`UpdateAccountBody.encode`（`BookkeepingModels.swift:855`）用 `encodeIfPresent`，表单清空图标后 PATCH 请求里不带 icon 字段 → 服务端视为未改 → 旧图标清不掉。引入"清除"入口前必须修掉，否则清除是假的。

## 改动内容

### 1. 新增 `Qianlai/Shared/UI/EmojiCatalog.swift`
- 静态分组目录：`struct EmojiGroup { l10nKey, fallbackTitle, icons }` + `enum EmojiCatalog { static let groups: [EmojiGroup] }`。
- 约 10 组、每组 10-16 枚：常用 / 餐饮 / 交通 / 购物 / 居住 / 娱乐 / 健康 / 教育 / 宠物 / 收入金融 / 其他，共 ~130 枚。目录需覆盖服务端 `STARTER_ACCOUNTS`（domain.ts）用到的全部图标（👛💼🍜✈️ 等），保证种子分类可原样重选。

### 2. 新增 `Qianlai/Shared/UI/EmojiPickerSheet.swift`
- 形态沿用 app 选择器惯例：`NavigationStack` + `.navigationTitle(L10n "icon.picker.title" 选择图标)` + `.inlineNavigationBarTitle()` + `.presentationDetents([.medium, .large])`（detents 包 `#if os(iOS)`，macOS 共用 sheet）。
- 内容：`ScrollView` + 按组 section header + `LazyVGrid` 6 列 flexible（间距 8-10），cell 为 28pt `Text(emoji)`，当前值用 accent 高亮（`Color.accentColor.opacity(0.15)` 圆角底），与 QuickEntryView 选中态一致。
- 交互：**点选即写回并 dismiss**；toolbar 左侧"取消"，当前已有图标时右侧 destructive "清除图标"（置空并 dismiss）。
- 接口：`EmojiPickerSheet(selection: Binding<String>)`，空串 = 未设置（与表单现有 `icon: String` 状态零转换）。

### 3. `AccountFormView` 换行
- 删掉 icon TextField（`:125-136`），换成 Button 行：左 `Text("Icon")`，右侧显示当前 emoji，为空时显示 secondary "未设置"（`icon.picker.none`）。
- `@State private var showIconPicker` + `.sheet(isPresented:)` 挂载选择器；`save()` 现有 trim/空转 nil 逻辑不变。

### 4. 修通"清除"链路（客户端）
- `UpdateAccountBody.encode`（`BookkeepingModels.swift:855`）改为始终编码 icon：有值发字符串、nil 显式发 `"icon": null`；服务端 zod/prisma 已支持 null 清空，无需改。
- 实现时核对 `UpdateAccountBody` 的全部构造点（目前已知仅 `AccountStore.update`），确保"总是发送 icon"不会覆盖其他调用方的语义；若有多处再退化为显式 `iconSet` 标记方案。

### 5. L10n
- 新键（en + zh-Hans，按规则做 targeted 文本插入 `QianlaiShared/Localizable.xcstrings`，不重排 JSON）：
  - `icon.picker.title` = Choose Icon / 选择图标
  - `icon.picker.none` = None / 未设置
  - `icon.picker.clear` = Remove Icon / 清除图标
  - `icon.group.common/food/transport/shopping/home/fun/health/education/pets/income/other` 各组标题
- 代码侧统一 `L10n.string(key, defaultValue:)`。

## 不做（明确排除）
- `RealAccountsView.swift:259` 的手动输入（相邻案例，保持现状；组件已可复用，后续要做只是挂同一 sheet）。
- 账本 icon 字段（现在不存在，不新增）。
- 最近使用、自定义 emoji 输入（未选）。

## 验证
- `xcodebuild` 用 iPhone 17 系模拟器 build + 单测（QianlaiTests 新增 `EmojiCatalogTests`：分组非空、emoji 无重复）。
- L10n 审计：diff 代码内新增 dotted key 与 Localizable.xcstrings，确认无漏（防"静默回退英文"）。
- 手动路径核对：新建分类选图标、编辑换图标、编辑清图标（PATCH 应带 `"icon": null` 且服务端清空）、macOS 构建不破。