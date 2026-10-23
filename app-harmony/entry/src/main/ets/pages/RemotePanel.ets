import { common } from '@kit.AbilityKit';
import { zhlDeviceList } from '../service/DeviceService';
import { zhlErrorText } from '../service/Http';
import { zhlParsePairQr, zhlStartPairScan, ZhlPairQr } from '../service/ScanService';
import { ZhlDevice, ZhlPinGateParam } from '../model/Types';
import {
  ZHL_ACCENT,
  ZHL_BG,
  ZHL_CARD_GAP,
  ZHL_DIM,
  ZHL_DOWN,
  ZHL_FAINT,
  ZHL_ICON_BOX,
  ZHL_LINE,
  ZHL_OK,
  ZHL_PANEL,
  ZHL_RADIUS_ICON,
  ZHL_TEXT,
  zhlAlpha,
} from '../common/Theme';
import { ZhlOutlineButton, ZhlPrimaryButton } from '../components/ZhlButton';
import { ZhlSectionCard } from '../components/SectionCard';
import { ZhlStatusBanner } from '../components/StatusBanner';

/**
 * 移动端远程控制面板 —— 规格 §二，逐段复刻桌面端弹窗（本任务主体）。
 *
 * 三段顺序与分组与桌面端一致：
 *  1) 头部：40x40 圆角容器 + 品牌青手机图标 + 标题「移动端远程控制」+ 副标题 + 描边关闭按钮
 *  2) 使用 Bot Channel 小节：小节头 + 说明 + 四张渠道信息卡 + 通栏描边「机器人管理」
 *  3) 品牌青描边重点卡「ZHLBuilder 手机客户端」：四个状态互斥渲染 + 出错时的后端原文红字
 *
 * 手机端无法 1:1 的地方（已在交付说明里逐条列出，这里只标事实，不静默改设计）：
 *  - 状态 A 的「生成配对二维码」、状态 C 的「启动设备代理」在桌面端走的是主进程 IPC
 *    （zhlDeviceAgent.ts 的 zhl:device:pair-qr / agent-start），手机端没有这条链路：
 *    A 按钮点击后走本机可行的配对路径（扫码），C 按钮点击后重新拉一次状态并给出桌面端指引。
 *  - 状态 B（配对中/显示二维码）在手机端不可达：配对码由桌面端生成，中枢不向手机暴露该状态，
 *    该分支按规格实现并保留，实际不会进入。
 *  - Bot Channel 四张卡与「机器人管理」在桌面端打开的是桌面端弹层，手机端只能给出桌面端指引。
 */

@Builder
export function RemotePanelBuilder(): void {
  RemotePanelPage()
}

interface ZhlBotEntry {
  botKey: string;
  botLabel: string;
  botRegion: string;
  botDesc: string;
  botIcon: Resource;
}

function zhlBotEntries(): Array<ZhlBotEntry> {
  const list: Array<ZhlBotEntry> = [];
  const weixin: ZhlBotEntry = {
    botKey: 'weixin',
    botLabel: '微信',
    botRegion: '',
    botDesc: '从微信会话打开这个工作区。',
    botIcon: $r('sys.symbol.message_fill'),
  };
  const feishu: ZhlBotEntry = {
    botKey: 'feishu',
    botLabel: '飞书',
    botRegion: '中国',
    botDesc: '从飞书打开这个工作区。',
    botIcon: $r('sys.symbol.message'),
  };
  const lark: ZhlBotEntry = {
    botKey: 'lark',
    botLabel: 'Lark',
    botRegion: '全球',
    botDesc: '从 Lark 打开这个工作区。',
    botIcon: $r('sys.symbol.at'),
  };
  const telegram: ZhlBotEntry = {
    botKey: 'telegram',
    botLabel: 'Telegram',
    botRegion: '',
    botDesc: '从 Telegram 打开这个工作区。',
    botIcon: $r('sys.symbol.paperplane_fill'),
  };
  list.push(weixin);
  list.push(feishu);
  list.push(lark);
  list.push(telegram);
  return list;
}

@Component
export struct RemotePanelPage {
  stack: NavPathStack | undefined = undefined;
  @State panelDevice: ZhlDevice | undefined = undefined;
  @State panelLoading: boolean = true;
  @State panelErr: string = '';
  @State panelHint: string = '';
  @State pressedBotKey: string = '';
  @State pairing: boolean = false;
  @State pairCode: string = '';
  @State pairMessage: string = '';
  private alive: boolean = true;

  aboutToAppear(): void {
    this.refreshDevices();
  }

  aboutToDisappear(): void {
    this.alive = false;
  }

  refreshDevices(): void {
    zhlDeviceList()
      .then((list: Array<ZhlDevice>) => {
        this.panelLoading = false;
        this.panelErr = '';
        if (list.length > 0) {
          this.panelDevice = list[0];
        } else {
          this.panelDevice = undefined;
        }
        this.pairing = false;
        if (this.alive) {
          setTimeout(() => {
            this.refreshDevices();
          }, 10000);
        }
      })
      .catch((e: Object) => {
        this.panelLoading = false;
        this.panelErr = zhlErrorText(e);
      });
  }

  // ===== 状态互斥判定（对应桌面端 ZhlAppPairSection 的四分支，顺序 online → bound → pairing → A）=====

  hasDevice(): boolean {
    return this.panelDevice !== undefined;
  }

  deviceOnline(): boolean {
    const device: ZhlDevice | undefined = this.panelDevice;
    if (device === undefined) {
      return false;
    }
    return device.online ?? false;
  }

  agentState(): string {
    const device: ZhlDevice | undefined = this.panelDevice;
    if (device === undefined) {
      return '';
    }
    return device.agentState ?? '';
  }

  // ===== 动作 =====

  /** 桌面端这里调主进程生成配对码；手机端只能走本机可行的配对路径：扫码 */
  startPairing(): void {
    this.panelHint = '';
    zhlStartPairScan(this.getUIContext().getHostContext() as common.UIAbilityContext)
      .then((raw: string) => {
        const qr: ZhlPairQr | undefined = zhlParsePairQr(raw);
        if (qr === undefined) {
          this.panelErr = '二维码内容无法识别（必须含 app=zhlbuilder 与 pairCode）';
          return;
        }
        const code: string = qr.pairCode ?? '';
        AppStorage.setOrCreate('zhlPendingPairCode', code);
        if (this.stack !== undefined) {
          const param: ZhlPinGateParam = {
            mode: 'pair',
            pairCode: code,
            deviceId: 0,
            deviceName: '',
            nextPage: '',
          };
          this.stack.pushDestination(new NavPathInfo('PinGate', param));
        }
      })
      .catch(() => {
        // 用户取消扫码：保持面板原状
      });
  }

  /** 桌面端这里调主进程启动代理；手机端没有这条链路，如实说明并重新拉一次状态 */
  tryStartAgent(): void {
    this.panelHint = '请在桌面端 ZHLBuilder 打开「远控面板」点击「启动设备代理」。';
    this.refreshDevices();
  }

  openBotHint(): void {
    this.panelHint = 'Bot Channel 与机器人管理都在桌面端 ZHLBuilder 的「远控面板」里配置。';
  }

  errorLine(): string {
    if (this.panelErr.length > 0) {
      return this.panelErr;
    }
    if (this.agentState() === 'offline') {
      return '设备代理已断开（电脑关机、断网或桌面端已退出），属于设备侧连接问题。';
    }
    return '';
  }

  build() {
    NavDestination() {
      Scroll() {
        Column({ space: ZHL_CARD_GAP }) {
          this.headerRow()
          this.botChannelSection()
          this.pairCard()
        }
        .width('100%')
        .padding({ left: 16, right: 16, top: 12, bottom: 24 })
      }
      .width('100%')
      .height('100%')
      .backgroundColor(ZHL_BG)
      .scrollBar(BarState.Off)
    }
    .hideTitleBar(true)
    .backgroundColor(ZHL_BG)
    .onReady((context: NavDestinationContext) => {
      this.stack = context.pathStack;
    })
  }

  // ===== 第 1 段：头部 =====

  @Builder
  headerRow() {
    Row({ space: 12 }) {
      Column() {
        SymbolGlyph($r('sys.symbol.phone_fill'))
          .fontSize(20)
          .fontColor([ZHL_ACCENT])
      }
      .width(ZHL_ICON_BOX)
      .height(ZHL_ICON_BOX)
      .justifyContent(FlexAlign.Center)
      .backgroundColor(ZHL_PANEL)
      .border({ width: 1, color: ZHL_LINE })
      .borderRadius(ZHL_RADIUS_ICON)

      Column({ space: 4 }) {
        Text('移动端远程控制')
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor(ZHL_TEXT)
        Text('通过聊天机器人控制 ZHLBuilder 工作区。')
          .fontSize(13)
          .fontColor(ZHL_DIM)
          .lineHeight(21)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)

      Button() {
        SymbolGlyph($r('sys.symbol.xmark'))
          .fontSize(16)
          .fontColor([ZHL_DIM])
      }
      .width(36)
      .height(36)
      .backgroundColor(Color.Transparent)
      .border({ width: 1, color: ZHL_LINE })
      .borderRadius(10)
      .onClick(() => {
        if (this.stack !== undefined) {
          this.stack.pop();
        }
      })
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
    .padding({ top: 4, bottom: 4 })
  }

  // ===== 第 2 段：使用 Bot Channel =====

  @Builder
  botChannelSection() {
    ZhlSectionCard({
      sectionTitle: '使用 Bot Channel',
      sectionDesc: '连接聊天 Bot，适合更长时间的移动端访问。',
      sectionIcon: $r('sys.symbol.robot'),
    }) {
      Column({ space: 12 }) {
        ForEach(zhlBotEntries(), (botItem: ZhlBotEntry) => {
          this.botCard(botItem)
        }, (botItem: ZhlBotEntry) => `bot_${botItem.botKey}`)

        ZhlOutlineButton({
          btnLabel: '机器人管理',
          hasIcon: true,
          iconRes: $r('sys.symbol.robot'),
          tapAction: () => {
            this.openBotHint();
          },
        })

        if (this.panelHint.length > 0) {
          Text(this.panelHint)
            .fontSize(12)
            .fontColor(ZHL_FAINT)
            .lineHeight(19)
            .width('100%')
        }
      }
      .width('100%')
    }
  }

  @Builder
  botCard(botItem: ZhlBotEntry) {
    Row({ space: 12 }) {
      Column() {
        SymbolGlyph(botItem.botIcon)
          .fontSize(20)
          .fontColor([ZHL_ACCENT])
      }
      .width(ZHL_ICON_BOX)
      .height(ZHL_ICON_BOX)
      .justifyContent(FlexAlign.Center)
      .backgroundColor(ZHL_PANEL)
      .border({ width: 1, color: ZHL_LINE })
      .borderRadius(ZHL_RADIUS_ICON)

      Column({ space: 4 }) {
        Row({ space: 6 }) {
          Text(botItem.botLabel)
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(ZHL_TEXT)
          if (botItem.botRegion.length > 0) {
            Text(botItem.botRegion)
              .fontSize(11)
              .fontColor(ZHL_FAINT)
              .padding({ left: 8, right: 8, top: 3, bottom: 3 })
              .border({ width: 1, color: ZHL_LINE })
              .borderRadius(999)
          }
        }

        Text(botItem.botDesc)
          .fontSize(13)
          .fontColor(ZHL_DIM)
          .lineHeight(21)
          .width('100%')

        // 桌面端这一行没有下划线（事实清单第 11 条纠正）
        Text('去 Bot Channels 配置')
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(ZHL_ACCENT)
          .width('100%')
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
    .padding(16)
    .backgroundColor(ZHL_PANEL)
    .border({ width: 1, color: this.botBorderColor(botItem.botKey) })
    .borderRadius(12)
    .translate({ y: this.botShift(botItem.botKey) })
    .shadow(this.botShadow(botItem.botKey))
    .animation({ duration: 120, curve: Curve.FastOutSlowIn })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressedBotKey = botItem.botKey;
        return;
      }
      if (event.type === TouchType.Up) {
        this.pressedBotKey = '';
        this.openBotHint();
        return;
      }
      if (event.type === TouchType.Cancel) {
        this.pressedBotKey = '';
      }
    })
  }

  botBorderColor(key: string): string {
    if (this.pressedBotKey === key) {
      return ZHL_ACCENT;
    }
    return ZHL_LINE;
  }

  botShift(key: string): number {
    if (this.pressedBotKey === key) {
      return -4;
    }
    return 0;
  }

  botShadow(key: string): ShadowOptions {
    if (this.pressedBotKey === key) {
      const deep: ShadowOptions = {
        radius: 14,
        color: zhlAlpha('#000000', 0.45),
        offsetX: 0,
        offsetY: 6,
      };
      return deep;
    }
    const none: ShadowOptions = {
      radius: 0,
      color: zhlAlpha('#000000', 0.0),
      offsetX: 0,
      offsetY: 0,
    };
    return none;
  }

  // ===== 第 3 段：品牌青描边重点卡 =====

  @Builder
  pairCard() {
    ZhlSectionCard({
      sectionTitle: 'ZHLBuilder 手机客户端',
      sectionDesc: '扫码绑定这台设备，在手机上远程下发任务、查看实时输出。绑定需设置 6 位 PIN。',
      sectionIcon: $r('sys.symbol.phone_fill'),
      sectionAccent: true,
    }) {
      Column({ space: 12 }) {
        if (this.hasDevice()) {
          if (this.deviceOnline()) {
            ZhlStatusBanner({
              bannerColor: ZHL_OK,
              bannerText: '设备代理已连接中枢，手机端可下发任务。',
            })
          } else {
            ZhlStatusBanner({
              bannerColor: ZHL_OK,
              bannerText: '已绑定。启动设备代理后即可在手机端看到本机在线。',
            })
            ZhlPrimaryButton({
              btnLabel: '启动设备代理',
              hasIcon: true,
              iconRes: $r('sys.symbol.play_fill'),
              tapAction: () => {
                this.tryStartAgent();
              },
            })
          }
        } else {
          if (this.pairing && this.pairCode.length > 0) {
            Column({ space: 8 }) {
              Column() {
                SymbolGlyph($r('sys.symbol.qrcode'))
                  .fontSize(96)
                  .fontColor(['#05090F'])
              }
              .width(176)
              .height(176)
              .justifyContent(FlexAlign.Center)
              .backgroundColor(Color.White)
              .borderRadius(10)

              Row({ space: 4 }) {
                Text('配对码 ')
                  .fontSize(14)
                  .fontColor(ZHL_DIM)
                Text(this.pairCode)
                  .fontSize(15)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(ZHL_ACCENT)
                  .fontFamily('monospace')
              }

              Text('打开 ZHLBuilder 手机 App → 扫码 → 设置 6 位 PIN（5 分钟内有效）')
                .fontSize(12)
                .fontColor(ZHL_FAINT)
                .lineHeight(19)
                .textAlign(TextAlign.Center)

              if (this.pairMessage.length > 0) {
                Text(this.pairMessage)
                  .fontSize(12)
                  .fontColor(ZHL_FAINT)
                  .textAlign(TextAlign.Center)
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Center)
          } else {
            ZhlPrimaryButton({
              btnLabel: '生成配对二维码',
              tapAction: () => {
                this.startPairing();
              },
            })
            Text('需要先在手机上安装 ZHLBuilder App（download.zhl.asia 下载中心）。')
              .fontSize(12)
              .fontColor(ZHL_FAINT)
              .lineHeight(19)
              .width('100%')
          }
        }

        if (this.errorLine().length > 0) {
          Text(this.errorLine())
            .fontSize(12)
            .fontColor(ZHL_DOWN)
            .lineHeight(19)
            .width('100%')
        }
      }
      .width('100%')
    }
  }
}