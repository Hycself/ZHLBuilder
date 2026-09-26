import { useCallback, useEffect, useState } from "react";

/**
 * ZHL 账号身份（桌面端）。
 *
 * 上游那套 user 来自 Z.ai / BigModel 账号体系，本 fork 不使用它，
 * 所以侧栏底部永远落到"未登录"分支（显示 Z 头像 + "连接使用"）。
 * 真正的身份是主进程 zhlGate 里的签派 OAuth2 登录态，
 * 通过 preload 暴露的 window.zhlGate 桥读取。
 *
 * Web 端没有这座桥，available 为 false，调用方应回退到原有表现。
 */

interface ZhlGateBridge {
  identity: () => Promise<{ username?: string; loggedIn?: boolean; skipped?: boolean }>;
  login: () => Promise<{ ok?: boolean; username?: string; reason?: string }>;
}

function getBridge(): ZhlGateBridge | null {
  return (window as unknown as { zhlGate?: ZhlGateBridge }).zhlGate ?? null;
}

export interface ZhlIdentityState {
  /** 当前宿主是否提供了 ZHL 身份桥（桌面端为 true，Web 为 false） */
  available: boolean;
  loggedIn: boolean;
  username: string;
  busy: boolean;
  refresh: () => Promise<void>;
  login: () => Promise<boolean>;
}

export function useZhlIdentity(): ZhlIdentityState {
  const [available, setAvailable] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    try {
      const res = await bridge.identity();
      setLoggedIn(Boolean(res?.loggedIn));
      setUsername(String(res?.username ?? ""));
    } catch {
      // 读身份失败时保持上一次状态，不把"已登录"误报成"未登录"
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 登录门是主进程弹出的模态窗口，关闭时渲染层不会收到事件；
    // 窗口重新获得可见性时补一次拉取，避免底部状态滞后一格。
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const login = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) return false;
    setBusy(true);
    try {
      const res = await bridge.login();
      await refresh();
      return Boolean(res?.ok);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { available, loggedIn, username, busy, refresh, login };
}
