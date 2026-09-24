import { router } from '@kit.ArkUI';
import { Api, ApiError, getPinSession, tasks, taskOutput, stopTask, createTask, deviceStatus } from '../model/Api';

/**
 * 设备详情：在线状态 + 任务列表 + 下发任务 + 输出实时流。
 * 进入前由 PinGate 校验 6 位 PIN（会话存 preferences）。
 */
const BG = '#05090F';
const PANEL = '#0C1420';
const PANEL2 = '#101A28';
const LINE = '#1B2839';
const TXT = '#E6EDF6';
const DIM = '#8CA0B8';
const FAINT = '#5A6E86';
const ACCENT = '#22D3EE';
const OK = '#34D399';
const DOWN = '#F87171';
const WARN = '#FBBF24';

@Entry
@Component
struct DeviceDetail {
  @State deviceId: number = 0;
  @State online: boolean = false;
  @State name: string = '';
  @State taskList: Array<Record<string, Object>> = [];
  @State openTaskId: number = 0;
  @State output: string = '';
  @State showNewTask: boolean = false;
  @State newPrompt: string = '';
  @State err: string = '';

  aboutToAppear(): void {
    this.deviceId = Number(AppStorage.get('currentDeviceId') ?? 0);
    this.pollStatus();
    this.pollTasks();
  }

  pollStatus(): void {
    getPinSession(this.context, this.deviceId).then((s) => {
      deviceStatus(this.context, this.deviceId, s).then((st) => {
        this.online = Boolean(st.online);
        this.name = String(st.name ?? '');
        setTimeout(() => this.pollStatus(), 6000);
      }).catch(() => setTimeout(() => this.pollStatus(), 6000));
    });
  }

  pollTasks(): void {
    getPinSession(this.context, this.deviceId).then((s) => {
      tasks(this.context, this.deviceId, s, 20).then((list) => {
        this.taskList = list;
        setTimeout(() => this.pollTasks(), 6000);
      }).catch(() => setTimeout(() => this.pollTasks(), 6000));
    });
  }

  pollOutput(taskId: number): void {
    getPinSession(this.context, this.deviceId).then((s) => {
      taskOutput(this.context, this.deviceId, s, taskId, 0).then((o) => {
        const lines = (o.lines ?? []) as Array<Record<string, Object>>;
        this.output = lines.map((l) => String(l.line ?? '')).join('\n');
        setTimeout(() => {
          if (this.openTaskId === taskId) {
            this.pollOutput(taskId);
          }
        }, 2000);
      }).catch(() => setTimeout(() => {
        if (this.openTaskId === taskId) {
          this.pollOutput(taskId);
        }
      }, 2000));
    });
  }

  statusLabel(s: number): string {
    if (s === 0) return '待下发';
    if (s === 1) return '运行中';
    if (s === 2) return '完成';
    if (s === 3) return '失败';
    return '已停止';
  }

  statusColor(s: number): string {
    if (s === 1) return ACCENT;
    if (s === 2) return OK;
    if (s === 3) return DOWN;
    return FAINT;
  }

  build() {
    Column() {
      Row() {
        Text('‹ 返回').fontSize(15).fontColor(DIM)
          .onClick(() => router.back())
        Text(` ${this.name || '设备'}`).fontSize(17).fontWeight(FontWeight.Bold).fontColor(TXT)
        Circle({ width: 9, height: 9 }).fill(this.online ? OK : FAINT).margin({ left: 8 })
        Text(this.online ? '在线' : '离线').fontSize(13).fontColor(DIM)
      }.width('100%').padding({ top: 14, bottom: 10 })

      Button('下发新任务')
        .width('100%').backgroundColor(ACCENT).fontColor('#06222B')
        .enabled(this.online)
        .onClick(() => { this.showNewTask = true; })

      if (this.err) {
        Text(this.err).fontSize(13).fontColor(WARN).margin({ top: 8 })
      }

      List({ space: 10 }) {
        ForEach(this.taskList, (t: Record<string, Object>) => {
          ListItem() {
            Column({ space: 6 }) {
              Row() {
                Text(`#${t.id}`).fontSize(13).fontWeight(FontWeight.Bold).fontColor(ACCENT)
                Text(` ${this.statusLabel(Number(t.status ?? 0))}`)
                  .fontSize(12).fontColor(this.statusColor(Number(t.status ?? 0)))
                Blank()
                if (Number(t.status) === 1 && this.openTaskId === Number(t.id)) {
                  Text('停止').fontSize(12).fontColor(DOWN)
                    .onClick(() => {
                      getPinSession(this.context, this.deviceId).then((s) => {
                        stopTask(this.context, this.deviceId, s, Number(t.id));
                      });
                    })
                }
              }.width('100%')
              Text(String(t.prompt ?? '')).fontSize(13.5).fontColor(TXT).maxLines(2)
              if (this.openTaskId === Number(t.id)) {
                Text(this.output === '' ? '等待输出…' : this.output)
                  .fontSize(12).fontColor('#9FB6CE').lineHeight(16)
                  .backgroundColor(PANEL).borderRadius(10).padding(10).width('100%')
              }
            }
            .padding(14).backgroundColor(this.openTaskId === Number(t.id) ? PANEL2 : PANEL)
            .borderRadius(12).width('100%')
            .onClick(() => {
              this.openTaskId = Number(t.id);
              this.output = '';
              this.pollOutput(this.openTaskId);
            })
          }
        }, (t: Record<string, Object>) => `${t.id}_${t.status}`)
      }.layoutWeight(1).width('100%').margin({ top: 10 })
    }
    .width('100%').height('100%')
    .backgroundColor(BG)
    .padding({ left: 20, right: 20 })
    .bindSheet($$this.showNewTask, this.newTaskSheet(), {
      height: 320, showClose: true, title: { title: '下发任务' },
    })
  }

  @Builder
  newTaskSheet() {
    Column({ space: 12 }) {
      TextInput({ placeholder: '要给 agent 的指令…', text: this.newPrompt })
        .onChange((v) => { this.newPrompt = v; })
        .backgroundColor(PANEL).borderColor(LINE).fontColor(TXT)
      Text('任务将在设备上以 agent 执行，输出实时回传。').fontSize(12).fontColor(FAINT)
      Button('下发')
        .width('100%').backgroundColor(ACCENT).fontColor('#06222B')
        .enabled(this.newPrompt !== '')
        .onClick(() => {
          getPinSession(this.context, this.deviceId).then((s) => {
            createTask(this.context, this.deviceId, s, this.newPrompt.trim())
              .then(() => {
                this.showNewTask = false;
                this.newPrompt = '';
                this.pollTasks();
              })
              .catch((e: ApiError) => { this.err = e.message; });
          });
        })
    }.padding(16)
  }
}
