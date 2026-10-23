import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { cn } from "@/components/lib/utils.js";

export interface AppNavRailItem {
  /** 稳定 id：既做 React key，也作为 DOM 探针与焦点定位的锚点 */
  id: string;
  icon: LucideIcon;
  /** 已由调用方用现有 i18n key 解析好的文案，轨内不引入任何新文案 */
  label: string;
  shortcutLabel?: string;
  /** 禁用时给出的原因；没有禁用时不传 */
  disabledReason?: string;
  testId?: string;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  /**
   * primary = 日常动线（新建、搜索），钉在轨顶；
   * secondary = 偶尔去的去处（自动化、插件市场），沉到轨底。
   * 分组的意义：让「几乎每次都用」和「一周点两次」在视觉上不再同权。
   */
  section?: "primary" | "secondary";
}

/**
 * 应用导航轨：把「去处」从「内容」里摘出来。
 *
 * 为什么要单独一列：原先「新建任务 / 搜索 / 自动化 / 插件市场」四个入口和项目行、
 * 会话行用同一套行样式竖着排在同一列里，侧栏因此没有可读的分区——扫一眼分不出
 * 哪个是动作、哪个是数据。它们性质不同，就不该长一样，所以挪到最左一列固定成
 * 图标轨，右列只留内容。配色、圆角、焦点环全部沿用现有令牌，不引入新色值。
 */
export function AppNavRail({
  items,
  ariaLabel,
}: {
  items: AppNavRailItem[];
  ariaLabel: string;
}) {
  const primary = items.filter((item) => (item.section ?? "primary") === "primary");
  const secondary = items.filter((item) => item.section === "secondary");

  return (
    <nav
      aria-label={ariaLabel}
      data-testid="app-nav-rail"
      className="flex h-full w-13 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar px-1.5 pb-2"
    >
      {/* 顶部 48px 让给窗口标题带：品牌标由 DesktopTopOverlay 独占绘制，
          轨上再放一枚就成了左上角两个标叠在一起。图标一律从这条带下面起排。 */}
      <div aria-hidden="true" className="h-12 shrink-0 [app-region:drag]" />
      {primary.map((item) => (
        <AppNavRailButton key={item.id} item={item} />
      ))}
      {secondary.length > 0 ? (
        <>
          {/* mt-auto 把次要去处压到底部，轨顶只留日常动线；中间留白是刻意的，
              不是没排完——一列里同时有高频和低频时，距离本身就是层级。 */}
          <div aria-hidden="true" className="mt-auto w-6 border-t border-border" />
          {secondary.map((item) => (
            <AppNavRailButton key={item.id} item={item} />
          ))}
        </>
      ) : null}
    </nav>
  );
}

function AppNavRailButton({ item }: { item: AppNavRailItem }) {
  const Icon = item.icon;
  const tooltipTitle = item.disabled ? (item.disabledReason ?? item.label) : item.label;

  return (
    <ControlHintTooltip title={tooltipTitle} shortcut={item.shortcutLabel} side="right">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={item.label}
        aria-current={item.active ? "page" : undefined}
        aria-pressed={item.active}
        disabled={item.disabled}
        data-testid={item.testId}
        data-nav-rail-item={item.id}
        onClick={item.onSelect}
        className={cn(
          "relative size-9 shrink-0 rounded-md text-foreground-subtle transition-colors duration-150",
          "hover:bg-hover hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring/30",
          // 纸与墨：选中不填色块。侧栏是长期驻留区，实心块会把注意力从内容列抢走；
          // 这里只用「墨色图标 + 左侧一道 2px 墨线」表达，像印刷品的页边标记。
          item.active && "bg-transparent text-foreground",
          item.disabled && "cursor-not-allowed text-foreground-subtlest hover:bg-transparent",
        )}
      >
        {/* 选中态用一条中性指示条表达，而不是把整块填成主色：
            侧栏是长期驻留区，实心块会把注意力从内容列抢走；指示条也不该用强调色，
            否则一列里每个选中项都在抢青色。 */}
        {item.active ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-0 h-5 w-[2px] -translate-y-1/2 bg-foreground"
          />
        ) : null}
        <Icon aria-hidden="true" className="size-4" />
      </Button>
    </ControlHintTooltip>
  );
}
