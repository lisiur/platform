# Localizable.xcstrings 目录同步规则

xcstrings 的失败模式几乎全是**静默回英文**（或静默丢 key），无报错。以下规则全部实战验证：

## 静默回英文的四种来源

1. 代码用了 `L10n.string(key, defaultValue:)` 而**目录缺该 key** → 渲染 defaultValue（英文）。
2. Xcode 构建扫描出的**空桩**（`"Show" : {}` 形态）同样回英文——必须填值。
3. 目录值**覆盖**代码 defaultValue：目录里的旧值会让代码新改的 defaultValue 不生效，改文案以目录为准。
4. demo/预览里的字面量会被构建扫描成空桩且**删了回生**——demo 用 `Text(verbatim:)` 再删桩。

## key 规则

- 字面量占位 key（`"Some Text"` 形式作 key）**全面禁止**：key 必须 `xxx.xxx` 点分。
- 每个手工 key 至少带全套语言值（en + zh 等）。
- **插值字符串 `Text("…\(x)")` 隐藏运行时 %-key**——判孤儿前先 grep `\(`；纯字面量扫描会漏掉经变量传的 key。
- 某个 key 的唯一使用点删除后，**整块删目录条目**（留死角会让下个人误判仍在用）。

## 操作纪律

- 加 key 用**定点文本插入**，绝不整文件重序列化（重排/重缩进制造 review 噪音；同理适用于构建工具管辖的 xcassets JSON——语义变化用去空白 diff 判）。
- 新目录块**锚定在紧随其后的 key 前插入**——目录按前缀序排列，靠「插在相似 key 后面」易错（unarchive < unarchiveSuccess 这类前缀顺序问题经实测确认）。
- 分支文案用枚举化 L10n 接口（`L10n.Entry` 模式），不在调用点手拼条件字符串。
- **验证以构建产物为准**：检查 `.lproj/Localizable.strings` 里实际编译出的值，而不是源目录。

## 本地化之外的格式化陷阱

`DateFormatter` / `.formatted` 跟设备语言走、无视 app 内语言覆盖——见 [locale-formatting.md](locale-formatting.md)。
