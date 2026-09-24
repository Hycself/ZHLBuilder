# ZHLBuilder HarmonyOS 端（ArkTS）

ZHLBuilder 手机客户端（HarmonyOS / OpenHarmony，Stage 模型，API 5.1.0(18)）。

## 功能（v0.1.0）

与 Android 端对齐：ZHL 账号登录 → 设备列表 → **ScanKit 扫码绑定 + 6 位 PIN** →
PIN 门禁 → 设备详情（状态/任务下发/输出流/停止）。

## 结构

- `entry/src/main/ets/pages/Index.ets` — 登录 + 设备列表 + 扫码入口
- `entry/src/main/ets/pages/PinGate.ets` — PIN 双模式（绑定 pair / 门禁 gate）
- `entry/src/main/ets/pages/DeviceDetail.ets` — 任务与输出
- `entry/src/main/ets/model/Api.ets` — 平台 API 客户端（NetworkKit http + preferences 持久化）

## 构建

需要 DevEco Studio 5.1+（Windows 可装，本仓库开发机未装鸿蒙工具链，未做本机编译验证）：

```bash
# DevEco Studio 打开 app-harmony 目录，或命令行：
hvigorw assembleHap --mode module -p module=entry@default
```

二维码扫描用系统 ScanKit（`@kit.ScanKit`），真机需要签名证书（DevEco 自动签名）。

## 已知限制

- preferences 未加 HUKS 加密（v0.2 计划：JWT 用 HUKS 密钥加密落盘）
- 弹窗输入 PIN 采用独立页面（PinGate），未用半模态
