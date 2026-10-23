import { zhlAgentStateHint, zhlPlatformText } from '../common/Format';
import {
  ZHL_ACCENT, ZHL_CARD_GAP, ZHL_CARD_PAD, ZHL_DIM, ZHL_DOWN, ZHL_ICON_BOX, ZHL_MS_PULSE, ZHL_OK,
  ZHL_PANEL, ZHL_RADIUS_CARD, ZHL_RADIUS_ICON, ZHL_TEXT, zhlAlpha,
} from '../common/Theme';
import { ZhlStatusBanner } from './StatusBanner';

/**
 * 设备详情页顶部卡：品牌青描边卡（与远控面板第三段同款）。
 *  - 设备名、平台、agent 版本、在线状态横幅（统一状态横幅，不允许降级成小字）
 *  - 有任务在跑时卡内加一条品牌青脉冲细光带（从左到右来回），不显示编造的百分比进度
 *  - agentState 三态文案不同：running / not_started / offline（规格 §七之二 第 5 条）
 */
@Component
export struct ZhlDeviceStatusCard {
  @Prop cardDeviceName: string = '';
  @Prop cardPlatform: string = '';
  @Prop cardAgentVersion: string = '';
  @Prop cardAgentState: string = '';
  @Prop cardBusy: boolean = false;
  @State pulseOn: boolean = false;

  aboutToAppear(): void {
    setTimeout(() => {
      this.pulseOn = true;
    }, 30);
  }

  bannerColor(): string {
    if (this.cardAgentState === 'running') {
      return ZHL_OK;
    }
    if (this.cardAgentState === 'offline') {
      return ZHL_DOWN;
    }
    return ZHL_ACCENT;
  }

  /** 文案逐字来自规格：状态 C/D 与 §七之二 第 5 条 */
  bannerText(): string {
    if (this.cardAgentState === 'running') {
      return '设备代理已连接中枢，手机端可下发任务。';
    }
    if (this.cardAgentState === 'offline') {
      return '设备代理已断开。';
    }
    return '已绑定。启动设备代理后即可在手机端看到本机在线。';
  }

  hintText(): string {
    if (this.cardAgentState === 'running') {
      return '';
    }
    return zhlAgentStateHint(this.cardAgentState);
  }

  metaLine(): string {
    const platform: string = zhlPlatformText(this.cardPlatform);
    const version: string = this.cardAgentVersion;
    if (version.length > 0) {
      return `${platform} · agent ${version}`;
    }
    return platform;
  }

  pulseShift(): string {
    if (this.pulseOn) {
      return '260%';
    }
    return '0%';
  }

  build() {
    Column({ space: ZHL_CARD_GAP }) {
      Row({ space: 12 }) {
        Column() {
          SymbolGlyph($r('sys.symbol.phone_fill'))
            .fontSize(20)
            .fontColor([ZHL_ACCENT])
        }
        .width(ZHL_ICON_BOX)
        .height(ZHL_ICON_BOX)
        .justifyContent(FlexAlign.Center)
        .backgroundColor(zhlAlpha(ZHL_ACCENT, 0.10))
        .borderRadius(ZHL_RADIUS_ICON)
        .border({ width: 1, color: zhlAlpha(ZHL_ACCENT, 0.30) })

        Column({ space: 4 }) {
          Text(this.cardDeviceName)
            .fontSize(16)
            .fontWeight(FontWeight.Medium)
            .fontColor(ZHL_TEXT)
          Text(this.metaLine())
            .fontSize(13)
            .fontColor(ZHL_DIM)
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)

      if (this.cardBusy) {
        Row() {
          Row()
            .width('30%')
            .height(2)
            .borderRadius(1)
            .linearGradient({
              angle: 90,
              colors: [
                [zhlAlpha(ZHL_ACCENT, 0.0), 0.0],
                [ZHL_ACCENT, 0.5],
                [zhlAlpha(ZHL_ACCENT, 0.0), 1.0],
              ],
            })
            .translate({ x: this.pulseShift() })
            .animation({
              duration: ZHL_MS_PULSE,
              curve: Curve.EaseInOut,
              iterations: -1,
              playMode: PlayMode.Alternate,
            })
        }
        .width('100%')
        .height(2)
      }

      ZhlStatusBanner({ bannerColor: this.bannerColor(), bannerText: this.bannerText() })

      if (this.hintText().length > 0) {
        Text(this.hintText())
          .fontSize(13)
          .fontColor(ZHL_DIM)
          .lineHeight(21)
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(ZHL_CARD_PAD)
    .border({ width: 1, color: zhlAlpha(ZHL_ACCENT, 0.30) })
    .borderRadius(ZHL_RADIUS_CARD)
    .backgroundColor(zhlAlpha(ZHL_PANEL, 0.60))
  }
}