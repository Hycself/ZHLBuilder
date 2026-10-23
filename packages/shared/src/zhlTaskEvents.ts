/**
 * ZHLBuilder 设备端 → 中枢 → 手机端的任务事件契约。
 *
 * 存在的理由：手机端只能走 HTTP，拿不到桌面端本地的 JSON-RPC v4 会话投影，
 * 而任务输出在中枢里原本只有子进程的原始 stdout 行（无类型），渲染不出
 * 气泡 / 思考 / 工具调用。设备端把 CLI `--output-format stream-json` 的每行
 * 归一化成这里的窄事件集再上报，中枢原样存、原样转发。
 *
 * 归一化刻意做窄：CLI 的事件词汇表会变（tool_input_* 之类），这里只保留
 * 手机端真正要渲染的几类，认不出的一律丢弃而不是原样透传，避免把不稳定的
 * 内部协议焊死成对外契约。
 */

/** CLI stream-json 单行的最小结构（其余字段本模块不读） */
export type ZhlStreamLine = {
  type?: unknown;
  sessionId?: unknown;
  turnId?: unknown;
  payload?: unknown;
};

/**
 * 归一化后的任务事件类型。
 *
 * 只有这四种是 CLI 真的会发出来的：`artifact` / `usage` 曾经也在这里，但
 * `zcodeSessionEventTypeSchema` 根本没有 `artifact.created` / `usage.reported`
 * 这两个 type，`session-mapper` 也不产生——留在契约里就是对外宣称一个手机端
 * 永远收不到的种类。文件变更信息走 `tool_call`（phase=result 里带工具名）。
 */
export type ZhlTaskEventType =
  | "assistant_text"
  | "reasoning"
  | "tool_call"
  | "waiting_input";

export type ZhlTaskEvent = {
  type: ZhlTaskEventType;
  payload: Record<string, unknown>;
};

/** 任务阶段。与生命周期终态 status(0-4) 正交：stage 表达"此刻在干什么" */
export const ZHL_TASK_STAGES = [
  "queued",
  "running",
  "thinking",
  "tool",
  "waiting_input",
  "done",
  "failed",
  "stopped",
] as const;

export type ZhlTaskStage = (typeof ZHL_TASK_STAGES)[number];

/**
 * 权限/协作模式。与 submissionModeSchema 同集合。
 * 这里重复一份字面量而不是 import 那个 schema，是因为设备端 agent 要在
 * 不初始化整个 shared 类型图的情况下就能上报能力；漂移的后果由中枢
 * normalizeMode 兜成 null，不会误授权。
 */
export const ZHL_MODE_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "build", label: "变更前确认" },
  { value: "edit", label: "自动编辑" },
  { value: "plan", label: "计划模式" },
  { value: "yolo", label: "完全访问" },
];

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const opt = (v: string | undefined): Record<string, unknown> => (v ? { turnId: v } : {});

/** CLI stream-json 的一行 → 窄事件；不认识的返回 null 直接丢 */
export function mapZhlStreamLine(line: ZhlStreamLine): ZhlTaskEvent | null {
  const type = str(line.type);
  const payload = (line.payload ?? {}) as Record<string, unknown>;
  const kind = str(payload.kind);
  const turnId = str(line.turnId) || undefined;
  const delta = str(payload.delta);

  switch (type) {
    case "model.streaming": {
      if (kind === "text_delta" && delta) {
        return { type: "assistant_text", payload: { text: delta, ...opt(turnId) } };
      }
      if (kind === "reasoning_delta" && delta) {
        return { type: "reasoning", payload: { text: delta, ...opt(turnId) } };
      }
      if (kind === "tool_call") {
        return {
          type: "tool_call",
          payload: {
            phase: "call",
            name: str(payload.name ?? payload.toolName),
            callId: payload.id ?? payload.toolCallId,
            ...opt(turnId),
          },
        };
      }
      return null;
    }
    case "tool.updated": {
      // payload.kind 由 session-mapper 定型为 scheduled / progress / result / error / batch
      if (!kind) return null;
      return {
        type: "tool_call",
        payload: {
          phase: kind,
          name: str(payload.name ?? payload.toolName),
          callId: payload.id ?? payload.toolCallId,
          summary: payload.summary ?? payload.title,
          ...opt(turnId),
        },
      };
    }
    case "permission.requested":
      return {
        type: "waiting_input",
        payload: {
          kind: "permission",
          prompt: str(payload.message ?? payload.reason) || "设备端请求授权",
          id: payload.interactionId ?? payload.id,
          ...opt(turnId),
        },
      };
    case "permission.resolved":
      return {
        type: "tool_call",
        payload: { phase: "permission_resolved", decision: payload.decision, ...opt(turnId) },
      };
    case "userInput.requested":
      // ask_user 走的是 userInput.*，不是 permission.*：之前只映射了后者，
      // 于是"agent 在等人回答"这件事在手机端完全看不见。
      return {
        type: "waiting_input",
        payload: {
          kind: "question",
          prompt: str(payload.question ?? payload.message) || "设备端等待你的回答",
          id: payload.interactionId ?? payload.id,
          ...opt(turnId),
        },
      };
    case "userInput.resolved":
      return {
        type: "tool_call",
        payload: { phase: "user_input_resolved", decision: payload.answer ?? payload.decision, ...opt(turnId) },
      };
    default:
      return null;
  }
}

/** 事件 → 阶段；返回 null 表示该事件不改变阶段 */
export function stageOfZhlEvent(event: ZhlTaskEvent): ZhlTaskStage | null {
  if (event.type === "waiting_input") return "waiting_input";
  if (event.type === "reasoning") return "thinking";
  if (event.type === "tool_call") {
    const phase = str(event.payload.phase);
    return phase === "result" || phase === "error" || phase === "batch" ? "running" : "tool";
  }
  if (event.type === "assistant_text") return "running";
  return null;
}

/** 把多条 delta 归并成可读的纯文本行，供 /output 的老客户端消费 */
export class ZhlTextAccumulator {
  private buf = "";

  /** 喂入一段增量，返回已经成行的部分（不含未完成的尾行） */
  push(text: string): string[] {
    this.buf += text;
    if (!this.buf.includes("\n")) return [];
    const parts = this.buf.split("\n");
    this.buf = parts.pop() ?? "";
    return parts.filter((p) => p.trim().length > 0);
  }

  /** 收尾：吐出未完成的最后一行 */
  flush(): string[] {
    const rest = this.buf;
    this.buf = "";
    return rest.trim().length > 0 ? [rest] : [];
  }
}
