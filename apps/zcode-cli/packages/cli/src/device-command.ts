import { join } from "node:path";
import { homedir, hostname, platform as osPlatform } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import { ZHL_MODE_CHOICES } from "@zhlbuilder/shared/zhlTaskEvents";
import { runDeviceTask } from "./deviceTaskRunner.js";

/**
 * ZHLBuilder 设备端 agent（`zhlbuilder device pair|start|status`）。
 *
 * <p>设备是出站长连：WS 连到 ZHL 平台中枢（/api/builder/ws），手机端经中枢
 * 下发任务、回传输出。数据目录与上游 ZCode 隔离（~/.zhlbuilder/cli/device.json）。</p>
 *
 * <p>v0.1.0 任务执行器：以子进程方式运行本 CLI 的 --prompt 模式并逐行回传输出；
 * 后续版本可替换为 app-server 协议的进程内驱动（见 NOTICE 中的修改声明）。</p>
 */

interface DeviceState {
  server: string;
  deviceId: number;
  deviceUid: string;
  deviceToken?: string;
  name: string;
}

/** 重连：10 秒一趟，连续 5 次失败就退出，别让代理静默挂着"还在连" */
const RECONNECT_DELAY_MS = 10_000;
const MAX_RECONNECT_FAILURES = 5;
/** 连接活过这么久才算稳定，可以清零重连失败计数（心跳 15s 一次，取一个多周期） */
const STABLE_CONNECTION_MS = 20_000;

const statePath = (): string =>
  join(homedir(), ".zhlbuilder", "cli", "device.json");

const loadState = (): DeviceState | null => {
  const p = statePath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as DeviceState;
  } catch {
    return null;
  }
};

const saveState = (s: DeviceState): void => {
  const p = statePath();
  mkdirSync(join(homedir(), ".zhlbuilder", "cli"), { recursive: true });
  writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
};

const serverOf = (options: { server?: string }): string => {
  const fromFlag = typeof options.server === "string" ? options.server : undefined;
  const fromEnv = process.env.ZHLBUILDER_HUB_URL;
  return (fromFlag ?? fromEnv ?? "https://dis.zhl.asia").replace(/\/+$/, "");
};

const genDeviceUid = (): string => randomBytes(16).toString("hex");

const deviceName = (): string => `ZHLBuilder@${hostname()}`;

const platformName = (): string =>
  osPlatform() === "win32" ? "win32" : osPlatform() === "darwin" ? "darwin" : "linux";

type LocalModelRule = {
  providerId?: unknown;
  modelId?: unknown;
  config?: { enabled?: unknown };
};

/**
 * 本机可用模型目录：读用户在本机「设置 → 模型」写的个人配置
 * （provider_config.json 的 modelConfigRules），把智能规则与手动规则里声明的
 * 模型全部枚举出来。中枢无从得知这份目录，只能由 agent 连上后上报快照。
 *
 * 只上报 defaultModelSelection 的话列表永远是 0 或 1 项，手机端的选择控件等于
 * 没有（鸿蒙规格 v3.2 §3 的诚实规则就是据此写的）——这里给完整目录，手机端才有
 * 真正可选项。解析失败或没配过照样上报空列表：手机端隐藏选择控件，而不是摆一份
 * 静态假列表。
 */
const readLocalModels = (): Array<Record<string, unknown>> => {
  const p = join(homedir(), ".zhlbuilder", "v2", "provider_config.json");
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      config?: {
        defaultModelSelection?: { providerId?: string; modelId?: string };
        modelConfigRules?: {
          providerModelRules?: LocalModelRule[];
          manualProviderModelRules?: LocalModelRule[];
        };
      };
    };
    const config = raw.config;
    if (!config) return [];

    const sel = config.defaultModelSelection;
    const defaultId = sel?.modelId
      ? sel.providerId
        ? `${sel.providerId}/${sel.modelId}`
        : sel.modelId
      : undefined;

    const models: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const rule of [
      ...(config.modelConfigRules?.providerModelRules ?? []),
      ...(config.modelConfigRules?.manualProviderModelRules ?? []),
    ]) {
      const modelId = typeof rule?.modelId === "string" ? rule.modelId : "";
      if (!modelId) continue;
      // enabled:false 是用户在「设置 → 模型」里显式关掉的项，不摆给手机端选
      if (rule?.config?.enabled === false) continue;
      const providerId =
        typeof rule.providerId === "string" && rule.providerId ? rule.providerId : null;
      const id = providerId ? `${providerId}/${modelId}` : modelId;
      if (seen.has(id)) continue;
      seen.add(id);
      models.push({ id, name: modelId, provider: providerId, default: id === defaultId });
    }

    // 老配置可能只有 defaultModelSelection 而没有规则列表；此时退回原来的单项上报，
    // 不要把有默认模型的设备报成"没配过"。
    if (models.length === 0 && defaultId) {
      models.push({
        id: defaultId,
        name: sel?.modelId,
        provider: sel?.providerId ?? null,
        default: true,
      });
    }

    // 中枢对 capabilities 快照有长度上限（超限整段丢弃，设备会被误判成从没启动过），
    // 按序列化长度收敛，保证整包留在安全范围内。
    while (models.length > 1 && JSON.stringify(models).length > 6000) models.pop();
    return models;
  } catch {
    return [];
  }
};


async function postJson(server: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${server}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { code?: number; message?: string; data?: Record<string, unknown> };
  if (data.code !== 20000) {
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  return data.data ?? {};
}

/** `zhlbuilder device` 入口 */
export const runDeviceCommand = async (
  ctx: { stdout: { write(s: string): void }; stderr: { write(s: string): void } },
  options: { server?: string },
  args: string[],
): Promise<number> => {
  const sub = args[0] ?? "help";

  if (sub === "help") {
    ctx.stdout.write(
      [
        "用法: zhlbuilder device <子命令>",
        "",
        "子命令:",
        "  pair      注册设备并显示配对二维码（手机端 ZHLBuilder App 扫码绑定）",
        "  start     启动设备 agent（attach 后 WS 长连，接收任务并回传输出）",
        "  status    显示本机设备绑定状态",
        "",
        "选项:",
        "  --server <url>   中枢地址（默认 https://dis.zhl.asia，可用 ZHLBUILDER_HUB_URL 覆盖）",
        "",
      ].join("\n"),
    );
    return 0;
  }

  if (sub === "status") {
    const s = loadState();
    if (!s) {
      ctx.stdout.write("本机尚未绑定。运行 `zhlbuilder device pair` 开始配对。\n");
      return 0;
    }
    ctx.stdout.write(
      [
        `server:  ${s.server}`,
        `deviceId: ${s.deviceId}`,
        `deviceUid: ${s.deviceUid}`,
        `name: ${s.name}`,
        `token: ${s.deviceToken ? "已保存" : "未 attach（先运行 pair）"}`,
        `state:  ${statePath()}`,
        "",
      ].join("\n"),
    );
    return 0;
  }

  if (sub === "pair") {
    const server = serverOf(options);
    let s = loadState();
    if (!s || s.server !== server) {
      s = { server, deviceId: 0, deviceUid: genDeviceUid(), name: deviceName() };
    }
    ctx.stdout.write(`向中枢注册设备 ${s.name} …\n`);
    const reg = (await postJson(server, "/api/builder/device/register", {
      deviceUid: s.deviceUid,
      name: s.name,
      platform: platformName(),
      agentVersion: process.env.ZCODE_VERSION ?? "0.1.0",
      meta: JSON.stringify({ host: hostname(), node: process.version }),
    })) as { deviceId: number; pairCode: string; expireMinutes: number };
    s.deviceId = reg.deviceId;
    saveState(s);

    ctx.stdout.write(
      [
        "",
        "════════════════════════════════════════════",
        `  配对码: ${reg.pairCode}  （${reg.expireMinutes} 分钟内有效，一次性）`,
        "  用手机端 ZHLBuilder App 扫描下方二维码完成绑定，",
        "  绑定时在手机上设置 6 位 PIN。",
        "════════════════════════════════════════════",
        "",
      ].join("\n"),
    );

    // 终端二维码（qrcode 为 MIT 许可，见 THIRD-PARTY-NOTICES）
    try {
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toString(JSON.stringify({ app: "zhlbuilder", server, pairCode: reg.pairCode }), {
        type: "terminal",
        small: true,
      });
      ctx.stdout.write(qr + "\n");
    } catch {
      ctx.stdout.write("(无法渲染二维码，请手动在 App 中输入配对码)\n");
    }

    ctx.stdout.write("等待手机端完成绑定后 attach …\n");
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const att = (await postJson(server, "/api/builder/device/attach", {
          deviceUid: s.deviceUid,
          pairCode: reg.pairCode,
        })) as { deviceId: number; deviceToken: string };
        s.deviceToken = att.deviceToken;
        saveState(s);
        ctx.stdout.write("绑定完成，设备令牌已保存。运行 `zhlbuilder device start` 上线。\n");
        return 0;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("尚未被认领")) continue; // 手机端还没扫
        throw e;
      }
    }
    ctx.stderr.write("等待超时：5 分钟内未完成手机端绑定。\n");
    return 1;
  }

  if (sub === "start") {
    const s = loadState();
    if (!s?.deviceToken) {
      ctx.stderr.write("设备未绑定：先运行 `zhlbuilder device pair`。\n");
      return 1;
    }
    return await runAgentLoop(s, ctx);
  }

  ctx.stderr.write(`未知子命令: ${sub}（可用: pair / start / status）\n`);
  return 1;
};

/** agent 主循环：WS 长连 + 心跳 + 任务执行 */
const runAgentLoop = async (state: DeviceState, ctx: { stdout: { write(s: string): void }; stderr: { write(s: string): void } }): Promise<number> => {
  // 令牌走 X-Builder-Token 头而不是 URL query：query 会落进 nginx 访问日志。
  // 全局 WebSocket 带不了自定义头，用 ws 包（构建时整体打进 bundle）。
  const wsUrl = `${state.server.replace(/^http/, "ws")}/api/builder/ws`;
  let stopped = false;
  const tasks = new Map<number, { child: ReturnType<typeof spawn> }>();

  /** 重连上限：够不着的话代理会永远静默重试，用户根本不知道设备已经掉了 */
  let reconnectFailures = 0;
  let connectedOnce = false;
  let openedAt = 0;

  const connect = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { headers: { "X-Builder-Token": state.deviceToken ?? "" } });
      let opened = false;
      ws.onopen = () => {
        opened = true;
        openedAt = Date.now();
        connectedOnce = true;
        ctx.stdout.write(`[device] 已连接中枢 ${state.server}\n`);
        ws.send(JSON.stringify({ type: "heartbeat" }));
        // 能力快照：中枢据此区分"代理没启动"与"设备离线"，手机端据此摆模型 chip
        ws.send(JSON.stringify({
          type: "agent.hello",
          capabilities: { modes: ZHL_MODE_CHOICES, models: readLocalModels() },
        }));
        resolve();
      };
      ws.onmessage = (ev) => {
        try {
          handleCommand(JSON.parse(String(ev.data)));
        } catch (e) {
          ctx.stderr.write(`[device] 消息处理失败: ${String(e)}\n`);
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        // 只有活过一个完整心跳周期的连接才算真连上，才清零失败计数；
        // 在 onopen 里清零的话，"接受握手又立刻关闭"每轮都复位，上限永远够不着。
        if (opened && Date.now() - openedAt >= STABLE_CONNECTION_MS) reconnectFailures = 0;
        if (!opened) {
          // 第一次握手失败交给外层 await 报错退出；重连途中的失败必须自己续一趟，
          // 之前这里的 reject 被 .catch(() => undefined) 吞掉，一次没连上就再也不重连。
          if (connectedOnce) scheduleReconnect();
          else reject(new Error("连接失败"));
          return;
        }
        scheduleReconnect();
      };
      ws.onerror = () => {
        if (!opened && !connectedOnce) reject(new Error("连接错误"));
      };
      (globalThis as { __zhlbuilderWs?: WebSocket }).__zhlbuilderWs = ws;
    });

  const scheduleReconnect = (): void => {
    reconnectFailures += 1;
    if (reconnectFailures > MAX_RECONNECT_FAILURES) {
      ctx.stderr.write(`[device] 连续 ${MAX_RECONNECT_FAILURES} 次重连失败，代理退出。\n`);
      terminate("RECONNECT-FAILED");
      return;
    }
    ctx.stdout.write(`[device] 连接断开，10 秒后重连（第 ${reconnectFailures} 次）…\n`);
    setTimeout(() => {
      if (stopped) return;
      void connect().catch(() => scheduleReconnect());
    }, RECONNECT_DELAY_MS);
  };

  /**
   * 停止代理并带走所有任务子进程。
   *
   * 之前没有任何信号处理：`device start` 被 SIGTERM（服务停止、kill、注销）打断时，
   * 子进程不会随父进程消失，代理的 WS 也留在那儿。结果是设备"离线"了但 CLI 还在跑任务、
   * 还在花 token，而手机端已经没有入口能停它。下面那个 finally 挂在
   * `await new Promise<never>(() => undefined)` 上，永远走不到，指不上。
   */
  const terminate = (reason: string): void => {
    if (stopped) {
      process.exit(0);
      return;
    }
    stopped = true;
    ctx.stdout.write(`[device] ${reason}：正在停止 ${tasks.size} 个任务…\n`);
    const ws = (globalThis as { __zhlbuilderWs?: WebSocket }).__zhlbuilderWs;
    try {
      ws?.close();
    } catch { /* 已关闭 */ }
    for (const { child } of tasks.values()) {
      try {
        child.kill("SIGTERM");
      } catch { /* 已退出 */ }
    }
    // 再等一秒让子进程自己收，然后强杀退出：CLI 不保证响应 SIGTERM
    setTimeout(() => {
      for (const { child } of tasks.values()) {
        try {
          child.kill("SIGKILL");
        } catch { /* 已退出 */ }
      }
      process.exit(0);
    }, 1000);
  };

  const send = (obj: unknown): void => {
    const ws = (globalThis as { __zhlbuilderWs?: WebSocket }).__zhlbuilderWs;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const handleCommand = (msg: Record<string, unknown>): void => {
    // 已经在退出了就不要再起新任务：残留在队列里的一条 task.start 会 spawn 出一个
    // 没人持有、也没人能 kill 的子进程。
    if (stopped) return;
    const type = String(msg.type ?? "");
    if (type === "task.start") {
      const taskId = Number(msg.taskId);
      const prompt = String(msg.prompt ?? "");
      const cwd = typeof msg.cwd === "string" && msg.cwd ? msg.cwd : process.cwd();
      const mode = typeof msg.mode === "string" ? msg.mode : undefined;
      const model = typeof msg.model === "string" && msg.model ? msg.model : undefined;
      const resumeSession = typeof msg.resumeSession === "string" ? msg.resumeSession : undefined;
      ctx.stdout.write(`[device] 收到任务 #${taskId}\n`);
      runDeviceTask({ taskId, prompt, cwd, mode, model, resumeSession, tasks, send, log: ctx });
    } else if (type === "task.stop") {
      const taskId = Number(msg.taskId);
      const t = tasks.get(taskId);
      if (t) {
        t.child.kill();
        ctx.stdout.write(`[device] 任务 #${taskId} 收到停止指令\n`);
      }
    }
  };

  const heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);

  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => terminate(sig));
  }

  ctx.stdout.write("[device] Ctrl+C 退出（设备将下线，任务缓冲保留在服务器）\n");
  try {
    await connect();
    // 挂起直到进程被终止
    await new Promise<never>(() => undefined);
  } catch (e) {
    ctx.stderr.write(`[device] ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  } finally {
    clearInterval(heartbeat);
  }
  stopped = true;
  return 0;
};
