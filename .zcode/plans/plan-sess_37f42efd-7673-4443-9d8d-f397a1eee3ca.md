# 记一笔页面改造：分类图标网格 + 最近分类（本地缓存）+ 类型配色

## 目标形态

```
[取消        记一笔        账本切换]        ← 不变
[支出 | 收入 | 转账]                        ← 分段控件不变
┌─ Form ──────────────────────────────┐
│ 最近使用  ⟨🍜餐饮⟩ ⟨🚇交通⟩ ⟨🛒日用⟩ → │  ← 新：横滑胶囊，仅当缓存非空
│ 🍜餐饮  🚇交通  🛒日用  🎬娱乐        │  ← 新：分类图标网格（4 列）
│ ☕️饮品  📱数码  💊医疗  [⋯ 更多]      │  ← "更多"打开现有树形 sheet
│ 付款账户                    招商银行 ▸ │  ← 分类侧的行被网格取代
│ 付款人 / 时间 / 项目 / 参与人 / …      │  ← 不变
└─────────────────────────────────────┘
[计算器：金额显示 + 键盘]                   ← 位置不变，配色随类型变化
```

- **支出/收入**：原"支出分类/收入分类"行由图标网格取代（选中项高亮），"更多"胶囊打开现有 `AccountSelectionView`（树形+搜索兜底长尾分类）。口袋侧行（付款账户/收款账户）保留。
- **转账**：无分类侧，网格不显示，From/To 两行照旧。
- **guest**：仍是仅支出 + 网格必选分类，逻辑不变。
- 记录时机：网格点选、sheet 内选中、成功提交后（含编辑），都写入缓存（去重置顶）。

## 实现步骤

### 1. 新建 `Qianlai/Bookkeeping/RecentCategoryStore.swift`
纯 UserDefaults 缓存，按 账本+类型 隔离：
- key：`recentCategories.<ledgerId>.<expense|income>`，值为 JSON `[String]`（most-recent-first，参考 `LedgerStore`/`LocaleSettings` 的裸 UserDefaults 惯例）。
- `static func ids(ledgerId:kind:) -> [String]`；`static func record(_ accountId:ledgerId:kind:cap: Int = 8)`（置顶去重、截断到 8 个）。
- 过期分类（已归档/已删）在读取侧由调用方对照当前 `accountStore.pickable` 剔除，缓存本身不清理。

### 2. `BookkeepingModels.swift`：`QuickEntryKind.accent`
给 enum 加 `var accent: Color`：支出 `.red`、收入 `.green`、转账 `.blue`（后续想换色调只改这一处）。

### 3. `Shared/UI/CalculatorView.swift`：接受 `tint: Color?`
- 唯一调用点就是 QuickEntryView（已确认），默认 `nil` 行为不变。
- 应用于：显示卡金额颜色（错误红保留）、✓ 提交键背景、运算键前景/底色的不透明度色。`KeyRole` 的静态颜色改为接收 tint 的计算属性，`nil` 时回落 `.accentColor`。数字/功能键保持中性色。

### 4. `Journal/QuickEntryView.swift`：网格 + 接线
- 新增 `categorySection`（放在 `fieldsSection` 之前）：内部先渲染"最近使用"横滑行（`ScrollView(.horizontal)` 胶囊，小标题 footnote 灰字），再渲染 `LazyVGrid` 4 列分类 chip：icon（`BookAccount.icon` emoji，40pt 四级灰圆底，选中换类型 accent 底+白图标）+ 名称（footnote、`lineLimit(1)`+缩放）。最后一个固定"更多"chip（`ellipsis.circle`）→ `activeAccountSide = .debit/.credit` 打开现有 sheet。
- `fieldsSection` 中支出/收入的分类侧行删除（支出只留付款账户行，收入只留收款账户行，顺序相应调整）；转账不动。`debitLabel/creditLabel` 保留供口袋行和 sheet 标题用。
- 数据源复用现有 `debitEntries`/`creditEntries` 的树构建（expense/income 分支），选中态对照 `draft.debitAccountId`/`draft.creditAccountId`。
- 记录缓存三处：网格点选、sheet 的 selection Binding（包一层 `Binding(get:set:)`，仅分类侧记录）、`save()` 成功后（新记/编辑都记）。
- `CalculatorView` 调用传入 `tint: draft.kind.accent`。
- 深色模式用语义色（`.quaternary` 系填充），不写死白色。

### 5. L10n（按既定纪律：目录内定向插入，绝不重排序 xcstrings）
新增两个 namespaced key 并补 zh-Hans：
- `quick.categories.recent`："Recent" / "最近使用"
- `quick.categories.more`："More" / "更多"

### 6. 验证
- 新增 `RecentCategoryStoreTests`（参考 `CalculatorEngineTests` 惯例，用独立 `UserDefaults(suiteName:)` 隔离），覆盖置顶去重/截断/读取。
- `xcodebuild` 以 iPhone 17 系列（iOS 26.5）模拟器构建验证，不启动 server。

## 明确不改
工具栏与账本切换、计算器键盘布局、其余表单行（付款人/时间/项目/参与人/备注/地点/计入收支）、`AccountSelectionView` 本身、guest/project 作用域逻辑、现有 `defaultExpenseCategoryId` 预填。