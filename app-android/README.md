# ZHLBuilder Android 端

ZHLBuilder 手机客户端（Android），对接 ZHL 平台设备中枢（dis.zhl.asia `/api/builder/*`）。

## 功能（v0.1.0）

- ZHL 账号登录（JWT，EncryptedSharedPreferences 安全存储）
- 设备列表（在线状态 10s 轮询、解绑）
- **扫码绑定**：扫设备端 `zhlbuilder device pair` 的二维码，绑定并设置 6 位 PIN（zxing-embedded）
- **PIN 门禁**：每次进入设备会话需输 PIN（verify-pin → 15 分钟会话）
- 设备详情：状态、任务下发、任务列表、输出实时流（2s 轮询）、停止任务

## 环境

- JDK 17+（本机 `C:\Program Files\Java\jdk-21.0.12`）
- Android SDK（本机 `H:\android-sdk`，AGP 8.5.2 / compileSdk 35 / minSdk 26）
- Gradle 8.9（wrapper 已配置腾讯镜像源）

## 构建

```bash
cd app-android
./gradlew assembleDebug        # 产物 app/build/outputs/apk/debug/app-debug.apk
```

`local.properties` 写 `sdk.dir=H:/android-sdk`（正斜杠，避免 properties 转义坑）。

## 服务端依赖

后端 ≥ 1.4.0（migrate-v23 已建 builder_devices / builder_tasks / builder_task_output）。
设备端见仓库根 `apps/zcode-cli` 的 `zhlbuilder device` 子命令。
