/*
 * Derived from vercel/ai-elements (packages/elements/src/message.tsx).
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * Modified by ZCode: local integration, formatting and adaptations.
 * See THIRD-PARTY-NOTICES.md in the repository root for license and provenance.
 *
 * 界面自研重写 v2（A2b）：消息流桥接组件。职责收敛为「把归一化后的 Markdown
 * 交给解析侧（Streamdown 只做解析），再用自研渲染表渲染，并在异常时降级」。
 * 解析侧在 messageMarkdownParse.ts，渲染侧在 messageMarkdownElements.tsx。
 */
import type { CodePreviewSettings } from "@/lib/codePreviewSettings.js";
import { DEFAULT_CODE_PREVIEW_SETTINGS } from "@/lib/codePreviewSettings.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import { createZCodeFileCitationRemarkPlugin } from "@/lib/zcodeFileCitationRemarkPlugin.js";
import { windowsFileLinkEscapeRemarkPlugin } from "@/lib/windowsFileLinkEscapeRemarkPlugin.js";
import { projectZCodeFileCitations } from "@/lib/zcodeFileCitation.js";
import { logger } from "@/logger.js";
import {
  createMessageMarkdownComponents,
  extractCodeText,
} from "@/next-message/messageMarkdownElements.js";
import type { MessageFileLinkTarget } from "@/next-message/messageFileLinks.js";
import {
  buildMessageStreamdownRenderKey,
  getAttachmentReaderEpoch,
  hashMarkdownCacheKey,
  messageDefaultRemarkPlugins,
  messageLinkSafety,
  messageRehypePlugins,
  normalizeMessageSingleDollarMath,
  resolveMessageCodeTheme,
  resolveMessageStreamdownMode,
  streamdownPlugins,
  type MessageStreamdownMode,
} from "@/next-message/messageMarkdownParse.js";
import type { Theme } from "@/useTheme.js";
import { STREAMDOWN_CONTROLS } from "@/components/ai-elements/streamdown-controls.js";
import { normalizeConsecutiveMarkdownImageBlocks } from "@/components/ai-elements/markdown-image.js";
import { cn } from "@/components/lib/utils.js";
import { rewriteMarkdownArtifactImageSources } from "@zhlbuilder/shared";
import type { BundledTheme } from "shiki";
import { Streamdown } from "streamdown";
import { Component, memo, useMemo, type ErrorInfo, type ReactNode } from "react";
import type { PluggableList } from "unified";

export type MessageResponseProps = {
  /** 办公模式的正式回答固定换行，不覆盖用户保存的代码预览设置。 */
  forceCodeWrap?: boolean;
  className?: string;
  children?: ReactNode;
  dir?: "auto" | "ltr" | "rtl";
  streaming?: boolean;
  streamingAnimationKey?: string;
  workspacePath?: string;
  workspaceHomePath?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  sessionId?: string;
  readAttachment?: (params: {
    sessionId: string;
    ref: string;
  }) => Promise<{ bytes: Uint8Array; mediaType: string } | { url: string; mediaType: string }>;
  /**
   * 应用主题（store 耦合剥离）：决定代码块高亮取 light/dark 主题。
   * 由调用方从上层状态传入；默认 "system" 跟随操作系统，供待删旧调用点兜底。
   */
  theme?: Theme;
  /**
   * 代码预览设置（store 耦合剥离）：由调用方传入，需保持引用稳定。
   * 默认 DEFAULT_CODE_PREVIEW_SETTINGS。
   */
  codePreviewSettings?: CodePreviewSettings;
  onOpenCodeViewer?: (source: CodeViewerSource) => void;
  onOpenFileLink?: (target: MessageFileLinkTarget) => void;
  onOpenExternalUrl?: (url: string) => void;
  /** 仅 Assistant 正文开启：把完整 zcode-file-citation 投影为现有文件链接。 */
  renderZCodeFileCitations?: boolean;
};

type MessageResponseBoundaryScope = {
  markdownLength: number;
  mode: MessageStreamdownMode;
  renderStreaming: boolean;
};

interface MessageResponseMarkdownBoundaryProps {
  children: ReactNode;
  className?: string;
  fallbackText: string;
  resetKey: string;
  scope: MessageResponseBoundaryScope;
}

interface MessageResponseMarkdownBoundaryState {
  error: Error | null;
}

function normalizeMarkdownRenderError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : "Unknown markdown render error");
}

class MessageResponseMarkdownBoundary extends Component<
  MessageResponseMarkdownBoundaryProps,
  MessageResponseMarkdownBoundaryState
> {
  state: MessageResponseMarkdownBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): MessageResponseMarkdownBoundaryState {
    return { error: normalizeMarkdownRenderError(error) };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const normalizedError = normalizeMarkdownRenderError(error);
    logger.warn("[MessageResponse] markdown 渲染失败，已降级为纯文本", {
      errorName: normalizedError.name,
      errorMessage: normalizedError.message,
      componentStack: errorInfo.componentStack,
      markdownLength: this.props.scope.markdownLength,
      mode: this.props.scope.mode,
      renderStreaming: this.props.scope.renderStreaming,
    });
  }

  override componentDidUpdate(previousProps: MessageResponseMarkdownBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render() {
    if (this.state.error) {
      return (
        <div className={this.props.className}>
          {/* 单条 markdown 渲染异常时降级为纯文本，避免错误继续冒泡到会话区边界。*/}
          {this.props.fallbackText}
        </div>
      );
    }

    return this.props.children;
  }
}

export const messageResponsePropsAreEqual = (
  prevProps: Readonly<MessageResponseProps>,
  nextProps: Readonly<MessageResponseProps>,
): boolean =>
  prevProps.children === nextProps.children &&
  prevProps.forceCodeWrap === nextProps.forceCodeWrap &&
  nextProps.streaming === prevProps.streaming &&
  nextProps.streamingAnimationKey === prevProps.streamingAnimationKey &&
  nextProps.workspacePath === prevProps.workspacePath &&
  nextProps.workspaceHomePath === prevProps.workspaceHomePath &&
  nextProps.workspaceIdentity === prevProps.workspaceIdentity &&
  nextProps.workspaceRemoteSessionId === prevProps.workspaceRemoteSessionId &&
  nextProps.sessionId === prevProps.sessionId &&
  nextProps.readAttachment === prevProps.readAttachment &&
  nextProps.renderZCodeFileCitations === prevProps.renderZCodeFileCitations &&
  nextProps.theme === prevProps.theme &&
  nextProps.codePreviewSettings === prevProps.codePreviewSettings &&
  nextProps.onOpenCodeViewer === prevProps.onOpenCodeViewer &&
  nextProps.onOpenFileLink === prevProps.onOpenFileLink &&
  nextProps.onOpenExternalUrl === prevProps.onOpenExternalUrl;

export const MessageResponse = memo(
  ({
    className,
    streaming = false,
    forceCodeWrap = false,
    onOpenCodeViewer,
    onOpenFileLink,
    onOpenExternalUrl,
    renderZCodeFileCitations = false,
    workspacePath,
    workspaceHomePath,
    workspaceIdentity,
    workspaceRemoteSessionId,
    sessionId,
    readAttachment,
    theme = "system",
    codePreviewSettings = DEFAULT_CODE_PREVIEW_SETTINGS,
    children,
  }: MessageResponseProps) => {
    const wrapLongLines = forceCodeWrap || codePreviewSettings.wrapLongLines;
    const rawMarkdown = useMemo(() => extractCodeText(children), [children]);
    const renderStreaming = streaming;
    const projectedCitationMarkdown = useMemo(
      () =>
        renderZCodeFileCitations
          ? projectZCodeFileCitations(rawMarkdown, { streaming: renderStreaming }).visibleText
          : rawMarkdown,
      [rawMarkdown, renderStreaming, renderZCodeFileCitations],
    );
    const targetMarkdown = useMemo(
      () =>
        rewriteMarkdownArtifactImageSources(
          normalizeMessageSingleDollarMath(
            normalizeConsecutiveMarkdownImageBlocks(projectedCitationMarkdown),
          ),
        ),
      [projectedCitationMarkdown],
    );
    const streamdownMode = resolveMessageStreamdownMode(renderStreaming);
    const messageRemarkPlugins = useMemo<PluggableList>(
      () => [
        // 显式传 remarkPlugins 会覆盖 Streamdown 默认插件；
        // citation 必须和默认 GFM 插件一起传入，否则表格会退化成普通段落。
        ...messageDefaultRemarkPlugins,
        // Windows 绝对路径链接里的 `\.` 会在 remark 解析期被当成标点转义吃掉
        // rehype 阶段已经看不到原文。这条还原必须无条件生效，不能挂在 citation 开关下。
        windowsFileLinkEscapeRemarkPlugin,
        ...(renderZCodeFileCitations && workspacePath
          ? [createZCodeFileCitationRemarkPlugin(workspacePath, workspaceHomePath)]
          : []),
      ],
      [renderZCodeFileCitations, workspaceHomePath, workspacePath],
    );
    const responseClassName = cn(
      "size-full text-ui-base leading-[1.75] tracking-wide [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
      className,
    );
    const fallbackClassName = cn(responseClassName, "whitespace-pre-wrap break-words");
    const boundaryResetKey = useMemo(
      () =>
        renderStreaming
          ? `streaming:${streamdownMode}`
          : `${streamdownMode}:${renderZCodeFileCitations ? "citations" : "plain"}:${hashMarkdownCacheKey(targetMarkdown)}`,
      [renderStreaming, renderZCodeFileCitations, streamdownMode, targetMarkdown],
    );
    const boundaryScope = useMemo<MessageResponseBoundaryScope>(
      () => ({
        markdownLength: targetMarkdown.length,
        mode: streamdownMode,
        renderStreaming,
      }),
      [renderStreaming, streamdownMode, targetMarkdown.length],
    );
    const codeBlockTheme = useMemo(
      () => resolveMessageCodeTheme(theme, codePreviewSettings),
      [codePreviewSettings, theme],
    );
    const shikiTheme = useMemo(
      () =>
        [codePreviewSettings.lightTheme, codePreviewSettings.darkTheme] as [
          BundledTheme,
          BundledTheme,
        ],
      [codePreviewSettings.lightTheme, codePreviewSettings.darkTheme],
    );
    const streamdownRenderKey = useMemo(() => {
      return (
        buildMessageStreamdownRenderKey({
          attachmentReaderEpoch: getAttachmentReaderEpoch(readAttachment),
          codeBlockTheme,
          fontSizePx: codePreviewSettings.fontSizePx,
          renderZCodeFileCitations,
          sessionId,
          workspacePath,
          workspaceHomePath,
          workspaceIdentity,
          workspaceRemoteSessionId,
          wrapLongLines,
        }) + (forceCodeWrap ? ":wrap-locked" : "")
      );
    }, [
      codeBlockTheme,
      codePreviewSettings.fontSizePx,
      wrapLongLines,
      forceCodeWrap,
      renderZCodeFileCitations,
      readAttachment,
      sessionId,
      workspaceHomePath,
      workspacePath,
      workspaceIdentity,
      workspaceRemoteSessionId,
    ]);
    const messageComponents = useMemo(
      () =>
        createMessageMarkdownComponents({
          codeBlockTheme,
          fontSizePx: codePreviewSettings.fontSizePx,
          forceCodeWrap,
          onOpenCodeViewer,
          onOpenExternalUrl,
          onOpenFileLink,
          readAttachment,
          renderStreaming,
          sessionId,
          theme,
          workspaceHomePath,
          workspaceIdentity,
          workspacePath,
          workspaceRemoteSessionId,
          wrapLongLines,
        }),
      [
        codeBlockTheme,
        codePreviewSettings.fontSizePx,
        wrapLongLines,
        forceCodeWrap,
        onOpenFileLink,
        onOpenCodeViewer,
        onOpenExternalUrl,
        readAttachment,
        renderStreaming,
        sessionId,
        theme,
        workspaceHomePath,
        workspacePath,
        workspaceIdentity,
        workspaceRemoteSessionId,
      ],
    );

    return (
      <MessageResponseMarkdownBoundary
        className={fallbackClassName}
        fallbackText={targetMarkdown}
        resetKey={boundaryResetKey}
        scope={boundaryScope}
      >
        <Streamdown
          key={streamdownRenderKey}
          className={responseClassName}
          // Streamdown 自身是 memo，比较函数不看 components。app light/dark 切换时
          // codeBlockTheme 只存在于自定义 code renderer 闭包里，若不改 key，当前 task 已挂载的
          // markdown 代码块不会重新执行 renderer；切换 task 触发重建后才会恢复正确主题。
          // Artifact reader/session 同样只存在于 img renderer 闭包里。权限上下文变化时必须重挂载
          // markdown 子树，释放旧 blob URL，并确保后续读取只使用当前会话的 reader。
          // 已结束消息之前也一直走 streaming mode，会触发 remend 对正文做“未闭合 markdown 补全”。
          // 遇到 `./src/**/*` 这类代码片段时，remend 会误判成未闭合粗体并在末尾补出 `**`。
          // 性能优化曾让长历史消息也启用 block streaming 模式复用分块缓存；虚拟滚动/懒渲染会
          // 频繁重挂载历史消息，生产上遇到部分 markdown 会在 Streamdown 内部触发 React #185。
          // 这里重新收敛为：只有真实流式输出走 streaming 解析，完成态一律 static。
          mode={streamdownMode}
          components={messageComponents}
          parseIncompleteMarkdown={streaming}
          // Streamdown 内置 code renderer 的 highlighted-body 会在代码高亮结果和 raw fallback
          // 之间反复 setState，部分历史消息恢复时会触发 React #185。这里保留 markdown 解析能力，
          // 但代码块改走本项目自己的稳定 CodeBlock 渲染器。
          // 说明：这里继续关掉 Streamdown 默认链接行为，统一改由上面的自定义 a 渲染器接管。
          // 这样工作区文件链接和 http/https 外链都能走我们自己的安全分流，其它协议仍保持不可点击。
          linkSafety={messageLinkSafety}
          plugins={streamdownPlugins}
          controls={STREAMDOWN_CONTROLS}
          // Streamdown 的 harden 插件会在自定义 a renderer 之前把 file:// 标成 [blocked]。
          // 这里先把 file URI 规整成本地路径 href，让后续 resolveMarkdownFileLink 统一走预览/文件树打开逻辑。
          rehypePlugins={messageRehypePlugins}
          remarkPlugins={messageRemarkPlugins}
          shikiTheme={shikiTheme}
          // markdown 正文流式淡入会在重渲染时让历史文本整段重新闪烁。
          // 这里保留 streaming 解析模式，但彻底关闭 Streamdown/正文 rehype 动画。
          animated={false}
          isAnimating={false}
        >
          {targetMarkdown}
        </Streamdown>
      </MessageResponseMarkdownBoundary>
    );
  },
  messageResponsePropsAreEqual,
);

MessageResponse.displayName = "MessageResponse";