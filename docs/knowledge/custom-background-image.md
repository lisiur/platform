# 全局自定义背景图（壁纸）系统

需求形态：用户选一张照片或内置预设作为**全局**背景，所有页面共享；背景上叠压模糊/压暗层，卡片内容保持可读。实现在 `Profile/BackgroundSettings.swift`（状态）+ `Shared/UI/CommonViews.swift` 的 Sink 三件套（渲染挂载）。

## 状态模型

- **双磁盘槽**：`active` 槽（当前上屏的壁纸：照片或渲染后的预设，二选一）+ `photo` 槽（用户照片的永久家，**永不被预设覆盖**）——预设上屏时照片槽不动，选择器的「我的照片」缩略图才有内容可显。
- **启用开关只隐藏不销毁**：关掉仅隐藏背景，照片/预设选择全保留；开着但槽为空时自动应用首个预设，**开关永不产出「开着但空白」状态**。默认关。
- 可调参数（dim 压暗、frost 毛玻璃档位、cardOpacity 卡面不透明度、preset）全存 UserDefaults，读入时范围校验、非法回落默认。
- **槽位拆分的迁移模式**：旧版本照片与 active 共用一个文件时，升级首运行发现「有 active 无照片槽且无预设标记」→ 判定为旧照片，拷贝进新槽，用户不丢文件。
- **单一写路径**：active 槽只走一个函数——原子写 + 从磁盘重新读回再更新内存（`activeImage` 恒等于盘上内容）；照片槽先写、active 后写，失败时照片可恢复。
- **选图即意图**：picked photo 同时进两槽、清预设选择；降采样后 JPEG 存储。

## 图片处理

- **ImageIO 降采样**：`kCGImageSourceThumbnailMaxPixelSize` 钳到「最高目标屏的像素高」（壁纸永远全屏渲染，多余的像素是纯浪费）+ `kCGImageSourceCreateThumbnailWithTransform`（EXIF 方向），再 CGImageDestination 编码 JPEG。
- 预设渲染到**屏幕分辨率**后存盘，而不是每帧重绘。

## 毛玻璃：系统材质，不是高斯

- **弃高斯模糊、用系统 Material 档位**：`Material` 不暴露 blur radius，"连续模糊半径滑杆"做不出来——档位实际步进的是材质的 tint（模糊强度固定在系统栏档），UI 上做成**步进滑杆**（几档离散选择），不宣称为连续可调。
- 档位枚举直接给 `material: Material?`，**off 返回 nil**——"关"在构造上就不可渲染，调用点不需要 if 门。
- **Reduce Transparency 检查**：系统开启降低透明度时材质变近不透明，壁纸会被完全遮挡——frost 层让位，直接显示清晰壁纸。
- 独立 UIWindow 上挂材质有额外条件（窗口与 host 都要 clear），见独立浮层场景的补充说明。

## 渲染挂载：沉底（sink）架构

三层结构，每层的存在都有理由：

```
Tab（iOS 26 画了不透明 TabView 底）
└─ .background { 壁纸层 }          ← AppBackgroundSinkContainer：栈外、Tab 内
   └─ NavigationStack
      └─ 页面（appBackgroundSink：清自己的底）
```

- **壁纸层必须在 NavigationStack 外**：这样它不参与 push/pop 转场，**屏幕固定**（页面滑走壁纸不动）。
- **又必须在 Tab 内、不能挂在整个 TabView 底下**：iOS 26 在 NavigationStack **和** TabView 上各画一层不透明底，页面侧的 clear 只够得到前者——层放 TabView 底下会被 TabView 的底盖住。
- **页面侧 opt-in**：`scrollContentBackground(.hidden)` + `containerBackground(for: .navigation) { Color.clear }` 清掉列表画布和导航容器底；不主动清，壁纸看不见。
- **cover/浮层等够不到 sink 的表面**保留一个页面级 canvas 变体兜底；macOS 走页面级（sink 只在 iOS 验证过）。

## 挂载姿势的三个已知问题（实测逐条验证）

1. **`.clipped()` 必须在 `.ignoresSafeArea()` 之前**——顺序反了壁纸溢出，4 变体探针实证；层挂 `.background`（不是 ZStack 兄弟），`allowsHitTesting(false)`。
2. **ZStack 兄弟陷阱**：全屏壁纸做 ZStack 兄弟时，栈按 union 尺寸居中对齐，把整个页面（含导航栏）上顶进状态栏——`.background` 挂法永不移动宿主。
3. **布局期读几何会破坏转场**：想"滚动时壁纸屏幕固定"而补偿 `.global` origin 的方案，会在 push/pop 动画中读到移动中的 origin 并把中间态固化进布局，转场中壁纸消失。终态是**零几何读取**：壁纸随页面走，push/pop/滚动全静默（滚动 List 不动自己的 frame，天然不动）。

## 可读性 scrim

- 压暗层朝**配色方案的基色**走：暗色模式压黑（壁纸更暗保白字可读）、亮色模式压白（粉彩化保黑字可读）——亮色主题下压黑纱会显著降低画布黑字的对比度。
- 背景激活时 List 行背景同步换成半透明卡面色（`listRowBackground`），让卡片内容浮在壁纸上。

## 验证

- **模糊验证用高频测试图**（细密纹理/格子）：真实照片太"软"，档位差异看不出来。
- 挂载层数多变体时逐变体探针（每层各测一遍 push/pop + 滚动 + sheet），布局顺序类 bug 只在特定组合现形。
