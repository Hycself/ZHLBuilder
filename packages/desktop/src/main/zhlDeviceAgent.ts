import { BrowserWindow, app, ipcMain, net } from "electron";
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";
import { agentCapabilitiesPayload, runZhlTask } from "./zhlDeviceTaskRunner.js";

/**
 * ZHLBuilder 设备代理（桌面端）：
 *  - 生成配对码（/api/builder/device/register），弹窗二维码由手机 App 扫描；
 *  - 手机认领并设置 6 位 PIN 后轮询 attach 换取 device_token；
 *  - 之后建立 WS 长连（wss://dis.zhl.asia/api/builder/ws），心跳保活，
 *    接收 task.start 并以随包 agent（--prompt 模式）执行、流式回传输出。
 *
 * device.json 与 CLI 的 `zhlbuilder device` 共用同一份（~/.zhlbuilder/cli/device.json），
 * 桌面端与 CLI 任一入口配对/启动均可。
 */

const SERVER = "https://dis.zhl.asia";

interface DeviceIdentity {
  server: string;
  deviceId: number;
  deviceUid: string;
  deviceToken: string;
  name: string;
}

interface AgentRuntime {
  ws: WebSocket | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  tasks: Map<number, { child: import("node:child_process").ChildProcess | null }>;
  /** 连续重连失败次数。超过上限就落到 error，不再无声重试 */
  reconnectFailures: number;
  stopped: boolean;
}

/** 重连上限：超过就明确报错让用户重启代理，而不是永远挂着"在线" */
const MAX_RECONNECT_FAILURES = 5;
const RECONNECT_DELAY_MS = 10_000;
/** 连接活过这么久才算稳定，可以清零重连失败计数（心跳 15s 一次，这里取一个多周期） */
const STABLE_CONNECTION_MS = 20_000;

const state: {
  identity: DeviceIdentity | null;
  runtime: AgentRuntime | null;
  online: boolean;
  phase: ZhlDeviceState["phase"];
  message?: string;
  pairCode?: string;
  qrDataUrl?: string;
} = { identity: null, runtime: null, online: false, phase: "idle" };

const deviceFile = () => join(app.getPath("home"), ".zhlbuilder", "cli", "device.json");

/**
 * 读身份文件。损坏一律当作"没有身份"而不是抛错：
 * 之前 loadOrCreateDeviceUid 里有一次解析不在 try 内，文件只要被写成半截 JSON，
 * 点「生成配对码」就抛异常、再点再抛，配对入口整个砖死。
 */
function readDeviceFile(): Record<string, unknown> {
  try {
    const p = deviceFile();
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 写身份文件：先建目录，再临时文件 + rename。
 * 目录未必存在——桌面代理可能比 CLI 先跑，~/.zhlbuilder/cli 还没被创建过；
 * 直接 writeFileSync 被中断就留下半截 JSON，而这个文件一旦损坏就再也读不回来。
 */
function writeDeviceFile(data: Record<string, unknown>): void {
  const p = deviceFile();
  mkdirSync(join(p, ".."), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, p);
}

function loadIdentity(): DeviceIdentity | null {
  if (state.identity) return state.identity;
  const raw = readDeviceFile() as Partial<DeviceIdentity>;
  if (raw.deviceToken && raw.deviceUid && raw.server) {
    const identity: DeviceIdentity = {
      server: raw.server,
      deviceId: Number(raw.deviceId ?? 0),
      deviceUid: raw.deviceUid,
      deviceToken: raw.deviceToken,
      name: raw.name ?? `ZHLBuilder@${hostname()}`,
    };
    state.identity = identity;
    return identity;
  }
  return null;
}

function saveIdentity(identity: DeviceIdentity): void {
  state.identity = identity;
  writeDeviceFile(identity as unknown as Record<string, unknown>);
}

function genDeviceUid(): string {
  return randomBytes(16).toString("hex");
}

export type ZhlDeviceState = {
  phase: "idle" | "pairing" | "online" | "bound" | "error";
  pairCode?: string;
  qrDataUrl?: string;
  message?: string;
  online?: boolean;
  username?: string;
};

let winProvider: (() => BrowserWindow | null) | null = null;

/**
 * 状态推给"当前活着的主窗口"。
 *
 * 之前是把第一个窗口的闭包固定下来的，而 macOS 关窗不退出进程：窗口关掉再打开，
 * 拿到的是新 BrowserWindow，旧的已 isDestroyed，设备状态推送就永远发不到界面上。
 */
export function setZhlDeviceStateWindow(provider: () => BrowserWindow | null): void {
  winProvider = provider;
}

/** 允许只更新部分字段：断线时只想标 online=false，不该被迫重报 phase */
function emit(statePatch: Partial<ZhlDeviceState>): void {
  Object.assign(state, statePatch);
  const win = winProvider?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send("zhl:device:state", getPublicState());
  }
}

/**
 * 在线判定必须以真实 socket 状态为准。
 *
 * 原实现用 `state.runtime ? "online"` 判断，而 runtime 在 socket 还没连上之前
 * 就被赋值、断开后也不清空，于是：点「启动设备代理」的瞬间就显示在线；令牌被
 * 手机端解绑后握手被拒、重连一直失败，界面仍永远挂着"在线"——而中枢的在线表里
 * 根本没有这台设备，手机端读到的就是离线。两边各说各话就是这么来的。
 */
function isSocketOpen(): boolean {
  const ws = state.runtime?.ws;
  return !!ws && ws.readyState === WebSocket.OPEN;
}

export function getPublicState(): ZhlDeviceState {
  const connected = isSocketOpen();
  const hasToken = !!state.identity?.deviceToken;
  const phase: ZhlDeviceState["phase"] =
    state.phase === "pairing" && state.qrDataUrl
      ? "pairing"
      : connected
        ? "online"
        : state.phase === "error"
          ? "error"
          : hasToken
            ? "bound"
            : "idle";
  return {
    phase,
    online: connected,
    message: state.message,
    pairCode: phase === "pairing" ? state.pairCode : undefined,
    qrDataUrl: phase === "pairing" ? state.qrDataUrl : undefined,
  };
}

export function registerZhlDeviceIpc(): void {
  ipcMain.handle("zhl:device:state", () => getPublicState());

  ipcMain.handle("zhl:device:pair-qr", async () => {
    const identity = loadIdentity();
    if (identity?.deviceToken) {
      emit({ phase: "bound", message: "设备已绑定" });
      return { bound: true as const };
    }
    const deviceUid = loadOrCreateDeviceUid();
    const resp = await net.fetch(`${SERVER}/api/builder/device/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceUid,
        name: `ZHLBuilder@${app.getName()}`,
        platform: process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux",
        agentVersion: app.getVersion(),
        meta: JSON.stringify({ host: hostname(), source: "desktop" }),
      }),
    });
    const data = (await resp.json()) as { code?: number; message?: string; data?: { deviceId: number; pairCode: string; expireMinutes: number } };
    if (data.code !== 20000 || !data.data) {
      throw new Error(data.message ?? `HTTP ${resp.status}`);
    }
    const qrPayload = JSON.stringify({ app: "zhlbuilder", server: SERVER, pairCode: data.data.pairCode });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 360, margin: 1 });
    emit({ phase: "pairing", pairCode: data.data.pairCode, qrDataUrl, message: "等待手机端扫码…" });
    void pollAttach(deviceUid, data.data.pairCode, data.data.expireMinutes ?? 5);
    return { bound: false as const, pairCode: data.data.pairCode, qrDataUrl, expireMinutes: data.data.expireMinutes };
  });

  ipcMain.handle("zhl:device:agent-start", async () => {
    const identity = loadIdentity();
    if (!identity?.deviceToken) {
      throw new Error("设备未绑定");
    }
    await startAgentLoop(identity);
    return getPublicState();
  });

  /**
   * 本机解除绑定。
   *
   * 为什么必须有一台侧入口：手机端解绑时中枢是 delete 掉设备行的，桌面端本地
   * device.json 里的 deviceToken 就成了孤儿令牌——WS 握手被拒，而 pair-qr 又是
   * "见本地有 token 就直接返回已绑定"，于是既连不上也重新配不了，只能手动删文件。
   * 这里清 token 但保留 deviceUid，让 register 复用中枢那一行的语义保持不变。
   */
  ipcMain.handle("zhl:device:unpair", async () => {
    if (state.runtime) stopRuntime(state.runtime);
    const deviceUid = readDeviceFile().deviceUid;
    writeDeviceFile({
      deviceUid: typeof deviceUid === "string" && deviceUid ? deviceUid : genDeviceUid(),
    });
    state.identity = null;
    emit({ phase: "idle", online: false, message: "已解除本机绑定" });
    return getPublicState();
  });

}

/**
 * 轮询 attach 直到手机端完成认领。
 *
 * try 只包住网络这一步。之前它包住了整个循环体，于是 saveIdentity 写盘失败、
 * startAgentLoop 连不上中枢，全都被当成"手机端还没扫码"静默吞掉，界面就一直停在
 * "等待手机端扫码…"；轮到 60 次跑完也没有任何过期提示，尽管中枢已经把 expireMinutes 发过来了。
 */
async function pollAttach(deviceUid: string, pairCode: string, expireMinutes: number): Promise<void> {
  const rounds = Math.max(1, Math.round((expireMinutes * 60_000) / 5000));
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (state.phase !== "pairing") return; // 用户关闭等
    let granted: { deviceId: number; deviceToken: string } | undefined;
    try {
      const resp = await net.fetch(`${SERVER}/api/builder/device/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceUid, pairCode }),
      });
      const data = (await resp.json()) as { code?: number; data?: { deviceId: number; deviceToken: string } };
      if (data.code === 20000 && data.data?.deviceToken) granted = data.data;
    } catch {
      continue; // 只有请求本身失败才算"还没认领成"，下一轮再试
    }
    if (!granted) continue;
    try {
      saveIdentity({
        server: SERVER,
        deviceId: granted.deviceId,
        deviceUid,
        deviceToken: granted.deviceToken,
        name: state.identity?.name ?? `ZHLBuilder@${hostname()}`,
      });
    } catch (e) {
      emit({ phase: "error", message: `设备令牌保存失败：${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    emit({ phase: "bound", message: "绑定完成，设备令牌已保存" });
    // startAgentLoop 自己会把 phase 打到 error 并给出可读提示，这里不再往外抛
    await startAgentLoop(state.identity!).catch(() => undefined);
    return;
  }
  emit({ phase: "idle", online: false, message: "配对码已过期，请重新生成二维码" });
}

function loadOrCreateDeviceUid(): string {
  const existing = readDeviceFile().deviceUid;
  // 按中枢的合法格式校验后再复用：一个损坏/来历不明的 uid 只会让 register 直接被拒
  if (typeof existing === "string" && /^[0-9a-f]{16,64}$/.test(existing)) return existing;
  const uid = genDeviceUid();
  // uid 单独暂存：attach 前身份尚未完整
  writeDeviceFile({ ...readDeviceFile(), deviceUid: uid });
  return uid;
}

async function startAgentLoop(state0: DeviceIdentity): Promise<void> {
  if (state.runtime && !state.runtime.stopped) return; // 已在运行
  const wsUrl = `${state0.server.replace(/^http/, "ws")}/api/builder/ws?token=${state0.deviceToken}`;
  const runtime: AgentRuntime = {
    ws: null,
    heartbeat: null,
    tasks: new Map(),
    reconnectFailures: 0,
    stopped: false,
  };
  state.runtime = runtime;

  const send = (obj: unknown): void => {
    if (runtime.ws && runtime.ws.readyState === WebSocket.OPEN) {
      runtime.ws.send(JSON.stringify(obj));
    }
  };

  const connect = (): Promise<void> =>
    new Promise((resolveWs, rejectWs) => {
      const ws = new WebSocket(wsUrl);
      let opened = false;
      let openedAt = 0;
      ws.onopen = () => {
        opened = true;
        openedAt = Date.now();
        ws.send(JSON.stringify({ type: "heartbeat" }));
        // 能力快照：中枢靠它区分"代理从没启动过"与"设备离线"，手机端靠它摆模型 chip
        ws.send(JSON.stringify({
          type: "agent.hello",
          capabilities: agentCapabilitiesPayload(),
        }));
        resolveWs();
      };
      ws.onmessage = (ev) => {
        try {
          handleCommand(JSON.parse(String(ev.data)));
        } catch (e) {
          console.warn("[zhl-device] 消息处理失败", e);
        }
      };
      ws.onclose = () => {
        if (runtime.stopped) return;
        // 断开必须立刻把状态打回 bound：否则界面会停在"在线"，
        // 而中枢已经把这台设备从在线表里摘掉，两端说法相反。
        emit({ online: false, message: "与中枢断开，正在重连…" });
        // 只有活过一整个心跳周期的连接才算"真连上了"，才清零失败计数。
        // 在 onopen 里清零的话，中枢"接受握手又立刻关闭"这种循环每轮都复位，
        // 上限永远够不着，界面就一直挂着正在重连。
        if (opened && Date.now() - openedAt >= STABLE_CONNECTION_MS) {
          runtime.reconnectFailures = 0;
        }
        if (!opened) {
          rejectWs(new Error("连接失败"));
          return;
        }
        scheduleReconnect(runtime, connect);
      };
      ws.onerror = () => {
        if (!opened) rejectWs(new Error("连接错误"));
      };
      runtime.ws = ws;
    });

  const handleCommand = (msg: Record<string, unknown>): void => {
    // 已经停掉的 runtime 不能再收命令：解绑后残留在队列里的一条 task.start
    // 会往已经被 clear 的 tasks 表里塞进一个没人能 kill 的子进程。
    if (runtime.stopped) return;
    const type = String(msg.type ?? "");
    if (type === "task.start") {
      const taskId = Number(msg.taskId);
      const prompt = String(msg.prompt ?? "");
      const cwd = typeof msg.cwd === "string" && msg.cwd ? msg.cwd : process.cwd();
      const mode = typeof msg.mode === "string" ? msg.mode : undefined;
      const model = typeof msg.model === "string" && msg.model ? msg.model : undefined;
      const resumeSession = typeof msg.resumeSession === "string" ? msg.resumeSession : undefined;
      runTask(taskId, prompt, cwd, mode, model, resumeSession);
    } else if (type === "task.stop") {
      const t = runtime.tasks.get(Number(msg.taskId));
      t?.child?.kill();
    }
  };

  const runTask = (
    taskId: number,
    prompt: string,
    cwd: string,
    mode?: string,
    model?: string,
    resumeSession?: string,
  ): void => {
    // 同一个 taskId 再来一次就忽略：覆盖 map 条目后，前一个子进程的 close 会把
    // 共享的 key 删掉，正在跑的那个就再也 kill 不掉了。
    if (runtime.tasks.has(taskId)) return;
    const child = runZhlTask({ taskId, prompt, cwd, mode, model, resumeSession, send });
    if (!child) return; // 执行器已就地回报失败
    runtime.tasks.set(taskId, { child });
    child.on("close", () => runtime.tasks.delete(taskId));
  };

  try {
    await connect();
  } catch (e) {
    // 首次握手就失败（多半是令牌已被手机端解绑）：落到 error 并清掉 runtime，
    // 让界面回到可重试的状态，而不是挂着一个假的"在线"
    stopRuntime(runtime);
    emit({
      phase: "error",
      online: false,
      message: `无法连接中枢：${e instanceof Error ? e.message : String(e)}。若已在手机端解绑，请重新生成配对码。`,
    });
    throw e;
  }
  runtime.heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);
  emit({ phase: "online", online: true, message: undefined });
}

/** 带上限的重连：失败到阈值就停手并报错，避免无限静默重试 */
function scheduleReconnect(runtime: AgentRuntime, connect: () => Promise<void>): void {
  runtime.reconnectFailures += 1;
  if (runtime.reconnectFailures > MAX_RECONNECT_FAILURES) {
    stopRuntime(runtime);
    emit({
      phase: "error",
      online: false,
      message: `连续 ${MAX_RECONNECT_FAILURES} 次重连失败，已停止。请检查网络或重新配对。`,
    });
    return;
  }
  setTimeout(() => {
    if (runtime.stopped || state.runtime !== runtime) return;
    // connect() 在"这一趟始终没打开 socket"时是 reject 而不是走 onclose 的重连分支。
    // 之前这里 .catch(() => undefined) 把 reject 吞了，于是第一次重连没连上就再也不重连，
    // 而界面还停在 bound/"正在重连…"——静默断流就是这么来的。
    connect().catch(() => scheduleReconnect(runtime, connect));
  }, RECONNECT_DELAY_MS);
}

function stopRuntime(runtime: AgentRuntime): void {
  runtime.stopped = true;
  if (runtime.heartbeat) clearInterval(runtime.heartbeat);
  runtime.heartbeat = null;
  for (const { child } of runtime.tasks.values()) child?.kill();
  runtime.tasks.clear();
  const ws = runtime.ws;
  runtime.ws = null;
  // 回调必须一起摘掉：close() 之后服务端还可能送来一帧，而 onmessage 持着
  // handleCommand 的闭包，跑起来就是一个没人能停止的任务子进程。
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch { /* 已关闭 */ }
  }
  if (state.runtime === runtime) state.runtime = null;
}

/**
 * 应用退出时收掉设备代理。
 *
 * 之前 stopRuntime 在整个应用生命周期里没有任何调用点：既没有 agent-stop 的 IPC，
 * before-quit 也不管它。Electron 退出不会带走子进程，于是代理的 WS 和正在跑的 CLI
 * 子进程都活在应用之外——手机那边看着任务还在动，桌面端早就没了。
 */
export function stopZhlDeviceAgent(): void {
  if (state.runtime) stopRuntime(state.runtime);
}
