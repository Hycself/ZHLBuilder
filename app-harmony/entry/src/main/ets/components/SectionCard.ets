import { ZHL_ACCENT, ZHL_DIM, ZHL_FAINT, ZHL_LINE, ZHL_PANEL, ZHL_RADIUS_CARD, ZHL_TEXT, zhlAlpha } from '../common/Theme';

/**
 * 小节卡：线性图标 + 标题 +（可选）说明 + 内容槽。
 *  - 普通小节：底色 #0C1420、描边 #1B2839
 *  - 重点卡（面板第三段 / 设备详情顶部卡）：品牌青 30% 描边 + 半透明底色
 * 内容用尾随 lambda 传入（单个 @BuilderParam）。
 */
@Component
export struct ZhlSectionCard {
  @Prop sectionTitle: string = '';
  @Prop sectionDesc: string = '';
  @Prop sectionAccent: boolean = false;
  sectionIcon: Resource = $r('sys.symbol.robot');
  @BuilderParam sectionContent: () => void = this.emptyContent;

  @Builder
  emptyContent() {
    Column() {
    }
  }

  iconColor(): string {
    if (this.sectionAccent) {
      return ZHL_ACCENT;
    }
    return ZHL_FAINT;
  }

  cardBorderColor(): string {
    if (this.sectionAccent) {
      return zhlAlpha(ZHL_ACCENT, 0.30);
    }
    return ZHL_LINE;
  }

  cardBackgroundColor(): string {
    if (this.sectionAccent) {
      return zhlAlpha(ZHL_PANEL, 0.60);
    }
    return ZHL_PANEL;
  }

  build() {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        SymbolGlyph(this.sectionIcon)
          .fontSize(16)
          .fontColor([this.iconColor()])
          .margin({ top: 2 })
        Column({ space: 4 }) {
          Text(this.sectionTitle)
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(ZHL_TEXT)
          if (this.sectionDesc.length > 0) {
            Text(this.sectionDesc)
              .fontSize(13)
              .fontColor(ZHL_DIM)
              .lineHeight(21)
          }
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
      }
      .width('100%')
      .alignItems(VerticalAlign.Top)

      this.sectionContent()
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(16)
    .backgroundColor(this.cardBackgroundColor())
    .border({ width: 1, color: this.cardBorderColor() })
    .borderRadius(ZHL_RADIUS_CARD)
  }
}