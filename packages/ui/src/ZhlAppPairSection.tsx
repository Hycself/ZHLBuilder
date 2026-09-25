import { useEffect, useState } from "react";
import { Smartphone as SmartphoneIcon } from "lucide-react";

/**
 * ZHLBuilder 手机客户端配对区：
 *  - 走主进程 zhlDevice 桥（签派 OAuth2 / 设备中枢 /api/builder/*）；
 *  - 展示配对二维码 + 6 位 PIN 提示，手机 App 扫码即绑定本机；
 *  - 绑定后启动设备代理（WS 心跳），手机端可下发任务并实时看输出。
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
  state: () => Promise<ZhlDeviceState>;
  onState: (cb: (state: ZhlDeviceState) => void) => () => void;
}

function getBridge(): ZhlDeviceBridge | null {
  return (window as unknown as { zhlDevice?: ZhlDeviceBridge }).zhlDevice ?? null;
}

export function ZhlAppPairSection() {
  const bridge = getBridge();
  const [pair, setPair] = useState<ZhlPairResult | null>(null);
  const [deviceState, setDeviceState] = useState<ZhlDeviceState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    const off = bridge.onState((s) => setDeviceState(s));
    bridge.state().then((s) => setDeviceState(s)).catch(() => undefined);
    return off;
  }, [bridge]);

  if (!bridge) {
    return null; // 非桌面端渲染（Web 预览等）不显示
  }

  const online = deviceState?.phase === "online";
  const bound = deviceState?.phase === "bound" || online;
  const pairing = deviceState?.phase === "pairing";

  const startPair = (): void => {
    setLoading(true);
    setError("");
    bridge
      .pairStart()
      .then((r) => {
        setLoading(false);
        if (r.bound) {
          setDeviceState((prev) => ({ ...(prev ?? {}), phase: "bound" }));
          return;
        }
        setPair(r);
      })
      .catch((e: Error) => {
        setLoading(false);
        setError(e.message);
      });
  };

  const startAgent = (): void => {
    setError("");
    bridge
      .agentStart()
      .then(() => bridge.state().then((s) => setDeviceState(s)))
      .catch((e: Error) => setError(e.message));
  };

  return (
    <section className="flex min-h-[200px] flex-col rounded-xl border border-[#22D3EE]/30 bg-[#0C1420]/60 p-4">
      <div className="mb-3 flex items-start gap-2">
        <SmartphoneIcon className="mt-0.5 size-4 shrink-0 text-[#22D3EE]" />
        <div className="min-w-0 space-y-1">
          <div className="text-ui-base font-medium text-foreground">ZHLBuilder 手机客户端</div>
          <p className="text-ui-base/relaxed text-foreground-subtle">
            扫码绑定这台设备，在手机上远程下发任务、查看实时输出。绑定需设置 6 位 PIN。
          </p>
        </div>
      </div>

      {online ? (
        <div className="rounded-lg border border-[#34D399]/40 bg-[#34D399]/10 px-3 py-2 text-ui-sm text-[#34D399]">
          设备代理已连接中枢，手机端可下发任务。
        </div>
      ) : bound ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-[#34D399]/40 bg-[#34D399]/10 px-3 py-2 text-ui-sm text-[#34D399]">
            已绑定。启动设备代理后即可在手机端看到本机在线。
          </div>
          <button
            type="button"
            onClick={startAgent}
            className="w-full cursor-pointer rounded-lg bg-[#22D3EE] py-2.5 text-ui-sm font-semibold text-[#06222B] hover:brightness-110"
          >
            启动设备代理
          </button>
        </div>
      ) : pairing && pair?.qrDataUrl ? (
        <div className="space-y-2 text-center">
          <img
            src={deviceState?.qrDataUrl ?? pair.qrDataUrl}
            alt="配对二维码"
            className="mx-auto w-44 rounded-lg bg-white p-1"
          />
          <div className="text-ui-sm text-foreground">
            配对码 <span className="font-mono font-bold text-[#22D3EE]">{deviceState?.pairCode ?? pair.pairCode}</span>
          </div>
          <div className="text-ui-xs text-foreground-subtle">
            打开 ZHLBuilder 手机 App → 扫码 → 设置 6 位 PIN（{pair.expireMinutes ?? 5} 分钟内有效）
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={startPair}
            disabled={loading}
            className="w-full cursor-pointer rounded-lg bg-[#22D3EE] py-2.5 text-ui-sm font-semibold text-[#06222B] hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "正在生成…" : "生成配对二维码"}
          </button>
          <div className="text-ui-xs text-foreground-subtle">
            需要先在手机上安装 ZHLBuilder App（download.zhl.asia 下载中心）。
          </div>
        </div>
      )}

      {error ? <div className="mt-2 text-ui-xs text-[#F87171]">{error}</div> : null}
      {deviceState?.message && pairing ? (
        <div className="mt-2 text-ui-xs text-foreground-subtle">{deviceState.message}</div>
      ) : null}
    </section>
  );
}
