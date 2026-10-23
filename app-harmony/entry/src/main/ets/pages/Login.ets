import { zhlAuthLogin } from '../service/AuthService';
import { zhlErrorText } from '../service/Http';
import { zhlGetBaseUrl, zhlGetCachedAccount, zhlSetBaseUrl } from '../service/SessionStore';
import {
  ZHL_ACCENT,
  ZHL_BG,
  ZHL_DOWN,
  ZHL_FAINT,
  ZHL_LINE,
  ZHL_MS_ITEM,
  ZHL_PANEL,
  ZHL_RADIUS_CARD,
} from '../common/Theme';
import { ZhlField } from '../components/ZhlField';
import { ZhlPrimaryButton } from '../components/ZhlButton';

/**
 * 登录页（规格 §三 登录页）：
 *  - 居中卡片，顶部用 resources 里的 ZHLBuilder 图形标（不许用文字当 logo）
 *  - 账号/邮箱、密码两个输入框（ZhlField 统一样式）
 *  - 通栏实心品牌青「登录」；错误就地显示在按钮上方，红色小字
 *  - 按钮下方一行：12 号弱文字「还没有账号？」+ 品牌青可点文字「去注册」
 *  - 再下方是弱文字「服务器设置」折叠区，展开后是同款输入框
 * 登录成功后由 AuthService 把 zhlAuthState 置为 loggedIn，Index 切到主界面。
 */
@Component
export struct ZhlLoginPage {
  onOpenRegister: () => void = () => {
  };
  @State account: string = '';
  @State password: string = '';
  @State serverUrl: string = '';
  @State showServer: boolean = false;
  @State errText: string = '';
  @State busy: boolean = false;
  @State entered: boolean = false;

  aboutToAppear(): void {
    this.serverUrl = zhlGetBaseUrl();
    this.account = zhlGetCachedAccount();
    setTimeout(() => {
      this.entered = true;
    }, 30);
  }

  enteredOpacity(): number {
    if (this.entered) {
      return 1;
    }
    return 0;
  }

  enteredOffset(): number {
    if (this.entered) {
      return 0;
    }
    return 10;
  }

  canSubmit(): boolean {
    return this.account.trim().length > 0 && this.password.length > 0 && !this.busy;
  }

  serverToggleText(): string {
    if (this.showServer) {
      return '收起服务器设置';
    }
    return '服务器设置';
  }

  doLogin(): void {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.errText = '';
    const account: string = this.account.trim();
    zhlSetBaseUrl(this.serverUrl)
      .then(() => zhlAuthLogin(account, this.password))
      .then(() => {
        this.busy = false;
      })
      .catch((e: Object) => {
        this.busy = false;
        this.errText = zhlErrorText(e);
      });
  }

  build() {
    Column() {
      Column({ space: 16 }) {
        Image($r('app.media.zhl_logo'))
          .width(64)
          .height(64)
          .borderRadius(16)
          .objectFit(ImageFit.Contain)

        ZhlField({
          fieldPlaceholder: '账号（用户名或邮箱）',
          fieldValue: this.account,
          onFieldChange: (value: string) => {
            this.account = value;
          },
        })

        ZhlField({
          fieldPlaceholder: '密码',
          fieldValue: this.password,
          fieldSecret: true,
          onFieldChange: (value: string) => {
            this.password = value;
          },
        })

        if (this.errText.length > 0) {
          Text(this.errText)
            .fontSize(13)
            .fontColor(ZHL_DOWN)
            .width('100%')
            .textAlign(TextAlign.Start)
        }

        ZhlPrimaryButton({
          btnLabel: '登录',
          btnBusyLabel: '登录中…',
          btnBusy: this.busy,
          btnEnabled: this.canSubmit(),
          tapAction: () => {
            this.doLogin();
          },
        })

        Row({ space: 4 }) {
          Text('还没有账号？')
            .fontSize(12)
            .fontColor(ZHL_FAINT)
          Text('去注册')
            .fontSize(12)
            .fontColor(ZHL_ACCENT)
            .onClick(() => {
              this.onOpenRegister();
            })
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)

        Column({ space: 8 }) {
          Row({ space: 4 }) {
            Text(this.serverToggleText())
              .fontSize(12)
              .fontColor(ZHL_FAINT)
            SymbolGlyph($r('sys.symbol.chevron_down'))
              .fontSize(12)
              .fontColor([ZHL_FAINT])
          }
          .justifyContent(FlexAlign.Center)
          .onClick(() => {
            this.showServer = !this.showServer;
          })

          if (this.showServer) {
            ZhlField({
              fieldPlaceholder: '服务器地址',
              fieldValue: this.serverUrl,
              onFieldChange: (value: string) => {
                this.serverUrl = value;
              },
            })
          }
        }
        .width('100%')
        .alignItems(HorizontalAlign.Center)
      }
      .width('100%')
      .alignItems(HorizontalAlign.Center)
      .padding(20)
      .backgroundColor(ZHL_PANEL)
      .border({ width: 1, color: ZHL_LINE })
      .borderRadius(ZHL_RADIUS_CARD)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 16, right: 16 })
    .justifyContent(FlexAlign.Center)
    .backgroundColor(ZHL_BG)
    .opacity(this.enteredOpacity())
    .translate({ y: this.enteredOffset() })
    .animation({ duration: ZHL_MS_ITEM, curve: Curve.FastOutSlowIn })
  }
}