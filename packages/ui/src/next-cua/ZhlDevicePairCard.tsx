import { useEffect, useState } from "react";
import { Smartphone as SmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { StatusDot, type StatusDotTone } from "@/settings/StatusDot.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/**
 * 设备与远程中心「本机配对卡」（自研重写 v2 · C2）：二维码卡 + PIN + 连接状态。
 *
 * 形态与 C1 检查表同一套话语：**状态行**（灯 + 状态词 + 一句读数）常显，下面是该状态下的动作
 * 面——未绑定给「生成配对二维码」，等待扫码给二维码卡（配对码 + 有效期），已绑定给「启动设备代理」，
 * 连接失败给读数与重试；**解除绑定**带就地二次确认（危险动作不弹原生 confirm）。
 *
 * 边界（与旧实现逐条相同）：走主进程 `zhlDevice` 桥的五个方法（pairStart / agentStart / unpair /
 * state / onState），非桌面端（Web 预览）桥缺席即整卡不渲染；启动 / 重试 / 解绑共用一个在途标记
 * （busy single-flight，防并发 agent-start 覆盖 WS）；主进程推进新 phase 时清掉旧错误。
 */
interface ZhlPairResult {
  bound?: boolean;
  pairCode?: string;
  qrDataUrl?: string;
  expireMinutes?: number;
}

interface ZhlDeviceState {
  phase: "idle" | "pairing" | "online" | "bound" | "error";
  pairCode?: string;
  qrDataUrl?: string;
  message?: string;
  online?: boolean;
}

interface ZhlDeviceBridge {
  pairStart: () => Promise<ZhlPairResult>;
  agentStart: () => Promise<unknown>;
  unpair: () => Promise<unknown>;
  state: () => Promise<ZhlDeviceState>;
  onState: (cb: (state: ZhlDeviceState) => void) => () => void;
}

function getBridge(): ZhlDeviceBridge | null {
  return (window as unknown as { zhlDevice?: ZhlDeviceBridge }).zhlDevice ?? null;
}

export function ZhlDevicePairCard() {
  const { intl } = useZCodeIntl();
  const bridge = getBridge();
  const [pair, setPair] = useState<ZhlPairResult | null>(null);
  const [deviceState, setDeviceState] = useState<ZhlDeviceState | null>(null);
  const [error, setError] = useState("");
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    // 主进程推进了新的 phase 就把上一次的错误提示清掉：之前 error 只在
    // 下一次点按钮时清，于是「设备未绑定」那条红线会一直挂在已绑定面板下面。
    const off = bridge.onState((state) => {
      setDeviceState(state);
      setError("");
    });
    bridge
      .state()
      .then((state) => setDeviceState(state))
      .catch(() => undefined);
    return off;
  }, [bridge]);

  if (!bridge) {
    return null; // 非桌面端渲染（Web 预览等）不显示
  }

  const phase = deviceState?.phase ?? "idle";
  const online = phase === "online";
  const bound = phase === "bound" || online;
  const pairing = phase === "pairing";
  const errored = phase === "error";
  const statusView =
    online
      ? { textId: "zhlPair.status.online", tone: "green" as StatusDotTone }
      : bound
        ? { textId: "zhlPair.status.bound", tone: "amber" as StatusDotTone }
        : pairing
          ? { textId: "zhlPair.status.pairing", tone: "amber" as StatusDotTone }
          : errored
            ? { textId: "zhlPair.status.error", tone: "red" as StatusDotTone }
            : { textId: "zhlPair.status.unbound", tone: "muted" as StatusDotTone };
  const reading = online
    ? intl.formatMessage({ id: "zhlPair.onlineNote" })
    : bound
      ? intl.formatMessage({ id: "zhlPair.boundNote" })
      : pairing
        ? intl.formatMessage(
            { id: "zhlPair.scanHint" },
            { minutes: String(pair?.expireMinutes ?? 5) },
          )
        : errored
          ? (deviceState?.message ?? intl.formatMessage({ id: "zhlPair.errorNote" }))
          : intl.formatMessage({ id: "zhlPair.unboundNote" });

  const startPair = (): void => {
    setLoading(true);
    setError("");
    bridge
      .pairStart()
      .then((result) => {
        setLoading(false);
        if (result.bound) {
          setDeviceState((previous) => ({ ...previous, phase: "bound" }));
          return;
        }
        setPair(result);
      })
      .catch((error_: Error) => {
        setLoading(false);
        setError(error_.message);
      });
  };

  // 启动/重试/解绑共用一个在途标记。之前这几个按钮没有 in-flight 守卫（只有
  // 生成二维码有），连点两下就并发发两次 agent-start：第一次的 WS 和它的重连循环
  // 会被后一次覆盖掉再也没人能停，手机端下一条 task.start 还能被执行两遍。
  const withBusy = (run: () => Promise<unknown>): void => {
    if (busy) return;
    setBusy(true);
    setError("");
    run()
      .then(() => bridge.state().then((state) => setDeviceState(state)))
      .catch((error_: Error) => setError(error_.message))
      .finally(() => setBusy(false));
  };

  const startAgent = (): void => withBusy(() => bridge.agentStart());

  const doUnpair = (): void => {
    setConfirmUnpair(false);
    withBusy(() => bridge.unpair());
  };

  // 二次确认用组件内状态而不是 window.confirm：Electron 里原生确认框会阻塞渲染进程，
  // 且在这个弹窗中弹出容易被当成界面无响应。
  const unpairControl = confirmUnpair ? (
    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2">
      <div className="text-ui-xs text-destructive">
        {intl.formatMessage({ id: "zhlPair.unpairConfirmNote" })}
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          data-testid="zhl-pair-unpair-confirm"
          disabled={busy}
          onClick={doUnpair}
          size="sm"
          type="button"
          variant="destructive"
        >
          {intl.formatMessage({ id: "zhlPair.unpairConfirm" })}
        </Button>
        <Button
          className="flex-1"
          onClick={() => setConfirmUnpair(false)}
          size="sm"
          type="button"
          variant="outline"
        >
          {intl.formatMessage({ id: "zhlPair.cancel" })}
        </Button>
      </div>
    </div>
  ) : (
    <Button
      className="w-full text-destructive hover:text-destructive"
      data-testid="zhl-pair-unpair"
      onClick={() => setConfirmUnpair(true)}
      size="lg"
      type="button"
      variant="outline"
    >
      {intl.formatMessage({ id: "zhlPair.unpair" })}
    </Button>
  );

  const qrDataUrl = deviceState?.qrDataUrl ?? pair?.qrDataUrl;
  const pairCode = deviceState?.pairCode ?? pair?.pairCode;

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      data-pair-phase={phase}
      data-testid="zhl-pair-card"
    >
      <div className="mb-3 flex items-start gap-2">
        <SmartphoneIcon className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <div className="text-ui-base font-medium text-foreground">
            {intl.formatMessage({ id: "zhlPair.title" })}
          </div>
          <p className="text-ui-base/relaxed text-foreground-subtle">
            {intl.formatMessage({ id: "zhlPair.description" })}
          </p>
        </div>
      </div>

      {/* 状态行：灯 + 状态词 + 一句读数（五个 phase 同一行，读数说此刻或下一步）。 */}
      <div className="flex min-w-0 items-center gap-2" data-testid="zhl-pair-status">
        <StatusDot tone={statusView.tone} />
        <span
          className={cn(
            "shrink-0 text-ui-base font-medium",
            errored ? "text-destructive" : "text-foreground",
          )}
        >
          {intl.formatMessage({ id: statusView.textId })}
        </span>
        <span className="min-w-0 flex-1 truncate text-ui-sm text-foreground-subtle" title={reading}>
          {reading}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {online ? (
          unpairControl
        ) : bound ? (
          <>
            <Button
              className="w-full"
              data-testid="zhl-pair-start-agent"
              disabled={busy}
              onClick={startAgent}
              size="lg"
              type="button"
            >
              {intl.formatMessage({
                id: busy ? "zhlPair.starting" : "zhlPair.startAgent",
              })}
            </Button>
            {unpairControl}
          </>
        ) : errored ? (
          <>
            <Button
              className="w-full"
              data-testid="zhl-pair-retry"
              disabled={busy}
              onClick={startAgent}
              size="lg"
              type="button"
            >
              {intl.formatMessage({ id: busy ? "zhlPair.starting" : "zhlPair.retry" })}
            </Button>
            {unpairControl}
          </>
        ) : pairing && qrDataUrl ? (
          <div className="space-y-2 text-center">
            <img
              alt={intl.formatMessage({ id: "zhlPair.qrAlt" })}
              className="mx-auto w-44 rounded-lg bg-white p-1"
              data-testid="zhl-pair-qr"
              src={qrDataUrl}
            />
            {pairCode === undefined ? null : (
              <div className="text-ui-sm text-foreground">
                {intl.formatMessage({ id: "zhlPair.pairCode" })}{" "}
                <span className="font-mono font-bold text-foreground">{pairCode}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            <Button
              className="w-full"
              data-testid="zhl-pair-generate"
              disabled={loading}
              onClick={startPair}
              size="lg"
              type="button"
            >
              {intl.formatMessage({ id: loading ? "zhlPair.generating" : "zhlPair.generate" })}
            </Button>
            <div className="text-ui-xs text-foreground-subtle">
              {intl.formatMessage({ id: "zhlPair.downloadHint" })}
            </div>
          </>
        )}
      </div>

      {error ? (
        <div className="mt-2 text-ui-xs text-destructive" data-testid="zhl-pair-error">
          {error}
        </div>
      ) : null}
      {deviceState?.message && pairing ? (
        <div className="mt-2 text-ui-xs text-foreground-subtle">{deviceState.message}</div>
      ) : null}
    </section>
  );
}