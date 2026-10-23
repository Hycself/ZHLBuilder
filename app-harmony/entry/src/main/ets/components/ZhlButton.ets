import { ZHL_ACCENT, ZHL_BTN_H, ZHL_DOWN, ZHL_LINE, ZHL_ON_ACCENT, ZHL_RADIUS_BTN, ZHL_TEXT, zhlAlpha } from '../common/Theme';

/**
 * 三种按钮，规格 §六 明令必须可辨：
 *  - 主按钮：实心品牌青（文字 #06222B）
 *  - 次按钮：描边（禁止实心）
 *  - 危险按钮：描边红
 * 请求中：按钮禁用、半透明、文案换成给定的进行中文案。
 */

function zhlButtonOpacity(busy: boolean, enabled: boolean): number {
  if (busy || !enabled) {
    return 0.5;
  }
  return 1;
}

function zhlBusyLabel(label: string, busyLabel: string, busy: boolean): string {
  if (busy && busyLabel.length > 0) {
    return busyLabel;
  }
  return label;
}

@Component
export struct ZhlPrimaryButton {
  @Prop btnLabel: string = '';
  @Prop btnBusyLabel: string = '';
  @Prop btnBusy: boolean = false;
  @Prop btnEnabled: boolean = true;
  @Prop hasIcon: boolean = false;
  iconRes: Resource = $r('sys.symbol.plus');
  tapAction: () => void = () => {
  };

  build() {
    Button() {
      Row({ space: 8 }) {
        if (this.hasIcon) {
          SymbolGlyph(this.iconRes)
            .fontSize(18)
            .fontColor([ZHL_ON_ACCENT])
        }
        Text(zhlBusyLabel(this.btnLabel, this.btnBusyLabel, this.btnBusy))
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(ZHL_ON_ACCENT)
      }
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height(ZHL_BTN_H)
    .backgroundColor(ZHL_ACCENT)
    .borderRadius(ZHL_RADIUS_BTN)
    .stateEffect(true)
    .opacity(zhlButtonOpacity(this.btnBusy, this.btnEnabled))
    .enabled(this.btnEnabled && !this.btnBusy)
    .onClick(() => {
      this.tapAction();
    })
  }
}

@Component
export struct ZhlOutlineButton {
  @Prop btnLabel: string = '';
  @Prop btnBusyLabel: string = '';
  @Prop btnBusy: boolean = false;
  @Prop btnEnabled: boolean = true;
  @Prop hasIcon: boolean = false;
  @Prop btnColor: string = ZHL_TEXT;
  iconRes: Resource = $r('sys.symbol.plus');
  tapAction: () => void = () => {
  };

  build() {
    Button() {
      Row({ space: 8 }) {
        if (this.hasIcon) {
          SymbolGlyph(this.iconRes)
            .fontSize(18)
            .fontColor([this.btnColor])
        }
        Text(zhlBusyLabel(this.btnLabel, this.btnBusyLabel, this.btnBusy))
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.btnColor)
      }
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height(ZHL_BTN_H)
    .backgroundColor(Color.Transparent)
    .border({ width: 1, color: ZHL_LINE })
    .borderRadius(ZHL_RADIUS_BTN)
    .stateEffect(true)
    .opacity(zhlButtonOpacity(this.btnBusy, this.btnEnabled))
    .enabled(this.btnEnabled && !this.btnBusy)
    .onClick(() => {
      this.tapAction();
    })
  }
}

/** 危险按钮：描边红（解绑设备、停止任务这类不可逆动作） */
@Component
export struct ZhlDangerButton {
  @Prop btnLabel: string = '';
  @Prop btnEnabled: boolean = true;
  @Prop hasIcon: boolean = false;
  iconRes: Resource = $r('sys.symbol.trash');
  tapAction: () => void = () => {
  };

  build() {
    Button() {
      Row({ space: 8 }) {
        if (this.hasIcon) {
          SymbolGlyph(this.iconRes)
            .fontSize(18)
            .fontColor([ZHL_DOWN])
        }
        Text(this.btnLabel)
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(ZHL_DOWN)
      }
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height(ZHL_BTN_H)
    .backgroundColor(zhlAlpha(ZHL_DOWN, 0.08))
    .border({ width: 1, color: zhlAlpha(ZHL_DOWN, 0.50) })
    .borderRadius(ZHL_RADIUS_BTN)
    .stateEffect(true)
    .opacity(zhlButtonOpacity(false, this.btnEnabled))
    .enabled(this.btnEnabled)
    .onClick(() => {
      this.tapAction();
    })
  }
}