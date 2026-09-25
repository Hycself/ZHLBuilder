import { BrowserWindow, app, ipcMain, net } from "electron";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolveBundledGlmBinaryPath } from "./desktopRuntimeEnv.js";

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

const require2 = createRequire("F:/dispatch111/zhl-builder/package.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require2("qrcode");

const SERVER = "https://dis.zhl.asia";
const WS_URL = "wss://dis.zhl.asia/api/builder/ws";

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
}

const state: {
  identity: DeviceIdentity | null;
  runtime: AgentRuntime | null;
  online: boolean;
} = { identity: null, runtime: null, online: false };

const deviceFile = () => join(app.getPath("home"), ".zhlbuilder", "cli", "device.json");

function loadIdentity(): DeviceIdentity | null {
  if (state.identity) return state.identity;
  const p = deviceFile();
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as DeviceIdentity;
    if (raw.deviceToken) {
      state.identity = raw;
      return raw;
    }
  } catch { /* 损坏则重新配对 */ }
  return null;
}

function saveIdentity(identity: DeviceIdentity): void {
  state.identity = identity;
  const p = deviceFile();
  writeFileSync(p, JSON.stringify(identity, null, 2), "utf8");
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

let statusListener: ((state: ZhlDeviceState) => void) | null = null;

function emit(statePatch: ZhlDeviceState): void {
  Object.assign(state, statePatch);
  statusListener?.(getPublicState());
}

export function getPublicState(): ZhlDeviceState {
  return {
    phase: state.runtime ? "online" : state.identity?.deviceToken ? "bound" : state.phase,
    online: state.online,
    message: state.message,
    pairCode: state.phase === "pairing" ? state.pairCode : undefined,
    qrDataUrl: state.phase === "pairing" ? state.qrDataUrl : undefined,
  };
}

export function registerZhlDeviceIpc(getWin: () => BrowserWindow | null): void {
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
        meta: JSON.stringify({ host: require2("node:os").hostname(), source: "desktop" }),
      }),
    });
    const data = (await resp.json()) as { code?: number; message?: string; data?: { deviceId: number; pairCode: string; expireMinutes: number } };
    if (data.code !== 20000 || !data.data) {
      throw new Error(data.message ?? `HTTP ${resp.status}`);
    }
    const qrPayload = JSON.stringify({ app: "zhlbuilder", server: SERVER, pairCode: data.data.pairCode });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 360, margin: 1 });
    emit({ phase: "pairing", pairCode: data.data.pairCode, qrDataUrl, message: "等待手机端扫码…" });
    void pollAttach(deviceUid, data.data.pairCode);
    return { bound: false as const, pairCode: data.data.pairCode, qrDataUrl, expireMinutes: data.data.expireMinutes };
  });

  ipcMain.handle("zhl:device:agent-start", async () => {
    const identity = loadIdentity();
    if (!identity?.deviceToken) {
      throw new Error("设备未绑定");
    }
    await startAgentLoop(identity, getWin());
    return getPublicState();
  });

  statusListener = (s) => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send("zhl:device:state", s);
    }
  };
}

async function pollAttach(deviceUid: string, pairCode: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (state.phase !== "pairing") return; // 用户关闭等
    try {
      const resp = await net.fetch(`${SERVER}/api/builder/device/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceUid, pairCode }),
      });
      const data = (await resp.json()) as { code?: number; message?: string; data?: { deviceId: number; deviceToken: string } };
      if (data.code === 20000 && data.data?.deviceToken) {
        saveIdentity({
          server: SERVER,
          deviceId: data.data.deviceId,
          deviceUid,
          deviceToken: data.data.deviceToken,
          name: state.identity?.name ?? `ZHLBuilder@${require2("node:os").hostname()}`,
        });
        emit({ phase: "bound", message: "绑定完成，设备令牌已保存" });
        await startAgentLoop(state.identity!, () => undefined);
        return;
      }
    } catch { /* 手机端尚未认领，继续等 */ }
  }
}

function loadOrCreateDeviceUid(): string {
  const p = deviceFile();
  if (existsSync(p)) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf8")) as { deviceUid?: string };
      if (raw.deviceUid) return raw.deviceUid;
    } catch { /* 重新生成 */ }
  }
  const uid = randomBytes(16).toString("hex");
  // uid 单独暂存：attach 前身份尚未完整
  const dir = join(app.getPath("home"), ".zhlbuilder", "cli");
  writeFileSync(p, JSON.stringify({ ...(existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {}), deviceUid: uid }), "utf8");
  void dir;
  return uid;
}

async function startAgentLoop(state0: DeviceIdentity, _win: BrowserWindow | null): Promise<void> {
  if (state.runtime) return; // 已在运行
  const wsUrl = `${state0.server.replace(/^http/, "ws")}/api/builder/ws?token=${state0.deviceToken}`;
  const runtime: AgentRuntime = { ws: null, heartbeat: null, tasks: new Map() };
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
      ws.onopen = () => {
        opened = true;
        ws.send(JSON.stringify({ type: "heartbeat" }));
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
        if (!opened) rejectWs(new Error("连接失败"));
        else if (state.runtime === runtime) {
          setTimeout(() => void connect().catch(() => undefined), 10_000);
        }
      };
      ws.onerror = () => {
        if (!opened) rejectWs(new Error("连接错误"));
      };
      runtime.ws = ws;
    });

  const handleCommand = (msg: Record<string, unknown>): void => {
    const type = String(msg.type ?? "");
    if (type === "task.start") {
      const taskId = Number(msg.taskId);
      const prompt = String(msg.prompt ?? "");
      const cwd = typeof msg.cwd === "string" && msg.cwd ? msg.cwd : process.cwd();
      runTask(taskId, prompt, cwd, runtime);
    } else if (type === "task.stop") {
      const t = runtime.tasks.get(Number(msg.taskId));
      t?.child?.kill();
    }
  };

  const out = (taskId: number, chunk: string): void => {
    for (const line of chunk.replace(/\r/g, "").split("\n")) {
      if (line) send({ type: "task.output", taskId, lines: [line] });
    }
  };

  const runTask = (taskId: number, prompt: string, cwd: string, rt: AgentRuntime): void => {
    send({ type: "task.status", taskId, status: 1 });
    // 用随包 agent（--prompt 模式）执行任务；找不到随包入口时回退本机 node + zhlbuilder.cjs
    const agentEntry = resolveBundledGlmBinaryPath();
    let child: import("node:child_process").ChildProcess;
    if (agentEntry) {
      const { spawn } = require2("node:child_process") as typeof import("node:child_process");
      child = spawn(process.execPath, [agentEntry, "--prompt", prompt], { cwd, env: process.env });
    } else {
      child = spawn(process.execPath, ["-e", "console.error('agent entry missing')"], { cwd });
    }
    rt.tasks.set(taskId, { child });
    child.stdout?.on("data", (c: Buffer) => out(taskId, c.toString("utf8")));
    child.stderr?.on("data", (c: Buffer) => out(taskId, c.toString("utf8")));
    child.on("close", (code) => {
      rt.tasks.delete(taskId);
      send({
        type: "task.status",
        taskId,
        status: code === 0 ? 2 : code === null ? 4 : 3,
        exitNote: `exit code ${code}`,
      });
    });
  };

  await connect();
  runtime.heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);
  emit({ phase: "online", online: true });
}
