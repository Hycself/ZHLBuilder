import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { mapZhlStreamLine, stageOfZhlEvent } from "@zhlbuilder/shared/zhlTaskEvents";

/**
 * 设备端任务执行器（`zhlbuilder device start` 收到 task.start 后走这里）。
 *
 * 从 device-command.ts 拆出来，是因为"跑一个 coding 任务并把过程翻译成事件"
 * 是一套独立职责：它只需要一个 send 回调和一个任务表，不关心 WS 怎么连、
 * 心跳谁发、令牌存在哪。拆开后 device-command 也回到了仓库的 400 行上限内。
 * 与桌面端 packages/desktop/src/main/zhlDeviceTaskRunner.ts 是同一套语义。
 */

export type DeviceSend = (obj: unknown) => void;

export interface DeviceTaskIO {
  /** taskId → 在跑的 child。重复 taskId 由这里拦住，close 时也由此表清理 */
  tasks: Map<number, { child: ChildProcess }>;
  send: DeviceSend;
  log: { stdout: { write(s: string): void }; stderr: { write(s: string): void } };
}

export interface DeviceTaskRequest extends DeviceTaskIO {
  taskId: number;
  prompt: string;
  cwd: string;
  mode?: string;
  model?: string;
  resumeSession?: string;
}

export function runDeviceTask(req: DeviceTaskRequest): void {
  const { taskId, prompt, cwd, mode, model, resumeSession, tasks, send, log } = req;

  // 同一个 taskId 重复下发就忽略：覆盖 map 条目后，前一个子进程的 close 会把共享的
  // key 删掉，正在跑的那个再也没法停。
  if (tasks.has(taskId)) {
    log.stderr.write(`[device] 任务 #${taskId} 已在跑，忽略重复下发\n`);
    return;
  }

  send({ type: "task.status", taskId, status: 1, stage: "running" });

  // 以 --output-format stream-json 跑本 CLI，stdout 每行是一个 ZCodeSessionEvent
  // （{type, payload, sessionId, turnId, ...}），解析后既上报 task.event（手机端要结构），
  // 又把助手正文归并成 task.output 的纯文本行（老客户端与降级路径仍读 /output）。
  const entry = process.argv[1] ?? "dist/zhlbuilder.cjs";
  const args = [entry, "--prompt", prompt, "--output-format", "stream-json"];
  // --model 是本次运行的覆盖（不改用户本机默认模型）。值直接交给 CLI 校验，
  // 不合法时子进程非零退出并把解析错误写到 stderr，手机端能看到原因。
  if (mode) args.push("--mode", mode);
  if (model) args.push("--model", model);
  if (resumeSession) args.push("--resume", resumeSession);
  const child = spawn(process.execPath, args, { cwd, env: process.env });
  tasks.set(taskId, { child });

  const out = (line: string): void => {
    for (const l of line.replace(/\r/g, "").split("\n")) {
      if (l.length) send({ type: "task.output", taskId, lines: [l] });
    }
  };

  // 两个流都按行缓冲并用 StringDecoder：之前 stderr 是每个 chunk 单独切行的，
  // 一条跨两个 chunk 的日志会被当成两条完整行发到中枢；而 chunk.toString("utf8")
  // 会把一个多字节汉字拆在相邻 chunk 里，中文输出直接变乱码。
  const stdoutText = new StringDecoder("utf8");
  const stderrText = new StringDecoder("utf8");
  let stdoutBuf = "";
  let stderrBuf = "";
  let textLine = "";
  let lastStage = "running";
  let reportedSession = resumeSession ?? "";

  const flushText = (): void => {
    if (textLine.trim().length) send({ type: "task.output", taskId, lines: [textLine] });
    textLine = "";
  };

  const pushStage = (stage: string | null): void => {
    if (!stage || stage === lastStage) return;
    lastStage = stage;
    send({ type: "task.stage", taskId, stage });
  };

  const handleStdoutLine = (raw: string): void => {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // 不是 JSON 的行（极少数诊断输出）退回纯文本，不丢日志
      out(raw);
      return;
    }
    const sessionId = typeof obj.sessionId === "string" ? obj.sessionId : "";
    if (sessionId && sessionId !== reportedSession) {
      reportedSession = sessionId;
      send({ type: "task.session", taskId, sessionId });
    }
    const ev = mapZhlStreamLine(obj);
    if (!ev) return;
    send({ type: "task.event", taskId, event: ev });
    pushStage(stageOfZhlEvent(ev));
    if (ev.type === "assistant_text") {
      textLine += String(ev.payload.text ?? "");
      if (textLine.includes("\n")) {
        const parts = textLine.split("\n");
        textLine = parts.pop() ?? "";
        for (const p of parts) if (p.trim().length) send({ type: "task.output", taskId, lines: [p] });
      }
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuf += stdoutText.write(chunk);
    let nl: number;
    while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
      const raw = stdoutBuf.slice(0, nl).replace(/\r$/, "");
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (raw.length) handleStdoutLine(raw);
    }
  });

  // stderr 是人读的诊断文本，原样按行上报，保证失败时手机端看得到原因
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += stderrText.write(chunk);
    let nl: number;
    while ((nl = stderrBuf.indexOf("\n")) >= 0) {
      const raw = stderrBuf.slice(0, nl).replace(/\r$/, "");
      stderrBuf = stderrBuf.slice(nl + 1);
      if (raw.length) out(raw);
    }
  });

  child.on("error", (e) => {
    send({
      type: "task.status",
      taskId,
      status: 3,
      stage: "failed",
      exitNote: `spawn 失败：${e.message}`,
    });
  });

  child.on("close", (code) => {
    tasks.delete(taskId);
    // 收尾：最后一个 chunk 之后不再有 \n，缓冲区里可能还压着半行；
    // 子进程被 kill 在写半截时也会留内容，不冲掉就永远丢了。
    stdoutBuf += stdoutText.end();
    stderrBuf += stderrText.end();
    const tail = stdoutBuf.replace(/\r$/, "");
    if (tail.length) out(tail);
    const errTail = stderrBuf.replace(/\r$/, "");
    if (errTail.length) out(errTail);
    flushText();
    send({
      type: "task.status",
      taskId,
      status: code === 0 ? 2 : code === null ? 4 : 3,
      stage: code === 0 ? "done" : code === null ? "stopped" : "failed",
      exitNote: `exit code ${code}`,
    });
    log.stdout.write(`[device] 任务 #${taskId} 结束（exit ${code}）\n`);
  });
}
