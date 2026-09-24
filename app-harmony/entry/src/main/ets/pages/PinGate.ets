import { router } from '@kit.ArkUI';
import { Api, ApiError, claim, setPinSession, verifyPin } from '../model/Api';

/**
 * PIN 页（双模式）：
 * - mode=pair  扫码绑定：输入 6 位 PIN 两次 → claim 认领设备
 * - mode=gate  进入设备：输一次 PIN → verifyPin 换 15 分钟会话
 */
const BG = '#05090F';
const PANEL = '#0C1420';
const LINE = '#1B2839';
const TXT = '#E6EDF6';
const DIM = '#8CA0B8';
const FAINT = '#5A6E86';
const ACCENT = '#22D3EE';
const DOWN = '#F87171';

@Entry
@Component
struct PinGate {
  @State mode: string = 'gate';
  @State pairCode: string = '';
  @State pin1: string = '';
  @State pin2: string = '';
  @State pin: string = '';
  @State err: string = '';
  @State loading: boolean = false;
  @State deviceId: number = 0;

  aboutToAppear(): void {
    const p = router.getParams() as Record<string, Object> | undefined;
    this.mode = String(p?.mode ?? 'gate');
    if (this.mode === 'pair') {
      this.pairCode = String(AppStorage.get('pendingPairCode') ?? '');
    } else {
      this.deviceId = Number(AppStorage.get('currentDeviceId') ?? 0);
    }
  }

  build() {
    Column({ space: 14 }) {
      Text(this.mode === 'pair' ? '绑定设备' : '输入设备 PIN')
        .fontSize(19).fontWeight(FontWeight.Bold).fontColor(TXT)
        .margin({ top: 48 })

      if (this.mode === 'pair') {
        Text(`配对码 ${this.pairCode}`).fontSize(15).fontColor(ACCENT).fontWeight(FontWeight.Medium)
        Text('为该设备设置 6 位数字 PIN，之后每次进入设备会话都要输入。')
          .fontSize(13).fontColor(DIM)
        TextInput({ placeholder: '6 位 PIN', text: this.pin1 })
          .type(InputType.Password).maxLength(6)
          .onChange((v) => { this.pin1 = v.replace(/\D/g, '').slice(0, 6); })
          .backgroundColor(PANEL).borderColor(LINE).fontColor(TXT)
        TextInput({ placeholder: '再输一次', text: this.pin2 })
          .type(InputType.Password).maxLength(6)
          .onChange((v) => { this.pin2 = v.replace(/\D/g, '').slice(0, 6); })
          .backgroundColor(PANEL).borderColor(LINE).fontColor(TXT)
      } else {
        Text('每次进入设备会话需要验证 6 位 PIN。').fontSize(13).fontColor(DIM)
        TextInput({ placeholder: '6 位 PIN', text: this.pin })
          .type(InputType.Password).maxLength(6)
          .onChange((v) => { this.pin = v.replace(/\D/g, '').slice(0, 6); })
          .backgroundColor(PANEL).borderColor(LINE).fontColor(TXT)
      }

      if (this.err) {
        Text(this.err).fontSize(13).fontColor(DOWN)
      }

      Button(this.loading ? '处理中…' : (this.mode === 'pair' ? '绑定' : '解锁'))
        .width('100%').backgroundColor(ACCENT).fontColor('#06222B')
        .enabled(!this.loading && (this.mode === 'pair'
          ? (this.pin1.length === 6 && this.pin1 === this.pin2)
          : this.pin.length === 6))
        .onClick(() => this.submit())

      Blank()
    }
    .width('100%').height('100%')
    .backgroundColor(BG)
    .padding({ left: 24, right: 24 })
  }

  submit(): void {
    this.loading = true;
    this.err = '';
    if (this.mode === 'pair') {
      claim(this.context, this.pairCode, this.pin1)
        .then(() => {
          this.loading = false;
          router.back();
        })
        .catch((e: ApiError) => {
          this.loading = false;
          this.err = e.message;
        });
    } else {
      verifyPin(this.context, this.deviceId, this.pin)
        .then(async (r) => {
          await setPinSession(this.context, this.deviceId, String(r.sessionToken ?? ''));
          this.loading = false;
          router.replaceUrl({ url: 'pages/DeviceDetail' });
        })
        .catch((e: ApiError) => {
          this.loading = false;
          this.err = e.message;
        });
    }
  }
}
