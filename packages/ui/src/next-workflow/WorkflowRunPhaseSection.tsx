import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { workflowRunStepCounts } from "@zhlbuilder/shared/zcode-protocol-v4";
import type {
  WorkflowRunPendingQuestion,
  WorkflowRunState,
} from "@zhlbuilder/shared/zcode-protocol-v4";
import type { WorkflowActorInstance } from "@/app-shell/workflowRunPanel.js";
import { cn } from "@/components/lib/utils.js";
import type { WorkflowCausalityGraphData } from "@/components/workflow-graph/types.js";
import type { WorkflowTimelineModel } from "@/components/workflow-timeline/timeline-model.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { WorkflowRunPhaseList } from "./WorkflowRunPhaseList.js";

/**
 * 运行详情「过程」段（自研重写 v2 · W2）：账本外面套一枚与产物段同节奏的节头（h-9 行、
 * 同一内缩、同一枚 `rotate-90` chevron），整段可折叠。**默认展开**——账本是这块面板的核心内容；
 * 收起时保留阶段数与步数读据，折叠不让「跑到哪了」不可见。
 *
 * 三个分段与产物段的关系：实时段（状态头）常显、错误/终止红条常显（都不在这里），过程段是本节，
 * 交付段是 `WorkflowRunArtifactsSection`（自带同形节头）。
 */
export function WorkflowRunPhaseSection({
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
  /** 开 actor transcript tab（没有会话的槽位开占位）。缺席即行不可点。 */
  onOpenActor?: (instance: WorkflowActorInstance) => void;
  /** 开脚本 transcript tab、落到这一站；缺席即脚本行不可点。 */
  onOpenWorkspace?: (phaseId: string) => void;
  /** 落点：`key` 每次打开都不同（`phaseId@openedAt`）。 */
  landing?: { phaseId: string; key: string };
}) {
  const { intl } = useZCodeIntl();
  const [expanded, setExpanded] = useState(true);
  const steps = run === undefined ? undefined : workflowRunStepCounts(run);
  return (
    <section
      className={cn("wf-motion shrink-0 border-t border-border", expanded && "flex min-h-0 flex-1 flex-col")}
      data-phases-open={expanded ? "true" : "false"}
      data-testid="workflow-run-phases-section"
    >
      <button
        aria-expanded={expanded}
        aria-label={intl.formatMessage({
          id: expanded
            ? "chat.toolCall.workflow.run.phases.collapse"
            : "chat.toolCall.workflow.run.phases.expand",
        })}
        className="flex h-9 w-full shrink-0 items-center gap-2 px-3 text-left outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40"
        data-testid="workflow-run-phases-toggle"
        onClick={() => setExpanded((previous) => !previous)}
        type="button"
      >
        <span className="min-w-0 shrink-0 truncate text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "chat.toolCall.workflow.run.phases.title" })}
        </span>
        {/* 阶段数在收起时也在场——与产物段的件数同一条规则。 */}
        <span
          className="shrink-0 font-mono text-ui-xs tabular-nums text-foreground-subtlest"
          data-testid="workflow-run-phases-count"
        >
          {model.stations.length.toLocaleString()}
        </span>
        {/* 收起时的步数读据：折叠不能让「跑到哪了」不可见。 */}
        {expanded || steps === undefined ? null : (
          <span
            className="min-w-0 truncate text-ui-sm text-foreground-subtle"
            data-testid="workflow-run-phases-steps"
          >
            ·{" "}
            {intl.formatMessage(
              { id: "chat.toolCall.workflow.card.steps" },
              { done: steps.settled, total: steps.total },
            )}
          </span>
        )}
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "ml-auto size-3.5 shrink-0 text-foreground-subtlest transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded ? (
        <WorkflowRunPhaseList
          graph={graph}
          {...(landing === undefined ? {} : { landing })}
          model={model}
          {...(onOpenActor === undefined ? {} : { onOpenActor })}
          {...(onOpenWorkspace === undefined ? {} : { onOpenWorkspace })}
          pendingQuestions={pendingQuestions}
          run={run}
        />
      ) : null}
    </section>
  );
}