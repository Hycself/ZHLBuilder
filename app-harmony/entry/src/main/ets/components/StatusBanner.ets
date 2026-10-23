import { ZHL_OK, zhlAlpha } from '../common/Theme';

/**
 * 统一状态横幅——全应用唯一一种状态呈现方式（规格 §二 末，禁止另造）。
 *
 * 一律"描边 + 10% 同色底 + 同色文字"三段式：
 *   在线 / 任务完成 → #34D399
 *   进行中           → #22D3EE
 *   失败             → #F87171
 *   排队             → #FBBF24
 * 不许把「在线」「已绑定」「失败」降级成一行普通小字。
 */
@Component
export struct ZhlStatusBanner {
  @Prop bannerColor: string = ZHL_OK;
  @Prop bannerText: string = '';

  build() {
    Row() {
      Text(this.bannerText)
        .fontSize(14)
        .fontColor(this.bannerColor)
        .lineHeight(21)
        .layoutWeight(1)
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
    .backgroundColor(zhlAlpha(this.bannerColor, 0.10))
    .border({ width: 1, color: zhlAlpha(this.bannerColor, 0.40) })
    .borderRadius(10)
  }
}