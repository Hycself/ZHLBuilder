/*
 * Derived from vercel/ai-elements (packages/elements/src/message.tsx).
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * Modified by ZCode: local integration, formatting and adaptations.
 * See THIRD-PARTY-NOTICES.md in the repository root for license and provenance.
 *
 * 界面自研重写 v2（A2b）：从 ai-elements/message.tsx 拆出的「渲染侧」。
 * 每个 Markdown 可见元素的渲染件都在本模块自研维护（含补充接管的
 * hr / sup / sub——Streamdown 默认组件表里此前仍由上游 UI 承接的最后三个）；
 * 文件/外链渲染组在 messageFileLinks.tsx，解析侧在 messageMarkdownParse.ts。
 */
import { isValidElement, type ComponentProps, type ReactNode } from "react";
import type { BundledTheme } from "shiki";
import { CodeBlock, CodeBlockHeader } from "@/components/ai-elements/code-block.js";
import { MarkdownBlockquote } from "@/components/ai-elements/markdown-blockquote.js";
import {
  MarkdownListItem,
  MarkdownOrderedList,
  MarkdownUnorderedList,
} from "@/components/ai-elements/markdown-list.js";
import {
  MarkdownImage,
  MarkdownImageParagraph,
  type MarkdownImageProps,
} from "@/components/ai-elements/markdown-image.js";
import {
  MarkdownTable,
  MarkdownTableBody,
  MarkdownTableCell,
  MarkdownTableHead,
  MarkdownTableHeader,
  MarkdownTableRow,
} from "@/components/ai-elements/markdown-table.js";
import { cn } from "@/components/lib/utils.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import { FOLDER_FILE_ICON_SRC, resolveFileDisplayDescriptor } from "@/lib/fileDisplay.js";
import { resolveMarkdownFileLink } from "@/lib/markdownFileLink.js";
import { stripBalancedAssistantPathQuotes } from "@/lib/assistantPathQuotes.js";
import { getPathLeaf } from "@/lib/path.js";
import {
  MessageExternalLink,
  MessageFileLink,
  buildMessageFileLinkTarget,
  messageLinkClassName,
  type MessageFileLinkTarget,
} from "@/next-message/messageFileLinks.js";
import type { MessageResponseProps } from "@/next-message/MessageResponse.js";
import type { Theme } from "@/useTheme.js";

// Markdown 之前继承紧凑 UI 字号，正文、标题、链接和表格缺少独立的阅读层级。
// 这里显式定义字号层级，并让标题跟随 UI 字号 Token 缩放，确保聊天、预览和工具面板复用 MessageResponse 时保持一致。
const messageMarkdownHeadingClassNames = {
  h1: "mt-6 mb-4 text-ui-xl font-semibold",
  h2: "mt-6 mb-4 text-ui-lg font-semibold",
  h3: "mt-6 mb-4 text-ui-base font-semibold",
  h4: "mt-6 mb-4 text-ui-base font-semibold",
  h5: "mt-6 mb-4 text-ui-base font-medium",
  h6: "mt-6 mb-4 text-ui-base font-normal",
} as const;

const languageClassNamePattern = /(?:^|\s)language-([^\s]+)/;

function getCodeLanguage(className?: string): string {
  return className?.match(languageClassNamePattern)?.[1] ?? "text";
}

export function extractCodeText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map(extractCodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(children)) {
    return extractCodeText(children.props.children);
  }

  return "";
}

function extractLinkLabelText(children: ReactNode): string {
  return extractCodeText(children).trim();
}

function trimCodeFenceTrailingNewlines(codeText: string): string {
  return codeText.replace(/\n+$/, "");
}

function isExternalWebHref(href: string): boolean {
  try {
    const protocol = new URL(href).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

type MarkdownCodeProps = ComponentProps<"code"> & {
  node?: unknown;
  "data-block"?: unknown;
};
type MarkdownHeadingProps = ComponentProps<"h1"> & {
  node?: unknown;
};
type MarkdownStrongProps = ComponentProps<"strong"> & {
  node?: unknown;
};

function MessageMarkdownHeading({
  className,
  headingLevel,
  node: _node,
  ...props
}: MarkdownHeadingProps & {
  headingLevel: keyof typeof messageMarkdownHeadingClassNames;
}) {
  const headingClassName = cn(messageMarkdownHeadingClassNames[headingLevel], className);
  const dataStreamdown = `heading-${headingLevel.slice(1)}`;

  if (headingLevel === "h1") {
    return <h1 className={headingClassName} data-streamdown={dataStreamdown} {...props} />;
  }

  if (headingLevel === "h2") {
    return <h2 className={headingClassName} data-streamdown={dataStreamdown} {...props} />;
  }

  if (headingLevel === "h3") {
    return <h3 className={headingClassName} data-streamdown={dataStreamdown} {...props} />;
  }

  if (headingLevel === "h4") {
    return <h4 className={headingClassName} data-streamdown={dataStreamdown} {...props} />;
  }

  if (headingLevel === "h5") {
    return <h5 className={headingClassName} data-streamdown={dataStreamdown} {...props} />;
  }

  return <h6 className={headingClassName} data-streamdown={dataStreamdown} {...props} />;
}

// 以下三个渲染件接管的是 Streamdown 默认组件表中最后仍由上游 UI 承接的元素
// （hr / sup / sub）；文案尺寸改用项目 text-ui-* 排版体系，不再走 Tailwind 默认 text-sm。
function MarkdownHr({ className, node: _node, ...props }: ComponentProps<"hr"> & { node?: unknown }) {
  return (
    <hr
      className={cn("my-6 border-border", className)}
      data-streamdown="horizontal-rule"
      {...props}
    />
  );
}

function MarkdownSup({
  className,
  node: _node,
  ...props
}: ComponentProps<"sup"> & { node?: unknown }) {
  return (
    <sup
      className={cn("text-ui-xs leading-none", className)}
      data-streamdown="superscript"
      {...props}
    />
  );
}

function MarkdownSub({
  className,
  node: _node,
  ...props
}: ComponentProps<"sub"> & { node?: unknown }) {
  return (
    <sub
      className={cn("text-ui-xs leading-none", className)}
      data-streamdown="subscript"
      {...props}
    />
  );
}

export interface MessageMarkdownRenderContext {
  codeBlockTheme: BundledTheme;
  fontSizePx: number;
  forceCodeWrap: boolean;
  onOpenCodeViewer?: (source: CodeViewerSource) => void;
  onOpenExternalUrl?: (url: string) => void;
  onOpenFileLink?: (target: MessageFileLinkTarget) => void;
  readAttachment?: MessageResponseProps["readAttachment"];
  renderStreaming: boolean;
  sessionId?: string;
  theme: Theme;
  workspaceHomePath?: string;
  workspaceIdentity?: string;
  workspacePath?: string;
  workspaceRemoteSessionId?: string;
  wrapLongLines: boolean;
}

/** 自研渲染表：Markdown 中每个可见元素 → 项目自维护的渲染件。 */
export function createMessageMarkdownComponents({
  codeBlockTheme,
  fontSizePx,
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
}: MessageMarkdownRenderContext) {
  return {
    a: ({
      children,
      className: linkClassName,
      href,
      node: _node,
    }: ComponentProps<"a"> & { node?: unknown }) => {
      const resolvedHref =
        typeof href === "string" ? stripBalancedAssistantPathQuotes(href) : "";
      const fileLink = resolveMarkdownFileLink(workspacePath, resolvedHref, {
        homePath: workspaceHomePath,
      });

      if (fileLink && (onOpenFileLink || onOpenCodeViewer)) {
        const descriptor = resolveFileDisplayDescriptor(fileLink.path);
        const fileName = descriptor.fileName || getPathLeaf(fileLink.path);
        const labelText = extractLinkLabelText(children) || fileName;
        const fileLinkTarget = buildMessageFileLinkTarget({
          href: resolvedHref,
          path: fileLink.path,
          label: labelText,
          workspacePath,
          workspaceIdentity,
          workspaceRemoteSessionId,
        });
        const fileIconSrc =
          fileLinkTarget.pathKind === "directory"
            ? FOLDER_FILE_ICON_SRC
            : descriptor.fileIconSrc;
        return (
          <MessageFileLink
            className={linkClassName}
            fileIconSrc={fileIconSrc}
            fileLink={fileLinkTarget}
            onOpen={() => {
              if (onOpenFileLink) {
                onOpenFileLink(fileLinkTarget);
                return;
              }
              onOpenCodeViewer?.({
                type: "file",
                title: getPathLeaf(fileLink.path),
                path: fileLink.path,
                workspacePath,
                workspaceIdentity,
                workspaceRemoteSessionId,
              });
            }}
          />
        );
      }

      if (isExternalWebHref(resolvedHref) && onOpenExternalUrl) {
        return (
          <MessageExternalLink
            className={linkClassName}
            href={resolvedHref}
            onOpenExternalUrl={onOpenExternalUrl}
          >
            {children}
          </MessageExternalLink>
        );
      }

      return (
        <span className={cn(messageLinkClassName, linkClassName)} title={resolvedHref || undefined}>
          {children}
        </span>
      );
    },
    img: (imageProps: MarkdownImageProps) => (
      <MarkdownImage
        {...imageProps}
        workspacePath={workspacePath}
        workspaceHomePath={workspaceHomePath}
        sessionId={sessionId}
        readAttachment={readAttachment}
      />
    ),
    p: MarkdownImageParagraph,
    h1: (headingProps: MarkdownHeadingProps) => (
      <MessageMarkdownHeading {...headingProps} headingLevel="h1" />
    ),
    h2: (headingProps: MarkdownHeadingProps) => (
      <MessageMarkdownHeading {...headingProps} headingLevel="h2" />
    ),
    h3: (headingProps: MarkdownHeadingProps) => (
      <MessageMarkdownHeading {...headingProps} headingLevel="h3" />
    ),
    h4: (headingProps: MarkdownHeadingProps) => (
      <MessageMarkdownHeading {...headingProps} headingLevel="h4" />
    ),
    h5: (headingProps: MarkdownHeadingProps) => (
      <MessageMarkdownHeading {...headingProps} headingLevel="h5" />
    ),
    h6: (headingProps: MarkdownHeadingProps) => (
      <MessageMarkdownHeading {...headingProps} headingLevel="h6" />
    ),
    strong: ({ className: strongClassName, node: _node, ...strongProps }: MarkdownStrongProps) => (
      <strong className={cn("font-medium", strongClassName)} {...strongProps} />
    ),
    code: ({
      children,
      className: codeClassName,
      node: _node,
      ...codeProps
    }: MarkdownCodeProps) => {
      const isBlockCode = "data-block" in codeProps;

      if (!isBlockCode) {
        return (
          <code
            className={cn(
              "rounded-md bg-markdown-inline-code/50 mx-0.5 px-1.5 py-0.5 font-mono text-ui-sm",
              codeClassName,
            )}
            {...codeProps}
          >
            {children}
          </code>
        );
      }

      const codeText = trimCodeFenceTrailingNewlines(extractCodeText(children));
      const language = getCodeLanguage(codeClassName);

      return (
        <CodeBlock
          className="my-4 border border-border bg-card"
          code={codeText}
          // 流式消息里的代码围栏会被 Streamdown 反复拆分/重挂载。
          // 高亮等消息完成后再启动，避免 async highlighter 和消息流更新叠加触发 React #185。
          enableSyntaxHighlighting={!renderStreaming}
          fontSizePx={fontSizePx}
          language={language}
          renderMermaid={!renderStreaming}
          theme={codeBlockTheme}
          appTheme={theme}
          wrapLongLines={wrapLongLines}
        >
          <CodeBlockHeader
            className="pl-3 pr-2 pt-2"
            language={language}
            showWrapButton={!forceCodeWrap}
          />
        </CodeBlock>
      );
    },
    blockquote: MarkdownBlockquote,
    li: MarkdownListItem,
    ol: MarkdownOrderedList,
    table: MarkdownTable,
    tbody: MarkdownTableBody,
    td: MarkdownTableCell,
    th: MarkdownTableHead,
    thead: MarkdownTableHeader,
    tr: MarkdownTableRow,
    ul: MarkdownUnorderedList,
    hr: MarkdownHr,
    sup: MarkdownSup,
    sub: MarkdownSub,
  };
}