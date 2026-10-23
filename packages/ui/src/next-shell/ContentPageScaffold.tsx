import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";

/**
 * 内容页外框：统一「可读宽度 + 纵向节奏」。
 * 之前功能页各自铺满可用宽度，插件卡被拉到 1100px 宽、描述只能截断收场；
 * 页面之间上下留白也不一致，切页面时版心一直在跳。这里的宽度与设置页已有的
 * SETTINGS_FRAME_CONTENT_CLASSNAME（max-w-4xl）取同一档，全应用只有一套版心；
 * 窄屏仍然 w-full，不引入固定像素宽度。
 */
export function ContentPageShell({
  children,
  className,
  testId,
  dataAttrs,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <div
      data-testid={testId}
      {...dataAttrs}
      className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10", className)}
    >
      {children}
    </div>
  );
}

/**
 * 内容页页头：整站「非首页」页面共用同一套头部结构。
 *
 * 之前每个功能页各写各的：有的标题独占一行、副标题再占一行、动作按钮散在第三行，
 * 搜索框还能再吃一整行宽度。结果是切页面时上沿一直在跳，页面显得彼此不属于同一个产品。
 * 这里收成一个约定：一行放「标题 + 说明 + 动作」，搜索与筛选归到页头下方的工具条行。
 * 只定结构与间距，颜色一律用现有令牌。
 */
export function ContentPageHeader({
  title,
  description,
  actions,
  breadcrumb,
  titleTestId,
  className,
}: {
  /** 页面标题文本（调用方用各自既有 i18n key 解析好） */
  title: string;
  description?: ReactNode;
  /** 右上角动作簇；主按钮由调用方自己保证只有一个 */
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  /** 标题上的 data-testid：E2E 契约靠它，套统一骨架时不能丢 */
  titleTestId?: string;
  className?: string;
}) {
  return (
    <header
      className={cn("flex w-full flex-col gap-1 border-b border-border pb-5", className)}
      data-page-header="true"
    >
      {breadcrumb ? <div className="mb-1">{breadcrumb}</div> : null}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1
            data-testid={titleTestId}
            className="min-w-0 truncate text-ui-display font-semibold tracking-ink-tight text-foreground"
          >
            {title}
          </h1>
          {description ? (
            <p className="min-w-0 max-w-2xl text-ui-base leading-6 text-foreground-subtle">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 pb-0.5">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * 页头下方的工具条：搜索、分段切换、筛选放在一起，并明确它们服务于下面的列表。
 * 之前搜索框通栏、分段控件缩在另一侧，看不出两者控制的是同一块内容。
 */
export function ContentPageToolbar({
  search,
  segments,
  filters,
  className,
}: {
  search?: ReactNode;
  segments?: ReactNode;
  filters?: ReactNode;
  className?: string;
}) {
  if (!search && !segments && !filters) {
    return null;
  }
  return (
    <div
      data-page-toolbar="true"
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
    >
      {search ? <div className="min-w-56 flex-1">{search}</div> : null}
      {segments ? <div className="flex shrink-0 items-center">{segments}</div> : null}
      {filters ? <div className="flex shrink-0 items-center gap-1">{filters}</div> : null}
    </div>
  );
}

/**
 * 列表分区头：标题 + 计数 + 右侧动作同一行。
 * 分区名与「这一区有多少条」是同一件事，分两行摆会让人以为计数属于上一区。
 */
export function ContentSectionHeader({
  title,
  count,
  actions,
  className,
  countTone = "subtlest",
  headingLevel = 2,
  id,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  className?: string;
  /** 计数用哪一档次级前景色：沿用调用方原本那一档，套统一骨架时不顺手改色 */
  countTone?: "subtle" | "subtlest";
  /** 标题层级：设置页里分区挂在页面标题之下，必须是 3 级，不能和页头抢层级 */
  headingLevel?: 2 | 3;
  /** 供列表用 aria-labelledby 关联本区 */
  id?: string;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div
      id={id}
      className={cn("flex items-center justify-between gap-3 border-b border-border pb-2", className)}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <Heading className="min-w-0 truncate text-ui-lg font-semibold text-foreground">
          {title}
        </Heading>
        {typeof count === "number" && count > 0 ? (
          <span
            className={cn(
              "shrink-0 text-ui-sm tabular-nums",
              countTone === "subtle" ? "text-foreground-subtle" : "text-foreground-subtlest",
            )}
          >
            {count}
          </span>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}