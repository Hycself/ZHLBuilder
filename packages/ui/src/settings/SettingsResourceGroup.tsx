import type { ReactNode } from "react";
import { ContentSectionHeader } from "@/next-shell/ContentPageScaffold.js";

/**
 * 资源分区头（插件/MCP/技能/命令/钩子/子智能体）此前各自维护一份同样的
 * 「标题 + 计数 + 右侧动作」行，间距和基线各不相同；这里统一走内容页分区骨架，
 * 只换结构，计数仍用原来那一档前景色。
 */
export function SettingsResourceGroupHeader({
  actions,
  count,
  title,
}: {
  actions?: ReactNode;
  count: number;
  title: string;
}) {
  return (
    <ContentSectionHeader
      actions={actions}
      count={count}
      countTone="subtle"
      headingLevel={3}
      title={title}
    />
  );
}

export function SettingsResourceList<T>({
  getKey,
  items,
  renderItem,
}: {
  getKey: (item: T) => string;
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg bg-surface">
      {items.map((item, index) => (
        <div key={getKey(item)}>
          {index > 0 ? <div className="h-px bg-border/50" aria-hidden="true" /> : null}
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}
