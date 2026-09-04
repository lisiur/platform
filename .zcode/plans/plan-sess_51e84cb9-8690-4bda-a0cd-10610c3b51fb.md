## 虚拟成员方案（服务端 + iOS + Web）

### 核心设计
虚拟成员 = **一条带 `virtual` 标记的 `User` 行（无 email、无凭证 Account，永不登录）+ 正常的 `LedgerMember` 行（角色固定 `viewer`）**。

理由：付款人（`paidById`）、参与者（`JournalEntryParticipant`）、结算分摊（`viewerShareCents`/`projectReport`/`memberTurnover`）全部以 `User.id` 为锚点。虚拟成员走这条路径，所有结算/统计数学**零改动**直接生效，且**不需要任何 Prisma 迁移**（`User.email`/`avatar` 已可空，`User.flags String[]` 已有 `builtin` 先例）。删除虚拟成员后历史名字解析也已由 `userLookupRepository` 的 departed-member 路径支持。

权限（按你确认的）：**添加/改名 = editor 及以上；删除 = owner**（与现有 removeMember 一致）。转正/认领本次不做，但 flags 设计天然预留（未来把凭证 Account 挂到同一 User 行并清 flag 即可）。

---

### 一、服务端（packages/shared + packages/service，无迁移）

1. **标记**：`packages/shared/src/user-flags.ts` 新增 `VIRTUAL_USER_FLAG = "virtual"` 和 `isVirtualUser(flags?)`（仿照 `BUILTIN_USER_FLAG`）。

2. **新增「直接添加成员」端点**（现状只有邀请码兑换一条路，没有按 userId 直加的端点）：
   - `POST /api/bookkeeping/ledgers/:ledgerId/members`，路由文件 `modules/bookkeeping/routes/share/createVirtualMember.ts` + schema 放 `routes/share/schema.ts`。
   - body：`{ name: z.string().trim().min(1).max(50) }`；响应 = 现有 `ledgerMemberSchema`。
   - service `share.service.ts` 新增 `createVirtualMember`，仿照 `redeemShareCode` 的结构：事务内 `lockLedgerRow` → 校验 ledger 存在且 active → 校验操作者 membership 为 editor+（403）→ **上限防护**（每账本虚拟成员 ≤ 50，防 User 表滥用）→ `user.create({ name, flags: [VIRTUAL_USER_FLAG] })` + `ledgerMemberRepository.create({ role: "viewer" })`，FK violation → 404。
   - 路由权限 floor：`requireLedgerAccess(userId, ledgerId, "editor")`。

3. **roster 序列化携带 `isVirtual`**（客户端徽标需要）：
   - `ledgerMemberSchema.user` 增加 `isVirtual: z.boolean().optional()`；
   - `ledgerMemberRepository.listByLedger` 的 user include 增加 `flags`，`listMembers` 及新端点输出前把 flags 换算成 `isVirtual` 布尔（不把原始 flags 泄漏到 API）；`redactMemberEmail` 泛型约束只有 email，天然兼容。

4. **改名**：`PATCH .../members/:userId` body 从 `{ role }` 扩展为 `{ role?, name? }`（至少一项）。权限拆分：`name` 仅对虚拟成员生效、editor+ 可改（非虚拟目标 400）；`role` 仍 owner-only、且虚拟成员不可改角色（400）。route 文件的权限 floor 相应从 owner 调整为 editor，service 内对 role 变更自行校验 actor 为 owner。

5. **删除**：复用现有 owner-only `DELETE .../members/:userId`。`removeMember` 扩展：删 LedgerMember + ProjectMember 后，若目标用户是 virtual 且**无任何条目引用**（createdBy/paidBy/participants 计数均为 0），连 User 行一起删（清理拼错名字的垃圾行）；有引用则保留 User 行，历史结算名字照常解析。

6. **防护**：
   - `transferOwnership`：目标为虚拟成员 → 400（不能成为 owner）；
   - identity 的 admin 全局 `deleteUser`：拒绝带 virtual flag 的用户（仿 `assertUserIsNotBuiltin`），防止绕过账本路径级联删掉参与者 tag 丢历史；
   - 登录面无需改：无 Account 行自然无法认证。

7. **测试**：editor 添加成功 / viewer、guest 403 / 名字与上限校验 / roster 带 isVirtual / 改名权限与仅限虚拟 / 虚拟不可改角色、不可被转让 / 删除时有引用保 User、无引用删 User / 结算与 member-turnover 正常包含虚拟成员。

### 二、Web（apps/qianlai）

1. `ledgers/components/members-dialog.tsx`：
   - `MemberRow.user` 类型加 `isVirtual?: boolean`；成员行名字旁显示「虚拟」小 Badge；
   - 虚拟行：role 列渲染固定 viewer Badge（不出 Select）、不出转让按钮；owner 可删除（确认文案区分）；editor+ 可改名（小 rename dialog，react-hook-form + zodResolver + `FieldError` + `aria-invalid`，遵守 AGENTS.md 表单规范）；
   - 新增「添加虚拟成员」区块（isOwner || isEditor 可见）：名字输入 + 提交，mutation 成功后 invalidate `["qianlai","members",ledgerId]`、`["qianlai","ledgers"]`、member-turnover。
2. i18n：`messages/en.json` + `zh.json` 的 `Ledgers` namespace 新增 keys（addVirtualMember / virtualBadge / renameMember / 相关成功与确认文案），中文用「虚拟成员」。
3. QuickEntry 的 Paid By / 参与人、日志过滤、报表：roster 自动带出虚拟成员，零改动。

### 三、iOS（apple/Qianlai）

1. `Bookkeeping/BookkeepingModels.swift`：`EntryUserRef` 加 `let isVirtual: Bool?`（entry 内嵌 ref 无此字段，optional 解码安全）；`LedgerMember` 加 computed `isVirtual`；新增 `CreateVirtualMemberBody { name }` 与 rename body（沿用 Encodable body 模式）。
2. `Bookkeeping/MemberStore.swift`：`addVirtualMember(name:)`、`renameMember(userId:name:)`，成功后调 `reloadAll()`（绕开 `load` 同账本的 no-op 缓存）。
3. `Ledgers/MembersView.swift`：
   - `LedgerPolicy` 新增 `canAddVirtualMembers = atLeast(.editor)`；
   - 工具栏/菜单「添加虚拟成员」（editor+）→ 名字输入 sheet；
   - 成员行：虚拟成员显示「虚拟」徽标；隐藏角色菜单与转让；rename 滑动/长按动作仅虚拟成员；remove 保持 owner。
4. L10n：`Localizable.xcstrings` 手动补 en + zh-Hans keys（代码里的 `L10n.string` key 必须同步进 catalog，否则静默回退英文）。
5. QuickEntry 付款人/参与者选择、项目加人菜单、报表：零改动自动生效。
6. 用 iPhone 17-family 模拟器构建验证。

### 明确不做（预留）
- 虚拟成员「转正/认领」流程（后续可加：凭证挂同 row + 清 flag）；
- 虚拟成员自定义头像；admin 后台的 virtual 标记展示。

### 已知边界（按现状容忍）
- 虚拟成员允许与真实成员重名（与现状一致）；guest 视角的 roster 裁剪（scopeRosterToSharedProjects）对虚拟成员同样生效；虚拟成员加入项目后，`withAutoParticipants` 会把无显式参与者的项目条目自动分摊给 Ta——正是期望行为。