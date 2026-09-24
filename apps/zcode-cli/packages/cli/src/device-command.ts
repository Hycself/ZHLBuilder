import { join } from "node:path";
import { homedir, hostname, platform as osPlatform } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

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
  const wsUrl = `${state.server.replace(/^http/, "ws")}/api/builder/ws?token=${state.deviceToken}`;
  let stopped = false;
  const tasks = new Map<number, { child: ReturnType<typeof spawn> }>();

  const connect = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let opened = false;
      ws.onopen = () => {
        opened = true;
        ctx.stdout.write(`[device] 已连接中枢 ${state.server}\n`);
        ws.send(JSON.stringify({ type: "heartbeat" }));
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
        if (!opened) reject(new Error("连接失败"));
        else if (!stopped) {
          ctx.stdout.write("[device] 连接断开，10 秒后重连…\n");
          setTimeout(() => void connect().catch(() => undefined), 10_000);
        }
      };
      ws.onerror = () => {
        if (!opened) reject(new Error("连接错误"));
      };
      (globalThis as { __zhlbuilderWs?: WebSocket }).__zhlbuilderWs = ws;
    });

  const send = (obj: unknown): void => {
    const ws = (globalThis as { __zhlbuilderWs?: WebSocket }).__zhlbuilderWs;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const handleCommand = (msg: Record<string, unknown>): void => {
    const type = String(msg.type ?? "");
    if (type === "task.start") {
      const taskId = Number(msg.taskId);
      const prompt = String(msg.prompt ?? "");
      const cwd = typeof msg.cwd === "string" && msg.cwd ? msg.cwd : process.cwd();
      ctx.stdout.write(`[device] 收到任务 #${taskId}\n`);
      runTask(taskId, prompt, cwd);
    } else if (type === "task.stop") {
      const taskId = Number(msg.taskId);
      const t = tasks.get(taskId);
      if (t) {
        t.child.kill();
        ctx.stdout.write(`[device] 任务 #${taskId} 收到停止指令\n`);
      }
    }
  };

  const out = (taskId: number, line: string): void => {
    for (const l of line.replace(/\r/g, "").split("\n")) {
      if (l.length) send({ type: "task.output", taskId, lines: [l] });
    }
  };

  const runTask = (taskId: number, prompt: string, cwd: string): void => {
    send({ type: "task.status", taskId, status: 1 });
    // v0.1.0 执行器：子进程跑本 CLI 的 --prompt 模式（见文件头说明）
    const entry = process.argv[1] ?? "dist/zhlbuilder.cjs";
    const child = spawn(process.execPath, [entry, "--prompt", prompt], { cwd, env: process.env });
    tasks.set(taskId, { child });
    child.stdout?.on("data", (chunk: Buffer) => out(taskId, chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => out(taskId, chunk.toString("utf8")));
    child.on("close", (code) => {
      tasks.delete(taskId);
      send({
        type: "task.status",
        taskId,
        status: code === 0 ? 2 : code === null ? 4 : 3,
        exitNote: `exit code ${code}`,
      });
      ctx.stdout.write(`[device] 任务 #${taskId} 结束（exit ${code}）\n`);
    });
  };

  const heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);

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
