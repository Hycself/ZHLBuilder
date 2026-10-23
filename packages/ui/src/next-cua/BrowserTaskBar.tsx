import { cn } from "@/components/lib/utils.js";
import { StatusDot } from "@/settings/StatusDot.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useBrowserUseOperationActive } from "@/browser-use/useBrowserUseOperationActive.js";

/**
 * 浏览器运行视图「当前任务条」（自研重写 v2 · C3）。
 *
 * 一条 slim 常显横条：**灯 + 词 + 一句读数**。数据源只有一个——`browserUseOperationUntil`
 * 那个 5 秒 operation deadline（`useBrowserUseOperationActive`，与标签页图标、自由尺寸警告
 * 共用同一判断）：在场 = 电脑控制正在驱动这个浏览器（琥珀脉冲灯），缺席 = 就绪（灰灯）。
 *
 * 边界：**不画步骤日志**。浏览器操作历史不在 UI 层可得（契约里只有 operation deadline 与
 * 截图 surface），照实不伪造——将来若事件流带操作序列，再在这条以下接第三栏。
 */
export function BrowserTaskBar({ operationUntil }: { operationUntil?: number }) {
  const { intl } = useZCodeIntl();
  const operating = useBrowserUseOperationActive(operationUntil ?? 0);
  return (
    <div
      className="flex h-7 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
      data-browser-task-bar={operating ? "operating" : "idle"}
      data-testid="browser-task-bar"
    >
      <StatusDot spinning={operating} tone={operating ? "amber" : "muted"} />
      <span
        className={cn(
          "shrink-0 text-ui-xs font-medium",
          operating ? "text-warning" : "text-foreground",
        )}
      >
        {intl.formatMessage({
          id: operating ? "browser.taskBar.operating" : "browser.taskBar.idle",
        })}
      </span>
      <span className="min-w-0 flex-1 truncate text-ui-xs text-foreground-subtlest">
        {intl.formatMessage({
          id: operating ? "browser.taskBar.operatingHint" : "browser.taskBar.idleHint",
        })}
      </span>
    </div>
  );
}