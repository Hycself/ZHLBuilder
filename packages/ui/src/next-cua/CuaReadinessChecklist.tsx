import { useState } from "react";
import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import type { CuaPermissionKind } from "@zhlbuilder/shared";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { SettingsBadge, SettingsGroupCard } from "@/settings/SettingsPageParts.js";
import { StatusDot, type StatusDotTone } from "@/settings/StatusDot.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/**
 * 电脑控制「就绪检查表」（自研重写 v2 · C1）。
 *
 * 形态：**总状态一行**（可用 / 待授权 / 不可用，灯 + 词 + 一句读数）挂在最上面，下面是检查项
 * 一行一项——状态徽标 + 名称 + 说明（展开显示）+ 该项的动作（一键直达 / 重启回执）。一眼能回答
 * 「现在能不能用、差什么、点哪里」；说明默认收起，密度给到读数而不是解释。
 *
 * 边界：本组件是纯展示 + 回调，不接触服务、投影或平台命令；就绪度的**计算**留在
 * `ComputerUseSection`（它拿得到插件态、Helper 状态与 OS 地板），这里只把结论画出来。
 * 「一键直达」与「重启回执」的门控沿用旧行：回调缺席即该项不可操作（未知平台 / 远端）。
 */
export type CuaSupportKind = "local-macos" | "local-windows" | "local-linux" | "remote" | "web";

export interface CuaReadinessPermissionItem {
  kind: CuaPermissionKind;
  labelId: string;
  purposeId: string;
  state: "granted" | "stale" | "denied" | "unknown" | undefined;
  /** 已授权（granted）时的替换文案（如「系统版本」项说「满足要求」而不是「已授权」）。 */
  grantedLabelId?: string;
  /** 一键直达（打开系统设置的那一页）。缺席即不可直达。 */
  onGrant?: () => void;
  /** 直达按钮的文案 id（`chat.cuaPermission.open*`）。 */
  grantLabelId: string;
  /** 重启回执（旧 Helper 的 stale：先重启再验证）。缺席即该项不提供重启。 */
  onRestart?: () => void;
  restarting?: boolean;
  /** 没有 workspace 路径等前置条件时的置灰（按钮仍在，说明侧面告诉用户缺什么）。 */
  restartDisabled?: boolean;
  /** 重启后仍然 stale：整应用重启的兜底（回执的最后一格）。 */
  onRelaunchApp?: () => void;
  verifyTimedOut?: boolean;
}

export interface CuaReadinessChecklistProps {
  supportKind: CuaSupportKind;
  /** 低于系统地板时在场：总状态行与「系统版本」一项都说这件事。 */
  osFloor?: { minimum: string; current: string } | undefined;
  /** macOS 本机的两项系统授权；其余平台为空。 */
  permissions: readonly CuaReadinessPermissionItem[];
  /** 插件总开关：未启用时不摆检查项，只留一句「先打开总开关」。 */
  enabled: boolean;
  /** 权限查询已落定：未落定的直达按钮显示「验证中…」并禁用。 */
  settled: boolean;
}

export function CuaReadinessChecklist({
  enabled,
  osFloor,
  permissions,
  settled,
  supportKind,
}: CuaReadinessChecklistProps) {
  const { intl } = useZCodeIntl();
  const macos = supportKind === "local-macos";
  const unsupported =
    supportKind === "local-linux" || supportKind === "remote" || supportKind === "web";
  const waiting = macos && enabled ? permissions.filter((item) => item.state !== "granted") : [];
  const ready = macos && enabled && waiting.length === 0 && osFloor === undefined;
  const summary = unsupported
    ? {
        id: "settings.computerUse.readiness.unavailable",
        reasonId:
          supportKind === "local-linux"
            ? "settings.computerUse.unsupported.linuxDescription"
            : "settings.computerUse.unsupported.remoteDescription",
        tone: "muted" as StatusDotTone,
      }
    : osFloor !== undefined
      ? {
          id: "settings.computerUse.readiness.unavailable",
          reasonId: "cuaPermission.osFloorTitle",
          tone: "red" as StatusDotTone,
        }
      : ready || supportKind === "local-windows"
        ? {
            id: "settings.computerUse.readiness.ready",
            reasonId:
              supportKind === "local-windows"
                ? "settings.computerUse.readiness.readyWindowsSummary"
                : "settings.computerUse.readiness.readySummary",
            tone: "green" as StatusDotTone,
          }
        : {
            id: "settings.computerUse.readiness.attention",
            reasonId: "settings.computerUse.readiness.attentionSummary",
            tone: "amber" as StatusDotTone,
          };
  const reasonValues = {
    count: waiting.length,
    minimum: osFloor?.minimum ?? "",
    current: osFloor?.current ?? "",
  };
  const reason = intl.formatMessage({ id: summary.reasonId }, reasonValues);
  return (
    <SettingsGroupCard>
      <div
        className="flex min-w-0 items-center gap-2 px-4 py-2.5"
        data-readiness={ready ? "ready" : unsupported || osFloor !== undefined ? "unavailable" : "attention"}
        data-testid="cua-readiness-summary"
      >
        <StatusDot tone={summary.tone} />
        <span
          className={cn(
            "shrink-0 text-ui-base font-medium",
            summary.tone === "red" ? "text-destructive" : "text-foreground",
          )}
        >
          {intl.formatMessage({ id: summary.id })}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-ui-sm text-foreground-subtle"
          data-testid="cua-readiness-reason"
          title={reason}
        >
          {reason}
        </span>
      </div>
      {unsupported ? null : !macos ? null : !enabled ? (
        <p
          className="border-t border-border px-4 py-2.5 text-ui-sm text-foreground-subtle"
          data-testid="cua-readiness-enable-first"
        >
          {intl.formatMessage({ id: "settings.computerUse.readiness.enableFirst" })}
        </p>
      ) : (
        <>
          <CuaChecklistItem
            grantedLabelId="settings.computerUse.readiness.osGranted"
            kind={undefined}
            labelId="settings.computerUse.readiness.osLabel"
            purposeId={
              osFloor === undefined
                ? "settings.computerUse.readiness.osPurpose"
                : "cuaPermission.osFloorDescription"
            }
            settled={settled}
            state={osFloor === undefined ? "granted" : "denied"}
          />
          {permissions.map((item) => (
            <CuaChecklistItem key={item.kind} {...item} settled={settled} />
          ))}
        </>
      )}
    </SettingsGroupCard>
  );
}

/** 检查表的一行：名称 + 说明（展开显示）+ 状态徽标 + 该项动作。 */
function CuaChecklistItem({
  grantLabelId,
  grantedLabelId,
  kind,
  labelId,
  onGrant,
  onRelaunchApp,
  onRestart,
  purposeId,
  restartDisabled = false,
  restarting = false,
  settled,
  state,
  verifyTimedOut = false,
}: {
  kind?: CuaPermissionKind;
  labelId: string;
  purposeId: string;
  state: "granted" | "stale" | "denied" | "unknown" | undefined;
  grantedLabelId?: string;
  grantLabelId?: string;
  onGrant?: () => void;
  onRestart?: () => void;
  restarting?: boolean;
  restartDisabled?: boolean;
  onRelaunchApp?: () => void;
  verifyTimedOut?: boolean;
  settled: boolean;
}) {
  const { intl } = useZCodeIntl();
  const [explained, setExplained] = useState(false);
  const view =
    state === "granted"
      ? {
          text: grantedLabelId ?? "cuaPermission.status.granted",
          tone: "green" as StatusDotTone,
        }
      : state === "stale"
        ? { text: "cuaPermission.status.stale", tone: "amber" as StatusDotTone }
        : state === "denied"
          ? { text: "cuaPermission.status.missing", tone: "red" as StatusDotTone }
          : { text: "cuaPermission.status.unknown", tone: "muted" as StatusDotTone };
  const badge = (
    <SettingsBadge>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot tone={view.tone} />
        {intl.formatMessage({ id: view.text })}
      </span>
    </SettingsBadge>
  );
  // 未授权（denied）时徽标本身可点，效果同「打开系统设置」——沿用旧行的行为。
  const badgeNode =
    state === "denied" && onGrant !== undefined ? (
      <button
        aria-label={intl.formatMessage({ id: view.text })}
        className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="cua-readiness-badge-grant"
        onClick={onGrant}
        type="button"
      >
        {badge}
      </button>
    ) : (
      badge
    );
  // 一键直达：未授权时（徽标之外）另给一枚带文案的按钮；查询未落定时显示「验证中…」。
  const grantButton =
    state === "denied" && onGrant !== undefined ? (
      <Button
        className="shrink-0"
        data-icon="inline-end"
        disabled={!settled}
        data-testid="cua-readiness-grant"
        onClick={onGrant}
        size="sm"
        type="button"
        variant="outline"
      >
        <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
        {intl.formatMessage({
          id: settled && grantLabelId !== undefined ? grantLabelId : "cuaPermission.status.verifying",
        })}
      </Button>
    ) : null;
  return (
    <div
      className="border-t border-border px-4 py-2.5"
      data-cua-check={kind ?? "platform"}
      data-cua-check-state={state ?? "unknown"}
      data-testid="cua-readiness-item"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-ui-base text-foreground">
          {intl.formatMessage({ id: labelId })}
        </span>
        <button
          aria-expanded={explained}
          aria-label={intl.formatMessage(
            { id: "settings.computerUse.readiness.detailsLabel" },
            { name: intl.formatMessage({ id: labelId }) },
          )}
          className="flex shrink-0 items-center gap-0.5 rounded-sm text-ui-sm text-foreground-subtle outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          data-testid="cua-readiness-details"
          onClick={() => setExplained((value) => !value)}
          type="button"
        >
          {intl.formatMessage({ id: "settings.computerUse.readiness.details" })}
          <ChevronRightIcon
            aria-hidden
            className={cn("size-3 transition-transform", explained && "rotate-90")}
          />
        </button>
        {badgeNode}
        {grantButton}
      </div>
      {explained ? (
        <p
          className="mt-1 text-ui-sm text-foreground-subtle"
          data-testid="cua-readiness-purpose"
        >
          {intl.formatMessage({ id: purposeId })}
        </p>
      ) : null}
      {/* 重启回执（旧 Helper 的 stale）：先重启并验证；仍失败时给出整应用重启的兜底。 */}
      {state === "stale" && onRestart !== undefined ? (
        <div className="mt-1.5 flex flex-col items-start gap-1.5">
          <Button
            className="shrink-0"
            data-testid="cua-readiness-restart"
            disabled={restarting || restartDisabled}
            onClick={onRestart}
            size="sm"
            type="button"
            variant="outline"
          >
            {intl.formatMessage({
              id: restarting
                ? "cuaPermission.modal.restarting"
                : "cuaPermission.modal.restartButton",
            })}
          </Button>
          {verifyTimedOut && !restarting ? (
            <>
              <span className="text-ui-xs text-foreground-subtlest">
                {intl.formatMessage({ id: "cuaPermission.modal.relaunchAppHint" })}
              </span>
              <Button
                className="shrink-0"
                onClick={onRelaunchApp}
                size="sm"
                type="button"
                variant="ghost"
              >
                {intl.formatMessage({ id: "cuaPermission.modal.relaunchAppButton" })}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}