/* eslint-disable max-lines -- CUA 设置页同时编排插件总开关、双权限状态与授权返回恢复链；后续单独拆分组件。 */
// 设置页「电脑控制 (Computer Use)」分区：
//  - 顶部一个总开关：开/关 zcode-cua 插件（连带其 MCP server 与 skill 一起启用/禁用）。
//  - 就绪检查表（自研重写 v2 · C1，见 next-cua/CuaReadinessChecklist）：总状态一行 + 检查项
//    （系统版本 / 辅助功能 / 录屏，macOS 本机），一键直达与重启回执的门控都与旧行相同。
//  - 次级的输入框常驻入口开关默认折叠。
//
// Helper 权限状态走 useCuaPermissionStatus：事件驱动（进入页面 / 窗口重获焦点 / 显式 refresh）
// 各查一次，不再定时轮询；状态存在共享缓存里，与输入框常驻入口读同一份。
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/hooks/useSettingService.js";
import type { CuaOsSupport, CuaPermissionKind, RemoteTarget } from "@zhlbuilder/shared";
import {
  DesktopCommandIds,
  isRemoteWorkspaceIdentity,
  ZCODE_CUA_OFFICIAL_PLUGIN_ID,
} from "@zhlbuilder/shared";
import { isCuaPermissionStatusAvailable, type CuaPermissionRestartOptions } from "@zhlbuilder/services";
import { toast } from "@/components/ui/toast.js";
import { Switch } from "@/components/ui/switch.js";
import { cn } from "@/components/lib/utils.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useCuaPermissionStatus } from "@/hooks/useCuaPermissionStatus.js";
import {
  claimCuaPermissionReturnRecovery,
  completeCuaPermissionReturnRecovery,
  captureCuaPermissionReturnRecovery,
  createCuaPermissionReturnRecoveryState,
  isCuaPermissionReturnRecoveryCurrent,
  markCuaPermissionOnboardingOpened,
  shouldRestartHelperAfterCuaPermissionReturn,
  type CuaPermissionReturnRecoveryClaim,
} from "@/lib/cuaPermissionAction.js";
import { usePluginManagementStore } from "@/store/pluginManagementStore.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { supportsLocalMacCuaPermissionOnboarding } from "@/lib/cuaPlatform.js";
import { runAfterSuccessfulPluginEnabledChange } from "@/settings/pluginEnabledChange.js";
import { createCuaPermissionOnboardingOperationId } from "@/lib/cuaPermissionOnboardingOperation.js";
import { waitForAccessibilityNotStale } from "@/settings/cuaPermissionRestartVerify.js";
import { requiredCuaPermissionsForFreshStatus } from "@/settings/cuaPermissionPreparation.js";
import { ChevronRightIcon } from "lucide-react";
import { resolveComputerUseAvailability } from "@/settings/computerUseAvailability.js";
import {
  CuaReadinessChecklist,
  type CuaReadinessPermissionItem,
  type CuaSupportKind,
} from "@/next-cua/CuaReadinessChecklist.js";

interface ComputerUseSectionProps {
  isDesktop?: boolean;
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
  workspacePath?: string | null;
  workspaceIdentity?: string;
  remoteSessionId?: string | null;
  remoteTarget?: RemoteTarget | null;
  // SSH 远端设置页里 workspacePath 是远端路径；本机 Helper 状态查询必须使用本机 workspace 路径。
  localWorkspacePath?: string | null;
}

export function ComputerUseSection({
  isDesktop = false,
  isMacDesktop,
  isWindowsDesktop = false,
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
  remoteTarget,
  localWorkspacePath,
}: ComputerUseSectionProps) {
  const { intl } = useZCodeIntl();
  const services = useServices();
  const platform = usePlatform();
  const pluginManagementService = services.pluginManagementService;
  // cuaPermissionService 在 main 是可选字段（远端 host 无 CUA）；下方各 handler 在缺失时早退。
  const cuaPermissionService = services.cuaPermissionService;
  const isLocalWorkspace =
    !remoteSessionId &&
    !remoteTarget &&
    !(workspaceIdentity?.trim() && isRemoteWorkspaceIdentity(workspaceIdentity.trim()));
  // Windows 只复用插件总开关；macOS 才具备 TCC 权限、Helper 状态和附加设置能力。
  const supportsLocalMacWorkspace =
    !isWindowsDesktop &&
    (isMacDesktop ?? supportsLocalMacCuaPermissionOnboarding(platform)) &&
    isLocalWorkspace;
  const supportsLocalWindowsWorkspace = isWindowsDesktop && isLocalWorkspace;
  const supportsComputerUseSettings = supportsLocalMacWorkspace || supportsLocalWindowsWorkspace;
  const availability = resolveComputerUseAvailability({
    isDesktop: isDesktop || isWindowsDesktop || supportsLocalMacWorkspace,
    isMacDesktop: isMacDesktop || supportsLocalMacWorkspace,
    isWindowsDesktop,
    remoteSessionId,
    remoteTarget,
    workspaceIdentity,
  });
  // CUA 权限是 macOS 本机属性：仅完整 macOS 设置需要 Helper workspace 路径。
  const path = supportsLocalMacWorkspace ? (localWorkspacePath ?? workspacePath) : null;
  // 展示只跟 settled：fresh 每次查询开始都会落回 false，跟着它渲染会让授权按钮的文案
  // 在「验证中…」与终态之间切换、宽度随之跳变。
  const { status, settled, refresh } = useCuaPermissionStatus(path ?? null, workspaceIdentity);
  const availableStatus = status && isCuaPermissionStatusAvailable(status) ? status : null;

  // macOS 版本门槛：低版本系统上 Helper 被 LaunchServices -10825 拒启，表象是授权反复无响应。
  // 查询一次主进程判定（GetCuaOsSupport），低于地板时渲染提示卡并隐藏授权操作区。
  // 查询失败按无门槛处理，不阻塞设置页；useCuaPermissionStatus 轮询保留，仅隐藏交互入口。
  const [osSupport, setOsSupport] = useState<CuaOsSupport | null>(null);
  useEffect(() => {
    if (!supportsLocalMacWorkspace || typeof platform.executeDesktopCommand !== "function") return;
    let cancelled = false;
    void platform
      .executeDesktopCommand(DesktopCommandIds.GetCuaOsSupport)
      .then((result) => {
        if (!cancelled) setOsSupport(result as CuaOsSupport);
      })
      .catch(() => {
        /* 查询失败按无门槛处理，不阻塞设置页 */
      });
    return () => {
      cancelled = true;
    };
  }, [supportsLocalMacWorkspace, platform]);

  const macOsBelowCuaFloor = osSupport?.kind === "macos-below-minimum";

  // 总开关 = zcode-cua 插件启用态（读自插件管理 store；切换即同步启用/禁用插件及其 MCP + skill）。
  const plugins = usePluginManagementStore((state) => state.plugins);
  const setPluginEnabled = usePluginManagementStore((state) => state.setEnabled);
  const initializePlugins = usePluginManagementStore((state) => state.initialize);
  const togglingPluginId = usePluginManagementStore((state) => state.togglingPluginId);
  const cuaPlugin = plugins.find((plugin) => plugin.id === ZCODE_CUA_OFFICIAL_PLUGIN_ID);
  const cuaEnabled = cuaPlugin?.enabled ?? false;
  const cuaToggling = togglingPluginId === ZCODE_CUA_OFFICIAL_PLUGIN_ID;

  const initRef = useRef(false);
  useEffect(() => {
    if (
      initRef.current ||
      !supportsComputerUseSettings ||
      !workspacePath ||
      !pluginManagementService
    )
      return;
    initRef.current = true;
    // 复用 Plugins 分区同一条初始化路径，确保 store 已加载 zcode-cua 的 enabled 态。
    void initializePlugins({
      workspacePath,
      workspaceIdentity,
      pluginService: pluginManagementService,
    });
  }, [
    supportsComputerUseSettings,
    workspacePath,
    workspaceIdentity,
    pluginManagementService,
    initializePlugins,
  ]);

  const [restarting, setRestarting] = useState(false);
  // 重启 single-flight：授权返回回调、双击和手动按钮共享同一 operation，不并发轮换 broker 凭据。
  const restartPromiseRef = useRef<Promise<boolean> | null>(null);
  const pendingGrantSessionIdRef = useRef<string | undefined>(undefined);
  const returnRecoveryRef = useRef(createCuaPermissionReturnRecoveryState());
  useEffect(() => {
    returnRecoveryRef.current = createCuaPermissionReturnRecoveryState(
      workspaceIdentity?.trim() || path || "<none>",
    );
    pendingGrantSessionIdRef.current = undefined;
  }, [path, workspaceIdentity]);
  // 重启 Helper 后验证仍持续 stale → 显示"重启 ZCode"兜底按钮。accessibility 变 granted 时自愈清除。
  const [verifyTimedOut, setVerifyTimedOut] = useState(false);
  // 卸载守卫：异步 fetch / 重启 / 切换完成时若组件已卸载，跳过 setState。
  const mountedRef = useRef(true);
  const pluginToggleGenerationRef = useRef(0);
  const pluginToggleContextKey = [
    workspacePath ?? "",
    workspaceIdentity ?? "",
    localWorkspacePath ?? "",
    remoteSessionId ?? "",
    remoteTarget ? "remote" : "local",
  ].join("\u0000");
  const pluginToggleContextKeyRef = useRef(pluginToggleContextKey);
  pluginToggleContextKeyRef.current = pluginToggleContextKey;
  const helperContextKey = [path ?? "", workspaceIdentity?.trim() ?? ""].join("\u0000");
  const helperContextKeyRef = useRef(helperContextKey);
  helperContextKeyRef.current = helperContextKey;
  const activeOnboardingOperationIdRef = useRef<string | null>(null);
  const permissionStatusCheckTokenRef = useRef<symbol | null>(null);
  const platformRef = useRef(platform);
  platformRef.current = platform;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pluginToggleGenerationRef.current += 1;
      permissionStatusCheckTokenRef.current = null;
      const operationId = activeOnboardingOperationIdRef.current;
      activeOnboardingOperationIdRef.current = null;
      if (operationId) {
        platformRef.current.cancelCuaPermissionOnboarding?.(operationId);
      }
    };
  }, []);

  // 同一设置页实例切换 workspace 时也要退出旧 participant；否则旧调用返回后会恢复错误的 Helper。
  useEffect(
    () => () => {
      permissionStatusCheckTokenRef.current = null;
      const operationId = activeOnboardingOperationIdRef.current;
      activeOnboardingOperationIdRef.current = null;
      if (operationId) {
        platformRef.current.cancelCuaPermissionOnboarding?.(operationId);
      }
    },
    [path, workspaceIdentity],
  );

  const onRestart = useCallback(
    (
      targetPath = path,
      targetWorkspaceIdentity = workspaceIdentity,
      restartOptions?: CuaPermissionRestartOptions,
    ): Promise<boolean> => {
      if (!targetPath || !services || !cuaPermissionService) return Promise.resolve(false);
      if (restartPromiseRef.current) return restartPromiseRef.current;
      const targetContextKey = [targetPath, targetWorkspaceIdentity?.trim() ?? ""].join("\u0000");
      if (helperContextKeyRef.current === targetContextKey) {
        setVerifyTimedOut(false);
      }
      setRestarting(true);
      const operation = (async (): Promise<boolean> => {
        let queuedActiveProbe = false;
        try {
          const result = await cuaPermissionService.restartHelper(
            targetPath,
            targetWorkspaceIdentity,
            restartOptions,
          );
          if (!result.ok && mountedRef.current) {
            toast(
              intl.formatMessage(
                { id: "cuaPermission.modal.restartFailed" },
                { error: result.reason ?? "unknown error" },
              ),
            );
            return false;
          }
          if (!result.ok) return false;

          // Helper socket 已健康不代表 tccd 状态已经传播完成；短轮询确认 stale 是否消失。
          const stillStale = await waitForAccessibilityNotStale(() =>
            cuaPermissionService.getStatus(targetPath, targetWorkspaceIdentity),
          );
          // 授权过程中可能切换 workspace；旧操作仍完成必要副作用，但不能污染新页面的升级提示。
          if (mountedRef.current && helperContextKeyRef.current === targetContextKey) {
            setVerifyTimedOut(stillStale);
            // 后台权限轮询必须保持只读，真实截图只能跟随显式的授权返回/重启。
            // restart single-flight 已经把同一 Helper 恢复合并为一次，这里只排一个主动探针；
            // hook 会继续合并 focus/refresh，避免重复触发 macOS 隐私采集。
            refresh({ includeFunctionalProbes: true });
            queuedActiveProbe = true;
          }
          return true;
        } catch (error) {
          if (mountedRef.current) {
            toast(
              intl.formatMessage(
                { id: "cuaPermission.modal.restartFailed" },
                {
                  error: error instanceof Error ? error.message : String(error),
                },
              ),
            );
          }
          return false;
        } finally {
          restartPromiseRef.current = null;
          if (mountedRef.current) {
            setRestarting(false);
            // 失败路径仍只读刷新；成功路径已在当前 workspace 精确排入一次主动探针。
            if (!queuedActiveProbe) refresh();
          }
        }
      })();
      restartPromiseRef.current = operation;
      return operation;
    },
    [path, workspaceIdentity, services, refresh, intl],
  );

  const applyPendingGrant = useCallback(
    async (
      expectedClaim?: CuaPermissionReturnRecoveryClaim,
      target?: { workspacePath: string; workspaceIdentity?: string },
      onboardingSessionId?: string,
    ): Promise<boolean> => {
      const claim = expectedClaim ?? captureCuaPermissionReturnRecovery(returnRecoveryRef.current);
      if (!claim || !isCuaPermissionReturnRecoveryCurrent(claim.state, claim)) {
        return false;
      }
      // 授权前若已有 restart，先等它结束，再启动一个真正位于授权之后的新 Helper。
      const existing = restartPromiseRef.current;
      if (existing) await existing;
      if (!isCuaPermissionReturnRecoveryCurrent(claim.state, claim)) return false;
      // A 发起授权后切到 B，返回结果仍属于当前 renderer/host 的 A runtime。用点击时捕获的 identity
      // 完成必要 restart；只让后续展示刷新服从当前 props，不能因 UI generation 变化丢掉副作用。
      const ok = await onRestart(target?.workspacePath, target?.workspaceIdentity, {
        reason: "permission_granted",
        ...((onboardingSessionId ?? pendingGrantSessionIdRef.current)
          ? {
              onboardingSessionId: onboardingSessionId ?? pendingGrantSessionIdRef.current,
            }
          : {}),
      });
      completeCuaPermissionReturnRecovery(claim, ok);
      return ok;
    },
    [onRestart],
  );

  // 兜底:重启 Helper 后仍持续 stale 时,用户可一键重启 ZCode(复用 OAuth 登出同款 RelaunchApp)。
  // 新 ZCode 进程会干净地重新拉起 Helper,绕过当前进程里可能卡住的重启机制(孤儿/socket/状态污染)。
  const onRelaunchApp = useCallback(async () => {
    if (typeof platform.executeDesktopCommand !== "function") return;
    await platform.executeDesktopCommand(DesktopCommandIds.RelaunchApp);
  }, [platform]);

  const onTogglePlugin = useCallback(
    async (next: boolean) => {
      if (!pluginManagementService) return;
      const operationGeneration = ++pluginToggleGenerationRef.current;
      const operationContextKey = pluginToggleContextKey;
      // 切换 zcode-cua 插件 = 同步其 MCP server + skill 一起启用/禁用。
      const completed = await runAfterSuccessfulPluginEnabledChange({
        submit: () => setPluginEnabled(ZCODE_CUA_OFFICIAL_PLUGIN_ID, next, pluginManagementService),
        isCurrent: () =>
          mountedRef.current &&
          pluginToggleGenerationRef.current === operationGeneration &&
          pluginToggleContextKeyRef.current === operationContextKey,
        onSuccess: () => {
          if (supportsLocalMacWorkspace) {
            // 权限状态和手动授权入口只在 macOS Computer Use 设置页展示。启用插件不得自动打开
            // macOS Permissions modal；刷新状态即可，避免打断用户当前工作流。
            refresh();
          }
          if (!next) {
            toast(intl.formatMessage({ id: "settings.computerUse.disabledToast" }));
          }
        },
      });
      if (!completed && mountedRef.current) {
        const message = usePluginManagementStore.getState().error;
        if (message) {
          toast(message);
        }
      }
    },
    [
      path,
      pluginManagementService,
      pluginToggleContextKey,
      refresh,
      setPluginEnabled,
      supportsLocalMacWorkspace,
      intl,
    ],
  );

  // 打开 macOS 系统设置引导用户授权指定权限（Accessibility / Screen Recording）。
  const openPermissionSettings = useCallback(
    async (initialPermission: CuaPermissionKind): Promise<void> => {
      if (
        typeof platform.openCuaPermissionOnboarding !== "function" ||
        activeOnboardingOperationIdRef.current ||
        permissionStatusCheckTokenRef.current
      ) {
        return;
      }
      const checkToken = Symbol("cua-permission-status-check");
      permissionStatusCheckTokenRef.current = checkToken;
      const operationContextKey = helperContextKey;
      let operationId: string | null = null;
      const recoveryState = returnRecoveryRef.current;
      const recoveryTarget = path
        ? {
            workspacePath: path,
            ...(workspaceIdentity ? { workspaceIdentity } : {}),
          }
        : null;
      try {
        if (!path || !cuaPermissionService) {
          toast(intl.formatMessage({ id: "cuaPermission.modal.unavailable" }));
          return;
        }
        // 设置页行按钮过去直接使用 lastKnown 状态；另一窗口刚完成授权或当前刷新
        // in-flight 时仍会打开过期 pane。点击边沿重新查询 Helper，只允许当前 denied/stale 的精确项。
        let currentStatus = await cuaPermissionService.getStatus(path, workspaceIdentity, {
          includeFunctionalProbes: false,
        });
        // 从系统设置授权返回后 App 会重启 Helper 才能读到新 TCC 授权，这段窗口内查询拿到的是
        // 不可用状态（授权完立刻点行按钮，预检查退化成「暂时无法确认」
        // 而非「已授权」）。状态不可用时短重试 2 次、间隔 2s，等 Helper 就绪后走到「已授权」
        // 或真实缺权分支；期间守卫失效（卸载/重复点击/上下文切换）直接放弃，不再重试。
        for (
          let attempt = 0;
          attempt < 2 && !isCuaPermissionStatusAvailable(currentStatus);
          attempt += 1
        ) {
          await new Promise<void>((resolve) => setTimeout(resolve, 2000));
          if (
            !mountedRef.current ||
            permissionStatusCheckTokenRef.current !== checkToken ||
            helperContextKeyRef.current !== operationContextKey ||
            returnRecoveryRef.current !== recoveryState
          ) {
            return;
          }
          currentStatus = await cuaPermissionService.getStatus(path, workspaceIdentity, {
            includeFunctionalProbes: false,
          });
        }
        // React concurrent commit 可能已经收到 workspace A→B 更新但 passive effect 尚未清理 A。
        // render 同步更新的 context ref 是这段窗口内唯一可靠的失效信号；让出一个 macrotask后再判，
        // 迟到的 A 状态不能为 B 打开原生设置页。
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (
          !mountedRef.current ||
          permissionStatusCheckTokenRef.current !== checkToken ||
          helperContextKeyRef.current !== operationContextKey ||
          returnRecoveryRef.current !== recoveryState
        ) {
          return;
        }
        if (
          !isCuaPermissionStatusAvailable(currentStatus) ||
          !requiredCuaPermissionsForFreshStatus(currentStatus).includes(initialPermission)
        ) {
          const permissionState = isCuaPermissionStatusAvailable(currentStatus)
            ? initialPermission === "accessibility"
              ? currentStatus.accessibility
              : currentStatus.screenRecording
            : null;
          toast(
            intl.formatMessage({
              id:
                permissionState === "granted"
                  ? "cuaPermission.grantAlreadySatisfied"
                  : "cuaPermission.modal.unavailable",
            }),
          );
          refresh();
          return;
        }
        operationId = createCuaPermissionOnboardingOperationId();
        activeOnboardingOperationIdRef.current = operationId;
        const result = await platform.openCuaPermissionOnboarding({
          initialPermission,
          operationId,
          requiredPermissions: [initialPermission],
        });
        if (
          !mountedRef.current ||
          activeOnboardingOperationIdRef.current !== operationId ||
          helperContextKeyRef.current !== operationContextKey
        ) {
          return;
        }
        if (shouldRestartHelperAfterCuaPermissionReturn(result)) {
          markCuaPermissionOnboardingOpened(recoveryState);
          pendingGrantSessionIdRef.current = result.sessionId;
          const claim = claimCuaPermissionReturnRecovery(recoveryState);
          if (claim && recoveryTarget) {
            void applyPendingGrant(claim, recoveryTarget, result.sessionId);
          }
        } else if (result?.success && result.returnedFromSettings) {
          // 同一 renderer 对 main session 的重复 join 只刷新；不同窗口各自会拿到本 host 的 recovery。
          refresh();
        }
        if (result?.success === false && !result.canceled) {
          toast(
            intl.formatMessage(
              { id: "chat.cuaPermission.openFailed" },
              { error: result.error ?? "unknown error" },
            ),
          );
        }
      } catch (error) {
        if (
          mountedRef.current &&
          permissionStatusCheckTokenRef.current === checkToken &&
          helperContextKeyRef.current === operationContextKey
        ) {
          toast(
            operationId
              ? intl.formatMessage(
                  { id: "chat.cuaPermission.openFailed" },
                  {
                    error: error instanceof Error ? error.message : String(error),
                  },
                )
              : intl.formatMessage({ id: "cuaPermission.modal.unavailable" }),
          );
        }
      } finally {
        if (permissionStatusCheckTokenRef.current === checkToken) {
          permissionStatusCheckTokenRef.current = null;
        }
        if (operationId && activeOnboardingOperationIdRef.current === operationId) {
          activeOnboardingOperationIdRef.current = null;
        }
      }
    },
    [platform, path, services, workspaceIdentity, intl, applyPendingGrant, refresh],
  );

  const onManualRestart = useCallback((): void => {
    void (returnRecoveryRef.current.pending ? applyPendingGrant() : onRestart());
  }, [applyPendingGrant, onRestart]);

  // 自愈:accessibility 在后续任一次查询里变成 granted 时,清除"重启 ZCode"兜底(说明问题已解决)。
  useEffect(() => {
    if (availableStatus?.accessibility === "granted") setVerifyTimedOut(false);
  }, [availableStatus?.accessibility]);

  // 检查表的两项系统授权（macOS 本机）：状态、一键直达、重启回执的门控与旧行逐条相同
  // （直达要 openCuaPermissionOnboarding；重启要有 workspace 路径 —— 没有它 Helper 无从重启）。
  const restartPathAvailable = typeof path === "string" && path.length > 0;
  const permissionItems: CuaReadinessPermissionItem[] =
    supportsLocalMacWorkspace && !macOsBelowCuaFloor
      ? [
          {
            kind: "accessibility",
            labelId: "cuaPermission.perm.accessibility",
            purposeId: "cuaPermission.perm.accessibility.purpose",
            state: availableStatus?.accessibility,
            grantLabelId: "chat.cuaPermission.openAccessibility",
            ...(typeof platform.openCuaPermissionOnboarding === "function"
              ? { onGrant: () => void openPermissionSettings("accessibility") }
              : {}),
            onRestart: onManualRestart,
            restarting,
            restartDisabled: !restartPathAvailable,
            onRelaunchApp: () => void onRelaunchApp(),
            verifyTimedOut,
          },
          {
            kind: "screen_recording",
            labelId: "cuaPermission.perm.screenRecording",
            purposeId: "cuaPermission.perm.screenRecording.purpose",
            state: availableStatus?.screenRecording,
            grantLabelId: "chat.cuaPermission.openScreenRecording",
            ...(typeof platform.openCuaPermissionOnboarding === "function"
              ? { onGrant: () => void openPermissionSettings("screen_recording") }
              : {}),
          },
        ]
      : [];
  const supportKind: CuaSupportKind = supportsLocalMacWorkspace
    ? "local-macos"
    : supportsLocalWindowsWorkspace
      ? "local-windows"
      : availability.kind === "local-linux"
        ? "local-linux"
        : availability.kind === "web"
          ? "web"
          : "remote";
  const osFloor =
    macOsBelowCuaFloor === true
      ? {
          minimum: osSupport?.minimumMacOs ?? "12.0",
          current: osSupport?.currentMacOs ?? "12 以下",
        }
      : undefined;

  if (!supportsComputerUseSettings) {
    // 远端 / Linux / Web 环境若直接 return null，设置页只剩标题，会让用户误以为页面加载失败。
    // 检查表退成总状态一行（不可用 + 一句为什么），且不渲染任何会触发本地 CUA 写操作的控件。
    return (
      <CuaReadinessChecklist
        enabled={false}
        permissions={[]}
        settled={settled}
        supportKind={supportKind}
      />
    );
  }

  // 输入框常驻入口的显隐。隐藏开关用 useSettings().update 写入
  // （直连 settingService 只落盘不刷新共享 snapshot，输入框按钮读不到新值）。
  // 乐观更新本地开关，失败回滚并提示。
  const { settings: appSettings, update: updateAppSettings } = useSettings();
  const [composerEntryHiddenOverride, setComposerEntryHiddenOverride] = useState<boolean | null>(
    null,
  );
  const [composerEntrySaving, setComposerEntrySaving] = useState(false);
  // 次级块（输入框入口 + macOS 系统授权）默认折叠为摘要行，降低设置页信息密度。
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  // 默认隐藏，与 useCuaComposerEntry 同口径：只有显式存过 false 才算展示。
  // 两处必须一致，否则设置页开关的显示状态会和输入框按钮的实际显隐对不上。
  const persistedComposerEntryHidden = appSettings?.computerUseComposerEntryHidden !== false;
  const composerEntryVisible = !(composerEntryHiddenOverride ?? persistedComposerEntryHidden);
  useEffect(() => {
    if (composerEntryHiddenOverride === null) return;
    if (persistedComposerEntryHidden === composerEntryHiddenOverride) {
      setComposerEntryHiddenOverride(null);
    }
  }, [composerEntryHiddenOverride, persistedComposerEntryHidden]);
  const onToggleComposerEntry = useCallback(
    async (visible: boolean) => {
      const nextHidden = !visible;
      setComposerEntryHiddenOverride(nextHidden);
      setComposerEntrySaving(true);
      try {
        await updateAppSettings({ computerUseComposerEntryHidden: nextHidden });
      } catch (error) {
        if (mountedRef.current) {
          setComposerEntryHiddenOverride(null);
          toast(
            intl.formatMessage(
              { id: "settings.computerUse.composerEntry.saveFailed" },
              { error: error instanceof Error ? error.message : String(error) },
            ),
          );
        }
      } finally {
        if (mountedRef.current) setComposerEntrySaving(false);
      }
    },
    [intl, updateAppSettings],
  );

  return (
    <div className="space-y-4">
      {/* 总开关：开/关 zcode-cua 插件（同步其 MCP + skill）。常显，承载最高频信息。 */}
      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.computerUse.toggleLabel" })}
          description={intl.formatMessage({
            id: "settings.computerUse.toggleDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({
                id: "settings.computerUse.toggleLabel",
              })}
              checked={cuaEnabled}
              disabled={cuaToggling || !workspacePath}
              onCheckedChange={(checked) => void onTogglePlugin(checked)}
            />
          }
        />
      </SettingsGroupCard>

      {/* 就绪检查表（自研重写 v2 · C1）：总状态一行（可用 / 待授权 / 不可用）常显，
          下挂检查项（系统版本 / 辅助功能 / 录屏）——每项 = 状态徽标 + 一键直达 + 重启回执，
          说明展开显示。权限配置不再藏进折叠块：检查表本身就是密度控制。 */}
      <CuaReadinessChecklist
        enabled={cuaEnabled}
        {...(osFloor === undefined ? {} : { osFloor })}
        permissions={permissionItems}
        settled={settled}
        supportKind={supportKind}
      />

      {/* 次级块（输入框常驻入口）默认折叠为摘要行，点击展开后按需查看与操作；主开关保持常显。 */}
      <SettingsGroupCard>
        <button
          aria-expanded={advancedExpanded}
          aria-label={intl.formatMessage({
            id: "settings.computerUse.advancedLabel",
          })}
          className="flex h-9 w-full items-center gap-2 px-3 text-left outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => setAdvancedExpanded((value) => !value)}
          type="button"
        >
          <span className="min-w-0 shrink-0 truncate text-ui-base font-medium text-foreground">
            {intl.formatMessage({ id: "settings.computerUse.advancedLabel" })}
          </span>
          <span className="min-w-0 truncate text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "settings.computerUse.advancedHint" })}
          </span>
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "ml-auto size-3.5 shrink-0 text-foreground-subtlest transition-transform",
              advancedExpanded && "rotate-90",
            )}
          />
        </button>
        {advancedExpanded ? (
          // 输入框常驻入口的显隐开关：关闭是持久化 hidden 标记，重启与版本更新都不会自愈。只管
          // 按钮渲不渲染，不影响插件启用态与进行中任务。电脑控制关闭时按钮无论如何都不渲染
          // （cuaComposerEntryState 的插件门），此时把开关置灰并改文案说明前置条件——留一个可点却
          // 看不到效果的开关会被当成坏了。
          <SettingsRow
            label={intl.formatMessage({ id: "settings.computerUse.composerEntry.label" })}
            description={intl.formatMessage({
              id: cuaEnabled
                ? "settings.computerUse.composerEntry.description"
                : "settings.computerUse.composerEntry.requiresEnabled",
            })}
            control={
              <Switch
                aria-label={intl.formatMessage({
                  id: "settings.computerUse.composerEntry.label",
                })}
                checked={composerEntryVisible}
                disabled={composerEntrySaving || !cuaEnabled}
                onCheckedChange={(checked) => void onToggleComposerEntry(checked)}
              />
            }
          />
        ) : null}
      </SettingsGroupCard>
    </div>
  );
}
