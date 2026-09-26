import type { IPlatformService } from "@zhlbuilder/shared";
import type { IntlInstance } from "@/i18n/IntlProvider.js";
import { runExportLogsAction } from "@/lib/exportLogsAction.js";
import { BUILDER_PRODUCT_DOCS_URL } from "@/lib/productDocs.js";

interface HelpMenuActionHandlers {
  openIssueReport: () => void;
  openProductDocs: () => void;
  exportLogs: () => void;
}

export function createHelpMenuActionHandlers({
  platform,
  intl,
}: {
  platform: Pick<
    IPlatformService,
    "captureWindowScreenshot" | "exportLogs" | "openExternal" | "openFeedback"
  >;
  intl: IntlInstance;
}): HelpMenuActionHandlers {
  return {
    // 走 platform.openFeedback 而不是渲染层自绘的反馈弹窗：后者会把日志和截图
    // 上传到上游 feedback API（feedback_api_base 尚未指向 ZHL 侧后端）。
    // 本 fork 的反馈入口由 config/default.json 的 feedback_url 决定，即 ZHL 论坛。
    openIssueReport: () => {
      void platform.openFeedback();
    },
    openProductDocs: () => {
      platform.openExternal(BUILDER_PRODUCT_DOCS_URL);
    },
    exportLogs: () => {
      void runExportLogsAction(platform, intl);
    },
  };
}
