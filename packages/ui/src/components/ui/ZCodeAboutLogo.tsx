import { cn } from "@/components/lib/utils.js";
import zhlbuilderMark from "@/assets/zhlbuilder-mark.png";

/**
 * ZHLBuilder 品牌标（XFSZHL 飞机标，品牌青 #22D3EE）。
 * 替换上游 ZCode 的 "Z" 字标 —— 上游视觉标识不随 fork 分发。
 */
export function ZCodeAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={zhlbuilderMark}
      alt="ZHLBuilder"
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    />
  );
}

/** 文字字标：不再使用上游 "ZCode" 矢量字标 */
export function ZCodeWordmarkLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 font-bold tracking-wide text-current",
        className,
      )}
      aria-hidden="true"
      focusable="false"
    >
      ZHLBuilder
    </span>
  );
}
