/*
 * 界面自研重写 v2（A3）：composer 外壳的展示子件。
 * `ComposerDragFeedback` = 拖拽投放提示覆层；`ComposerSubmitControls` = 取消 / 第二动作 / 主提交。
 * 类名与交互与旧外壳逐条一致（纯提取，不改行为）。
 */
import { ArrowUpIcon, Hand, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TID_CHAT_SEND_BUTTON } from "@zhlbuilder/shared";
import { Button } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";

export function ComposerDragFeedback({ hint }: { hint: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-accent/55 backdrop-blur-sm">
      <div className="flex items-center gap-2 rounded-full border border-border bg-accent px-4 py-2 text-ui-base text-foreground">
        <Hand className="size-4 text-foreground" />
        <span>{hint}</span>
      </div>
    </div>
  );
}

export function ComposerSubmitControls({
  betweenCancelAndSubmitAction,
  cancelLabel,
  cancelTestId,
  enterSubmits,
  onCancel,
  submitControl,
  submitDisabled,
  submitLabel,
  submitTestId,
  submitting,
}: {
  /** 行内编辑专用：固定插在取消与主提交之间的第二动作。 */
  betweenCancelAndSubmitAction?: ReactNode;
  cancelLabel?: string;
  cancelTestId?: string;
  enterSubmits?: boolean;
  onCancel?: () => void;
  submitControl?: ReactNode;
  submitDisabled?: boolean;
  submitLabel: string;
  submitTestId?: string;
  submitting: boolean;
}) {
  return (
    <>
      {onCancel && cancelLabel ? (
        <ControlHintTooltip title={cancelLabel} shortcut="Esc">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={onCancel}
            disabled={submitting}
            data-testid={cancelTestId}
            aria-label={cancelLabel}
          >
            <XIcon className="size-4" />
            <span className="sr-only">{cancelLabel}</span>
          </Button>
        </ControlHintTooltip>
      ) : null}
      {betweenCancelAndSubmitAction}
      {submitControl ?? (
        <ControlHintTooltip title={submitLabel} shortcut={enterSubmits ? "Enter" : undefined}>
          <Button
            type="submit"
            size="icon-md"
            disabled={submitDisabled}
            data-testid={submitTestId ?? TID_CHAT_SEND_BUTTON}
            aria-label={submitLabel}
            className="gap-1 rounded-lg bg-brand text-ui-base text-foreground-inverse hover:bg-brand/80"
          >
            {submitting ? <Spinner className="size-4" /> : <ArrowUpIcon className="size-4" />}
            <span className="sr-only">{submitLabel}</span>
          </Button>
        </ControlHintTooltip>
      )}
    </>
  );
}
