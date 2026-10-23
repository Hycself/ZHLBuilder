import { ZHL_ACCENT, ZHL_FAINT, ZHL_LINE, ZHL_PANEL, ZHL_RADIUS_BTN, ZHL_TEXT, zhlAlpha } from '../common/Theme';

/**
 * 输入框（登录 / 注册 / 服务器设置 / 设备详情任务输入共用一套样式）：
 * 底色 #0C1420、描边 #1B2839；聚焦时描边变品牌青，并加 3 宽品牌青 14% 外发光。
 */

function zhlFieldBorder(focused: boolean, enabled: boolean): string {
  if (!enabled) {
    return ZHL_LINE;
  }
  if (focused) {
    return ZHL_ACCENT;
  }
  return ZHL_LINE;
}

function zhlFieldGlow(focused: boolean): ShadowOptions {
  if (focused) {
    const glow: ShadowOptions = {
      radius: 3,
      color: zhlAlpha(ZHL_ACCENT, 0.14),
      offsetX: 0,
      offsetY: 0,
    };
    return glow;
  }
  const none: ShadowOptions = {
    radius: 0,
    color: zhlAlpha(ZHL_ACCENT, 0.0),
    offsetX: 0,
    offsetY: 0,
  };
  return none;
}

@Component
export struct ZhlField {
  @Prop fieldPlaceholder: string = '';
  @Prop fieldValue: string = '';
  @Prop fieldSecret: boolean = false;
  /** >0 时限制长度（PIN、验证码、呼号等）；0 表示不限（按 256 兜底，防止异常超长输入） */
  @Prop fieldMaxLength: number = 0;
  @Prop fieldEnabled: boolean = true;
  @Prop fieldHeight: number = 46;
  @State fieldFocused: boolean = false;
  onFieldChange: (value: string) => void = () => {
  };

  fieldType(): InputType {
    if (this.fieldSecret) {
      return InputType.Password;
    }
    return InputType.Normal;
  }

  fieldMax(): number {
    if (this.fieldMaxLength > 0) {
      return this.fieldMaxLength;
    }
    return 256;
  }

  build() {
    TextInput({ placeholder: this.fieldPlaceholder, text: this.fieldValue })
      .type(this.fieldType())
      .maxLength(this.fieldMax())
      .placeholderColor(ZHL_FAINT)
      .placeholderFont({ size: 14 })
      .fontColor(ZHL_TEXT)
      .fontSize(15)
      .caretColor(ZHL_ACCENT)
      .backgroundColor(ZHL_PANEL)
      .borderRadius(ZHL_RADIUS_BTN)
      .borderWidth(1)
      .borderColor(zhlFieldBorder(this.fieldFocused, this.fieldEnabled))
      .shadow(zhlFieldGlow(this.fieldFocused))
      .padding({ left: 12, right: 12 })
      .height(this.fieldHeight)
      .width('100%')
      .enabled(this.fieldEnabled)
      .onChange((value: string) => {
        this.onFieldChange(value);
      })
      .onFocus(() => {
        this.fieldFocused = true;
      })
      .onBlur(() => {
        this.fieldFocused = false;
      })
  }
}