import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { TID_WORKFLOW_RUN_ROW, testId, type ZCodeSavedWorkflowRun } from "@zhlbuilder/shared";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { STATUS_DOT } from "@/components/workflow-graph/run-status-presentation.js";
import type { StepRunStatus } from "@/components/workflow-graph/types.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatDateTime } from "@/settings/automationFormat.js";
import { SavedWorkflowArtifactChips } from "@/settings/saved-workflows/SavedWorkflowArtifactChips.js";
import {
  formatSavedWorkflowRunArgs,
  formatSavedWorkflowTokens,
  savedWorkflowRunBadgeKind,
  savedWorkflowRunDurationMs,
} from "@/settings/saved-workflows/savedWorkflowRunHistory.js";

/** 详情页某一行运行记录对应的项目（全局工作流跨 cwd 时用；cwd 命中已打开项目才能「查看实例」）。 */
export interface SavedWorkflowRunProject {
  label: string;
  /** 完整 cwd 路径，挂在 title 上。 */
  title?: string;
  /** 该行 cwd 对应本地已打开项目 → 可「查看实例」。 */
  canOpen: boolean;
}

type RunBadgeKind = ReturnType<typeof savedWorkflowRunBadgeKind>;

/** 中枢历史行的状态点与 W1 账本同一套四值形与色（`.wf-lamp` 槽位可悬停）。 */
const RUN_STATUS_DOT: Record<RunBadgeKind, StepRunStatus> = {
  completed: "done",
  errored: "failed",
  never: "pending",
  running: "running",
  stopped: "pending",
};

/**
 * 中枢详情页「运行历史」→ 运行表（自研重写 v2 · W3）：账本紧凑行。
 *
 * 一行默认只说四件事——**状态点 / 时间 / 耗时 / 产物数**（有项目列时再带项目名）；点行就地展开
 * 明细：这次运行花了多少 tokens、实参芯片、以及**可点的产物药丸**（与通知行、时间线下的产物条
 * 同一枚）。「查看实例」是这一行的主操作，因此**不折叠**——它永远在行尾。
 *
 * 行身份（`TID_WORKFLOW_RUN_ROW` + runId）与「查看实例」「产物 chip」的门控逐条沿用旧行：
 * 老行可缺 `parentSessionId`/`toolCallId`，产物 chip 的门比「查看实例」松一格（产物 tab 不回
 * 那条 CreateWorkflow 工具行）。
 */
export function SavedWorkflowRunHistory({
  runs,
  now,
  canOpenRun,
  onOpenRun,
  onOpenArtifact,
  resolveRunProject,
}: {
  runs: readonly ZCodeSavedWorkflowRun[];
  now: number;
  canOpenRun: boolean;
  onOpenRun: (run: ZCodeSavedWorkflowRun) => void;
  /**
   * 产物 chip → `workflow-artifact` tab。
   * 缺席即 chips 只读。门比「查看实例」松一格：产物不需要 `toolCallId`。
   */
  onOpenArtifact?: (run: ZCodeSavedWorkflowRun, artifactId: string) => void;
  /** 传入即在每行渲染项目列（全局工作流跨项目历史）；「查看实例」还要该行 canOpen。 */
  resolveRunProject?: (run: ZCodeSavedWorkflowRun) => SavedWorkflowRunProject | null;
}) {
  const { intl } = useZCodeIntl();
  if (runs.length === 0) {
    return (
      <p className="text-ui-base text-foreground-subtlest">
        {intl.formatMessage({ id: "workflows.hub.history.empty" })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border border-border">
        {runs.map((run, index) => (
          <RunLedgerRow
            canOpenRun={canOpenRun}
            index={index}
            key={run.runId}
            now={now}
            onOpenArtifact={onOpenArtifact}
            onOpenRun={onOpenRun}
            {...(resolveRunProject === undefined ? {} : { resolveRunProject })}
            run={run}
          />
        ))}
      </div>
      <p className="text-ui-sm text-foreground-subtle">
        {intl.formatMessage({ id: "workflows.hub.history.note" })}
      </p>
    </div>
  );
}

function RunLedgerRow({
  canOpenRun,
  index,
  now,
  onOpenArtifact,
  onOpenRun,
  resolveRunProject,
  run,
}: {
  canOpenRun: boolean;
  index: number;
  now: number;
  onOpenArtifact?: (run: ZCodeSavedWorkflowRun, artifactId: string) => void;
  onOpenRun: (run: ZCodeSavedWorkflowRun) => void;
  resolveRunProject?: (run: ZCodeSavedWorkflowRun) => SavedWorkflowRunProject | null;
  run: ZCodeSavedWorkflowRun;
}) {
  const { intl } = useZCodeIntl();
  const [expanded, setExpanded] = useState(false);
  const kind = savedWorkflowRunBadgeKind(run.status);
  const dot = RUN_STATUS_DOT[kind];
  const statusLabel = intl.formatMessage({ id: `workflows.hub.lastRun.${kind}` });
  const project = resolveRunProject === undefined ? null : resolveRunProject(run);
  const durationMs = savedWorkflowRunDurationMs(run, now);
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const duration =
    minutes > 0
      ? intl.formatMessage(
          { id: "workflows.hub.time.duration.minutes" },
          { minutes: String(minutes), seconds: String(seconds) },
        )
      : intl.formatMessage(
          { id: "workflows.hub.time.duration.seconds" },
          { seconds: String(seconds) },
        );
  const openable =
    canOpenRun &&
    Boolean(run.parentSessionId && run.toolCallId) &&
    (resolveRunProject === undefined ? true : (project?.canOpen ?? false));
  // 产物 chip 的门：只要 `parentSessionId` 在场（老行可缺）+ 项目可打开。
  // `toolCallId` 不是条件——产物 tab 不回那条 CreateWorkflow 工具行。
  const artifactsOpenable =
    onOpenArtifact !== undefined &&
    Boolean(run.parentSessionId) &&
    (resolveRunProject === undefined ? true : (project?.canOpen ?? false));
  const artifacts = run.artifacts ?? [];
  const artifactCountLabel =
    artifacts.length === 0
      ? undefined
      : intl.formatMessage(
          {
            id:
              artifacts.length === 1
                ? "chat.toolCall.workflow.card.artifact"
                : "chat.toolCall.workflow.card.artifacts",
          },
          { count: artifacts.length },
        );
  return (
    <div className={cn(index > 0 && "border-t border-border")} data-testid={testId(TID_WORKFLOW_RUN_ROW, run.runId)}>
      <div className="flex min-w-0 items-stretch">
        <button
          aria-expanded={expanded}
          aria-label={intl.formatMessage({
            id: expanded
              ? "workflows.hub.history.row.collapse"
              : "workflows.hub.history.row.expand",
          })}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 pl-3 pr-2 text-left outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40"
          data-testid="workflow-run-ledger-toggle"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span
            aria-label={statusLabel}
            className={cn(
              "wf-lamp size-2.5 shrink-0 rounded-full",
              STATUS_DOT[dot],
              dot === "pending" && "bg-background",
              dot === "running" && "wf-lamp-running motion-reduce:animate-none",
            )}
            data-run-status={kind}
            data-testid="workflow-run-ledger-status"
            role="img"
            title={statusLabel}
          />
          <span
            className="shrink-0 whitespace-nowrap text-ui-base text-foreground"
            data-testid="workflow-run-ledger-time"
          >
            {formatDateTime(run.createdAt)}
          </span>
          {resolveRunProject === undefined || project === null ? null : (
            <span
              className="min-w-0 max-w-40 truncate text-ui-base text-foreground-subtle"
              data-workflow-run-project="true"
              title={project.title ?? project.label}
            >
              {project.label}
            </span>
          )}
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2.5 font-mono text-ui-xs tabular-nums text-foreground-subtlest">
            <span data-testid="workflow-run-ledger-duration">{duration}</span>
            {artifactCountLabel === undefined ? null : (
              <span data-testid="workflow-run-ledger-artifacts">{artifactCountLabel}</span>
            )}
            <ChevronRightIcon
              aria-hidden
              className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
            />
          </span>
        </button>
        {openable ? (
          <Button
            className="my-1 mr-2 shrink-0 self-center text-foreground-subtle"
            data-icon="inline-end"
            onClick={() => onOpenRun(run)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {intl.formatMessage({ id: "workflows.hub.history.open" })}
            <ChevronRightIcon aria-hidden="true" className="size-3" />
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <div
          className="wf-unfold flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pb-2.5 pt-0 text-ui-base text-foreground-subtle"
          data-testid="workflow-run-ledger-detail"
        >
          <span>
            {intl.formatMessage(
              { id: "workflows.hub.history.tokens" },
              { tokens: formatSavedWorkflowTokens(run.spentTokens) },
            )}
          </span>
          {formatSavedWorkflowRunArgs(run.args).map((chip) => (
            <span
              className="rounded-xs border border-border px-1.5 py-0.5 font-mono text-ui-xs leading-none text-foreground-subtlest"
              key={chip}
            >
              {chip}
            </span>
          ))}
          {/*
           * 这次运行交付的产物。
           * ⚠ 术语：artifact = 脚本发布给用户看的产出，不是脚本的顶层返回值。
           * 老行没有这个键（老 CLI 不发），整块因此缺席而不是画一个空位。
           */}
          {run.artifacts === undefined ? null : (
            <SavedWorkflowArtifactChips
              artifacts={run.artifacts}
              {...(artifactsOpenable
                ? {
                    onOpenArtifact: (artifactId: string) => onOpenArtifact?.(run, artifactId),
                  }
                : {})}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}