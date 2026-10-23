import { zhlAuthLogout, zhlLoadProfile, zhlRefreshProfile } from '../../service/AuthService';
import { zhlDeviceChangePin, zhlDeviceList, zhlDeviceUnpair } from '../../service/DeviceService';
import { zhlErrorText } from '../../service/Http';
import { zhlGetBaseUrl, zhlSetBaseUrl } from '../../service/SessionStore';
import { ZhlDevice, ZhlUserInfo } from '../../model/Types';
import {
  ZHL_BG, ZHL_CARD_GAP, ZHL_CARD_PAD, ZHL_DIM, ZHL_DOWN, ZHL_FAINT, ZHL_LINE, ZHL_MS_ITEM, ZHL_OK,
  ZHL_PANEL, ZHL_RADIUS_CARD, ZHL_TEXT, zhlAlpha,
} from '../../common/Theme';
import { ZhlDangerButton, ZhlOutlineButton, ZhlPrimaryButton } from '../../components/ZhlButton';
import { ZhlField } from '../../components/ZhlField';
import { ZhlSkeletonBar } from '../../components/SkeletonBar';
import { ZhlStatusBanner } from '../../components/StatusBanner';

/**
 * 我的页（规格 §三 我的页）。
 *  - 账号卡：用户名、呼号、等级名、积分、余额、飞行小时，2 列小格（上小字标签下大号数值）
 *  - 依次：设备数量、修改 PIN、解绑设备（描边红字按钮，二次确认）、服务器设置、退出登录
 *  - 另加一个「移动端远程控制」入口：面板是桌面端的入口在手机端没有对应位置，
 *    这里作为唯一承载入口（交付说明里已列明这一处新增）
 *  - 这一页不要任何装饰性动画，只留骨架屏和淡入
 */

interface ZhlProfileCell {
  cellLabel: string;
  cellValue: string;
}

@Component
export struct ZhlProfilePane {
  onOpenRemotePanel: () => void = () => {
  };
  @State profile: ZhlUserInfo | undefined = undefined;
  @State profileDevices: Array<ZhlDevice> = [];
  @State profileLoading: boolean = true;
  @State paneEntered: boolean = false;
  @State profileErr: string = '';
  @State actionMsg: string = '';
  @State serverUrl: string = '';
  @State showServer: boolean = false;
  @State showChangePin: boolean = false;
  @State currentPin: string = '';
  @State newPin: string = '';
  @State pinChanging: boolean = false;
  @State unpairArming: boolean = false;
  @State unpairing: boolean = false;
  private alive: boolean = true;

  aboutToAppear(): void {
    setTimeout(() => {
      this.paneEntered = true;
    }, 20);
    this.profile = zhlLoadProfile();
    this.serverUrl = zhlGetBaseUrl();
    this.loadDevices();
    zhlRefreshProfile()
      .then((user: ZhlUserInfo) => {
        this.profile = user;
        this.profileLoading = false;
      })
      .catch((e: Object) => {
        this.profileLoading = false;
        this.profileErr = zhlErrorText(e);
      });
  }

  aboutToDisappear(): void {
    this.alive = false;
  }

  loadDevices(): void {
    zhlDeviceList()
      .then((list: Array<ZhlDevice>) => {
        this.profileDevices = list;
      })
      .catch(() => {
        // 账号卡与设置项不依赖设备列表，静默
      });
  }

  paneOpacity(): number {
    if (this.paneEntered) {
      return 1;
    }
    return 0;
  }

  cells(): Array<ZhlProfileCell> {
    const user: ZhlUserInfo | undefined = this.profile;
    const list: Array<ZhlProfileCell> = [];
    const username: ZhlProfileCell = {
      cellLabel: '用户名',
      cellValue: user === undefined ? '—' : (user.username ?? '—'),
    };
    const callsign: ZhlProfileCell = {
      cellLabel: '呼号',
      cellValue: user === undefined ? '—' : (user.callsign ?? '—'),
    };
    const levelName: ZhlProfileCell = {
      cellLabel: '等级名',
      cellValue: user === undefined ? '—' : (user.levelName ?? '—'),
    };
    const points: ZhlProfileCell = {
      cellLabel: '积分',
      cellValue: user === undefined ? '—' : this.numberText(user.points),
    };
    const balance: ZhlProfileCell = {
      cellLabel: '余额',
      cellValue: user === undefined ? '—' : this.numberText(user.balance),
    };
    const flightHours: ZhlProfileCell = {
      cellLabel: '飞行小时',
      cellValue: user === undefined ? '—' : this.numberText(user.flightHours),
    };
    list.push(username);
    list.push(callsign);
    list.push(levelName);
    list.push(points);
    list.push(balance);
    list.push(flightHours);
    return list;
  }

  numberText(value: number | undefined): string {
    if (value === undefined) {
      return '—';
    }
    return String(value);
  }

  deviceCountText(): string {
    return `${this.profileDevices.length} 台`;
  }

  targetDeviceId(): number {
    if (this.profileDevices.length === 0) {
      return 0;
    }
    const stored: number = AppStorage.get<number>('zhlSelectedDeviceId') ?? 0;
    for (let i = 0; i < this.profileDevices.length; i++) {
      if ((this.profileDevices[i].id ?? 0) === stored) {
        return stored;
      }
    }
    return this.profileDevices[0].id ?? 0;
  }

  doChangePin(): void {
    const deviceId: number = this.targetDeviceId();
    if (deviceId <= 0) {
      this.actionMsg = '还没有绑定设备，无法修改 PIN。';
      return;
    }
    if (this.currentPin.length !== 6 || this.newPin.length !== 6) {
      this.actionMsg = '当前 PIN 与新 PIN 都必须是 6 位数字。';
      return;
    }
    this.pinChanging = true;
    zhlDeviceChangePin(deviceId, this.currentPin, this.newPin)
      .then(() => {
        this.pinChanging = false;
        this.showChangePin = false;
        this.currentPin = '';
        this.newPin = '';
        this.actionMsg = 'PIN 已修改。';
      })
      .catch((e: Object) => {
        this.pinChanging = false;
        this.actionMsg = zhlErrorText(e);
      });
  }

  doUnpair(): void {
    const deviceId: number = this.targetDeviceId();
    if (deviceId <= 0) {
      this.actionMsg = '还没有绑定设备。';
      return;
    }
    this.unpairing = true;
    zhlDeviceUnpair(deviceId)
      .then(() => {
        this.unpairing = false;
        this.unpairArming = false;
        this.actionMsg = '已解绑。';
        this.loadDevices();
      })
      .catch((e: Object) => {
        this.unpairing = false;
        this.actionMsg = zhlErrorText(e);
      });
  }

  saveServer(): void {
    zhlSetBaseUrl(this.serverUrl).then(() => {
      this.actionMsg = '服务器地址已保存。';
    });
  }

  doLogout(): void {
    zhlAuthLogout().then(() => {
      this.actionMsg = '';
    });
  }

  build() {
    Column() {
      Scroll() {
        Column({ space: ZHL_CARD_GAP }) {
          if (this.profileLoading) {
            Column({ space: 10 }) {
              ZhlSkeletonBar({ barWidth: '50%' })
              ZhlSkeletonBar({ barWidth: '100%', barHeight: 12 })
              ZhlSkeletonBar({ barWidth: '80%', barHeight: 12 })
            }
            .width('100%')
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)
          }

          Column({ space: ZHL_CARD_GAP }) {
            Text('账号')
              .fontSize(15)
              .fontWeight(FontWeight.Medium)
              .fontColor(ZHL_TEXT)
              .width('100%')
            this.cellRow(0)
            this.cellRow(2)
            this.cellRow(4)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(ZHL_CARD_PAD)
          .backgroundColor(ZHL_PANEL)
          .border({ width: 1, color: ZHL_LINE })
          .borderRadius(ZHL_RADIUS_CARD)

          Column({ space: ZHL_CARD_GAP }) {
            this.settingRow('移动端远程控制', () => {
              this.onOpenRemotePanel();
            })
            this.settingRow(`设备数量 · ${this.deviceCountText()}`, () => {
              this.loadDevices();
            })
            this.settingRow('修改 PIN', () => {
              this.showChangePin = !this.showChangePin;
              this.actionMsg = '';
            })

            if (this.showChangePin) {
              Column({ space: 8 }) {
                ZhlField({
                  fieldPlaceholder: '当前 6 位 PIN',
                  fieldValue: this.currentPin,
                  fieldSecret: true,
                  fieldMaxLength: 6,
                  onFieldChange: (value: string) => {
                    this.currentPin = value;
                  },
                })
                ZhlField({
                  fieldPlaceholder: '新 6 位 PIN',
                  fieldValue: this.newPin,
                  fieldSecret: true,
                  fieldMaxLength: 6,
                  onFieldChange: (value: string) => {
                    this.newPin = value;
                  },
                })
                ZhlPrimaryButton({
                  btnLabel: '确认修改',
                  btnBusyLabel: '提交中…',
                  btnBusy: this.pinChanging,
                  btnEnabled: !this.pinChanging,
                  tapAction: () => {
                    this.doChangePin();
                  },
                })
              }
              .width('100%')
            }

            if (this.unpairArming) {
              Column({ space: 8 }) {
                Text('解绑后桌面端需要重新配对才能回来：本机令牌立即失效，需重新用手机扫码绑定。')
                  .fontSize(12)
                  .fontColor(ZHL_DOWN)
                  .lineHeight(19)
                  .width('100%')
                ZhlDangerButton({
                  btnLabel: '确认解绑',
                  btnEnabled: !this.unpairing,
                  tapAction: () => {
                    this.doUnpair();
                  },
                })
                ZhlOutlineButton({
                  btnLabel: '取消',
                  tapAction: () => {
                    this.unpairArming = false;
                  },
                })
              }
              .width('100%')
              .padding(16)
              .backgroundColor(zhlAlpha(ZHL_DOWN, 0.08))
              .border({ width: 1, color: zhlAlpha(ZHL_DOWN, 0.40) })
              .borderRadius(12)
            } else {
              ZhlDangerButton({
                btnLabel: '解绑设备',
                btnEnabled: this.profileDevices.length > 0,
                hasIcon: true,
                iconRes: $r('sys.symbol.link_slash'),
                tapAction: () => {
                  this.unpairArming = true;
                  this.actionMsg = '';
                },
              })
            }

            this.settingRow('服务器设置', () => {
              this.showServer = !this.showServer;
              this.actionMsg = '';
            })

            if (this.showServer) {
              Column({ space: 8 }) {
                ZhlField({
                  fieldPlaceholder: '服务器地址',
                  fieldValue: this.serverUrl,
                  onFieldChange: (value: string) => {
                    this.serverUrl = value;
                  },
                })
                ZhlOutlineButton({
                  btnLabel: '保存服务器地址',
                  tapAction: () => {
                    this.saveServer();
                  },
                })
              }
              .width('100%')
            }

            ZhlOutlineButton({
              btnLabel: '退出登录',
              btnColor: ZHL_DIM,
              hasIcon: true,
              iconRes: $r('sys.symbol.arrow_up_right'),
              tapAction: () => {
                this.doLogout();
              },
            })
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(ZHL_CARD_PAD)
          .backgroundColor(ZHL_PANEL)
          .border({ width: 1, color: ZHL_LINE })
          .borderRadius(ZHL_RADIUS_CARD)

          if (this.actionMsg.length > 0) {
            ZhlStatusBanner({ bannerColor: ZHL_OK, bannerText: this.actionMsg })
          }

          if (this.profileErr.length > 0) {
            Text(this.profileErr)
              .fontSize(12)
              .fontColor(ZHL_DOWN)
              .width('100%')
          }
        }
        .width('100%')
        .padding({ top: 12, bottom: 24 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.Top)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 16, right: 16 })
    .backgroundColor(ZHL_BG)
    .opacity(this.paneOpacity())
    .animation({ duration: ZHL_MS_ITEM, curve: Curve.FastOutSlowIn })
  }

  @Builder
  cellRow(startIndex: number) {
    Row({ space: ZHL_CARD_GAP }) {
      this.cellBox(this.cells()[startIndex])
      this.cellBox(this.cells()[startIndex + 1])
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
  }

  @Builder
  cellBox(cell: ZhlProfileCell) {
    Column({ space: 4 }) {
      Text(cell.cellLabel)
        .fontSize(12)
        .fontColor(ZHL_FAINT)
      Text(cell.cellValue)
        .fontSize(18)
        .fontWeight(FontWeight.Medium)
        .fontColor(ZHL_TEXT)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
    .padding(16)
    .backgroundColor(ZHL_PANEL)
    .border({ width: 1, color: ZHL_LINE })
    .borderRadius(12)
  }

  @Builder
  settingRow(rowLabel: string, onTap: () => void) {
    Row({ space: 8 }) {
      Text(rowLabel)
        .fontSize(14)
        .fontColor(ZHL_TEXT)
        .layoutWeight(1)
      SymbolGlyph($r('sys.symbol.chevron_right'))
        .fontSize(14)
        .fontColor([ZHL_FAINT])
    }
    .width('100%')
    .alignItems(VerticalAlign.Center)
    .padding({ top: 10, bottom: 10 })
    .onClick(() => {
      onTap();
    })
  }
}