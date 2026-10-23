import { zhlTaskAppendMessage, zhlTaskEvents, zhlTaskList } from '../service/TaskService';
import { zhlErrorText } from '../service/Http';
import { zhlGetPinSession } from '../service/SessionStore';
import { ZhlEventBatch, ZhlEventPayload, ZhlTask, ZhlTaskEventItem, ZhlTaskOutputParam } from '../model/Types';
import {
  zhlClockText, zhlFormatElapsed, zhlModeText, zhlParseTime, zhlTaskIsTerminal, zhlTaskStatusColor,
  zhlTaskStatusText,
} from '../common/Format';
import {

 
 
 
 
  ZHL_ACCENT
, 
 


 
 
  ZHL_CARD_PAD,
  ZHL_CONSOLE_BG,
  ZHL_CONSOLE_TEXT,
  ZHL_DIM,
  ZHL_DOWN,
  ZHL_FAINT,
  ZHL_LINE,
  ZHL_MS_LINE,
  ZHL_PANEL,
  ZHL_TEXT,
  ZHL_WARN,
  zhlAlpha,
} from '../common/Theme';
import { ZhlStatusBanner } from '../components/StatusBanner';
import { ZhlSkeletonBar } from '../components/SkeletonBar';

/**
 * 任务输出页（规格 §三 任务输出页 + §七之二 结构化事件 + 第 4 条多轮续话）。
 *
 *  - 深色控制台观感：底色 #0A121C（比页面再深一档），等宽字体，行号 seq 用弱文字色弱化
 *  - 顶部一行：任务状态横幅 + 耗时 + 右侧「自动跟随」开关
 *  - 新行淡入加轻微上移，单行不超过 120ms；一批同时到达时整批一次呈现
 *  - 任务进终态后把 exitNote 用红色横幅单独列出
 *  - 页面隐藏或任务进终态必须停止轮询；自动跟随关闭时用户上翻不被新行顶走
 *  - 事件四类各有其渲染：assistant_text 正文 / reasoning 弱化折叠 / tool_call 一行 /
 *    waiting_input 明显等待态；不认识的 type 当纯文本降级
 *  - 多轮：按 threadId 聚合、按 turnNo 排序显示轮次，续话走 /messages（不新建任务）
 */

@Builder
export function TaskOutputBuilder(): void {
  TaskOutputPage()
}

/** 控制台里的一行 */
interface ZhlConsoleLine {
  lineKey: string;
  lineKind: string;
  lineSeq: number;
  lineText: string;
  lineToolName: string;
  lineToolPhase: string;
  lineSummary: string;
  lineTs: number;
}

function zhlToolPhaseText(phase: string): string {
  if (phase === 'scheduled') {
    return '已计划';
  }
  if (phase === 'progress') {
    return '进行中';
  }
  if (phase === 'result') {
    return '结果';
  }
  if (phase === 'error') {
    return '出错';
  }
  if (phase === 'batch') {
    return '批量';
  }
  if (phase === 'call') {
    return '调用';
  }
  if (phase === 'permission_resolved') {
    return '权限已处理';
  }
  if (phase === 'user_input_resolved') {
    return '已回应';
  }
  return phase;
}

function zhlEventToLine(ev: ZhlTaskEventItem): ZhlConsoleLine {
  const seq: number = ev.seq ?? 0;
  const eventType: string = ev.type ?? '';
  const rawPayload: Object | undefined = ev.payload;
  const line: ZhlConsoleLine = {
    lineKey: `ev_${seq}_${eventType}`,
    lineKind: 'plain',
    lineSeq: seq,
    lineText: '',
    lineToolName: '',
    lineToolPhase: '',
    lineSummary: '',
    lineTs: zhlParseTime(ev.ts),
  };

  if (rawPayload !== undefined && typeof rawPayload === 'string') {
    line.lineText = String(rawPayload);
    return line;
  }
  const payload: ZhlEventPayload = rawPayload as ZhlEventPayload;

  if (eventType === 'assistant_text') {
    line.lineKind = 'assistant';
    line.lineText = payload.text ?? '';
    return line;
  }
  if (eventType === 'reasoning') {
    line.lineKind = 'reasoning';
    line.lineText = payload.text ?? '';
    return line;
  }
  if (eventType === 'tool_call') {
    line.lineKind = 'tool';
    line.lineToolName = payload.name ?? '';
    line.lineToolPhase = payload.phase ?? '';
    line.lineSummary = payload.summary ?? '';
    line.lineText = payload.text ?? '';
    return line;
  }
  if (eventType === 'waiting_input') {
    line.lineKind = 'waiting';
    const kind: string = payload.kind ?? '';
    const prompt: string = payload.prompt ?? '';
    if (kind === 'permission') {
      line.lineText = `等待授权：${prompt}`;
    } else if (kind === 'question') {
      line.lineText = `等待你的回答：${prompt}`;
    } else {
      line.lineText = prompt;
    }
    return line;
  }
  // 不认识的 type：当纯文本降级
  line.lineKind = 'plain';
  const fallback: string = payload.text ?? '';
  if (fallback.length > 0) {
    line.lineText = fallback;
  } else {
    line.lineText = `[${eventType}]`;
  }
  return line;
}

@Component
export struct TaskOutputPage {
  private consoleScroller: Scroller = new Scroller();
  @State consoleDeviceId: number = 0;
  @State consoleTaskId: number = 0;
  @State consoleDeviceName: string = '';
  @State consolePinSession: string = '';
  @State turnTasks: Array<ZhlTask> = [];
  @State consoleLines: Array<ZhlConsoleLine> = [];
  @State expandedKeys: Array<string> = [];
  @State taskStatus: number = 1;
  @State taskStage: string = '';
  @State exitNote: string = '';
  @State autoFollow: boolean = true;
  @State elapsedText: string = '—';
  @State loading: boolean = true;
  @State errText: string = '';
  @State replyText: string = '';
  @State replying: boolean = false;
  @State linesCursor: number = 0;
  private polling: boolean = false;
  private startTs: number = 0;
  private endTs: number = 0;

  aboutToAppear(): void {
    setTimeout(() => {
      zhlGetPinSession(this.consoleDeviceId).then((session: string) => {
        this.consolePinSession = session;
        if (session.length === 0) {
          this.loading = false;
          this.errText = 'PIN 会话已过期，请重新输入设备 PIN。';
          return;
        }
        this.loadThread();
      });
    }, 20);
  }

  aboutToDisappear(): void {
    this.polling = false;
  }

  // ===== 数据装载 =====

  /** 按 threadId 聚合成一段对话，按 turnNo 排序 */
  loadThread(): void {
    zhlTaskList(this.consoleDeviceId, this.consolePinSession, 50)
      .then((list) => {
        let threadId: number = this.consoleTaskId;
        for (let i = 0; i < list.length; i++) {
          const task: ZhlTask = list[i];
          if ((task.id ?? 0) === this.consoleTaskId) {
            threadId = task.threadId ?? task.id ?? 0;
          }
        }
        const group: Array<ZhlTask> = [];
        for (let i = 0; i < list.length; i++) {
          const task: ZhlTask = list[i];
          if ((task.threadId ?? task.id ?? 0) === threadId) {
            group.push(task);
          }
        }
        group.sort((left: ZhlTask, right: ZhlTask): number => (left.turnNo ?? 1) - (right.turnNo ?? 1));
        this.turnTasks = group;
        const first: ZhlTask | undefined = group.length > 0 ? group[0] : undefined;
        if (first !== undefined) {
          this.startTs = zhlParseTime(first.createdAt);
        }
        this.loadTurnHistory(0);
      })
      .catch((e: Object) => {
        this.loading = false;
        this.errText = zhlErrorText(e);
      });
  }

  /** 逐轮把历史事件读一遍；最后一轮读完转入增量轮询 */
  loadTurnHistory(index: number): void {
    if (index >= this.turnTasks.length) {
      this.loading = false;
      this.beginPolling();
      return;
    }
    const turn: ZhlTask = this.turnTasks[index];
    const turnId: number = turn.id ?? 0;
    const isLast: boolean = index === this.turnTasks.length - 1;
    this.appendUserLine(turn);
    zhlTaskEvents(this.consoleDeviceId, this.consolePinSession, turnId, 0)
      .then((batch: ZhlEventBatch) => {
        this.appendBatch(batch, isLast);
        if (isLast) {
          this.loading = false;
          this.updateElapsed();
          if (zhlTaskIsTerminal(this.taskStatus)) {
            return;
          }
          this.beginPolling();
          return;
        }
        this.loadTurnHistory(index + 1);
      })
      .catch((e: Object) => {
        this.loading = false;
        this.errText = zhlErrorText(e);
      });
  }

  appendUserLine(turn: ZhlTask): void {
    const turnNo: number = turn.turnNo ?? 1;
    const line: ZhlConsoleLine = {
      lineKey: `user_${turn.id ?? 0}`,
      lineKind: 'user',
      lineSeq: 0,
      lineText: `第 ${turnNo} 轮 · ${this.turnEcho(turn)}${turn.prompt ?? ''}`,
      lineToolName: '',
      lineToolPhase: '',
      lineSummary: '',
      lineTs: zhlParseTime(turn.createdAt),
    };
    this.consoleLines = this.consoleLines.concat([line]);
  }

  /** 气泡/轮次头部回显的是任务对象里后端回传的"本轮实际"模型与模式，不是用户上次选中的值 */
  turnEcho(turn: ZhlTask): string {
    const model: string = turn.modelSelection ?? '';
    const mode: string = turn.mode ?? '';
    if (model.length === 0 && mode.length === 0) {
      return '';
    }
    if (model.length > 0 && mode.length > 0) {
      return `[${model} · ${zhlModeText(mode)}] `;
    }
    if (model.length > 0) {
      return `[${model}] `;
    }
    return `[${zhlModeText(mode)}] `;
  }

  appendBatch(batch: ZhlEventBatch, isLast: boolean): void {
    const events: Array<ZhlTaskEventItem> = batch.events ?? [];
    if (events.length > 0) {
      const fresh: Array<ZhlConsoleLine> = [];
      for (let i = 0; i < events.length; i++) {
        fresh.push(zhlEventToLine(events[i]));
      }
      // 一批同时到达 → 一次状态更新整批呈现，不逐条排队播放
      this.consoleLines = this.consoleLines.concat(fresh);
    }
    if (isLast) {
      this.linesCursor = batch.lastSeq ?? this.linesCursor;
      this.taskStatus = batch.status ?? this.taskStatus;
      this.taskStage = batch.stage ?? this.taskStage;
      this.exitNote = batch.exitNote ?? '';
      this.endTs = this.terminalTs();
      this.autoScroll();
    }
  }

  // ===== 轮询 =====

  beginPolling(): void {
    this.polling = true;
    this.pollOnce();
  }

  pollOnce(): void {
    if (!this.polling) {
      return;
    }
    const lastTurnId: number = this.lastTurnTaskId();
    if (lastTurnId <= 0) {
      return;
    }
    zhlTaskEvents(this.consoleDeviceId, this.consolePinSession, lastTurnId, this.linesCursor)
      .then((batch: ZhlEventBatch) => {
        this.appendBatch(batch, true);
        this.updateElapsed();
        if (zhlTaskIsTerminal(this.taskStatus)) {
          this.polling = false;
          return;
        }
        setTimeout(() => {
          this.pollOnce();
        }, 2000);
      })
      .catch((e: Object) => {
        this.errText = zhlErrorText(e);
        setTimeout(() => {
          this.pollOnce();
        }, 3000);
      });
  }

  lastTurnTaskId(): number {
    if (this.turnTasks.length === 0) {
      return this.consoleTaskId;
    }
    return this.turnTasks[this.turnTasks.length - 1].id ?? this.consoleTaskId;
  }

  terminalTs(): number {
    if (!zhlTaskIsTerminal(this.taskStatus)) {
      return 0;
    }
    const last: ZhlTask | undefined =
      this.turnTasks.length > 0 ? this.turnTasks[this.turnTasks.length - 1] : undefined;
    if (last !== undefined) {
      const finished: number = zhlParseTime(last.finishedAt);
      if (finished > 0) {
        return finished;
      }
    }
    return Date.now();
  }

  updateElapsed(): void {
    if (this.startTs <= 0) {
      this.elapsedText = '—';
      return;
    }
    if (zhlTaskIsTerminal(this.taskStatus)) {
      this.elapsedText = zhlFormatElapsed(this.terminalTs() - this.startTs);
      return;
    }
    this.elapsedText = zhlFormatElapsed(Date.now() - this.startTs);
  }

  autoScroll(): void {
    if (!this.autoFollow || this.consoleLines.length === 0) {
      return;
    }
    setTimeout(() => {
      this.consoleScroller.scrollToIndex(this.consoleLines.length - 1, true, ScrollAlign.END);
    }, 40);
  }

  // ===== 续话 =====

  doReply(): void {
    const text: string = this.replyText.trim();
    if (text.length === 0 || this.replying) {
      return;
    }
    const lastTurn: ZhlTask | undefined =
      this.turnTasks.length > 0 ? this.turnTasks[this.turnTasks.length - 1] : undefined;
    let modelSelection: string = '';
    let mode: string = '';
    if (lastTurn !== undefined) {
      modelSelection = lastTurn.modelSelection ?? '';
      mode = lastTurn.mode ?? '';
    }
    this.replying = true;
    zhlTaskAppendMessage(this.consoleDeviceId, this.consolePinSession, this.lastTurnTaskId(),
      text, modelSelection, mode)
      .then((task: ZhlTask) => {
        this.replying = false;
        this.replyText = '';
        // 新的一轮：接到同一段对话尾部，继续按 threadId 聚合
        this.turnTasks = this.turnTasks.concat([task]);
        this.appendUserLine(task);
        this.linesCursor = 0;
        this.taskStatus = task.status ?? 1;
        this.taskStage = task.stage ?? '';
        this.exitNote = '';
        this.polling = true;
        this.pollOnce();
      })
      .catch((e: Object) => {
        this.replying = false;
        this.errText = zhlErrorText(e);
      });
  }

  // ===== 渲染辅助 =====

  statusBannerColor(): string {
    return zhlTaskStatusColor(this.taskStatus);
  }

  statusBannerText(): string {
    const stageText: string = this.taskStage.length > 0 ? ` · ${this.stageLabel()}` : '';
    return `任务 ${zhlTaskStatusText(this.taskStatus)}${stageText}`;
  }

  stageLabel(): string {
    if (this.taskStage === 'queued') {
      return '排队中';
    }
    if (this.taskStage === 'running') {
      return '执行中';
    }
    if (this.taskStage === 'thinking') {
      return '正在思考';
    }
    if (this.taskStage === 'tool') {
      return '调用工具';
    }
    if (this.taskStage === 'waiting_input') {
      return '等待回应';
    }
    if (this.taskStage === 'done') {
      return '已完成';
    }
    if (this.taskStage === 'failed') {
      return '失败';
    }
    if (this.taskStage === 'stopped') {
      return '已停止';
    }
    return this.taskStage;
  }

  elapsedLabel(): string {
    return `耗时 ${this.elapsedText}`;
  }

  turnSummary(): string {
    if (this.turnTasks.length <= 1) {
      return '';
    }
    return `共 ${this.turnTasks.length} 轮`;
  }

  isExpanded(key: string): boolean {
    return this.expandedKeys.indexOf(key) >= 0;
  }

  toggleExpanded(key: string): void {
    if (this.isExpanded(key)) {
      this.expandedKeys = this.expandedKeys.filter((item: string): boolean => item !== key);
      return;
    }
    this.expandedKeys = this.expandedKeys.concat([key]);
  }

  lineBorderColor(line: ZhlConsoleLine): string {
    if (line.lineKind === 'assistant') {
      return zhlAlpha(ZHL_ACCENT, 0.30);
    }
    if (line.lineKind === 'waiting') {
      return zhlAlpha(ZHL_WARN, 0.45);
    }
    if (line.lineKind === 'tool') {
      return ZHL_LINE;
    }
    return 'rgba(0,0,0,0)';
  }

  lineBackground(line: ZhlConsoleLine): string {
    if (line.lineKind === 'assistant') {
      return zhlAlpha(ZHL_ACCENT, 0.05);
    }
    if (line.lineKind === 'waiting') {
      return zhlAlpha(ZHL_WARN, 0.08);
    }
    return 'rgba(0,0,0,0)';
  }

  lineTextColor(line: ZhlConsoleLine): string {
    if (line.lineKind === 'assistant') {
      return ZHL_TEXT;
    }
    if (line.lineKind === 'reasoning') {
      return ZHL_FAINT;
    }
    if (line.lineKind === 'waiting') {
      return ZHL_WARN;
    }
    if (line.lineKind === 'user') {
      return ZHL_ACCENT;
    }
    return ZHL_CONSOLE_TEXT;
  }

  reasoningLabel(line: ZhlConsoleLine): string {
    if (this.isExpanded(line.lineKey)) {
      return line.lineText;
    }
    return '思考过程（点击展开）';
  }

  toolLineText(line: ZhlConsoleLine): string {
    const phaseText: string = zhlToolPhaseText(line.lineToolPhase);
    if (line.lineToolPhase === 'result' && line.lineSummary.length > 0) {
      return `工具：${line.lineToolName}（${phaseText}）：${line.lineSummary}`;
    }
    if (line.lineToolPhase === 'permission_resolved' && line.lineSummary.length > 0) {
      return `工具：${line.lineToolName}（${phaseText}）：${line.lineSummary}`;
    }
    return `工具：${line.lineToolName}（${phaseText}）`;
  }

  build() {
    NavDestination() {
      Column() {
        Row({ space: 12 }) {
          Column() {
            ZhlStatusBanner({
              bannerColor: this.statusBannerColor(),
              bannerText: this.statusBannerText(),
            })
          }
          .layoutWeight(1)

          Column({ space: 2 }) {
            Text(this.elapsedLabel())
              .fontSize(12)
              .fontColor(ZHL_FAINT)
            if (this.turnSummary().length > 0) {
              Text(this.turnSummary())
                .fontSize(12)
                .fontColor(ZHL_FAINT)
            }
          }

          Row({ space: 6 }) {
            Text('自动跟随')
              .fontSize(12)
              .fontColor(ZHL_DIM)
            Toggle({ type: ToggleType.Switch, isOn: this.autoFollow })
              .selectedColor(ZHL_ACCENT)
              .onChange((isOn: boolean) => {
                this.autoFollow = isOn;
                if (isOn) {
                  this.autoScroll();
                }
              })
          }
        }
        .width('100%')
        .alignItems(VerticalAlign.Center)
        .padding({ top: 8, bottom: 8 })

        if (zhlTaskIsTerminal(this.taskStatus) && this.exitNote.length > 0) {
          Column() {
            ZhlStatusBanner({ bannerColor: ZHL_DOWN, bannerText: this.exitNote })
          }
          .width('100%')
          .margin({ bottom: 8 })
        }

        if (this.loading) {
          Column({ space: 10 }) {
            ZhlSkeletonBar({ barWidth: '80%' })
            ZhlSkeletonBar({ barWidth: '60%' })
            ZhlSkeletonBar({ barWidth: '90%' })
          }
          .width('100%')
          .padding(ZHL_CARD_PAD)
        } else {
          List({ space: 8, scroller: this.consoleScroller }) {
            ForEach(this.consoleLines, (consoleLine: ZhlConsoleLine) => {
              ListItem() {
                Row({ space: 8 }) {
                  Text(String(consoleLine.lineSeq))
                    .fontSize(11)
                    .fontColor(ZHL_FAINT)
                    .fontFamily('monospace')
                    .width(40)
                    .textAlign(TextAlign.End)

                  Text(zhlClockText(consoleLine.lineTs))
                    .fontSize(11)
                    .fontColor(zhlAlpha(ZHL_FAINT, 0.7))
                    .fontFamily('monospace')
                    .width(56)

                  Column({ space: 4 }) {
                    if (consoleLine.lineKind === 'tool') {
                      Text(this.toolLineText(consoleLine))
                        .fontSize(12)
                        .fontColor(ZHL_CONSOLE_TEXT)
                        .fontFamily('monospace')
                        .width('100%')
                    } else if (consoleLine.lineKind === 'reasoning') {
                      Text(this.reasoningLabel(consoleLine))
                        .fontSize(12)
                        .fontColor(ZHL_FAINT)
                        .fontFamily('monospace')
                        .lineHeight(18)
                        .width('100%')
                        .onClick(() => {
                          this.toggleExpanded(consoleLine.lineKey);
                        })
                    } else {
                      Text(consoleLine.lineText)
                        .fontSize(13)
                        .fontColor(this.lineTextColor(consoleLine))
                        .fontFamily('monospace')
                        .lineHeight(19)
                        .width('100%')
                    }
                  }
                  .layoutWeight(1)
                  .alignItems(HorizontalAlign.Start)
                  .padding({
                    left: 10,
                    right: 10,
                    top: consoleLine.lineKind === 'tool' ? 4 : 8,
                    bottom: consoleLine.lineKind === 'tool' ? 4 : 8,
                  })
                  .backgroundColor(this.lineBackground(consoleLine))
                  .border({ width: 1, color: this.lineBorderColor(consoleLine) })
                  .borderRadius(8)
                }
                .width('100%')
                .alignItems(VerticalAlign.Top)
                .transition(
                  TransitionEffect.OPACITY
                    .combine(TransitionEffect.translate({ y: 6 }))
                    .animation({ duration: ZHL_MS_LINE, curve: Curve.FastOutSlowIn })
                )
              }
            }, (consoleLine: ZhlConsoleLine) => consoleLine.lineKey)
          }
          .width('100%')
          .layoutWeight(1)
          .scrollBar(BarState.Off)
        }

        if (this.errText.length > 0) {
          Text(this.errText)
            .fontSize(12)
            .fontColor(ZHL_DOWN)
            .width('100%')
            .margin({ top: 6 })
        }

        Row({ space: 8 }) {
          TextInput({ placeholder: '继续这个线程…', text: this.replyText })
            .placeholderColor(ZHL_FAINT)
            .fontColor(ZHL_TEXT)
            .fontSize(14)
            .backgroundColor(ZHL_PANEL)
            .borderRadius(12)
            .border({ width: 1, color: ZHL_LINE })
            .height(44)
            .layoutWeight(1)
            .onChange((value: string) => {
              this.replyText = value;
            })

          Button() {
            Text(this.replyBusyLabel())
              .fontSize(14)
              .fontColor(ZHL_ACCENT)
          }
          .height(44)
          .backgroundColor(Color.Transparent)
          .border({ width: 1, color: zhlAlpha(ZHL_ACCENT, 0.45) })
          .borderRadius(12)
          .enabled(this.replyEnabled())
          .onClick(() => {
            this.doReply();
          })
        }
        .width('100%')
        .alignItems(VerticalAlign.Center)
        .padding({ top: 8, bottom: 8 })
      }
      .width('100%')
      .height('100%')
      .padding({ left: 12, right: 12 })
      .backgroundColor(ZHL_CONSOLE_BG)
    }
    .hideTitleBar(true)
    .backgroundColor(ZHL_CONSOLE_BG)
    .onShown(() => {
      this.polling = true;
      if (!this.loading) {
        this.pollOnce();
      }
    })
    .onHidden(() => {
      this.polling = false;
    })
    .onReady((context: NavDestinationContext) => {
      const raw: Object = context.pathInfo.param as Object;
      const param: ZhlTaskOutputParam = raw as ZhlTaskOutputParam;
      this.consoleDeviceId = param.deviceId;
      this.consoleTaskId = param.taskId;
      this.consoleDeviceName = param.deviceName;
    })
  }

  replyBusyLabel(): string {
    if (this.replying) {
      return '发送中…';
    }
    return '继续';
  }

  replyEnabled(): boolean {
    return this.replyText.trim().length > 0 && !this.replying;
  }
}