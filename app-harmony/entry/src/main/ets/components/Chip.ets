import { ZHL_FAINT, ZHL_LINE, ZHL_RADIUS_CHIP } from '../common/Theme';

/**
 * 描边胶囊 chip。
 *  - 设备卡的平台 / agent 版本：弱文字色描边胶囊（11 号）
 *  - 面板 Bot 卡的适用范围（中国 / 全球）：同上
 *  - 任务状态 chip：用统一状态横幅的同色，底色取同色 10%
 */
@Component
export struct ZhlChip {
  @Prop chipLabel: string = '';
  @Prop chipColor: string = ZHL_FAINT;
  @Prop chipBorder: string = ZHL_LINE;
  @Prop chipFill: string = 'rgba(0,0,0,0)';
  @Prop chipFontSize: number = 11;

  build() {
    Text(this.chipLabel)
      .fontSize(this.chipFontSize)
      .fontColor(this.chipColor)
      .padding({ left: 8, right: 8, top: 3, bottom: 3 })
      .backgroundColor(this.chipFill)
      .border({ width: 1, color: this.chipBorder })
      .borderRadius(ZHL_RADIUS_CHIP)
  }
}