# 数值格式化单咽喉点与全局遮罩

## 单咽喉点

一切金额/数值展示**必须经过同一个 format 函数**（`Shared/Utils/Money.swift` 模式）：

- 格式规则（小数位、分组符、货币符号表）收在一处，多端镜像同一符号表保证 glyph 一致。
- **全局遮罩开关（隐私遮盖）也收在同一个函数**：`if isMasked { return mask }` 是函数体第一行，调用点零感知。
- 新增展示面自动继承格式与遮罩，不存在遗漏的调用点。

## Sendable 处理

`NumberFormatter` 非 Sendable → **每次调用现建一个**（格式化不是热路径），换取函数可从任意隔离调用；不要为省这点开销引入共享可变 formatter。

## 自拼符号必须传 abs（关键规则）

format 函数对负值**自带** `-`/货币前缀（如 `-¥12.00`）。任何调用点若自己拼接正负号（收入显示 `+`），**必须传 `abs(value)`** 进 format，否则负收入渲染成 `+-¥12.00`。规则一句话：**符号要么全在 format 里，要么全在调用点，绝不两头拼。**

## 遮罩的第二检查点

不在视图树里的文本（Swift Charts 的 `AxisMarks` 标签、Canvas 绘制的内容）够不到视图层的 format 函数 → 这些面**内联重复**遮罩判断（`isMasked ? mask : 真值`），并注释标注「这是第 N 个检查点」。这是已知例外，不是破坏单点原则。

## 开关翻转的重求值

遮罩翻转后已挂载 Text 不会自动重算——用 `.id()` 重挂载子树强制重求值，模式见 [architecture-state-management.md](architecture-state-management.md)。
