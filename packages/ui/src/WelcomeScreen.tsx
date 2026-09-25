/**
 * WelcomeScreen — ZHL 身份确认 + 模型配置指引
 *
 * ZHL 账号登录已由启动时的模态门（zhlGate.ts）完成。
 * 这里只做身份确认和引导用户去 Settings 配置模型提供商。
 */
import { useState } from "react";
import { SettingsIcon, SmartphoneIcon } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { ZCodeAboutLogo } from "@/components/ui/ZCodeAboutLogo.js";
import { ThemeHeroVisual } from "./openWorkspacePageThemeHero.js";

export type LoginCompleteReason = "zhl-oauth" | "skip";

interface WelcomeScreenProps {
  onComplete: (reason: LoginCompleteReason) => void | Promise<void>;
}

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [showModelHint, setShowModelHint] = useState(false);

  return (
    <main className="relative flex h-full min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-6 text-foreground sm:px-6">
      <ThemeHeroVisual className="absolute inset-0" />
      <div className="pointer-events-none absolute left-0 top-0 right-0 z-10 flex h-12 w-full items-center [app-region:drag]" />
      <section className="relative z-10 w-full max-w-sm rounded-2xl border border-popover-border bg-background p-8 text-ui-base/relaxed shadow-md sm:p-10">
        <div className="mb-6 flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#000000_0%,#151718_100%)] shadow-lg/20">
            <ZCodeAboutLogo className="h-auto w-10" />
          </div>
        </div>

        <div className="space-y-1 text-center">
          <p className="text-ui-lg font-bold text-foreground">ZHLBuilder</p>
          <p className="text-ui-sm text-foreground-subtle">
            ZHL 账号已就绪，配置模型后即可开始。
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => setShowModelHint(true)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-input-border-focused hover:bg-surface-hover"
          >
            <SettingsIcon className="size-5 shrink-0 text-[#22D3EE]" />
            <span className="min-w-0 flex-1">
              <span className="block text-ui-base font-medium text-foreground">配置模型提供商</span>
              <span className="block text-ui-xs text-foreground-subtle">
                填入你自己的 API Key，支持 OpenAI / DeepSeek / 通义等
              </span>
            </span>
            <span className="text-foreground-subtle">›</span>
          </button>
          <button
            type="button"
            onClick={() => setShowModelHint(true)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-input-border-focused hover:bg-surface-hover"
          >
            <SmartphoneIcon className="size-5 shrink-0 text-[#22D3EE]" />
            <span className="min-w-0 flex-1">
              <span className="block text-ui-base font-medium text-foreground">绑定手机客户端</span>
              <span className="block text-ui-xs text-foreground-subtle">
                在远控面板生成二维码，手机扫码即管本机
              </span>
            </span>
            <span className="text-foreground-subtle">›</span>
          </button>
        </div>

        {showModelHint ? (
          <div className="mt-4 rounded-lg border border-[#22D3EE]/30 bg-[#0C1420]/80 p-3 text-ui-xs leading-relaxed text-dim">
            点击下方「跳过，进入 ZHLBuilder」→ 打开「设置 → 模型」→ 选择你的提供商并填入
            API Key。配置完成后即可开始对话和执行任务。
          </div>
        ) : null}

        <Button
          variant="default"
          className="mt-6 h-11 w-full text-ui-base font-semibold"
          onClick={() => void onComplete("zhl-oauth")}
        >
          跳过，进入 ZHLBuilder
        </Button>
      </section>
    </main>
  );
}
