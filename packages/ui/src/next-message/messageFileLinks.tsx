/*
 * Derived from vercel/ai-elements (packages/elements/src/message.tsx).
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * Modified by ZCode: local integration, formatting and adaptations.
 * See THIRD-PARTY-NOTICES.md in the repository root for license and provenance.
 *
 * 界面自研重写 v2（A2b）：Markdown 里的文件/外链渲染组——链接样式常量、
 * 文件链接目标模型、外链按钮与文件链接按钮（含右键菜单）。元素渲染表在
 * messageMarkdownElements.tsx，解析侧在 messageMarkdownParse.ts。
 */
import type { EditorInfo, FileStat, OpenInEditorOptions } from "@zhlbuilder/shared";
import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.js";
import { cn } from "@/components/lib/utils.js";
import { resolveMessageLinkOpenTarget } from "@/embeddedBrowserHelpers.js";
import { useFileContextActions } from "@/hooks/useFileContextActions.js";
import { useOptionalPlatform, usePlatform } from "@/hooks/usePlatform.js";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useWorkspaceOpenInEditorTarget } from "@/hooks/useWorkspaceOpenInEditorTarget.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { persistLastSelectedEditorId, readLastSelectedEditorId } from "@/lib/editorPreference.js";
import { FileDisplayIcon } from "@/lib/fileDisplay.js";
import { resolveWorkspaceEditorSelection } from "@/lib/workspaceEditorSelection.js";
import { logger } from "@/logger.js";
import { getWorkspaceFileRelativePath } from "@/workspace-file-tree/model.js";

// `decoration-dashed` 会把原有的细圆点下划线绘制成短线段；这里只改变下划线的
// 出现时机，继续使用 `dotted` 保留原视觉形态。
export const messageLinkClassName =
  "wrap-anywhere text-ui-base font-medium text-icon-blue no-underline decoration-dotted underline-offset-4 hover:underline";
// `items-center` 让 inline-flex 使用浏览器合成的基线，固定 top 偏移又会随平台字体产生漂移。
// 改为由文字子项提供真实 baseline；图标只在链接自身行盒内居中，桌面和移动 Web 共用同一语义。
const messageFileLinkClassName =
  "inline-flex max-w-full items-baseline gap-1 align-baseline text-icon-blue text-ui-base no-underline decoration-dotted underline-offset-4 hover:underline";

export function hasFileExtension(pathLeaf: string): boolean {
  return /\.[^./\\]+$/.test(pathLeaf);
}

function isExplicitDirectoryMarkdownLink(path: string, href: string): boolean {
  const trimmedHref = href.trim();
  return /[\\/]$/.test(trimmedHref) || /[\\/]$/.test(path);
}

export interface MessageFileLinkTarget {
  path: string;
  label: string;
  /** 仅用于显式尾随斜杠的目录展示提示；打开第三方应用前必须重新 stat。 */
  pathKind?: NonNullable<OpenInEditorOptions["pathKind"]>;
  relativePath?: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
}

export function buildMessageFileLinkTarget(input: {
  href: string;
  label: string;
  path: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
}): MessageFileLinkTarget {
  // 文件名是否带扩展名不能代表文件系统类型；env、hosts、config 等无扩展名文件
  // 过去会被误判为目录。这里只保留显式尾随斜杠作为图标提示，打开方式必须再 stat。
  const pathKind = isExplicitDirectoryMarkdownLink(input.path, input.href)
    ? ("directory" as const)
    : undefined;
  return {
    path: input.path,
    label: input.label,
    pathKind,
    relativePath: input.workspacePath
      ? getWorkspaceFileRelativePath(input.workspacePath, input.path)
      : input.label,
    workspacePath: input.workspacePath,
    workspaceIdentity: input.workspaceIdentity,
    workspaceRemoteSessionId: input.workspaceRemoteSessionId,
  };
}

export async function openMessageFileLinkInEditor({
  editorId,
  fileLink,
  openInEditor,
  remoteTarget,
  statFile,
}: {
  editorId: string;
  fileLink: MessageFileLinkTarget;
  openInEditor: (
    editorId: string,
    path: string,
    options: OpenInEditorOptions,
  ) => Promise<{ success: boolean; error?: string }>;
  remoteTarget?: OpenInEditorOptions["remoteTarget"];
  statFile: (params: { path: string }) => Promise<Pick<FileStat, "type">>;
}) {
  // Markdown 渲染层无法从名称可靠判断文件/目录。这里在动作发生时通过
  // 当前 workspace scope 的 file service 取真实类型，stat 失败时不会调用本机应用。
  const fileStat = await statFile({ path: fileLink.path });
  return openInEditor(editorId, fileLink.path, {
    pathKind: fileStat.type,
    remoteTarget,
    workspaceIdentity: fileLink.workspaceIdentity,
  });
}

interface MessageExternalLinkProps extends ComponentProps<"button"> {
  href: string;
  onOpenExternalUrl: (url: string) => void;
}

export function MessageExternalLink({
  children,
  className,
  href,
  onClick,
  onOpenExternalUrl,
  ...props
}: MessageExternalLinkProps) {
  const { intl } = useZCodeIntl();
  const platform = useOptionalPlatform();
  const handleOpen = useCallback(
    (options: { forceExternal?: boolean; forceInApp?: boolean } = {}) => {
      // 交互语义：本机/私网白名单只决定左键单击的默认目标；右键菜单两项各自强制一个目标。
      // 菜单「打开」过去复用左键默认行为，公网链接（如飞书文档）两项都会跳系统浏览器。
      const target = resolveMessageLinkOpenTarget({ href, ...options });
      logger.debug("[MessageExternalLink] 打开 Markdown 外链", {
        forceExternal: Boolean(options.forceExternal),
        forceInApp: Boolean(options.forceInApp),
        href,
        target,
      });

      if (target === "app-browser" || !platform) {
        // Share/普通 Web 没有 Desktop PlatformProvider；仍交给调用方的安全 URL handler，
        // 避免 MessageResponse 因缺少宿主上下文整棵 Markdown 降级为纯文本。
        onOpenExternalUrl(href);
        return;
      }

      platform.openExternal(href);
    },
    [href, onOpenExternalUrl, platform],
  );
  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }

      handleOpen({ forceExternal: event.metaKey || event.ctrlKey });
    },
    [handleOpen, onClick],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            messageLinkClassName,
            "cursor-pointer bg-transparent p-0 text-left",
            className,
          )}
          title={href}
          {...props}
          // markdown 外链之前被统一降级成 span，用户看得到链接却点不开。
          // 这里仍阻断原生 a 标签跳转，但不再把所有 http/https 都默认送进内置浏览器。
          onClick={handleClick}
        >
          {children}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={() => handleOpen({ forceInApp: true })}>
          {intl.formatMessage({ id: "common.open" })}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => handleOpen({ forceExternal: true })}>
          <ExternalLinkIcon className="size-4" />
          <span>{intl.formatMessage({ id: "chat.previewCards.openExternal" })}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface MessageFileLinkButtonProps extends ComponentProps<"button"> {
  fileIconSrc: string;
  fileLink: MessageFileLinkTarget;
  onOpen: () => void;
}

const MessageFileLinkButton = forwardRef<HTMLButtonElement, MessageFileLinkButtonProps>(
  function MessageFileLinkButton(
    { children, className, fileIconSrc, fileLink, onOpen, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(messageFileLinkClassName, "cursor-pointer", className)}
        title={fileLink.path}
        onClick={onOpen}
        {...props}
      >
        <FileDisplayIcon src={fileIconSrc} size={16} className="ml-0.5 shrink-0 self-center" />
        <span className="min-w-0 self-baseline truncate">{children}</span>
      </button>
    );
  },
);

interface MessageFileLinkProps {
  className?: string;
  fileIconSrc: string;
  fileLink: MessageFileLinkTarget;
  onOpen: () => void;
}

export function MessageFileLink({ className, fileIconSrc, fileLink, onOpen }: MessageFileLinkProps) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const services = useOptionalServices();
  const fileActions = useFileContextActions();
  const openInEditorContext = useWorkspaceOpenInEditorTarget({
    workspacePath: fileLink.workspacePath,
    workspaceIdentity: fileLink.workspaceIdentity,
    workspaceRemoteSessionId: fileLink.workspaceRemoteSessionId,
  });
  const [editors, setEditors] = useState<EditorInfo[]>([]);
  const [editorsLoaded, setEditorsLoaded] = useState(false);
  const [loadingEditors, setLoadingEditors] = useState(false);
  const sortedEditors = useMemo(
    () =>
      openInEditorContext.isRemoteWorkspace && !openInEditorContext.remoteTarget
        ? []
        : resolveWorkspaceEditorSelection({
            installedEditors: editors,
            selectedEditorId: null,
            remoteTarget: openInEditorContext.remoteTarget,
          }).availableEditors,
    [editors, openInEditorContext],
  );
  const selectedEditor = useMemo(() => {
    const selectedEditorId = readLastSelectedEditorId();
    return (
      sortedEditors.find((editor) => editor.id === selectedEditorId) ?? sortedEditors[0] ?? null
    );
  }, [sortedEditors]);

  const loadEditors = useCallback(async () => {
    if (editorsLoaded || loadingEditors) {
      return;
    }

    setLoadingEditors(true);
    try {
      const installedEditors = await platform.getInstalledEditors();
      setEditors(installedEditors);
      setEditorsLoaded(true);
    } catch (error) {
      logger.warn("[MessageResponse] 获取 markdown 链接打开方式失败", {
        path: fileLink.path,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoadingEditors(false);
    }
  }, [editorsLoaded, fileLink.path, loadingEditors, platform]);

  const handleOpenInEditor = (editor: EditorInfo) => {
    if (!services) {
      logger.warn("[MessageResponse] 无法确认 markdown 链接文件类型", {
        editorId: editor.id,
        path: fileLink.path,
        error: "workspace-file-service-unavailable",
      });
      return;
    }

    persistLastSelectedEditorId(editor.id);
    void openMessageFileLinkInEditor({
      editorId: editor.id,
      fileLink,
      openInEditor: (editorId, path, options) => platform.openInEditor(editorId, path, options),
      remoteTarget: openInEditorContext.remoteTarget,
      statFile: (params) => services.fileService.stat(params),
    })
      .then((result) => {
        if (result.success) {
          return;
        }

        logger.warn("[MessageResponse] 第三方 App 打开 markdown 文件链接失败", {
          editorId: editor.id,
          path: fileLink.path,
          error: result.error ?? "unknown-error",
        });
      })
      .catch((error) => {
        logger.warn("[MessageResponse] 无法确认 markdown 链接文件类型", {
          editorId: editor.id,
          path: fileLink.path,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };

  return (
    <ContextMenu onOpenChange={(open) => open && void loadEditors()}>
      <ContextMenuTrigger asChild>
        <MessageFileLinkButton
          className={className}
          fileIconSrc={fileIconSrc}
          fileLink={fileLink}
          onOpen={onOpen}
        >
          {fileLink.label}
        </MessageFileLinkButton>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onOpen}>
          {intl.formatMessage({ id: "common.open" })}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {selectedEditor ? (
          sortedEditors.map((editor) => (
            <ContextMenuItem key={editor.id} onSelect={() => handleOpenInEditor(editor)}>
              <img src={editor.iconDataUrl} alt={editor.name} className="size-4 shrink-0" />
              <span>{editor.name}</span>
            </ContextMenuItem>
          ))
        ) : (
          <ContextMenuItem disabled>
            {intl.formatMessage({
              id: loadingEditors ? "common.loading" : "chat.previewCards.noOpenApps",
            })}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => void fileActions.copyAbsolutePath({ path: fileLink.path })}
        >
          <CopyIcon className="size-4" />
          {intl.formatMessage({ id: "fileActions.copyAbsolutePath" })}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            void fileActions.copyRelativePath({
              path: fileLink.path,
              relativePath: fileLink.relativePath ?? fileLink.label,
            })
          }
        >
          <CopyIcon className="size-4" />
          {intl.formatMessage({ id: "fileActions.copyRelativePath" })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}