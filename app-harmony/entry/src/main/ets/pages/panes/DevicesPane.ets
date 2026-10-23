import { zhlDeviceList } from '../../service/DeviceService';
import { zhlErrorText } from '../../service/Http';
import { zhlGetPinSession } from '../../service/SessionStore';
import { zhlTaskList } from '../../service/TaskService';
import { ZhlDevice, ZhlTask } from '../../model/Types';
import {
  ZHL_BG,
  ZHL_CARD_GAP,
  ZHL_CARD_PAD,
  ZHL_DIM,
  ZHL_DOWN,
  ZHL_FAINT,
  ZHL_LINE,
  ZHL_PANEL,
  ZHL_RADIUS_CARD,
  ZHL_TEXT,
} from '../../common/Theme';
import { ZhlPrimaryButton } from '../../components/ZhlButton';
import { ZhlDeviceCard } from '../../components/DeviceCard';
import { ZhlSkeletonBar } from '../../components/SkeletonBar';

/**
 * 设备页（规格 §三 设备页）。
 *  - 顶部一行：左「我的设备」弱文字标题，右侧实心品牌青「扫码绑定」
 *  - 加载中显示 2~3 条骨架条，不用占满屏的转圈
 *  - 每台设备一张卡（ZhlDeviceCard），卡内嵌最近 6 条任务
 *  - 空态：居中图形占位 + 一句指引
 *
 * 说明：中枢的 /tasks 强制 X-Builder-Session（15 分钟 PIN 会话），所以卡内的任务只在
 * 本机还有有效会话时显示；没有会话时不编造任何任务行。
 */

interface ZhlDeviceTaskGroup {
  groupDeviceId: number;
  groupTasks: Array<ZhlTask>;
}

@Component
export struct ZhlDevicesPane {
  onOpenDevice: (deviceId: number, deviceName: string) => void = () => {
  };
  onScanBind: () => void = () => {
  };
  @State deviceList: Array<ZhlDevice> = [];
  @State taskGroups: Array<ZhlDeviceTaskGroup> = [];
  @State paneLoading: boolean = true;
  @State paneErr: string = '';
  @State paneEntered: boolean = false;
  private alive: boolean = true;

  aboutToAppear(): void {
    setTimeout(() => {
      this.paneEntered = true;
    }, 20);
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
        this.deviceList = list;
        this.paneLoading = false;
        this.paneErr = '';
        this.loadTasks(list);
        if (this.alive) {
          setTimeout(() => {
            this.refresh();
          }, 10000);
        }
      })
      .catch((e: Object) => {
        this.paneLoading = false;
        this.paneErr = zhlErrorText(e);
        if (this.alive) {
          setTimeout(() => {
            this.refresh();
          }, 10000);
        }
      });
  }

  /** 只有还存在 PIN 会话的设备才拉任务（避免 401 噪音），逐台串行拉最近 6 条 */
  loadTasks(list: Array<ZhlDevice>): void {
    const groups: Array<ZhlDeviceTaskGroup> = [];
    this.collectTasks(list, 0, groups);
  }

  collectTasks(list: Array<ZhlDevice>, index: number, groups: Array<ZhlDeviceTaskGroup>): void {
    if (index >= list.length) {
      this.taskGroups = groups;
      return;
    }
    const device: ZhlDevice = list[index];
    const deviceId: number = device.id ?? 0;
    zhlGetPinSession(deviceId).then((session: string) => {
      if (session.length === 0) {
        this.collectTasks(list, index + 1, groups);
        return;
      }
      zhlTaskList(deviceId, session, 6)
        .then((rows: Array<ZhlTask>) => {
          const group: ZhlDeviceTaskGroup = { groupDeviceId: deviceId, groupTasks: rows };
          groups.push(group);
          this.collectTasks(list, index + 1, groups);
        })
        .catch(() => {
          this.collectTasks(list, index + 1, groups);
        });
    });
  }

  tasksOf(deviceId: number): Array<ZhlTask> {
    for (let i = 0; i < this.taskGroups.length; i++) {
      const group: ZhlDeviceTaskGroup = this.taskGroups[i];
      if (group.groupDeviceId === deviceId) {
        return group.groupTasks;
      }
    }
    return [];
  }

  paneOpacity(): number {
    if (this.paneEntered) {
      return 1;
    }
    return 0;
  }

  build() {
    Column() {
      Row() {
        Text('我的设备')
          .fontSize(13)
          .fontColor(ZHL_DIM)
        Blank()
        Button() {
          Row({ space: 6 }) {
            SymbolGlyph($r('sys.symbol.qrcode'))
              .fontSize(16)
              .fontColor(['#06222B'])
            Text('扫码绑定')
              .fontSize(14)
              .fontWeight(FontWeight.Medium)
              .fontColor('#06222B')
          }
          .justifyContent(FlexAlign.Center)
        }
        .height(36)
        .padding({ left: 14, right: 14 })
        .backgroundColor('#22D3EE')
        .borderRadius(10)
        .onClick(() => {
          this.onScanBind();
        })
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
              ForEach([0, 1, 2], (skeletonIndex: number) => {
                ZhlSkeletonBar({ barWidth: this.skeletonWidth(skeletonIndex) })
              }, (skeletonIndex: number) => `device_skeleton_${skeletonIndex}`)
            }
            .width('100%')
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)
          } else if (this.deviceList.length === 0) {
            Column({ space: 12 }) {
              SymbolGlyph($r('sys.symbol.computer'))
                .fontSize(48)
                .fontColor([ZHL_FAINT])
              Text('还没有绑定任何设备。')
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor(ZHL_TEXT)
              Text('在桌面端打开「远控面板」生成二维码，用手机扫码即可绑定。')
                .fontSize(13)
                .fontColor(ZHL_DIM)
                .lineHeight(21)
                .textAlign(TextAlign.Center)
              ZhlPrimaryButton({
                btnLabel: '扫码绑定',
                hasIcon: true,
                iconRes: $r('sys.symbol.qrcode'),
                tapAction: () => {
                  this.onScanBind();
                },
              })
            }
            .width('100%')
            .alignItems(HorizontalAlign.Center)
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)
            .margin({ top: 40 })
          } else {
            ForEach(this.deviceList, (deviceItem: ZhlDevice, deviceIndex: number) => {
              ZhlDeviceCard({
                cardIndex: deviceIndex,
                device: deviceItem,
                deviceTasks: this.tasksOf(deviceItem.id ?? 0),
                onOpenDevice: () => {
                  this.onOpenDevice(deviceItem.id ?? 0, deviceItem.name ?? '');
                },
                onOpenTask: () => {
                  this.onOpenDevice(deviceItem.id ?? 0, deviceItem.name ?? '');
                },
              })
            }, (deviceItem: ZhlDevice) => `device_${deviceItem.id ?? 0}`)
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
    .opacity(this.paneOpacity())
    .animation({ duration: 220, curve: Curve.FastOutSlowIn })
  }

  skeletonWidth(index: number): string {
    if (index === 1) {
      return '86%';
    }
    if (index === 2) {
      return '64%';
    }
    return '100%';
  }
}