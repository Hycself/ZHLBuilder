/**
 * 草稿态空态问候：时间问候语 + ZCode Logo。
 * 自旧版 ChatView/ChatViewEmptyState.tsx 恢复（该组件随旧 ChatView 删除，
 * i18n key `chat.empty.greeting.*` 一直保留）；边界时刻自动换档逻辑保真。
 * 手机远控复用同一组件，但继续保留 20px 紧凑标题；桌面草稿首页才按标题自身宽度适配。
 */
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useIsOfficeMode } from "@/hooks/useInterfaceMode.js";
import { logger } from "@/logger.js";

const GREETING_BOUNDARY_HOURS = [5, 9, 12, 14, 18, 23] as const;
// 问候语原本是 20–30px 的展示级标题，和它下面的输入框抢同一个视觉重心，
// 而输入框才是这一屏唯一的动作。现在收进排版的标题档：最大 18px（text-ui-xl），
// 长译文放不下时才降到 16px（text-ui-lg），层级靠位置与字重表达，不靠字号堆。
const GREETING_MIN_FONT_SIZE_PX = 16;
const GREETING_MAX_FONT_SIZE_PX = 18;

type ChatEmptyGreetingMessageId =
  | "chat.empty.greeting.morningEarly"
  | "chat.empty.greeting.morning"
  | "chat.empty.greeting.noon"
  | "chat.empty.greeting.afternoon"
  | "chat.empty.greeting.evening"
  | "chat.empty.greeting.lateNight";

function getChatEmptyGreetingMessageId(date: Date = new Date()): ChatEmptyGreetingMessageId {
  const hour = date.getHours();

  if (hour >= 5 && hour < 9) return "chat.empty.greeting.morningEarly";
  if (hour >= 9 && hour < 12) return "chat.empty.greeting.morning";
  if (hour >= 12 && hour < 14) return "chat.empty.greeting.noon";
  if (hour >= 14 && hour < 18) return "chat.empty.greeting.afternoon";
  if (hour >= 18 && hour < 23) return "chat.empty.greeting.evening";

  return "chat.empty.greeting.lateNight";
}

function getNextChatEmptyGreetingDelayMs(date: Date = new Date()) {
  const candidates = GREETING_BOUNDARY_HOURS.map((hour) => {
    const boundary = new Date(date);
    boundary.setHours(hour, 0, 0, 0);
    return boundary;
  });
  const tomorrowFirstBoundary = new Date(date);
  tomorrowFirstBoundary.setDate(tomorrowFirstBoundary.getDate() + 1);
  tomorrowFirstBoundary.setHours(GREETING_BOUNDARY_HOURS[0], 0, 0, 0);

  const nextBoundary =
    candidates.find((candidate) => candidate.getTime() > date.getTime()) ?? tomorrowFirstBoundary;

  return Math.max(1, nextBoundary.getTime() - date.getTime());
}

function resolveGreetingFontSizePx({
  availableWidthPx,
  naturalTextWidthPx,
}: {
  availableWidthPx: number;
  naturalTextWidthPx: number;
}) {
  if (
    !Number.isFinite(availableWidthPx) ||
    !Number.isFinite(naturalTextWidthPx) ||
    availableWidthPx <= 0 ||
    naturalTextWidthPx <= 0 ||
    availableWidthPx >= naturalTextWidthPx
  ) {
    return GREETING_MAX_FONT_SIZE_PX;
  }

  return Math.max(
    GREETING_MIN_FONT_SIZE_PX,
    Math.min(
      GREETING_MAX_FONT_SIZE_PX,
      Math.floor(GREETING_MAX_FONT_SIZE_PX * (availableWidthPx / naturalTextWidthPx)),
    ),
  );
}

export function ConversationDraftEmptyState({ className }: { className?: string }) {
  const { intl } = useZCodeIntl();
  const isOfficeMode = useIsOfficeMode();
  const [greetingDate, setGreetingDate] = useState(() => new Date());
  const [greetingFontSizePx, setGreetingFontSizePx] = useState(GREETING_MAX_FONT_SIZE_PX);
  const greetingContainerRef = useRef<HTMLParagraphElement | null>(null);
  const greetingMeasurementRef = useRef<HTMLSpanElement | null>(null);
  const greeting = intl.formatMessage({
    id: isOfficeMode ? "chat.empty.greeting.office" : getChatEmptyGreetingMessageId(greetingDate),
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setGreetingDate(new Date());
    }, getNextChatEmptyGreetingDelayMs(greetingDate));

    return () => {
      window.clearTimeout(timeout);
    };
  }, [greetingDate]);

  useLayoutEffect(() => {
    const container = greetingContainerRef.current;
    const measurement = greetingMeasurementRef.current;
    if (!container || !measurement) {
      return;
    }

    let frameId: number | null = null;
    const measure = () => {
      frameId = null;
      const containerStyle = window.getComputedStyle(container);
      const horizontalPaddingPx =
        Number.parseFloat(containerStyle.paddingLeft) +
        Number.parseFloat(containerStyle.paddingRight);
      const availableWidthPx = Math.max(
        0,
        container.getBoundingClientRect().width - horizontalPaddingPx,
      );
      const naturalTextWidthPx = measurement.getBoundingClientRect().width;
      const nextFontSizePx = resolveGreetingFontSizePx({
        availableWidthPx,
        naturalTextWidthPx,
      });

      setGreetingFontSizePx((currentFontSizePx) => {
        if (currentFontSizePx === nextFontSizePx) {
          return currentFontSizePx;
        }
        logger.debug("[v4-draft-greeting] 标题自身可用宽度变化，更新字号", {
          availableWidthPx: Math.round(availableWidthPx),
          naturalTextWidthPx: Math.round(naturalTextWidthPx),
          previousFontSizePx: currentFontSizePx,
          nextFontSizePx,
        });
        return nextFontSizePx;
      });
    };
    const scheduleMeasure = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(measure);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleMeasure);
      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
        window.removeEventListener("resize", scheduleMeasure);
      };
    }

    // 标题字号曾直接绑定整个视口宽度，最小窗口里文字两侧仍有大量空间却被
    // 强制缩到 20px。分别观察标题容器和 30px 原始文案，只在两者真实相撞时缩小。
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    observer.observe(measurement);
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, [greeting]);

  return (
    <div
      className={cn(
        // 左对齐到输入框同一列的左沿：问候语因此变成这张卡的标题，
        // 而不是一屏居中的 hero。间距也从 gap-6 收到 gap-3，让它贴着输入框。
        // 「纸与墨」：容器只承担排版节奏，不再承载任何装饰性图层。
        "relative mb-8 flex w-full max-w-3xl flex-col items-start justify-center gap-4 text-foreground sm:mb-6",
        className,
      )}
    >
      <p
        ref={greetingContainerRef}
        data-v4-draft-greeting="true"
        style={
          {
            "--v4-draft-greeting-font-size": `${greetingFontSizePx}px`,
          } as CSSProperties
        }
        className={cn(
          // 纸与墨：问候语按「出版物章节标题」处理 —— 半粗、紧字距、下方一道发丝线收口。
          // 原先的半粗 + 宽松行距读起来像营销 hero；收紧字距并加一条细线，
          // 它就变成正文的开头，而不是飘在页面中间的标语。
          "relative z-10 w-full border-b border-border px-4 pb-4 text-left font-semibold tracking-ink-tight text-foreground",
          "text-[length:var(--v4-draft-greeting-font-size)]/[1.3]",
        )}
      >
        <span
          ref={greetingMeasurementRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute whitespace-nowrap text-ui-xl/[1.4]"
        >
          {greeting}
        </span>
        <span>{greeting}</span>
      </p>
    </div>
  );
}
