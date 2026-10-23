/*
 * 界面自研重写 v2（A2c）：行级操作条与行级时间的统一排版。
 *
 * 会话行的悬停操作条（复制 / 反馈 / 分支 / 钩子详情）与行级时间此前在三个装配点
 * 各自重复类名；这里收口为一处：
 *   - `MessageRowActions`：按宿主作用域（user-row / assistant-row / assistant-turn）
 *     统一「桌面 hover/focus 降噪，触屏/手机远控常显」的显现规则；
 *   - `MessageRowTime`：行级时间 = `row.createdAt` 的只读派生展示，统一字号 / 颜色 /
 *     数字对齐，文案走 formatMessageTimeLabel（zh/en 同源）。
 * 动作集与 testid 不变——本模块只改显现规则与排版，不新增也不吞并任何动作。
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { MessageActions } from "@/next-message/messageShells.js";
import { formatMessageTimeLabel } from "@/v4/messageTimeLabel.js";

export type MessageRowActionsScope = "user-row" | "assistant-row" | "assistant-turn";

// 三个作用域各写一遍完整类名：Tailwind 需要字面量才能生成规则，
// 但「显现规则」本身只在这里定义一处，装配点不再各自拼字符串。
const ROW_ACTIONS_REVEAL_CLASS: Record<MessageRowActionsScope, string> = {
  "user-row":
    "opacity-0 transition-opacity group-hover/user-row:opacity-100 focus-within:opacity-100",
  "assistant-row":
    "opacity-0 transition-opacity group-hover/assistant-row:opacity-100 focus-within:opacity-100",
  "assistant-turn":
    "opacity-0 transition-opacity group-hover/assistant-turn:opacity-100 focus-within:opacity-100",
};

/** 触屏 / 手机远控没有 hover：一次判定，贯穿该行生命周期。 */
function useHoverNone(): boolean {
  const [isHoverNone] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none)").matches,
  );
  return isHoverNone;
}

/**
 * 行级操作条：悬停/聚焦显现（桌面）或常显（触屏/手机远控）。
 * 间距由调用方通过 className 决定（就近摆放在内容之后）。
 */
export function MessageRowActions({
  scope,
  className,
  children,
}: {
  scope: MessageRowActionsScope;
  className?: string;
  children: ReactNode;
}) {
  const isHoverNone = useHoverNone();
  return (
    <MessageActions className={cn(isHoverNone ? undefined : ROW_ACTIONS_REVEAL_CLASS[scope], className)}>
      {children}
    </MessageActions>
  );
}

/** 行级时间：只读派生展示，数字等宽避免流式/滚动时抖动。 */
export function MessageRowTime({
  createdAt,
  className,
}: {
  createdAt: number;
  className?: string;
}) {
  const { intl, locale } = useZCodeIntl();
  const timeLabel = formatMessageTimeLabel(createdAt, locale, intl);
  if (!timeLabel) {
    return null;
  }

  return (
    <span
      className={cn(
        "ml-1 select-none whitespace-nowrap text-ui-sm text-foreground-subtlest tabular-nums",
        className,
      )}
    >
      {timeLabel}
    </span>
  );
}