/**
 * ZHLBuilder 鸿蒙端唯一视觉常量表。
 *
 * 与《鸿蒙客户端-DevEcoCode-提示词-v3.txt》第一节（颜色与尺度）一一对应。
 * 页面与组件一律从这里取色取值，禁止在页面里自创颜色或间距。
 */

// ===== 颜色（规格第一节，唯一权威）=====
/** 页面底色 */
export const ZHL_BG: string = '#05090F';
/** 卡片/面板底色 */
export const ZHL_PANEL: string = '#0C1420';
/** 描边 */
export const ZHL_LINE: string = '#1B2839';
/** 主文字 */
export const ZHL_TEXT: string = '#E6EDF6';
/** 次级文字 */
export const ZHL_DIM: string = '#8CA0B8';
/** 弱文字/说明 */
export const ZHL_FAINT: string = '#5A6E86';
/** 品牌青：主按钮、选中态、强调、重点卡描边 */
export const ZHL_ACCENT: string = '#22D3EE';
/** 主按钮文字色 */
export const ZHL_ON_ACCENT: string = '#06222B';
/** 成功/在线 */
export const ZHL_OK: string = '#34D399';
/** 警告（排队） */
export const ZHL_WARN: string = '#FBBF24';
/** 失败/错误 */
export const ZHL_DOWN: string = '#F87171';
/** 任务输出页底色（比页面再深一档） */
export const ZHL_CONSOLE_BG: string = '#0A121C';
/** 骨架条的两端色（规格：设备页 2~3 条骨架条） */
export const ZHL_SKELETON_A: string = '#0C1420';
export const ZHL_SKELETON_B: string = '#12202E';
/** 控制台正文行（设备详情内嵌输出与任务输出页共用） */
export const ZHL_CONSOLE_TEXT: string = '#9FB6CE';

// ===== 尺度 =====
/** 卡片圆角 14 */
export const ZHL_RADIUS_CARD: number = 14;
/** 小圆角（图标容器、按钮） */
export const ZHL_RADIUS_CHIP: number = 999;
export const ZHL_RADIUS_BTN: number = 12;
export const ZHL_RADIUS_ICON: number = 10;
/** 卡片内边距 16（规格禁止小于 16） */
export const ZHL_CARD_PAD: number = 16;
/** 卡片间距 12（规格禁止小于 12） */
export const ZHL_CARD_GAP: number = 12;
/** 通栏按钮高度 */
export const ZHL_BTN_H: number = 44;
/** 描边宽度 */
export const ZHL_BORDER_W: number = 1;
/** 40x40 图标容器 */
export const ZHL_ICON_BOX: number = 40;
/** 页面左右边距 */
export const ZHL_PAGE_PAD: number = 16;

// ===== 动效（规格第五节）=====
/** 页面切换平移淡入 240~320ms，取中点 */
export const ZHL_MS_PAGE: number = 280;
/** 列表项入场 */
export const ZHL_MS_ITEM: number = 220;
/** 列表首次加载错峰，每项 30~40ms */
export const ZHL_MS_STAGGER: number = 35;
/** 错峰上限，保证总时长压在 400ms 内 */
export const ZHL_STAGGER_MAX: number = 10;
/** 控制台新行淡入，单行不超过 120ms */
export const ZHL_MS_LINE: number = 120;
/** 在线圆点呼吸，周期不短于 2.4s */
export const ZHL_MS_BREATH: number = 2400;
/** 重点卡脉冲光带来回一趟 */
export const ZHL_MS_PULSE: number = 1500;

/**
 * 把 6 位十六进制色转成带透明度的 rgba()。
 * 规格里的描边/底色用了 rgba(34,211,238,0.30) 这类写法，统一由这里生成。
 */
export function zhlAlpha(hex: string, alpha: number): string {
  const r: number = Number.parseInt(hex.substring(1, 3), 16);
  const g: number = Number.parseInt(hex.substring(3, 5), 16);
  const b: number = Number.parseInt(hex.substring(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}