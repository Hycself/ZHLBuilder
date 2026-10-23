import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { findZCodeAgentRuntimeNodeBundle } from "@zhlbuilder/services/node";
import {
  mapZhlStreamLine,
  stageOfZhlEvent,
  ZhlTextAccumulator,
  ZHL_MODE_CHOICES,
} from "@zhlbuilder/shared/zhlTaskEvents";

/**
 * 桌面端设备代理的任务执行器。
 *
 * 从 zhlDeviceAgent 里拆出来，是因为"跑一个 coding 任务并把过程翻译成事件"
 * 是一套独立的职责：它只需要一个 send 回调，不关心 WS 怎么连、身份是谁。
 */

export type ZhlSend = (obj: unknown) => void;

export interface ZhlTaskRequest {
  taskId: number;
  prompt: string;
  cwd: string;
  /** 权限/协作模式；缺省由 agent 用它自己的默认值 */
  mode?: string;
  /** 本次运行的模型覆盖（providerId/modelId[$reasoningLevel]）；缺省用设备自己的默认模型 */
  model?: string;
  /** 续话：上一轮设备上报过的 CLI session id */
  resumeSession?: string;
  send: ZhlSend;
}

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
export function readLocalModels(): Array<Record<string, unknown>> {
  const p = join(app.getPath("home"), ".zhlbuilder", "v2", "provider_config.json");
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
}

export function agentCapabilitiesPayload(): Record<string, unknown> {
  return { modes: ZHL_MODE_CHOICES, models: readLocalModels() };
}

/**
 * 启动一个任务子进程。
 *
 * @returns 子进程；随包 agent 缺失时不启动进程，直接回报失败并返回 null。
 *          调用方负责把返回的 child 存进自己的任务表以便 kill。
 */
export function runZhlTask(req: ZhlTaskRequest): ChildProcess | null {
  const { taskId, prompt, cwd, mode, model, resumeSession, send } = req;

  // 用的是 node bundle 解析器，不是 resolveBundledGlmBinaryPath()：后者返回的是原生
  // zcode-agent(.exe) 路径，而这个 fork 随包只带 zhlbuilder.cjs（体积从 ~180MB 降到
  // ~16MB 的代价就是没有原生二进制）。之前取错了解析器，永远命中"agent 缺失"分支，
  // 任何一条 task.start 都跑不起来。打包态与 dev 态的候选目录由解析器自己覆盖。
  const agentEntry = findZCodeAgentRuntimeNodeBundle();
  if (!agentEntry) {
    send({
      type: "task.status",
      taskId,
      status: 3,
      stage: "failed",
      exitNote: "随包 agent 缺失，无法执行任务",
    });
    return null;
  }

  // stream-json：stdout 每行是一个会话事件，解析后上报 task.event（手机端要结构），
  // 同时把助手正文归并成纯文本喂 /output，老客户端与降级路径不受影响。
  // --model 是本次运行的覆盖，不会改用户在本机设的默认模型。值由 CLI 自己校验，
  // 不合法时任务会以非零退出并带上 --model 的解析错误，这里不重复校验。
  const args = [agentEntry, "--prompt", prompt, "--output-format", "stream-json"];
  if (mode) args.push("--mode", mode);
  if (model) args.push("--model", model);
  if (resumeSession) args.push("--resume", resumeSession);
  const child = spawn(process.execPath, args, {
    cwd,
    // 必须以纯 Node 模式启动。少了 ELECTRON_RUN_AS_NODE，process.execPath 会被当作
    // Electron 主程序再起一个 GUI 实例：撞 requestSingleInstanceLock 后直接 app.quit()，
    // 任务没跑，还把用户的窗口弄没了。口径与 zcodeAgentProcessManager 一致。
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });

  const sendLine = (line: string): void => {
    if (line) send({ type: "task.output", taskId, lines: [line] });
  };

  // 两个流都按行缓冲，并且用 StringDecoder：chunk.toString("utf8") 会把一个多字节汉字
  // 拆在相邻两个 chunk 里，中文输出直接变乱码；之前 stderr 更是每个 chunk 单独切行，
  // 一条跨 chunk 的行会被当成两条完整行发给中枢。
  const stdoutText = new StringDecoder("utf8");
  const stderrText = new StringDecoder("utf8");
  let stdoutBuf = "";
  let stderrBuf = "";
  let lastStage = "running";
  let reportedSession = resumeSession ?? "";
  const text = new ZhlTextAccumulator();

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
      // 非 JSON 的诊断输出，退回纯文本，不丢日志
      sendLine(raw);
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
      for (const line of text.push(String(ev.payload.text ?? ""))) {
        sendLine(line);
      }
    }
  };

  child.stdout?.on("data", (c: Buffer) => {
    stdoutBuf += stdoutText.write(c);
    let nl: number;
    while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
      const raw = stdoutBuf.slice(0, nl).replace(/\r$/, "");
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (raw.length) handleStdoutLine(raw);
    }
  });

  // stderr 是人读的诊断文本，原样按行上报，失败时手机端要能看到原因
  child.stderr?.on("data", (c: Buffer) => {
    stderrBuf += stderrText.write(c);
    let nl: number;
    while ((nl = stderrBuf.indexOf("\n")) >= 0) {
      const raw = stderrBuf.slice(0, nl).replace(/\r$/, "");
      stderrBuf = stderrBuf.slice(nl + 1);
      sendLine(raw);
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
    // 收尾：最后一个 chunk 之后不再有 \n，缓冲区里可能还压着半行；
    // 子进程被 kill 在写半截时也会留下内容，不冲掉就永远丢了。
    stdoutBuf += stdoutText.end();
    stderrBuf += stderrText.end();
    const tail = stdoutBuf.replace(/\r$/, "");
    if (tail.length) handleStdoutLine(tail);
    sendLine(stderrBuf.replace(/\r$/, ""));
    for (const line of text.flush()) sendLine(line);
    send({
      type: "task.status",
      taskId,
      status: code === 0 ? 2 : code === null ? 4 : 3,
      stage: code === 0 ? "done" : code === null ? "stopped" : "failed",
      exitNote: `exit code ${code}`,
    });
  });

  return child;
}
