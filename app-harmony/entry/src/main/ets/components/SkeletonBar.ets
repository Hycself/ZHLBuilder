import { ZHL_SKELETON_A, ZHL_SKELETON_B } from '../common/Theme';

/**
 * 骨架条（设备页加载态：2~3 条，禁止用占满屏的转圈）。
 * 底色在 #0C1420 与 #12202E 之间做横向微光。
 */
@Component
export struct ZhlSkeletonBar {
  @Prop barWidth: string = '100%';
  @Prop barHeight: number = 14;
  @State shimmerOn: boolean = false;

  aboutToAppear(): void {
    // 只能放状态变更，不在 aboutToAppear 里直接调动画
    setTimeout(() => {
      this.shimmerOn = true;
    }, 20);
  }

  barOpacity(): number {
    if (this.shimmerOn) {
      return 1;
    }
    return 0.55;
  }

  build() {
    Row()
      .width(this.barWidth)
      .height(this.barHeight)
      .borderRadius(this.barHeight / 2)
      .linearGradient({
        angle: 90,
        colors: [[ZHL_SKELETON_A, 0.0], [ZHL_SKELETON_B, 0.5], [ZHL_SKELETON_A, 1.0]],
      })
      .opacity(this.barOpacity())
      .animation({
        duration: 1000,
        curve: Curve.EaseInOut,
        iterations: -1,
        playMode: PlayMode.Alternate,
      })
  }
}