import { ZhlTask } from '../model/Types';
import { zhlParseTime, zhlRelativeTime, zhlTaskStatusColor, zhlTaskStatusText } from '../common/Format';
import { ZHL_DIM, ZHL_DOWN, ZHL_FAINT, zhlAlpha } from '../common/Theme';
import { ZhlChip } from './Chip';

/**
 * 任务行（设备页内嵌最近 6 条 / 设备详情任务历史 / 任务 Tab 共用）：
 * 状态 chip（统一状态横幅配色的小号胶囊）+ prompt 单行省略
 * + 失败时右侧红色 exitNote + 最右弱文字相对时间。
 */
@Component
export struct ZhlTaskRow {
  @Prop taskIndex: number = 0;
  @Prop taskInfo: ZhlTask = {};
  @Prop showDevice: boolean = false;
  @Prop deviceName: string = '';
  onOpenTask: () => void = () => {
  };

  statusColor(): string {
    return zhlTaskStatusColor(this.taskInfo.status ?? 0);
  }

  statusText(): string {
    return zhlTaskStatusText(this.taskInfo.status ?? 0);
  }

  promptText(): string {
    return this.taskInfo.prompt ?? '';
  }

  relativeText(): string {
    const finished: number = zhlParseTime(this.taskInfo.finishedAt);
    if (finished > 0) {
      return zhlRelativeTime(finished);
    }
    return zhlRelativeTime(zhlParseTime(this.taskInfo.createdAt));
  }

  /** 失败（status=3）时右侧显示后端原文 exitNote，成功/运行中不显示 */
  failNote(): string {
    const status: number = this.taskInfo.status ?? 0;
    if (status !== 3) {
      return '';
    }
    return this.taskInfo.exitNote ?? '';
  }

  deviceChipText(): string {
    if (this.showDevice && this.deviceName.length > 0) {
      return this.deviceName;
    }
    return '';
  }

  build() {
    Row({ space: 8 }) {
      if (this.deviceChipText().length > 0) {
        ZhlChip({ chipLabel: this.deviceChipText(), chipColor: ZHL_DIM })
      }
      ZhlChip({
        chipLabel: this.statusText(),
        chipColor: this.statusColor(),
        chipBorder: zhlAlpha(this.statusColor(), 0.40),
        chipFill: zhlAlpha(this.statusColor(), 0.10),
      })
      Text(this.promptText())
        .fontSize(13)
        .fontColor(ZHL_DIM)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .layoutWeight(1)
      if (this.failNote().length > 0) {
        Text(this.failNote())
          .fontSize(12)
          .fontColor(ZHL_DOWN)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .constraintSize({ maxWidth: 104 })
      }
      Text(this.relativeText())
        .fontSize(12)
        .fontColor(ZHL_FAINT)
    }
    .width('100%')
    .alignItems(VerticalAlign.Center)
    .padding({ top: 6, bottom: 6 })
    .onClick(() => {
      this.onOpenTask();
    })
  }
}