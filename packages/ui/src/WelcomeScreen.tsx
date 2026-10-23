/**
 * WelcomeScreen — ZHL 身份确认 + 模型配置指引
 *
 * ZHL 账号登录已由启动时的模态门（zhlGate.ts）完成。
 * 这里只做身份确认和引导用户去 Settings 配置模型提供商。
 */
import { useEffect, useState } from "react";
import { ChevronRight, SettingsIcon, SmartphoneIcon } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ZCodeAboutLogo } from "@/components/ui/ZCodeAboutLogo.js";
import { ThemeHeroVisual } from "./openWorkspacePageThemeHero.js";

interface ZhlGateBridge {
  identity: () => Promise<{ username?: string; loggedIn?: boolean; skipped?: boolean }>;
  login: () => Promise<{ ok?: boolean; username?: string; reason?: string }>;
}

function getZhlGate(): ZhlGateBridge | null {
  return (window as unknown as { zhlGate?: ZhlGateBridge }).zhlGate ?? null;
}

export type LoginCompleteReason = "zhl-oauth" | "skip";

interface WelcomeScreenProps {
  onComplete: (reason: LoginCompleteReason) => void | Promise<void>;
}

/** 两条指引各自展开自己的说明；之前两条都指向模型说明，点「绑定手机客户端」会读到模型文案。 */
type GuideKey = "model" | "device";

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const { intl } = useZCodeIntl();
  const [openGuide, setOpenGuide] = useState<GuideKey | null>(null);
  const [identity, setIdentity] = useState<{ loggedIn: boolean; username: string }>({
    loggedIn: false,
    username: "",
  });
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const gate = getZhlGate();

  useEffect(() => {
    if (!gate) return;
    let disposed = false;
    void gate.identity().then((res) => {
      if (!disposed) {
        setIdentity({ loggedIn: Boolean(res?.loggedIn), username: res?.username ?? "" });
      }
    }, () => {});
    return () => {
      disposed = true;
    };
  }, [gate]);

  const handleZhlLogin = () => {
    if (!gate || loggingIn) return;
    setLoggingIn(true);
    setLoginError("");
    void gate.login().then((res) => {
      setLoggingIn(false);
      if (res?.ok) {
        setIdentity({ loggedIn: true, username: res.username ?? "" });
      } else if (res?.reason && res.reason !== "skipped") {
        setLoginError(intl.formatMessage({ id: "welcome.login.error.retry" }));
      }
    }, () => {
      setLoggingIn(false);
      setLoginError(intl.formatMessage({ id: "welcome.login.error.unavailable" }));
    });
  };

  const guideRows: Array<{
    key: GuideKey;
    icon: typeof SettingsIcon;
    titleId: string;
    descId: string;
    hintId: string;
  }> = [
    {
      key: "model",
      icon: SettingsIcon,
      titleId: "welcome.guide.model.title",
      descId: "welcome.guide.model.desc",
      hintId: "welcome.guide.model.hint",
    },
    {
      key: "device",
      icon: SmartphoneIcon,
      titleId: "welcome.guide.device.title",
      descId: "welcome.guide.device.desc",
      hintId: "welcome.guide.device.hint",
    },
  ];

  return (
    <main className="relative flex h-full min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-6 text-foreground sm:px-6">
      <ThemeHeroVisual className="absolute inset-0" />
      <div className="pointer-events-none absolute left-0 top-0 right-0 z-10 flex h-12 w-full items-center [app-region:drag]" />
      <section className="relative z-10 w-full max-w-sm rounded-lg border border-popover-border bg-background p-8 text-ui-base/relaxed shadow-md sm:p-10">
        <div className="mb-6 flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-lg bg-background shadow-lg/20">
            <ZCodeAboutLogo className="h-auto w-10" />
          </div>
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-ui-lg font-bold text-foreground">ZHLBuilder</h1>
          <p className="text-ui-sm text-foreground-subtle">
            {identity.loggedIn
              ? intl.formatMessage({ id: "welcome.identity.loggedIn" }, { username: identity.username })
              : intl.formatMessage({ id: "welcome.identity.guest" })}
          </p>
        </div>

        {!identity.loggedIn && gate ? (
          <Button
            variant="default"
            className="mt-6 h-11 w-full text-ui-base font-semibold"
            disabled={loggingIn}
            onClick={handleZhlLogin}
          >
            {loggingIn
              ? intl.formatMessage({ id: "welcome.login.pending" })
              : intl.formatMessage({ id: "welcome.login.action" })}
          </Button>
        ) : null}
        {loginError ? (
          <p role="alert" className="mt-2 text-center text-ui-xs text-destructive">
            {loginError}
          </p>
        ) : null}

        {/* 两条指引：卡片行是「了解怎么做」，不是动作按钮，所以用 list 语义包起来，
            展开的说明挂在被点开的那一行下面，而不是共用一块固定位置的提示。 */}
        <div className="mt-8 space-y-3">
          {guideRows.map((row) => {
            const Icon = row.icon;
            const expanded = openGuide === row.key;
            return (
              <div key={row.key}>
                <button
                  type="button"
                  onClick={() => setOpenGuide(expanded ? null : row.key)}
                  aria-expanded={expanded}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-input-border-focused hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <Icon className="size-5 shrink-0 text-foreground-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui-base font-medium text-foreground">
                      {intl.formatMessage({ id: row.titleId })}
                    </span>
                    <span className="block text-ui-xs text-foreground-subtle">
                      {intl.formatMessage({ id: row.descId })}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0 text-foreground-subtle transition-transform duration-200",
                      expanded && "rotate-90",
                    )}
                  />
                </button>
                {expanded ? (
                  <div className="mt-2 rounded-lg border border-brand/30 bg-card/80 p-3 text-ui-xs leading-relaxed text-foreground-subtle">
                    {intl.formatMessage({ id: row.hintId })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* 主按钮只有一个：登录是这一屏的主张，「跳过进入」是退路，
            两枚都做实心主按钮会互相抢焦点。 */}
        <Button
          variant="outline"
          className="mt-6 h-11 w-full text-ui-base font-medium"
          // 同一个按钮承担两种收尾：刚登录成功就是 zhl-oauth，没登录直接进来就是 skip。
          // 之前恒报 "zhl-oauth"，Root 的失败日志里归因是错的。
          onClick={() => void onComplete(identity.loggedIn ? "zhl-oauth" : "skip")}
        >
          {intl.formatMessage({ id: "welcome.enter.action" })}
        </Button>
      </section>
    </main>
  );
}
