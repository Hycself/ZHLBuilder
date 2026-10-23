import { zhlDeviceClaim, zhlDeviceVerifyPin } from '../service/DeviceService';
import { zhlErrorText } from '../service/Http';
import { zhlSetPinSession } from '../service/SessionStore';
import { ZhlDeviceDetailParam, ZhlPinGateParam } from '../model/Types';
import {
  ZHL_ACCENT,
  ZHL_BG,
  ZHL_CARD_GAP,
  ZHL_DIM,
  ZHL_DOWN,
  ZHL_FAINT,
  ZHL_TEXT,
} from '../common/Theme';
import { ZhlPinInput } from '../components/PinInput';
import { ZhlPrimaryButton } from '../components/ZhlButton';

/**
 * PIN 页（规格 §五 动效 + §七 PIN 约束），两种模式：
 *  - pair：扫码绑定。分两步输两次 6 位 PIN → claim 认领设备
 *  - gate：进入设备会话。输一次 PIN → verifyPin 换 15 分钟 X-Builder-Session
 *
 * PIN 不落盘：这里只在内存里拿着，成功后换到的是会话 token（HUKS 加密存储）。
 * 同设备错 5 次锁 15 分钟：锁定期内后端给出的中文原文直接显示，并禁用提交。
 */

@Builder
export function PinGateBuilder(): void {
  PinGatePage()
}

@Component
export struct PinGatePage {
  stack: NavPathStack | undefined = undefined;
  @State gateMode: string = 'gate';
  @State pairCode: string = '';
  @State gateDeviceId: number = 0;
  @State gateDeviceName: string = '';
  @State nextPage: string = '';
  @State pin: string = '';
  @State pin2: string = '';
  @State step: number = 1;
  @State errText: string = '';
  @State busy: boolean = false;
  @State pinError: boolean = false;
  @State shakeSignal: boolean = false;
  @State successSignal: boolean = false;
  @State locked: boolean = false;

  aboutToAppear(): void {
    const code: string = AppStorage.get<string>('zhlPendingPairCode') ?? '';
    if (this.pairCode.length === 0 && code.length > 0) {
      this.pairCode = code;
    }
  }

  titleText(): string {
    if (this.gateMode === 'pair') {
      return '绑定设备';
    }
    return '输入设备 PIN';
  }

  guideText(): string {
    if (this.gateMode === 'pair') {
      if (this.step === 2) {
        return '再输一次确认，两次必须一致。';
      }
      return '为该设备设置 6 位数字 PIN，之后每次进入设备会话都要输入。';
    }
    return '每次进入设备会话需要验证 6 位 PIN。';
  }

  stepText(): string {
    if (this.gateMode !== 'pair') {
      return '';
    }
    if (this.step === 2) {
      return '第 2 / 2 步';
    }
    return '第 1 / 2 步';
  }

  submitEnabled(): boolean {
    if (this.busy || this.locked) {
      return false;
    }
    if (this.gateMode === 'pair') {
      if (this.step === 2) {
        return this.pin2.length === 6;
      }
      return this.pin.length === 6;
    }
    return this.pin.length === 6;
  }

  onPinChanged(value: string): void {
    this.errText = '';
    this.pinError = false;
    if (value.length === 6) {
      this.trySubmit();
    }
  }

  onPin2Changed(value: string): void {
    this.errText = '';
    this.pinError = false;
    if (value.length === 6) {
      this.trySubmit();
    }
  }

  triggerFail(message: string): void {
    this.errText = message;
    this.pinError = true;
    this.shakeSignal = !this.shakeSignal;
    if (message.indexOf('15 分钟') >= 0 || message.indexOf('次数过多') >= 0) {
      this.locked = true;
    }
    setTimeout(() => {
      this.pin = '';
      this.pin2 = '';
    }, 350);
  }

  trySubmit(): void {
    if (!this.submitEnabled()) {
      return;
    }
    if (this.gateMode === 'pair') {
      if (this.step === 1) {
        this.step = 2;
        this.pin2 = '';
        return;
      }
      if (this.pin !== this.pin2) {
        this.step = 1;
        this.triggerFail('两次 PIN 不一致，请重新设置');
        return;
      }
      this.doClaim();
      return;
    }
    this.doVerify();
  }

  doClaim(): void {
    this.busy = true;
    this.errText = '';
    zhlDeviceClaim(this.pairCode, this.pin)
      .then(() => {
        this.busy = false;
        this.successSignal = true;
        this.pin = '';
        this.pin2 = '';
        AppStorage.setOrCreate('zhlPendingPairCode', '');
        setTimeout(() => {
          if (this.stack !== undefined) {
            this.stack.pop();
          }
        }, 450);
      })
      .catch((e: Object) => {
        this.busy = false;
        this.step = 1;
        this.triggerFail(zhlErrorText(e));
      });
  }

  doVerify(): void {
    this.busy = true;
    this.errText = '';
    zhlDeviceVerifyPin(this.gateDeviceId, this.pin)
      .then((data) => {
        const sessionToken: string = data.sessionToken ?? '';
        zhlSetPinSession(this.gateDeviceId, sessionToken).then(() => {
          this.busy = false;
          this.successSignal = true;
          setTimeout(() => {
            this.leaveGate();
          }, 350);
        });
      })
      .catch((e: Object) => {
        this.busy = false;
        this.triggerFail(zhlErrorText(e));
      });
  }

  /** 解锁成功后：nextPage 非空则替换到该页，否则退回上一页等它自己续跑 */
  leaveGate(): void {
    if (this.stack === undefined) {
      return;
    }
    if (this.nextPage === 'DeviceDetail') {
      const param: ZhlDeviceDetailParam = {
        deviceId: this.gateDeviceId,
        deviceName: this.gateDeviceName,
      };
      this.stack.replacePath(new NavPathInfo(this.nextPage, param));
      return;
    }
    this.stack.pop();
  }

  build() {
    NavDestination() {
      Column({ space: ZHL_CARD_GAP }) {
        Text(this.titleText())
          .fontSize(19)
          .fontWeight(FontWeight.Bold)
          .fontColor(ZHL_TEXT)
          .width('100%')

        if (this.gateMode === 'pair') {
          Column({ space: 4 }) {
            Text(`配对码 ${this.pairCode}`)
              .fontSize(15)
              .fontWeight(FontWeight.Medium)
              .fontColor(ZHL_ACCENT)
              .fontFamily('monospace')
            Text(this.stepText())
              .fontSize(12)
              .fontColor(ZHL_FAINT)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
        }

        Text(this.guideText())
          .fontSize(13)
          .fontColor(ZHL_DIM)
          .lineHeight(21)
          .width('100%')

        if (this.gateMode === 'pair' && this.step === 2) {
          ZhlPinInput({
            pinValue: this.pin2,
            pinError: this.pinError,
            pinShakeSignal: this.shakeSignal,
            pinSuccess: this.successSignal,
            onPinChange: (value: string) => {
              this.pin2 = value;
              this.onPin2Changed(value);
            },
          })
        } else {
          ZhlPinInput({
            pinValue: this.pin,
            pinError: this.pinError,
            pinShakeSignal: this.shakeSignal,
            pinSuccess: this.successSignal,
            onPinChange: (value: string) => {
              this.pin = value;
              this.onPinChanged(value);
            },
          })
        }

        if (this.errText.length > 0) {
          Text(this.errText)
            .fontSize(13)
            .fontColor(ZHL_DOWN)
            .width('100%')
        }

        ZhlPrimaryButton({
          btnLabel: this.primaryLabel(),
          btnBusy: this.busy,
          btnEnabled: this.submitEnabled(),
          tapAction: () => {
            this.trySubmit();
          },
        })

        Blank()
      }
      .width('100%')
      .height('100%')
      .alignItems(HorizontalAlign.Start)
      .padding({ left: 20, right: 20, top: 24 })
      .backgroundColor(ZHL_BG)
    }
    .hideTitleBar(true)
    .backgroundColor(ZHL_BG)
    .onReady((context: NavDestinationContext) => {
      this.stack = context.pathStack;
      const raw: Object = context.pathInfo.param as Object;
      const param: ZhlPinGateParam = raw as ZhlPinGateParam;
      this.gateMode = param.mode;
      this.pairCode = param.pairCode;
      this.gateDeviceId = param.deviceId;
      this.gateDeviceName = param.deviceName;
      this.nextPage = param.nextPage;
    })
  }

  primaryLabel(): string {
    if (this.busy) {
      return '处理中…';
    }
    if (this.gateMode === 'pair') {
      if (this.step === 2) {
        return '绑定';
      }
      return '下一步';
    }
    return '解锁';
  }
}