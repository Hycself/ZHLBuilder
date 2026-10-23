import { ZHL_ACCENT, ZHL_DOWN, ZHL_FAINT, ZHL_OK, ZHL_WARN } from './Theme';

/**
 * 文案与时间格式化。
 *
 * 状态、阶段、模式的中文名逐条来自服务端契约（规格 §七 / §七之二）：
 *  - 任务状态 0 排队 1 执行 2 完成 3 失败 4 停止
 *  - stage：queued running thinking tool waiting_input done failed stopped
 *  - mode：build 变更前确认 / edit 自动编辑 / plan 计划模式 / yolo 完全访问
 */

export function zhlTaskStatusText(status: number): string {
  if (status === 0) {
    return '排队';
  }
  if (status === 1) {
    return '执行中';
  }
  if (status === 2) {
    return '完成';
  }
  if (status === 3) {
    return '失败';
  }
  if (status === 4) {
    return '停止';
  }
  return '未知';
}

/** 统一状态横幅四色：在线/任务完成→绿，进行中→青，失败→红，排队→黄 */
export function zhlTaskStatusColor(status: number): string {
  if (status === 0) {
    return ZHL_WARN;
  }
  if (status === 1) {
    return ZHL_ACCENT;
  }
  if (status === 2) {
    return ZHL_OK;
  }
  if (status === 3) {
    return ZHL_DOWN;
  }
  return ZHL_FAINT;
}

/** 任务进入终态（2 完成 / 3 失败 / 4 停止）后不再轮询 */
export function zhlTaskIsTerminal(status: number): boolean {
  return status === 2 || status === 3 || status === 4;
}

export function zhlStageText(stage: string): string {
  if (stage === 'queued') {
    return '排队中';
  }
  if (stage === 'running') {
    return '执行中';
  }
  if (stage === 'thinking') {
    return '正在思考';
  }
  if (stage === 'tool') {
    return '调用工具';
  }
  if (stage === 'waiting_input') {
    return '等待回应';
  }
  if (stage === 'done') {
    return '已完成';
  }
  if (stage === 'failed') {
    return '失败';
  }
  if (stage === 'stopped') {
    return '已停止';
  }
  return stage;
}

/** agentState 短标签（设备卡/详情卡用） */
export function zhlAgentStateText(agentState: string): string {
  if (agentState === 'running') {
    return '代理已连接';
  }
  if (agentState === 'not_started') {
    return '代理未启动';
  }
  if (agentState === 'offline') {
    return '代理已断开';
  }
  return '状态未知';
}

/**
 * agentState 提示语。
 * 规格 §七之二 第 5 条：not_started 与 offline 文案必须不同——
 * 前者引导去桌面端启动代理，后者说明是设备侧连接问题，不许编造更细原因。
 */
export function zhlAgentStateHint(agentState: string): string {
  if (agentState === 'not_started') {
    return '这台设备从未启动过设备代理：请在桌面端 ZHLBuilder 打开「远控面板」点「启动设备代理」。';
  }
  if (agentState === 'offline') {
    return '设备代理已断开（电脑关机、断网或桌面端已退出），属于设备侧连接问题。';
  }
  return '';
}

export function zhlPlatformText(platform: string): string {
  if (platform === 'win32') {
    return 'Windows';
  }
  if (platform === 'darwin') {
    return 'macOS';
  }
  if (platform === 'linux') {
    return 'Linux';
  }
  return platform;
}

export function zhlModeText(mode: string): string {
  if (mode === 'build') {
    return '变更前确认';
  }
  if (mode === 'edit') {
    return '自动编辑';
  }
  if (mode === 'plan') {
    return '计划模式';
  }
  if (mode === 'yolo') {
    return '完全访问';
  }
  return mode;
}

/**
 * 后端时间 → epoch 毫秒。
 * 兼容 ISO 字符串（Spring Boot 默认序列化）与数字时间戳（秒或毫秒）；认不出返回 0。
 */
export function zhlParseTime(value: Object | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const text: string = String(value);
  if (text.length === 0) {
    return 0;
  }
  const seconds: number = Number(text);
  if (!Number.isNaN(seconds) && seconds > 0) {
    if (seconds < 100000000000) {
      return seconds * 1000;
    }
    return seconds;
  }
  const parsed: number = Date.parse(text);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前；时间不可用返回空串 */
export function zhlRelativeTime(ts: number): string {
  if (ts <= 0) {
    return '';
  }
  const diff: number = Date.now() - ts;
  if (diff < 60000) {
    return '刚刚';
  }
  const minutes: number = Math.floor(diff / 60000);
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours: number = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  const days: number = Math.floor(hours / 24);
  return `${days} 天前`;
}

function zhlPad2(n: number): string {
  if (n < 10) {
    return `0${n}`;
  }
  return String(n);
}

/** 控制台行首的时刻（HH:mm:ss） */
export function zhlClockText(ts: number): string {
  if (ts <= 0) {
    return '';
  }
  const d: Date = new Date(ts);
  return `${zhlPad2(d.getHours())}:${zhlPad2(d.getMinutes())}:${zhlPad2(d.getSeconds())}`;
}

/** 任务耗时：首末时间可用时给「N 分 N 秒」，否则给占位符（不编造） */
export function zhlFormatDuration(startTs: number, endTs: number): string {
  if (startTs <= 0 || endTs <= 0 || endTs < startTs) {
    return '—';
  }
  return zhlFormatElapsed(endTs - startTs);
}

export function zhlFormatElapsed(ms: number): string {
  if (ms < 1000) {
    return '1 秒内';
  }
  const totalSec: number = Math.floor(ms / 1000);
  if (totalSec < 60) {
    return `${totalSec} 秒`;
  }
  const minutes: number = Math.floor(totalSec / 60);
  const seconds: number = totalSec % 60;
  if (minutes < 60) {
    return `${minutes} 分 ${seconds} 秒`;
  }
  const hours: number = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

/** 事件类型中文名；不认识的类型按纯文本降级（规格 §七之二 第 1 条） */
export function zhlEventTypeText(eventType: string): string {
  if (eventType === 'assistant_text') {
    return '助手';
  }
  if (eventType === 'reasoning') {
    return '思考';
  }
  if (eventType === 'tool_call') {
    return '工具';
  }
  if (eventType === 'waiting_input') {
    return '等待回应';
  }
  return '文本';
}

/** 后端时间 → 「YYYY-MM-DD HH:mm」（本地时区）；不可用时返回空串 */
export function zhlFormatDateTime(value: Object | undefined): string {
  const ts: number = zhlParseTime(value);
  if (ts <= 0) {
    return '';
  }
  const d: Date = new Date(ts);
  return `${d.getFullYear()}-${zhlPad2(d.getMonth() + 1)}-${zhlPad2(d.getDate())} ` +
    `${zhlPad2(d.getHours())}:${zhlPad2(d.getMinutes())}`;
}