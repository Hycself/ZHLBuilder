import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon, CircleHelpIcon } from "lucide-react";
import type {
  WorkflowRunPendingQuestion,
  WorkflowRunState,
} from "@zhlbuilder/shared/zcode-protocol-v4";
import { WorkflowRunQuestionRow } from "@/app-shell/WorkflowRunQuestionRow.js";
import { AvatarCluster, Rounds } from "@/app-shell/WorkflowRunSpineParts.js";
import { cn } from "@/components/lib/utils.js";
import { laneDisplayName } from "@/components/workflow-graph/lane-name.js";
import { phaseDisplayName } from "@/components/workflow-graph/phase-name.js";
import { STATUS_DOT } from "@/components/workflow-graph/run-status-presentation.js";
import type { StepRunStatus, WorkflowCausalityGraphData } from "@/components/workflow-graph/types.js";
import {
  ROSTER_PINS_CARD,
  ROSTER_PINS_PANE,
  pillInstanceKey,
  rosterMore,
  rosterRestCounts,
  rosterRoll,
  stationRosterOf,
} from "@/components/workflow-timeline/roster-model.js";
import { pillActivity, type TimelinePill } from "@/components/workflow-timeline/timeline-model.js";
import {
  WorkflowAgentPill,
  type WorkflowAgentPillOpen,
} from "@/components/workflow-timeline/WorkflowAgentPill.js";
import { WorkflowMoreRow } from "@/components/workflow-timeline/WorkflowMoreRow.js";
import { WorkflowRoll } from "@/components/workflow-timeline/WorkflowRoll.js";
import { RosterMeter } from "@/components/workflow-timeline/WorkflowRosterParts.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ledgerOrdinal, type LedgerModel, type LedgerRow } from "./ledger-model.js";

/**
 * 账本的一行（自研重写 v2 · W1）：序号 / 状态点 / 名称 / 代理簇 / 进度 / 轮次 + chevron。
 * 点行头就地展开明细——药丸列（名册站是钉位 + 门 / 「还有 n 个」），问题挂在提问者那一行下面。
 * 两个面共用这一行：聊天里的运行卡（`digest`）与运行面板（`pane`），差别只有三处——
 * 名册门（面板是就地开合的门，卡上是开运行面板的 ↗）、问题行（卡上没有问题清单）、落点（面板专属）。
 *
 * 运行行自己展开（与从前同一条规则：正在跑的阶段不该再点一下才看得见谁在工作），用户收起后不再
 * 抢回。落点沿用旧语法：`landing.key` 每次打开都不同，同一站再点一次也再落（展开 + 开门 + 亮一下 + 滚到顶）。
 */
const LANDING_MS = 1200;

export function WorkflowLedgerRow({
  buckets,
  graph,
  landing,
  now,
  onOpenMore,
  onOpenPill,
  onOpenWorkspace,
  row,
  run,
  variant,
}: {
  /** 行下的待答问题（按提问者实例键）；卡上没有清单，缺席即不挂问题行。 */
  buckets?: LedgerModel["byInstance"];
  graph: WorkflowCausalityGraphData;
  /** 落点（面板专属）：`key` 每次打开都不同。 */
  landing?: { phaseId: string; key: string };
  /** 面板的「现在」（问题等待时长由清单的定时器喂）；缺席即取渲染的那一刻。 */
  now?: number;
  /** 卡上名册站「还有 n 个」那一行 → 开运行面板、落到这一站；缺席即静态行。 */
  onOpenMore?: () => void;
  /** 点药丸开子代理 transcript；缺席即药丸不可点。 */
  onOpenPill?: (pill: TimelinePill) => void;
  /** 点脚本药丸开脚本 transcript；缺席即脚本药丸不可点。 */
  onOpenWorkspace?: (pill: TimelinePill) => void;
  row: LedgerRow;
  run: WorkflowRunState | undefined;
  variant: "digest" | "pane";
}) {
  const { intl } = useZCodeIntl();
  const format = intl.formatMessage.bind(intl);
  const station = row.station;
  const status: StepRunStatus = station.status ?? "pending";
  const pending = status === "pending";
  const name = phaseDisplayName(station.naming, format);
  const roster = stationRosterOf(station, variant === "pane" ? ROSTER_PINS_PANE : ROSTER_PINS_CARD);
  const nameOf = (pill: TimelinePill) => pill.runtimeName ?? laneDisplayName(pill.lane, format);

  // 运行行自己展开；一旦跑起来过就记住用户的收起（effect 只在 running 翻真时补一次）。
  const [expanded, setExpanded] = useState(() => status === "running");
  const running = status === "running";
  useEffect(() => {
    if (running) setExpanded(true);
  }, [running]);
  // 名册的门：开合是这一行的局部状态，按站记（旧实现是清单级的一张 Set）。
  const [listed, setListed] = useState(false);

  const headRef = useRef<HTMLButtonElement>(null);
  const landedOnceRef = useRef<string | undefined>(undefined);
  const [landed, setLanded] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (
      variant !== "pane" ||
      landing === undefined ||
      landing.phaseId !== station.id ||
      landedOnceRef.current === landing.key
    )
      return undefined;
    landedOnceRef.current = landing.key;
    setExpanded(true);
    setListed(true);
    setLanded(landing.key);
    const timer = setTimeout(
      () => setLanded((current) => (current === landing.key ? undefined : current)),
      LANDING_MS,
    );
    return () => clearTimeout(timer);
  }, [landing, station.id, variant]);
  useEffect(() => {
    if (landed === undefined) return;
    const head = headRef.current;
    if (head === null || typeof head.scrollIntoView !== "function") return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    head.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [landed]);

  /** 药丸的公共接线（名字、状态、可打开）；钉位与名单共用。 */
  const pillProps = (pill: TimelinePill) => {
    const label = nameOf(pill);
    const openable = onOpenPill !== undefined && pill.slot !== undefined;
    const workspacePhaseId = onOpenWorkspace === undefined ? undefined : pill.workspace?.phaseId;
    const open: WorkflowAgentPillOpen | undefined = openable
      ? {
          data: {
            "data-agent-key": pillInstanceKey(pill) ?? "",
            "data-agent-session-id": pill.instance?.sessionId ?? "",
            "data-agent-status": pill.status ?? "pending",
          },
          label: format({ id: "chat.toolCall.workflow.timeline.openAgent" }, { name: label }),
          onOpen: () => onOpenPill?.(pill),
          testId: "workflow-run-agent-open",
        }
      : workspacePhaseId !== undefined
        ? {
            data: { "data-phase-id": workspacePhaseId },
            label: format({ id: "chat.toolCall.workflow.timeline.openScript" }, { phase: name }),
            onOpen: () => onOpenWorkspace?.(pill),
            testId: "workflow-run-workspace-open",
          }
        : undefined;
    return {
      avatarIndex: pill.avatarIndex,
      laneClass: pill.laneClass,
      name: label,
      status: pill.status,
      title: label,
      ...(open === undefined ? {} : { open }),
    };
  };

  const renderPill = (pill: TimelinePill) => {
    const activity = pillActivity(graph, run, pill);
    const key = pillInstanceKey(pill);
    const questions: readonly WorkflowRunPendingQuestion[] =
      key === undefined ? [] : (buckets?.get(key) ?? []);
    const counts: string[] = [];
    if (activity.asks > 0) {
      counts.push(
        format({ id: "chat.toolCall.workflow.graph.card.tasks" }, { count: activity.asks }),
      );
    }
    if (activity.reads > 0) {
      counts.push(
        format({ id: "chat.toolCall.workflow.graph.card.reads" }, { count: activity.reads }),
      );
    }
    return (
      <div className="flex min-w-0 flex-col" key={pill.key}>
        <WorkflowAgentPill {...pillProps(pill)}>
          {counts.length === 0 ? null : (
            <span className="shrink-0 font-mono text-ui-xs tabular-nums text-foreground-subtlest">
              {counts.join(" · ")}
            </span>
          )}
        </WorkflowAgentPill>
        {/* 问题挂在提问者下面，再退一步（26px）：它属于这一行，不属于这一站。 */}
        {questions.map((question) => (
          <WorkflowRunQuestionRow
            className="ml-[26px]"
            key={question.qid}
            now={now ?? Date.now()}
            question={question}
          />
        ))}
      </div>
    );
  };

  return (
    <section
      className={cn("wf-arrive relative", station.track > 0 && "border-l border-border")}
      data-phase-id={station.id}
      data-phase-landed={landed === undefined ? undefined : "true"}
      data-phase-open={expanded ? "true" : "false"}
      data-phase-status={status}
      data-phase-track={station.track}
      data-testid="workflow-run-phase"
      style={station.track > 0 ? { marginLeft: 12 * station.track } : undefined}
    >
      <button
        aria-expanded={expanded}
        aria-label={format(
          {
            id: expanded
              ? "chat.toolCall.workflow.run.phase.collapse"
              : "chat.toolCall.workflow.run.phase.expand",
          },
          { name },
        )}
        className={cn(
          "wf-station-open relative flex h-9 w-full items-center gap-2 rounded-md pl-2 pr-2.5 text-left outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40",
          landed !== undefined && "wf-landed",
        )}
        data-testid="workflow-run-phase-toggle"
        // 再落时换 key 重挂行头：同一个类名不会让 CSS 动画重来。
        key={landed ?? "head"}
        onClick={() => setExpanded((value) => !value)}
        ref={headRef}
        type="button"
      >
        <span
          aria-hidden
          className="w-6 shrink-0 font-mono text-ui-xs leading-none tabular-nums text-foreground-subtlest"
        >
          {ledgerOrdinal(row.index)}
        </span>
        <span
          aria-hidden
          className={cn(
            "wf-lamp size-2.5 shrink-0 rounded-full",
            STATUS_DOT[status],
            status === "pending" && "bg-background",
            status === "running" && "wf-lamp-running motion-reduce:animate-none",
          )}
          data-lamp={status}
          data-testid="workflow-run-phase-lamp"
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-ui-base",
            pending ? "text-foreground-subtle" : "font-medium text-foreground",
          )}
        >
          {name}
        </span>
        <span className="flex shrink-0 items-center gap-2.5 font-mono text-ui-xs tabular-nums text-foreground-subtlest">
          {expanded ? null : roster !== undefined ? (
            <RosterMeter counts={roster.counts} mini />
          ) : (
            <AvatarCluster nameOf={nameOf} pills={station.pills} />
          )}
          {station.fraction === undefined ? null : (
            <span data-testid="workflow-run-phase-fraction">
              {station.fraction.settled}/{station.fraction.observed}
            </span>
          )}
          <Rounds station={station} />
          <ChevronRightIcon
            aria-hidden
            className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
          />
        </span>
      </button>
      {expanded ? (
        <div
          className="wf-unfold flex flex-col gap-1.5 pb-3 pl-[38px] pr-2.5 pt-0.5"
          data-testid="workflow-ledger-row-detail"
        >
          {roster === undefined ? (
            station.pills.map(renderPill)
          ) : (
            <>
              <div className="flex flex-col gap-1.5" data-testid="workflow-roster-pins">
                {roster.pinned.map(renderPill)}
              </div>
              <WorkflowMoreRow
                {...(variant === "pane"
                  ? { door: { open: listed, tally: rosterRestCounts(roster) } }
                  : {})}
                more={rosterMore(roster)}
                {...(variant === "pane"
                  ? { onOpen: () => setListed((value) => !value) }
                  : onOpenMore === undefined
                    ? {}
                    : { onOpen: onOpenMore })}
              />
              {variant !== "pane" || !listed ? null : (
                <WorkflowRoll
                  groups={rosterRoll(roster)}
                  unlisted={roster.unlisted.actors}
                  renderRow={(pill, enterDelayMs) => (
                    <WorkflowAgentPill
                      enterDelayMs={enterDelayMs}
                      key={pill.key}
                      size="row"
                      {...pillProps(pill)}
                    >
                      {/* 第六个及以后的提问者落在名单里：尾槽前一枚 ?，问题本身不在这里重复。 */}
                      {pill.asking === true ? (
                        <CircleHelpIcon
                          aria-hidden
                          className="size-3 shrink-0 text-warning"
                          data-testid="workflow-roll-asking"
                        />
                      ) : null}
                    </WorkflowAgentPill>
                  )}
                />
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}