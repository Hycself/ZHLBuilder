import { useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { TaskRowActionButton } from "@/workspace-grouped-tasks/task-row-action-button.js";

export function GroupedDraftTaskRow({
  active,
  workspaceLabel,
  onSelect,
  onClose,
}: {
  active: boolean;
  workspaceLabel: string;
  onSelect: () => void;
  onClose?: () => void;
}) {
  const { intl } = useZCodeIntl();
  // 触屏端没有 hover：关闭入口必须常驻，否则草稿行在手机远控里无法丢弃。
  // 与 task-row 同款判定（matchMedia("(hover: none)")），只在初始化时读一次。
  const [isHoverNone] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none)").matches,
  );
  const title = intl.formatMessage({ id: "taskList.newThread" });
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onSelect();
  };
  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose?.();
  };

  return (
    <div className={cn("rounded-lg py-px transition-colors")}>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        className={cn(
          "group/task-row flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg pl-2.5 pr-1 text-left text-ui-base transition-colors",
          "border border-dashed",
          active
            ? "bg-selected border-primary/35"
            : "bg-success/10 border-primary/20 hover:bg-success/14",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-foreground-subtlest" title={title}>
          {title}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-ui-sm text-foreground-subtle">
          <span
            className="max-w-24 truncate rounded-md bg-tag/50 px-1.5 py-0.5 text-ui-sm text-foreground-subtle"
            title={workspaceLabel}
          >
            {workspaceLabel}
          </span>
          <span className="relative size-6 shrink-0">
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-0 flex items-center justify-center",
                onClose && !isHoverNone && "group-hover/task-row:hidden",
                // 触屏常驻关闭入口时让位给 X，避免两枚标记在 6×6 槽里叠画。
                onClose && isHoverNone && "hidden",
              )}
            >
              <span className="size-1.5 rounded-full bg-green-500 dark:bg-green-400" />
            </span>
            {onClose ? (
              <span
                className={cn(
                  "absolute inset-0 items-center justify-center",
                  isHoverNone ? "flex" : "hidden group-hover/task-row:flex",
                )}
              >
                <TaskRowActionButton
                  label={intl.formatMessage({ id: "common.close" })}
                  onClick={handleClose}
                >
                  <X className="size-3.5" />
                </TaskRowActionButton>
              </span>
            ) : null}
          </span>
        </span>
      </div>
    </div>
  );
}
