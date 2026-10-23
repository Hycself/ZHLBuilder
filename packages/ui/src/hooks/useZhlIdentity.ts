import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast.js";

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
  logout?: () => Promise<{ ok?: boolean }>;
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
  /** 宿主是否真的挂了登出入口；只有 available 是不够的 */
  canLogout: boolean;
  refresh: () => Promise<void>;
  login: () => Promise<boolean>;
  /** 宿主未提供登出桥时返回 false，调用方据此隐藏菜单项 */
  logout: () => Promise<boolean>;
}

export function useZhlIdentity(): ZhlIdentityState {
  const [available, setAvailable] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [canLogout, setCanLogout] = useState(false);

  const refresh = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) {
      setAvailable(false);
      setCanLogout(false);
      return;
    }
    setAvailable(true);
    setCanLogout(typeof bridge.logout === "function");
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
    } catch {
      // IPC 失败和用户跳过不是一回事。之前只有 try/finally 没有 catch，reject 直接
      // 变成未处理拒绝，调用方拿的还是 undefined——用户点了登录，界面无任何反馈。
      toast("登录失败，请稍后重试");
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge?.logout) return false;
    setBusy(true);
    try {
      await bridge.logout();
      await refresh();
      return true;
    } catch {
      toast("登出失败，请稍后重试");
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { available, loggedIn, username, busy, canLogout, refresh, login, logout };
}
