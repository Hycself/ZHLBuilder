import { memo, useEffect, useMemo, useState } from "react";
import type {
  WorkflowRunPendingQuestion,
  WorkflowRunState,
} from "@zhlbuilder/shared/zcode-protocol-v4";
import { WorkflowRunQuestionRow } from "@/app-shell/WorkflowRunQuestionRow.js";
import type { WorkflowActorInstance } from "@/app-shell/workflowRunPanel.js";
import type { WorkflowCausalityGraphData } from "@/components/workflow-graph/types.js";
import type {
  TimelinePill,
  WorkflowTimelineModel,
} from "@/components/workflow-timeline/timeline-model.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { buildLedger } from "./ledger-model.js";
import { WorkflowLedgerRow } from "./WorkflowLedgerRow.js";

/**
 * 运行面板的阶段账本（自研重写 v2 · W1）：脊线（轨道 / 灯 / 分叉曲线）退场，时间线在这里读作
 * 一份纵向账本。行与卡上同一具身体（`WorkflowLedgerRow`），面板侧多三件事：全部的行（卡上有摘要
 * 窗口）、提问者行下的问题清单、以及落点（展开 + 开门 + 亮一下 + 滚到顶）。
 *
 * 一个模型消费：账本行读 `buildWorkflowTimeline` 的同一个模型对象（不变式 1）。
 */
const QUESTION_TICK_MS = 30_000;

export const WorkflowRunPhaseList = memo(function WorkflowRunPhaseList({
  graph,
  landing,
  model,
  onOpenActor,
  onOpenWorkspace,
  pendingQuestions,
  run,
}: {
  graph: WorkflowCausalityGraphData;
  model: WorkflowTimelineModel;
  run: WorkflowRunState | undefined;
  pendingQuestions: readonly WorkflowRunPendingQuestion[];
  /** 开 actor transcript tab（没有会话的槽位开占位）。缺席即行不可点——回调的存在本身就是门控。 */
  onOpenActor?: (instance: WorkflowActorInstance) => void;
  /** 开脚本 transcript tab、落到这一站；缺席即脚本行不可点。 */
  onOpenWorkspace?: (phaseId: string) => void;
  /** 落点：`key` 每次打开都不同（`phaseId@openedAt`），同一站再点一次也再落。 */
  landing?: { phaseId: string; key: string };
}) {
  const { intl } = useZCodeIntl();
  const { byInstance, orphans, rows } = useMemo(
    () => buildLedger(model, pendingQuestions),
    [model, pendingQuestions],
  );

  // 等待时长要自己走：一个在等答案的 run **恰恰不发事件**。定时器只在有问题时存在。
  const [now, setNow] = useState(() => Date.now());
  const hasQuestions = pendingQuestions.length > 0;
  useEffect(() => {
    if (!hasQuestions) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), QUESTION_TICK_MS);
    return () => clearInterval(timer);
  }, [hasQuestions]);

  // 行交出槽位身份：会话 id 有则随行，没有就开占位 tab。
  const openActor = (pill: TimelinePill) => {
    const slot = pill.slot;
    if (onOpenActor === undefined || slot === undefined) return;
    const sessionId = pill.instance?.sessionId;
    onOpenActor({
      ordinal: slot.ordinal,
      ...(sessionId === undefined ? {} : { sessionId }),
      siteId: slot.siteId,
      status:
        pill.status === "running"
          ? "running"
          : pill.status === "done" || pill.status === "failed"
            ? "completed"
            : "waiting",
      ...(pill.runtimeName === undefined ? {} : { name: pill.runtimeName }),
    });
  };
  const openWorkspace = (pill: TimelinePill) => {
    const phaseId = pill.workspace?.phaseId;
    if (phaseId !== undefined) onOpenWorkspace?.(phaseId);
  };

  return (
    <div
      className="wf-motion flex min-h-0 flex-1 flex-col overflow-auto pb-3 pt-2.5"
      data-testid="workflow-run-phases"
    >
      {rows.map((row) => (
        <WorkflowLedgerRow
          buckets={byInstance}
          graph={graph}
          key={row.station.id}
          {...(landing === undefined ? {} : { landing })}
          now={now}
          {...(onOpenActor === undefined ? {} : { onOpenPill: openActor })}
          {...(onOpenWorkspace === undefined ? {} : { onOpenWorkspace: openWorkspace })}
          row={row}
          run={run}
          variant="pane"
        />
      ))}
      {orphans.length === 0 ? null : (
        <div
          className="flex flex-col gap-1 pl-[38px] pr-3 pt-2"
          data-testid="workflow-run-orphan-questions"
        >
          <span className="text-ui-xs font-medium text-foreground-subtle">
            {intl.formatMessage({ id: "chat.toolCall.workflow.run.questions.title" })}
          </span>
          {orphans.map((question) => (
            <WorkflowRunQuestionRow key={question.qid} now={now} question={question} showAsker />
          ))}
        </div>
      )}
    </div>
  );
});