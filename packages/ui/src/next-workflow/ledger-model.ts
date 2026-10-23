import type { WorkflowRunPendingQuestion } from "@zhlbuilder/shared/zcode-protocol-v4";
import { pillInstanceKey } from "@/components/workflow-timeline/roster-model.js";
import type {
  TimelineStation,
  WorkflowTimelineModel,
} from "@/components/workflow-timeline/timeline-model.js";

/**
 * 阶段账本模型（自研重写 v2 · W1）。
 *
 * 五层叠图（轨道 / 弧 / 站 / 灯 / 檐）折成一本**垂直账本**：一阶段一行，行头是
 * 序号 / 状态点 / 名称 / 代理数 / 进度 / 轮次，行体是就地展开的明细。本文件只做纯的派生——
 * 行（声明序 + 展示序号）、问题的归桶（照旧按提问者实例键挂行）、以及卡上的**摘要窗口**
 * （信号行永远在场，其余从最早补位，跳过的区间折成一条「还有 n 个阶段」）。
 *
 * 时间线模型（`timeline-model.ts`）与 hooks 一字未动：账本读的仍是同一个模型对象
 * （不变式 1：一个模型，多处消费）。
 */

/** 行的展示序号：两位补零（账本左缘的编号列，等宽对齐）。 */
export function ledgerOrdinal(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export interface LedgerRow {
  /** 声明序下标（0 起）；展示序号由 {@link ledgerOrdinal} 成形。 */
  index: number;
  station: TimelineStation;
}

/** 待答问题的归属键：提问者实例（`siteId@ordinal`）；两端拼不齐时为 undefined。 */
export function questionInstanceKey(
  question: Pick<WorkflowRunPendingQuestion, "actorSiteId" | "actorOrdinal">,
): string | undefined {
  return question.actorSiteId === undefined || question.actorOrdinal === undefined
    ? undefined
    : `${question.actorSiteId}@${question.actorOrdinal}`;
}

export interface LedgerModel {
  rows: LedgerRow[];
  /** 提问者实例键 → 挂在那一位子代理行下的问题（面板逐条渲染）。 */
  byInstance: Map<string, WorkflowRunPendingQuestion[]>;
  /** 配不上任何一行的（提问者不在界上）：清单末尾单独一块，与从前同一条规则。 */
  orphans: WorkflowRunPendingQuestion[];
}

export function buildLedger(
  model: WorkflowTimelineModel,
  pendingQuestions: readonly WorkflowRunPendingQuestion[] | undefined,
): LedgerModel {
  const attached = new Set<string>();
  for (const station of model.stations) {
    for (const pill of station.pills) {
      const key = pillInstanceKey(pill);
      if (key !== undefined) attached.add(key);
    }
  }
  const byInstance = new Map<string, WorkflowRunPendingQuestion[]>();
  const orphans: WorkflowRunPendingQuestion[] = [];
  for (const question of pendingQuestions ?? []) {
    const key = questionInstanceKey(question);
    if (key === undefined || !attached.has(key)) {
      orphans.push(question);
      continue;
    }
    const list = byInstance.get(key) ?? [];
    list.push(question);
    byInstance.set(key, list);
  }
  return {
    byInstance,
    orphans,
    rows: model.stations.map((station, index) => ({ index, station })),
  };
}

/** 卡上的账本最多摆这么多行；其余折成省略条。 */
export const DIGEST_LEDGER_CAP = 8;

export type LedgerDigestEntry = { kind: "row"; row: LedgerRow } | { kind: "hidden"; count: number };

/**
 * 卡上的摘要窗口：行数不超上限时全摆；超了则 **running / failed 永远在场**（它们正是卡上要看
 * 的信号），其余从最早补位，被跳过的区间折成一条省略条（点它开运行面板）。窗口按行号升序，
 * 省略条出现在缺口所在的位置——账本的顺序不被打乱。
 */
export function digestLedgerWindow(
  rows: readonly LedgerRow[],
  cap: number = DIGEST_LEDGER_CAP,
): LedgerDigestEntry[] {
  if (rows.length <= cap) return rows.map((row) => ({ kind: "row", row }));
  const visible = new Set<number>();
  for (const row of rows) {
    const status = row.station.status;
    if (status === "running" || status === "failed") visible.add(row.index);
  }
  for (const row of rows) {
    if (visible.size >= cap) break;
    visible.add(row.index);
  }
  const indices = [...visible].sort((left, right) => left - right).slice(0, cap);
  const entries: LedgerDigestEntry[] = [];
  let cursor = 0;
  for (const index of indices) {
    if (index > cursor) entries.push({ count: index - cursor, kind: "hidden" });
    entries.push({ kind: "row", row: rows[index]! });
    cursor = index + 1;
  }
  if (cursor < rows.length) entries.push({ count: rows.length - cursor, kind: "hidden" });
  return entries;
}