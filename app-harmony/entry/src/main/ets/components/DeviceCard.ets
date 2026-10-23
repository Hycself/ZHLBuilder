import { ZhlDevice, ZhlTask } from '../model/Types';
import { zhlParseTime, zhlPlatformText, zhlRelativeTime } from '../common/Format';
import {
  ZHL_FAINT, ZHL_MS_BREATH, ZHL_MS_ITEM, ZHL_MS_STAGGER, ZHL_OK, ZHL_PANEL, ZHL_RADIUS_CARD,
  ZHL_STAGGER_MAX, ZHL_TEXT, ZHL_LINE, ZHL_CARD_PAD, ZHL_CARD_GAP,
} from '../common/Theme';
import { ZhlChip } from './Chip';
import { ZhlTaskRow } from './TaskRow';

/**
 * 设备卡（设备页）：
 * 在线圆点 + 设备名（15 中等字重）+ 平台 chip + agent 版本 chip，
 * 右侧靠边「在线」或「最后在线 N 分钟前」弱文字；卡片下方内嵌该设备最近 6 条任务。
 * 在线圆点缓慢呼吸（周期 2.4s），只在在线时呼吸。
 * 首次加载错峰入场：每项延迟 35ms，上限 10 项（总时长压 400ms 内）。
 */
@Component
export struct ZhlDeviceCard {
  @Prop cardIndex: number = 0;
  @Prop device: ZhlDevice = {};
  @Prop deviceTasks: Array<ZhlTask> = [];
  onOpenDevice: () => void = () => {
  };
  onOpenTask: (taskId: number) => void = () => {
  };
  @State entered: boolean = false;
  @State breathOn: boolean = false;

  aboutToAppear(): void {
    const delay: number = Math.min(this.cardIndex, ZHL_STAGGER_MAX) * ZHL_MS_STAGGER;
    setTimeout(() => {
      this.entered = true;
    }, delay);
    if (this.deviceOnline()) {
      setTimeout(() => {
        this.breathOn = true;
      }, delay + 20);
    }
  }

  delayMs(): number {
    return Math.min(this.cardIndex, ZHL_STAGGER_MAX) * ZHL_MS_STAGGER;
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
    return 8;
  }

  deviceOnline(): boolean {
    return this.device.online ?? false;
  }

  deviceName(): string {
    const name: string = this.device.name ?? '';
    if (name.length === 0) {
      return '未命名设备';
    }
    return name;
  }

  platformLabel(): string {
    return zhlPlatformText(this.device.platform ?? '');
  }

  agentLabel(): string {
    const version: string = this.device.agentVersion ?? '';
    if (version.length === 0) {
      return '';
    }
    return `v${version}`;
  }

  dotColor(): string {
    if (this.deviceOnline()) {
      return ZHL_OK;
    }
    return ZHL_FAINT;
  }

  dotOpacity(): number {
    if (!this.deviceOnline()) {
      return 1;
    }
    if (this.breathOn) {
      return 1;
    }
    return 0.35;
  }

  /** 右侧弱文字：在线 / 最后在线 N 分钟前 */
  rightText(): string {
    if (this.deviceOnline()) {
      return '在线';
    }
    const seen: number = zhlParseTime(this.device.lastSeen);
    const rel: string = zhlRelativeTime(seen);
    if (rel.length === 0) {
      return '离线';
    }
    return `最后在线 ${rel}`;
  }

  build() {
    Column({ space: ZHL_CARD_GAP }) {
      Row({ space: 8 }) {
        Circle({ width: 9, height: 9 })
          .fill(this.dotColor())
          .opacity(this.dotOpacity())
          .animation({
            duration: ZHL_MS_BREATH / 2,
            curve: Curve.EaseInOut,
            iterations: -1,
            playMode: PlayMode.Alternate,
          })
        Text(this.deviceName())
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(ZHL_TEXT)
        if (this.platformLabel().length > 0) {
          ZhlChip({ chipLabel: this.platformLabel() })
        }
        if (this.agentLabel().length > 0) {
          ZhlChip({ chipLabel: this.agentLabel() })
        }
        Blank()
        Text(this.rightText())
          .fontSize(12)
          .fontColor(ZHL_FAINT)
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)

      if (this.deviceTasks.length > 0) {
        Column() {
          ForEach(this.deviceTasks, (taskItem: ZhlTask) => {
            ZhlTaskRow({
              taskInfo: taskItem,
              onOpenTask: () => {
                this.onOpenTask(taskItem.id ?? 0);
              },
            })
          }, (taskItem: ZhlTask) => `device_task_${taskItem.id ?? 0}`)
        }
        .width('100%')
        .padding({ top: 4 })
        .border({ width: { top: 1 }, color: ZHL_LINE })
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(ZHL_CARD_PAD)
    .backgroundColor(ZHL_PANEL)
    .border({ width: 1, color: ZHL_LINE })
    .borderRadius(ZHL_RADIUS_CARD)
    .opacity(this.enteredOpacity())
    .translate({ y: this.enteredOffset() })
    .animation({ duration: ZHL_MS_ITEM, curve: Curve.FastOutSlowIn, delay: this.delayMs() })
    .onClick(() => {
      this.onOpenDevice();
    })
  }
}