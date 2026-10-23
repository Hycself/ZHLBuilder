import { ZHL_ACCENT, ZHL_DOWN, ZHL_LINE, ZHL_PANEL, ZHL_TEXT, zhlAlpha } from '../common/Theme';

/**
 * 6 格分离式 PIN 输入（规格 §五）：
 *  - 聚焦格品牌青描边并轻微放大
 *  - 校验失败横向抖动一次并整组转红（由父组件置 pinError / pinShakeSignal）
 *  - 成功后 6 格的点依次点亮（父组件置 pinSuccess）
 * 布局上是一层透明 TextInput 覆盖在 6 个格子之上：点击任意位置即聚焦并弹数字键盘，
 * 格子本身只做展示。
 */

function zhlDigitsOnly(raw: string, maxLen: number): string {
  let out: string = '';
  for (let i = 0; i < raw.length; i++) {
    const ch: string = raw.charAt(i);
    if (ch >= '0' && ch <= '9' && out.length < maxLen) {
      out += ch;
    }
  }
  return out;
}

@Component
export struct ZhlPinInput {
  @Prop pinLength: number = 6;
  @Prop pinError: boolean = false;
  @Prop @Watch('onShakeSignalChanged') pinShakeSignal: boolean = false;
  @Prop @Watch('onSuccessSignalChanged') pinSuccess: boolean = false;
  @Link pinValue: string;
  @State pinFocused: boolean = false;
  @State shakeOffset: number = 0;
  @State litCount: number = 0;
  onPinChange: (value: string) => void = () => {
  };

  onShakeSignalChanged(): void {
    if (!this.pinShakeSignal) {
      return;
    }
    // 横向抖动一次：四个小步，总时长 < 300ms
    this.getUIContext().animateTo({ duration: 60, curve: Curve.Linear }, () => {
      this.shakeOffset = -8;
    });
    setTimeout(() => {
      this.getUIContext().animateTo({ duration: 60, curve: Curve.Linear }, () => {
        this.shakeOffset = 8;
      });
    }, 70);
    setTimeout(() => {
      this.getUIContext().animateTo({ duration: 60, curve: Curve.Linear }, () => {
        this.shakeOffset = -5;
      });
    }, 140);
    setTimeout(() => {
      this.getUIContext().animateTo({ duration: 60, curve: Curve.Linear }, () => {
        this.shakeOffset = 0;
      });
    }, 210);
  }

  onSuccessSignalChanged(): void {
    if (!this.pinSuccess) {
      this.litCount = 0;
      return;
    }
    // 6 格的点依次点亮，间隔 45ms
    for (let i = 0; i < this.pinLength; i++) {
      const step: number = i + 1;
      setTimeout(() => {
        this.litCount = step;
      }, i * 45);
    }
  }

  boxIndexes(): Array<number> {
    const list: Array<number> = [];
    for (let i = 0; i < this.pinLength; i++) {
      list.push(i);
    }
    return list;
  }

  activeIndex(): number {
    if (this.pinValue.length >= this.pinLength) {
      return this.pinLength - 1;
    }
    return this.pinValue.length;
  }

  boxBorderColor(idx: number): string {
    if (this.pinError) {
      return zhlAlpha(ZHL_DOWN, 0.85);
    }
    if (idx === this.activeIndex() && this.pinFocused) {
      return ZHL_ACCENT;
    }
    if (idx < this.pinValue.length) {
      return zhlAlpha(ZHL_ACCENT, 0.45);
    }
    return ZHL_LINE;
  }

  boxScale(idx: number): number {
    if (idx === this.activeIndex() && this.pinFocused) {
      return 1.06;
    }
    return 1;
  }

  dotColor(idx: number): string {
    if (this.pinError) {
      return ZHL_DOWN;
    }
    if (idx < this.litCount) {
      return ZHL_ACCENT;
    }
    if (idx < this.pinValue.length) {
      return ZHL_TEXT;
    }
    return zhlAlpha(ZHL_TEXT, 0.0);
  }

  build() {
    Stack() {
      Row({ space: 10 }) {
        ForEach(this.boxIndexes(), (boxIndex: number) => {
          Column() {
            Circle({ width: 9, height: 9 })
              .fill(this.dotColor(boxIndex))
          }
          .justifyContent(FlexAlign.Center)
          .layoutWeight(1)
          .height(56)
          .backgroundColor(ZHL_PANEL)
          .border({ width: 1, color: this.boxBorderColor(boxIndex) })
          .borderRadius(12)
          .scale({ x: this.boxScale(boxIndex), y: this.boxScale(boxIndex) })
          .animation({ duration: 140, curve: Curve.FastOutSlowIn })
        }, (boxIndex: number) => `pin_box_${boxIndex}`)
      }
      .width('100%')

      TextInput({ text: this.pinValue })
        .type(InputType.NUMBER_PASSWORD)
        .maxLength(this.pinLength)
        .opacity(0)
        .width('100%')
        .height(56)
        .onChange((value: string) => {
          const digits: string = zhlDigitsOnly(value, this.pinLength);
          this.pinValue = digits;
          this.onPinChange(digits);
        })
        .onFocus(() => {
          this.pinFocused = true;
        })
        .onBlur(() => {
          this.pinFocused = false;
        })
    }
    .width('100%')
    .translate({ x: this.shakeOffset })
  }
}