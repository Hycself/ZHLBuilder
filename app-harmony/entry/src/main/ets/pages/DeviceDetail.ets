import { zhlDeviceCapabilities, zhlDeviceStatus } from '../service/DeviceService';
import { zhlErrorText } from '../service/Http';
import { zhlTaskCreate, zhlTaskList } from '../service/TaskService';
import { zhlGetPinSession } from '../service/SessionStore';
import {
  ZhlCapabilities, ZhlDevice, ZhlDeviceDetailParam, ZhlModeOption, ZhlModelOption, ZhlPinGateParam,
  ZhlTask, ZhlTaskOutputParam,
} from '../model/Types';
import { zhlTaskIsTerminal } from '../common/Format';
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
} from '../common/Theme';
import { ZhlDeviceStatusCard } from '../components/DeviceStatusCard';
import { ZhlModelModePicker } from '../components/ModelModePicker';
import { ZhlPrimaryButton } from '../components/ZhlButton';
import { ZhlTaskRow } from '../components/TaskRow';
import { ZhlSkeletonBar } from '../components/SkeletonBar';

/**
 * 设备详情页（规格 §三 设备详情页）：
 *  - 顶部品牌青描边卡（device 状态 + agentState 横幅 + 有任务在跑时的脉冲光带）
 *  - 任务输入区：多行输入框 + 一排描边胶囊快捷指令 + 模型/模式选择
 *  - 通栏实心品牌青「下发任务」；设备离线时禁用并在下方给红色小字「设备不在线」
 *  - 再往下任务历史，样式同设备页内嵌任务
 * 所有任务接口都要 X-Builder-Session；没有会话时先引导到 PIN 页。
 */

@Builder
export function DeviceDetailBuilder(): void {
  DeviceDetailPage()
}

interface ZhlQuickCommand {
  cmdLabel: string;
  cmdText: string;
}

@Component
export struct DeviceDetailPage {
  stack: NavPathStack | undefined = undefined;
  @State detailDeviceId: number = 0;
  @State detailDeviceName: string = '';
  @State detailDevice: ZhlDevice = {};
  @State detailTasks: Array<ZhlTask> = [];
  @State detailModels: Array<ZhlModelOption> = [];
  @State detailModes: Array<ZhlModeOption> = [];
  @State detailPinSession: string = '';
  @State promptText: string = '';
  @State selectedModel: string = '';
  @State selectedMode: string = '';
  @State sending: boolean = false;
  @State loading: boolean = true;
  @State errText: string = '';
  @State needsPin: boolean = false;
  @State alive: boolean = true;

  aboutToAppear(): void {
    setTimeout(() => {
      this.bootstrap();
    }, 30);
  }

  aboutToDisappear(): void {
    this.alive = false;
  }

  bootstrap(): void {
    zhlGetPinSession(this.detailDeviceId).then((session: string) => {
      this.detailPinSession = session;
      if (session.length === 0) {
        this.needsPin = true;
        this.loading = false;
        return;
      }
      this.needsPin = false;
      this.refreshStatus();
      this.refreshTasks();
      this.refreshCapabilities();
    });
  }

  refreshStatus(): void {
    if (!this.alive) {
      return;
    }
    zhlDeviceStatus(this.detailDeviceId, this.detailPinSession)
      .then((device) => {
        this.detailDevice = device;
        this.loading = false;
        this.errText = '';
        setTimeout(() => {
          this.refreshStatus();
        }, 6000);
      })
      .catch((e: Object) => {
        this.loading = false;
        this.errText = zhlErrorText(e);
        setTimeout(() => {
          this.refreshStatus();
        }, 6000);
      });
  }

  refreshTasks(): void {
    if (!this.alive) {
      return;
    }
    zhlTaskList(this.detailDeviceId, this.detailPinSession, 20)
      .then((list) => {
        this.detailTasks = list;
        setTimeout(() => {
          this.refreshTasks();
        }, 6000);
      })
      .catch((e: Object) => {
        setTimeout(() => {
          this.refreshTasks();
        }, 6000);
      });
  }

  refreshCapabilities(): void {
    zhlDeviceCapabilities(this.detailDeviceId, this.detailPinSession)
      .then((caps: ZhlCapabilities) => {
        this.detailModels = caps.models ?? [];
        this.detailModes = caps.modes ?? [];
      })
      .catch((e: Object) => {
        // 能力快照拿不到不影响下发任务，保持「跟随设备默认模型」
      });
  }

  deviceOnline(): boolean {
    return this.detailDevice.online ?? false;
  }

  agentState(): string {
    return this.detailDevice.agentState ?? '';
  }

  runningCount(): number {
    let count: number = 0;
    for (let i = 0; i < this.detailTasks.length; i++) {
      const status: number = this.detailTasks[i].status ?? 0;
      if (!zhlTaskIsTerminal(status)) {
        count = count + 1;
      }
    }
    return count;
  }

  offlineHint(): string {
    if (this.deviceOnline()) {
      return '';
    }
    return '设备不在线';
  }

  canSend(): boolean {
    return this.deviceOnline() && this.promptText.trim().length > 0 && !this.sending &&
      this.detailPinSession.length > 0;
  }

  quickCommands(): Array<ZhlQuickCommand> {
    const list: Array<ZhlQuickCommand> = [];
    const one: ZhlQuickCommand = { cmdLabel: '仓库状态', cmdText: '查看当前仓库状态与未提交改动' };
    const two: ZhlQuickCommand = { cmdLabel: '运行测试', cmdText: '运行一遍测试并汇总失败项' };
    const three: ZhlQuickCommand = { cmdLabel: '重新构建', cmdText: '重新构建项目并说明失败原因' };
    list.push(one);
    list.push(two);
    list.push(three);
    return list;
  }

  applyQuickCommand(text: string): void {
    this.promptText = text;
  }

  doSend(): void {
    if (!this.canSend()) {
      return;
    }
    this.sending = true;
    this.errText = '';
    zhlTaskCreate(this.detailDeviceId, this.detailPinSession, this.promptText.trim(),
      this.selectedModel, this.selectedMode)
      .then((task) => {
        this.sending = false;
        this.promptText = '';
        this.refreshTasks();
        this.openTask(task.id ?? 0);
      })
      .catch((e: Object) => {
        this.sending = false;
        this.errText = zhlErrorText(e);
      });
  }

  openTask(taskId: number): void {
    if (this.stack === undefined || taskId <= 0) {
      return;
    }
    const param: ZhlTaskOutputParam = {
      deviceId: this.detailDeviceId,
      taskId: taskId,
      deviceName: this.detailDeviceName,
    };
    this.stack.pushDestination(new NavPathInfo('TaskOutput', param));
  }

  openPinGate(): void {
    if (this.stack === undefined) {
      return;
    }
    const param: ZhlPinGateParam = {
      mode: 'gate',
      pairCode: '',
      deviceId: this.detailDeviceId,
      deviceName: this.detailDeviceName,
      nextPage: '',
    };
    this.stack.pushDestination(new NavPathInfo('PinGate', param));
  }

  build() {
    NavDestination() {
      Column() {
        Scroll() {
          Column({ space: ZHL_CARD_GAP }) {
            if (this.loading) {
              Column({ space: 10 }) {
                ZhlSkeletonBar({ barWidth: '60%' })
                ZhlSkeletonBar({ barWidth: '100%', barHeight: 60 })
                ZhlSkeletonBar({ barWidth: '80%' })
              }
              .width('100%')
              .padding(ZHL_CARD_PAD)
              .backgroundColor(ZHL_PANEL)
              .borderRadius(ZHL_RADIUS_CARD)
            } else {
              ZhlDeviceStatusCard({
                cardDeviceName: this.detailDevice.name ?? this.detailDeviceName,
                cardPlatform: this.detailDevice.platform ?? '',
                cardAgentVersion: this.detailDevice.agentVersion ?? '',
                cardAgentState: this.agentState(),
                cardBusy: this.runningCount() > 0,
              })
            }

            if (this.needsPin) {
              Column({ space: ZHL_CARD_GAP }) {
                Text('进入设备会话需要先验证 6 位 PIN。')
                  .fontSize(13)
                  .fontColor(ZHL_DIM)
                  .lineHeight(21)
                  .width('100%')
                ZhlPrimaryButton({
                  btnLabel: '输入设备 PIN',
                  hasIcon: true,
                  iconRes: $r('sys.symbol.lock_fill'),
                  tapAction: () => {
                    this.openPinGate();
                  },
                })
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)
              .padding(ZHL_CARD_PAD)
              .backgroundColor(ZHL_PANEL)
              .border({ width: 1, color: ZHL_LINE })
              .borderRadius(ZHL_RADIUS_CARD)
            }

            Column({ space: ZHL_CARD_GAP }) {
              Text('下发任务')
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor(ZHL_TEXT)
                .width('100%')

              TextArea({ placeholder: '要给 agent 的指令…', text: this.promptText })
                .placeholderColor(ZHL_FAINT)
                .fontColor(ZHL_TEXT)
                .fontSize(14)
                .backgroundColor(ZHL_PANEL)
                .borderRadius(12)
                .border({ width: 1, color: ZHL_LINE })
                .height(96)
                .width('100%')
                .onChange((value: string) => {
                  this.promptText = value;
                })

              Row({ space: 8 }) {
                ForEach(this.quickCommands(), (quickItem: ZhlQuickCommand) => {
                  Text(quickItem.cmdLabel)
                    .fontSize(12)
                    .fontColor(ZHL_DIM)
                    .padding({ left: 10, right: 10, top: 6, bottom: 6 })
                    .border({ width: 1, color: ZHL_LINE })
                    .borderRadius(999)
                    .onClick(() => {
                      this.applyQuickCommand(quickItem.cmdText);
                    })
                }, (quickItem: ZhlQuickCommand) => `quick_${quickItem.cmdLabel}`)
              }
              .width('100%')

              ZhlModelModePicker({
                pickerModels: this.detailModels,
                pickerModes: this.detailModes,
                pickerEnabled: !this.sending,
                selectedModel: this.selectedModel,
                selectedMode: this.selectedMode,
              })

              ZhlPrimaryButton({
                btnLabel: '下发任务',
                btnBusyLabel: '下发中…',
                btnBusy: this.sending,
                btnEnabled: this.canSend(),
                hasIcon: true,
                iconRes: $r('sys.symbol.paperplane_fill'),
                tapAction: () => {
                  this.doSend();
                },
              })

              if (this.offlineHint().length > 0) {
                Text(this.offlineHint())
                  .fontSize(12)
                  .fontColor(ZHL_DOWN)
                  .width('100%')
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)

            Column({ space: 4 }) {
              Text('任务历史')
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor(ZHL_TEXT)
                .width('100%')
                .margin({ bottom: 4 })
              if (this.detailTasks.length === 0) {
                Text('这台上还没有任务记录。')
                  .fontSize(13)
                  .fontColor(ZHL_FAINT)
                  .width('100%')
              } else {
                ForEach(this.detailTasks, (historyItem: ZhlTask) => {
                  Column() {
                    ZhlTaskRow({
                      taskInfo: historyItem,
                      onOpenTask: () => {
                        this.openTask(historyItem.id ?? 0);
                      },
                    })
                  }
                  .width('100%')
                  .border({ width: { bottom: 1 }, color: ZHL_LINE })
                }, (historyItem: ZhlTask) => `detail_task_${historyItem.id ?? 0}`)
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
            .padding(ZHL_CARD_PAD)
            .backgroundColor(ZHL_PANEL)
            .border({ width: 1, color: ZHL_LINE })
            .borderRadius(ZHL_RADIUS_CARD)

            if (this.errText.length > 0) {
              Text(this.errText)
                .fontSize(12)
                .fontColor(ZHL_DOWN)
                .width('100%')
            }
          }
          .width('100%')
          .padding({ top: 12, bottom: 24 })
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Off)
      }
      .width('100%')
      .height('100%')
      .padding({ left: 16, right: 16 })
      .backgroundColor(ZHL_BG)
    }
    .hideTitleBar(true)
    .backgroundColor(ZHL_BG)
    .onReady((context: NavDestinationContext) => {
      this.stack = context.pathStack;
      const raw: Object = context.pathInfo.param as Object;
      const param: ZhlDeviceDetailParam = raw as ZhlDeviceDetailParam;
      this.detailDeviceId = param.deviceId;
      this.detailDeviceName = param.deviceName;
      this.detailDevice = { id: param.deviceId, name: param.deviceName } as ZhlDevice;
    })
  }
}