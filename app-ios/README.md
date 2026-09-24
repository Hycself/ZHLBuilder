# ZHLBuilder iOS 端（SwiftUI）

ZHLBuilder 手机客户端（iOS 16+，SwiftUI，bundle id `asia.zhl.builder`）。

> **本机未编译验证**：iOS 构建需要 macOS + Xcode 16。本目录提供完整源码与工程文件
> （手写 project.pbxproj），在 Mac 上直接 `open ZHLBuilder.xcodeproj` 即可构建。
> 如工程文件报格式问题，用 Xcode 新建空 App 后把 `ZHLBuilder/` 下四个 Swift 文件
> 拖进工程即可（无第三方依赖）。

## 功能（v0.1.0）

与 Android 端对齐：ZHL 账号登录（JWT 存 **Keychain**）→ 设备列表 →
**扫码绑定**（AVFoundation QR，iOS 17+ 可换 DataScanner）+ 6 位 PIN →
PIN 门禁 → 设备详情（状态/任务下发/输出流/停止）。

## 结构

- `App.swift` — 入口与导航状态机
- `Api.swift` — 平台 API 客户端 + Keychain 存储 + 模型
- `Views.swift` — 全部界面（品牌色 Zhl 色板与介绍站一致）
- `Assets.xcassets` — AppIcon（XFSZHL 飞机标）与 AccentColor（#22D3EE）

## 构建（macOS）

```bash
open ZHLBuilder.xcodeproj   # Xcode 16+，iOS 16.0 deployment target
# 选好开发者团队（Signing & Capabilities），Cmd+R 运行
```
