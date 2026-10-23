# ZHLBuilder HarmonyOS 端（ArkTS，legacy）

> **已冻结为 legacy，不再作为交付线。** 6.1 SDK 的唯一交付工程是仓库根目录外的
> `../../ZHLBuilder for HarmonyOS`（`compileSdkVersion` / `targetSdkVersion` /
> `compatibleSdkVersion` 均为 `6.1.1(24)`，bundle 同为 `com.zhl.builder`）。
> 本目录仅保留 5.1.0(18) 的历史实现与对照价值，请勿从这里出 HAP。

ZHLBuilder 手机客户端（HarmonyOS，Stage 模型，本机验证用 SDK 5.1.0(18)）。

按《鸿蒙客户端-DevEcoCode-提示词-v3.txt》实现：桌面端「移动端远程控制」面板 1:1 复刻
（`pages/RemotePanel.ets`）+ 登录/注册/设备/设备详情/任务输出/我的 六个页面。

## 结构

```
entry/src/main/ets/
  common/     Theme.ets（唯一取色取值） Format.ets（状态/阶段/时间文案）
  model/      Types.ets（后端契约类型 + 路由参数类型）
  service/    Http.ets SessionStore.ets(HUKS) AuthService.ets DeviceService.ets TaskService.ets ScanService.ets
  components/ StatusBanner SectionCard Chip ZhlButton ZhlField SkeletonBar DeviceCard TaskRow
              PinInput DeviceStatusCard ModelModePicker ImmersiveTabBar
  pages/      Index.ets(@Entry：登录门 + 设备/任务/我的 三 Tab + Navigation 栈)
              Login.ets Register.ets PinGate.ets DeviceDetail.ets TaskOutput.ets RemotePanel.ets
              panes/{DevicesPane,TasksPane,ProfilePane}.ets
```

路由：Navigation + 系统路由表（`resources/base/profile/router_map.json`），子页 5 个：
Register / PinGate / DeviceDetail / TaskOutput / RemotePanel。

## 构建

```bash
# DevEco Studio 打开本目录（File → Project Structure → Signing Configs 勾自动签名），或命令行：
hvigorw assembleHap --mode module -p product=default -p buildMode=debug
```

产物：`entry/build/default/outputs/default/entry-default-unsigned.hap`
（未签名，装真机前需要在 DevEco 里用你的账号自动签名）。

SDK 版本：`build-profile.json5` 三处版本号必须与 `hvigor/hvigor-config.json5`、
根 `oh-package.json5` 的 `modelVersion` 对齐（当前都是 5.1.0 / 5.1.0(18)）。
换到你机器的 SDK（例如 6.1.1(24)）时把这四处一起改。

2026-10-16 在 Windows 本机按 HarmonyOS 6.1.1(24) 实测过：`build-profile.json5` 三个
`*SdkVersion` + `hvigor/hvigor-config.json5` 与根 `oh-package.json5` 的 `modelVersion`
共 4 处改成 6.1.1 即可 `BUILD SUCCESSFUL`（仓库内这份保留 5.1.0(18)，改动是在盘的副本
`H:\zhl-hap-build` 里做的，避免影响另一台设备的构建）。签名产物：
`F:\dispatch111\_dist\zhlbuilder-hap-20261016\ZHLBuilder-0.1.0-debug-signed.hap`
（debug profile，bundle `com.zhl.builder`，只授权那一台调试设备）。

## 安全

- 登录令牌（JWT）用 HUKS 里的 AES-256-GCM 密钥加密后落盘（`service/SessionStore.ets`），
  这是「记住我」的全部依赖：杀掉 App 重开仍保持登录。
- 每台设备的 PIN 会话 token（`X-Builder-Session`）**只放内存，不落盘**：
  重开后保持登录，但进入设备操控仍要重新输 6 位 PIN（规格 §七「PIN 不落盘」+ 验收第 6 条）。
- PIN 本身只在内存里过一次，没有任何写 PIN 的接口；日志不含 token/PIN/密码。
- 凭据存储在 `EntryAbility.onCreate` 就发起初始化（早于首帧），页面只 `await
  zhlSessionStoreReady()`；放在页面 `aboutToAppear` 里取不到 host context 会让
  preferences 永远打不开，表现就是「记住我失效」。敏感操作（任务、状态、模型）都带
  `X-Builder-Session` 头（15 分钟 PIN 会话）。

## 说明

- 复刻自查表、与桌面端无法 1:1 的点、编译与安装步骤：见交付文档
  《鸿蒙端-复刻自查表与交付说明.md》。
- 底部栏材质的三档降级链说明写在 `components/ImmersiveTabBar.ets` 文件头
  （第 1 档 uiMaterial.ImmersiveMaterial 需要 HarmonyOS 26+，当前生效第 2 档）。