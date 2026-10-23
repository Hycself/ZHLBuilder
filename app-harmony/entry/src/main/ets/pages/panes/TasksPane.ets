import { zhlDeviceList } from '../../service/DeviceService';
import { zhlErrorText } from '../../service/Http';
import { zhlGetPinSession } from '../../service/SessionStore';
import { zhlTaskList } from '../../service/TaskService';
import { ZhlDevice, ZhlTask } from '../../model/Types';
import {
  ZHL_ACCENT,
  ZHL_BG,
  ZHL_CARD_GAP,
  ZHL_CARD_PAD,
  ZHL_DIM,
  ZHL_DOWN,
  ZHL_LINE,
  ZHL_PANEL,
  ZHL_RADIUS_CARD,
  ZHL_RADIUS_CHIP,
  ZHL_TEXT,
  zhlAlpha,
} from '../../common/Theme';
import { ZhlPrimaryButton } from '../../components/ZhlButton';
import { ZhlSkeletonBar } from '../../components/SkeletonBar';
import { ZhlTaskRow } from '../../components/TaskRow';

/**
 * 任务入口（底部导航第 2 个 Tab）。
 * 顶部选设备（胶囊 + 下拉），下方是该设备的任务列表，点任一行进任务输出页。
 * 设备没有有效 PIN 会话时先引导去输入 PIN（/tasks 强制 X-Builder-Session）。
 */
@Component
export struct ZhlTasksPane {
  onOpenTask: (deviceId: number, deviceName: string, taskId: number) => void = () => {
  };
  onUnlock: (deviceId: number, deviceName: string) => void = () => {
  };
  @State paneDevices: Array<ZhlDevice> = [];
  @State paneDeviceId: number = 0;
  @State paneDeviceName: string = '';
  @State paneRows: Array<ZhlTask> = [];
  @State paneSession: string = '';
  @State paneLoading: boolean = true;
  @State paneErr: string = '';
  private alive: boolean = true;

  aboutToAppear(): void {
    this.refresh();
  }

  aboutToDisappear(): void {
    this.alive = false;
  }

  refresh(): void {
    if (!this.alive) {
      return;
    }
    zhlDeviceList()
      .then((list: Array<ZhlDevice>) => {
        this.paneDevices = list;
        this.paneErr = '';
        if (list.length === 0) {
          this.paneLoading = false;
          this.scheduleNext();
          return;
        }
        const stored: number = AppStorage.get<number>('zhlSelectedDeviceId') ?? 0;
        let target: ZhlDevice = list[0];
        for (let i = 0; i < list.length; i++) {
          if ((list[i].id ?? 0) === stored) {
            target = list[i];
          }
        }
        this.paneDeviceId = target.id ?? 0;
        this.paneDeviceName = target.name ?? '';
        this.loadTasksFor(this.paneDeviceId);
      })
      .catch((e: Object) => {
        this.paneLoading = false;
        this.paneErr = zhlErrorText(e);
        this.scheduleNext();
      });
  }

  loadTasksFor(deviceId: number): void {
    zhlGetPinSession(deviceId).then((session: string) => {
      this.paneSession = session;
      if (session.length === 0) {
        this.paneRows = [];
        this.paneLoading = false;
        this.scheduleNext();
        return;
      }
      zhlTaskList(deviceId, session, 20)
        .then((rows: Array<ZhlTask>) => {
          this.paneRows = rows;
          this.paneLoading = false;
          this.scheduleNext();
        })
        .catch((e: Object) => {
          this.paneRows = [];
          this.paneLoading = false;
          this.paneErr = zhlErrorText(e);
          this.scheduleNext();
        });
    });
  }

  scheduleNext(): void {
    if (!this.alive) {
      return;
    }
    setTimeout(() => {
      this.refresh();
    }, 8000);
  }

  deviceMenu(): Array<MenuElement> {
    const items: Array<MenuElement> = [];
    for (let i = 0; i < this.paneDevices.length; i++) {
      const device: ZhlDevice = this.paneDevices[i];
      const deviceId: number = device.id ?? 0;
      const menuItem: MenuElement = {
        value: device.name ?? `设备 ${deviceId}`,
        action: () => {
          AppStorage.setOrCreate('zhlSelectedDeviceId', deviceId);
          this.paneDeviceId = deviceId;
          this.paneDeviceName = device.name ?? '';
          this.paneLoading = true;
          this.loadTasksFor(deviceId);
        },
      };
      items.push(menuItem);
    }
    return items;
  }

  titleText(): string {
    if (this.paneDeviceName.length === 0) {
      return '任务';
    }
    return this.paneDeviceName;
  }

  needUnlock(): boolean {
    return this.paneDeviceId > 0 && this.paneSession.length === 0;
  }

  build() {
    Column() {
      Row({ space: 10 }) {
        Text('任务')
          .fontSize(13)
          .fontColor(ZHL_DIM)
        Blank()
        if (this.paneDevices.length > 0) {
          Row({ space: 6 }) {
            Text(this.titleText())
              .fontSize(13)
              .fontColor(ZHL_TEXT)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            SymbolGlyph($r('sys.symbol.chevron_down'))
              .fontSize(13)
              .fontColor([ZHL_ACCENT])
          }
          .padding({ left: 12, right: 12, top: 6, bottom: 6 })
          .backgroundColor(zhlAlpha(ZHL_ACCENT, 0.08))
          .border({ width: 1, color: zhlAlpha(ZHL_ACCENT, 0.30) })
          .borderRadius(ZHL_RADIUS_CHIP)
          .bindMenu(this.deviceMenu())
        }
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)
      .padding({ top: 10, bottom: 10 })

      if (this.paneErr.length > 0) {
        Text(this.paneErr)
          .fontSize(12)
          .fontColor(ZHL_DOWN)
          .width('100%')
          .margin({ bottom: 8 })
      }

      Scroll() {
        Column({ space: ZHL_CARD_GAP }) {
          if (this.paneLoading) {
            Column({ space: 10 }) {
              ZhlSkeletonBar({ barWidth: '70%' })
              ZhlSkeletonBar({ barWidth: '90%', barHeight: 12 })
              ZhlSkeletonBar({ barWidth: '50%', barHeight: 12 })
            }
            .width('100%')
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)
          } else if (this.paneDevices.length === 0) {
            Column({ space: 8 }) {
              Text('还没有绑定设备。')
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor(ZHL_TEXT)
              Text('先到「设备」页扫码绑定一台设备，再回到这里下发任务。')
                .fontSize(13)
                .fontColor(ZHL_DIM)
                .lineHeight(21)
                .textAlign(TextAlign.Center)
            }
            .width('100%')
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)
            .margin({ top: 40 })
          } else if (this.needUnlock()) {
            Column({ space: ZHL_CARD_GAP }) {
              Text('这台设备的任务列表需要 PIN 会话。')
                .fontSize(13)
                .fontColor(ZHL_DIM)
                .lineHeight(21)
                .width('100%')
              ZhlPrimaryButton({
                btnLabel: '输入设备 PIN',
                hasIcon: true,
                iconRes: $r('sys.symbol.lock_fill'),
                tapAction: () => {
                  this.onUnlock(this.paneDeviceId, this.paneDeviceName);
                },
              })
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)
          } else if (this.paneRows.length === 0) {
            Column({ space: 8 }) {
              Text('还没有任务。')
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor(ZHL_TEXT)
              Text('到「设备」页打开一台在线设备，就能下发第一条任务。')
                .fontSize(13)
                .fontColor(ZHL_DIM)
                .lineHeight(21)
                .textAlign(TextAlign.Center)
            }
            .width('100%')
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)
            .margin({ top: 40 })
          } else {
            Column() {
              ForEach(this.paneRows, (rowItem: ZhlTask) => {
                Column() {
                  ZhlTaskRow({
                    taskInfo: rowItem,
                    onOpenTask: () => {
                      this.onOpenTask(this.paneDeviceId, this.paneDeviceName, rowItem.id ?? 0);
                    },
                  })
                }
                .width('100%')
                .border({ width: { bottom: 1 }, color: ZHL_LINE })
              }, (rowItem: ZhlTask) => `pane_task_${rowItem.id ?? 0}`)
            }
            .width('100%')
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)
          }
        }
        .width('100%')
        .padding({ bottom: 24 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.Top)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 16, right: 16 })
    .backgroundColor(ZHL_BG)
  }
}