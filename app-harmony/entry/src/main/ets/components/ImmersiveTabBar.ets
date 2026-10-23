import { ZHL_ACCENT, ZHL_BG, ZHL_FAINT, zhlAlpha } from '../common/Theme';

/**
 * 沉浸式底部导航栏（规格 §四：设备 / 任务 / 我的）。
 *
 * 为什么是三档降级链（这段说明必须保留）：
 *  1) 规格首选 uiMaterial.ImmersiveMaterial 的 ULTRA_THIN 档。该 API 自 HarmonyOS
 *     26.0.0（API 26）才提供（@ohos.arkui.uiMaterial / .systemMaterial()）。本工程交付
 *     目标的 SDK 是 6.1.1(24)、本机验证用的是 5.1.0(18)，两者都没有这个声明——
 *     写了就编不过。因此第 1 档以注释形式留在这里，工程升级到 26.0.0 后取消注释即生效：
 *
 *         import { uiMaterial } from '@kit.ArkUI';
 *         tabsBar.systemMaterial(new uiMaterial.ImmersiveMaterial({
 *           style: uiMaterial.ImmersiveStyle.ULTRA_THIN,
 *         }));
 *
 *  2) 该材质不可用 → backgroundBlurStyle(COMPONENT_THICK) + 半透明品牌底
 *  3) 仍不可用   → 纯色底 + 顶部 1vp 品牌青高光描边
 *
 * ArkUI 里 Tabs 的栏背景属性只能挂在 Tabs 自身，所以档位取值由本文件给出、
 * 由 Index 在 Tabs 上贴上去（见 zhlTabBarTier / zhlTabBarBlurStyle / zhlTabBarSolid /
 * zhlTabBarHighlight）。
 */

/** 当前生效档位：2（第 1 档需要 HarmonyOS 26+，见文件头） */
export const ZHL_TAB_BAR_TIER: number = 2;
export const ZHL_TAB_BAR_HEIGHT: number = 64;

export function zhlTabBarBlurStyle(): BlurStyle {
  return BlurStyle.COMPONENT_THICK;
}

/** 半透明品牌底（比页面底色略透） */
export function zhlTabBarSolid(): string {
  return zhlAlpha(ZHL_BG, 0.86);
}

/** 第 3 档的顶部 1vp 品牌青高光 */
export function zhlTabBarHighlight(): string {
  return zhlAlpha(ZHL_ACCENT, 0.55);
}

/** 三个入口的图标与文案（图标全部是 sys.symbol，禁止 emoji / 文字字母当图标） */
export interface ZhlTabSpec {
  tabIndex: number;
  tabLabel: string;
  tabIcon: Resource;
}

export function zhlTabSpecs(): Array<ZhlTabSpec> {
  const list: Array<ZhlTabSpec> = [];
  const devices: ZhlTabSpec = { tabIndex: 0, tabLabel: '设备', tabIcon: $r('sys.symbol.computer') };
  const tasks: ZhlTabSpec = { tabIndex: 1, tabLabel: '任务', tabIcon: $r('sys.symbol.list_bullet') };
  const profile: ZhlTabSpec = { tabIndex: 2, tabLabel: '我的', tabIcon: $r('sys.symbol.person_fill') };
  list.push(devices);
  list.push(tasks);
  list.push(profile);
  return list;
}

/**
 * 底栏里的单个入口：选中项图标与文字同时变品牌青，未选中 #5A6E86。
 */
@Component
export struct ZhlTabBarItem {
  @Prop itemLabel: string = '';
  @Prop itemSelected: boolean = false;
  itemIcon: Resource = $r('sys.symbol.house');

  itemColor(): string {
    if (this.itemSelected) {
      return ZHL_ACCENT;
    }
    return ZHL_FAINT;
  }

  build() {
    Column({ space: 4 }) {
      SymbolGlyph(this.itemIcon)
        .fontSize(22)
        .fontColor([this.itemColor()])
      Text(this.itemLabel)
        .fontSize(11)
        .fontColor(this.itemColor())
    }
    .width('100%')
    .height(ZHL_TAB_BAR_HEIGHT - 8)
    .justifyContent(FlexAlign.Center)
  }
}