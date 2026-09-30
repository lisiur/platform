# 模拟器 UI 验证链路

computer-use / 截图驱动 UI 自动化对 iOS 模拟器**不可用**。实战闭环是：启动参数 hook + `simctl` 截图 + 必要时像素采样。

## 标准链路

```bash
xcrun simctl launch <device> <bundle-id> --ui-demo-xxx        # 带参数启动
xcrun simctl io <booted> screenshot /tmp/shot.png             # 截图
open /tmp/shot.png                                            # 或脚本取像素
```

- App 根部一排 `ProcessInfo` 分支：每个复杂交互/视觉改版配一个**离线 harness flag**（渲染真实视图、跳过会话恢复/网络——登录态缺失时网络请求会让壳 20 秒内挂掉）。
- 异步呈现（sheet）与转场动画竞态时，hook 里**延迟呈现**避开 cover 转场。
- 精确色值验证（如「按钮灰是否保住」）用脚本对截图**取像素采样**（r=g=b 灰度判断），不靠肉眼。
- **瞬态动画须在 app 内抓帧**（或录屏拆帧），单张 `simctl io screenshot` 抓不到中间态；异步长列表的滚动锚定验证可用临时隐藏上方 section 复现。

## 模拟器怪癖（实测）

- `openurl` 触发的系统确认弹窗**跨重启存活**——复现不了先重启模拟器。
- 会话 token 只在 keychain，**不能跨模拟器拷贝**；每台模拟器独立登录。
- 软键盘全局禁用硬件键盘：`defaults ConnectHardwareKeyboard false` + **重启 Simulator** 才生效；程序化聚焦用 `@FocusState` / `.searchFocused`。
- 多个并行 Xcode 会话测试会并发写同一 DerivedData 产生冲突——**各会话隔离 DerivedData**。
- 系统噪音日志（蓝牙/PointerUI launchd 告警）非 app bug，无需排查。

## 真机

`devicectl` 安装启动 + `idevicesyslog` 看日志；模拟器探明的行为（尤其手势时序）上线前最好真机复测。
