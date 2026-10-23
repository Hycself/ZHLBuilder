import { pasteboard } from '@kit.BasicServicesKit';
import { zhlAuthRegister, zhlAuthSendEmailCode, ZhlRegisterBody } from '../service/AuthService';
import { zhlErrorText } from '../service/Http';
import { zhlFormatDateTime } from '../common/Format';
import {
  ZHL_ACCENT, ZHL_BG, ZHL_CARD_GAP, ZHL_CARD_PAD, ZHL_DIM, ZHL_DOWN, ZHL_FAINT, ZHL_LINE,
  ZHL_OK, ZHL_PANEL, ZHL_RADIUS_CARD, ZHL_TEXT,
} from '../common/Theme';
import { ZhlField } from '../components/ZhlField';
import { ZhlOutlineButton, ZhlPrimaryButton } from '../components/ZhlButton';
import { ZhlStatusBanner } from '../components/StatusBanner';

/**
 * 注册页（规格 §三 注册页）。
 * 桌面端没有这个页面，所以它不参与并排截图验收，但视觉规格与登录页同一套。
 *
 *  - 五个字段按固定顺序，全部必填：用户名 / 呼号 / 邮箱 / 密码 / 邮箱验证码
 *  - 「获取验证码」按下后禁用并显示 60 秒倒计时，结束恢复
 *  - 主按钮「注册」，请求中禁用、半透明、文案「提交中…」
 *  - 校验错误就地显示在对应输入框下方（12 号 #F87171），优先显示后端返回的中文原文
 *  - 成功后整页换成成功卡（不是弹窗、不是 toast）
 *  - botToken 是服务端凭据：这里不接收、不显示、不落盘、不打日志（AuthService 白名单化）
 */

@Builder
export function RegisterBuilder(): void {
  RegisterPage()
}

@Component
export struct RegisterPage {
  stack: NavPathStack | undefined = undefined;
  @State username: string = '';
  @State callsign: string = '';
  @State email: string = '';
  @State password: string = '';
  @State emailCode: string = '';
  @State errUser: string = '';
  @State errCallsign: string = '';
  @State errEmail: string = '';
  @State errPass: string = '';
  @State errCode: string = '';
  @State formErr: string = '';
  @State countdown: number = 0;
  @State sendingCode: boolean = false;
  @State submitting: boolean = false;
  @State done: boolean = false;
  @State joinCode: string = '';
  @State joinCodeExpire: string = '';
  @State alive: boolean = true;

  aboutToDisappear(): void {
    this.alive = false;
  }

  clearErrors(): void {
    this.errUser = '';
    this.errCallsign = '';
    this.errEmail = '';
    this.errPass = '';
    this.errCode = '';
    this.formErr = '';
  }

  validEmail(value: string): boolean {
    const at: number = value.indexOf('@');
    const dot: number = value.lastIndexOf('.');
    return at > 0 && dot > at + 1 && dot < value.length - 1;
  }

  /** 本机格式校验：后端能给的错就以它为准，本地只拦明显不合规的输入 */
  localCheck(): boolean {
    this.clearErrors();
    if (this.username.trim().length === 0) {
      this.errUser = '请填写用户名';
      return false;
    }
    if (this.callsign.trim().length === 0) {
      this.errCallsign = '请填写呼号';
      return false;
    }
    if (!this.validEmail(this.email.trim())) {
      this.errEmail = '请填写合法的邮箱';
      return false;
    }
    if (this.password.length === 0) {
      this.errPass = '请填写密码';
      return false;
    }
    if (this.emailCode.length !== 6) {
      this.errCode = '请填写 6 位邮箱验证码';
      return false;
    }
    return true;
  }

  /** 后端中文原文按关键词归位到对应字段下方，归不出来就放表单底部 */
  applyServerError(message: string): void {
    this.clearErrors();
    if (message.indexOf('用户名') >= 0) {
      this.errUser = message;
      return;
    }
    if (message.indexOf('呼号') >= 0) {
      this.errCallsign = message;
      return;
    }
    if (message.indexOf('邮箱') >= 0) {
      this.errEmail = message;
      return;
    }
    if (message.indexOf('密码') >= 0) {
      this.errPass = message;
      return;
    }
    if (message.indexOf('验证码') >= 0) {
      this.errCode = message;
      return;
    }
    this.formErr = message;
  }

  codeButtonText(): string {
    if (this.countdown > 0) {
      return `${this.countdown} 秒`;
    }
    return '获取验证码';
  }

  codeButtonColor(): string {
    if (this.countdown > 0) {
      return ZHL_FAINT;
    }
    return ZHL_TEXT;
  }

  sendCode(): void {
    if (this.countdown > 0 || this.sendingCode) {
      return;
    }
    if (!this.validEmail(this.email.trim())) {
      this.errEmail = '请填写合法的邮箱';
      return;
    }
    this.errEmail = '';
    this.sendingCode = true;
    zhlAuthSendEmailCode(this.email.trim())
      .then(() => {
        this.sendingCode = false;
        this.startCountdown();
      })
      .catch((e: Object) => {
        this.sendingCode = false;
        const message: string = zhlErrorText(e);
        if (message.indexOf('邮箱') >= 0) {
          this.errEmail = message;
        } else {
          this.formErr = message;
        }
      });
  }

  startCountdown(): void {
    this.countdown = 60;
    this.tick();
  }

  tick(): void {
    if (!this.alive || this.countdown <= 0) {
      return;
    }
    setTimeout(() => {
      if (!this.alive) {
        return;
      }
      if (this.countdown > 0) {
        this.countdown = this.countdown - 1;
        this.tick();
      }
    }, 1000);
  }

  doRegister(): void {
    if (this.submitting) {
      return;
    }
    if (!this.localCheck()) {
      return;
    }
    const body: ZhlRegisterBody = {
      username: this.username.trim(),
      callsign: this.callsign.trim(),
      email: this.email.trim(),
      password: this.password,
      emailCode: this.emailCode,
    };
    this.submitting = true;
    zhlAuthRegister(body)
      .then((data) => {
        this.submitting = false;
        this.done = true;
        this.joinCode = data.joinCode ?? '';
        this.joinCodeExpire = zhlFormatDateTime(data.joinCodeExpire);
      })
      .catch((e: Object) => {
        this.submitting = false;
        this.applyServerError(zhlErrorText(e));
      });
  }

  copyJoinCode(): void {
    if (this.joinCode.length === 0) {
      return;
    }
    const data: pasteboard.PasteData =
      pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.joinCode);
    pasteboard.getSystemPasteboard().setData(data).then(() => {
      this.getUIContext().getPromptAction().showToast({ message: '入群码已复制' });
    }).catch(() => {
      this.getUIContext().getPromptAction().showToast({ message: '复制失败，请手动记录' });
    });
  }

  /** 成功卡上的「去登录」：清注册页状态、回登录页并保留已填账号 */
  backToLogin(): void {
    AppStorage.setOrCreate('zhlRegAccount', this.username.trim());
    this.done = false;
    this.username = '';
    this.callsign = '';
    this.email = '';
    this.password = '';
    this.emailCode = '';
    this.joinCode = '';
    this.joinCodeExpire = '';
    this.clearErrors();
    if (this.stack !== undefined) {
      this.stack.pop();
    }
  }

  build() {
    NavDestination() {
      Column() {
        if (this.done) {
          this.successCard()
        } else {
          this.registerForm()
        }
      }
      .width('100%')
      .height('100%')
      .backgroundColor(ZHL_BG)
      .padding({ left: 16, right: 16 })
    }
    .hideTitleBar(true)
    .backgroundColor(ZHL_BG)
    .onReady((context: NavDestinationContext) => {
      this.stack = context.pathStack;
    })
  }

  @Builder
  successCard() {
    Column({ space: 16 }) {
      ZhlStatusBanner({
        bannerColor: ZHL_OK,
        bannerText: '注册成功。你的账号尚未入群，用下面的入群码在 QQ 群机器人处激活。',
      })

      Text(this.joinCode)
        .fontSize(30)
        .fontWeight(FontWeight.Bold)
        .fontColor(ZHL_ACCENT)
        .fontFamily('monospace')
        .letterSpacing(2)
        .textAlign(TextAlign.Center)
        .width('100%')
        .padding({ top: 8, bottom: 8 })
        .backgroundColor(ZHL_PANEL)
        .borderRadius(12)

      Text(this.expireLine())
        .fontSize(12)
        .fontColor(ZHL_FAINT)
        .lineHeight(19)
        .width('100%')

      ZhlOutlineButton({
        btnLabel: '复制入群码',
        hasIcon: true,
        iconRes: $r('sys.symbol.checkmark_square_on_square'),
        tapAction: () => {
          this.copyJoinCode();
        },
      })

      ZhlPrimaryButton({
        btnLabel: '去登录',
        tapAction: () => {
          this.backToLogin();
        },
      })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(ZHL_CARD_PAD)
    .backgroundColor(ZHL_PANEL)
    .border({ width: 1, color: ZHL_LINE })
    .borderRadius(ZHL_RADIUS_CARD)
    .margin({ top: 40 })
  }

  expireLine(): string {
    if (this.joinCodeExpire.length === 0) {
      return '入群码 24 小时内有效，一次性。';
    }
    return `入群码 24 小时内有效，一次性。到期时间：${this.joinCodeExpire}`;
  }

  @Builder
  registerForm() {
    Column({ space: ZHL_CARD_GAP }) {
      Text('注册 ZHLBuilder 账号')
        .fontSize(16)
        .fontWeight(FontWeight.Medium)
        .fontColor(ZHL_TEXT)
        .width('100%')

      this.fieldBlock('用户名', '2-20 位，字母/数字/下划线/中文', this.username, this.errUser, false)
      this.fieldBlock('呼号', '2-8 位字母数字，注册后自动转大写', this.callsign, this.errCallsign, false)
      this.fieldBlock('邮箱', '用于接收验证码', this.email, this.errEmail, false)
      this.fieldBlock('密码', '6-32 位', this.password, this.errPass, true)

      Column({ space: 6 }) {
        Row({ space: 8 }) {
          Column() {
            ZhlField({
              fieldPlaceholder: '邮箱验证码',
              fieldValue: this.emailCode,
              fieldMaxLength: 6,
              onFieldChange: (value: string) => {
                this.emailCode = value;
              },
            })
          }
          .layoutWeight(1)

          Column() {
            Button() {
              Text(this.codeButtonText())
                .fontSize(14)
                .fontColor(this.codeButtonColor())
            }
            .width('100%')
            .height(46)
            .backgroundColor(Color.Transparent)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(12)
            .enabled(this.countdown === 0 && !this.sendingCode)
            .onClick(() => {
              this.sendCode();
            })
          }
          .width(112)
        }
        .width('100%')

        if (this.errCode.length > 0) {
          Text(this.errCode)
            .fontSize(12)
            .fontColor(ZHL_DOWN)
            .width('100%')
        }
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)

      if (this.formErr.length > 0) {
        Text(this.formErr)
          .fontSize(12)
          .fontColor(ZHL_DOWN)
          .width('100%')
      }

      ZhlPrimaryButton({
        btnLabel: '注册',
        btnBusyLabel: '提交中…',
        btnBusy: this.submitting,
        btnEnabled: !this.submitting,
        tapAction: () => {
          this.doRegister();
        },
      })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(ZHL_CARD_PAD)
    .backgroundColor(ZHL_PANEL)
    .border({ width: 1, color: ZHL_LINE })
    .borderRadius(ZHL_RADIUS_CARD)
    .margin({ top: 40 })
  }

  @Builder
  fieldBlock(label: string, hint: string, value: string, errText: string, secret: boolean) {
    Column({ space: 6 }) {
      Text(label)
        .fontSize(12)
        .fontColor(ZHL_DIM)
        .width('100%')
      ZhlField({
        fieldPlaceholder: hint,
        fieldValue: value,
        fieldSecret: secret,
        onFieldChange: (next: string) => {
          this.onRegisterFieldChanged(label, next);
        },
      })
      if (errText.length > 0) {
        Text(errText)
          .fontSize(12)
          .fontColor(ZHL_DOWN)
          .width('100%')
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  onRegisterFieldChanged(label: string, value: string): void {
    if (label === '用户名') {
      this.username = value;
      this.errUser = '';
      return;
    }
    if (label === '呼号') {
      this.callsign = value;
      this.errCallsign = '';
      return;
    }
    if (label === '邮箱') {
      this.email = value;
      this.errEmail = '';
      return;
    }
    if (label === '密码') {
      this.password = value;
      this.errPass = '';
      return;
    }
    this.emailCode = value;
    this.errCode = '';
  }
}