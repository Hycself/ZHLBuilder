/*
 * Derived from vercel/ai-elements (packages/elements/src/message.tsx).
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * Modified by ZCode: local integration, formatting and adaptations.
 * See THIRD-PARTY-NOTICES.md in the repository root for license and provenance.
 *
 * 界面自研重写 v2（A2b）：从 ai-elements/message.tsx 拆出的「解析侧」。
 * Streamdown 在这一层只承担 Markdown 解析（remark/rehype 管线、流式未闭合补全、
 * 分块），归一化流水线与插件装配全部由本模块自研维护；渲染侧在
 * messageMarkdownElements.tsx，桥接组件在 MessageResponse.tsx。
 */
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough";
import type { BundledTheme } from "shiki";
import { defaultRehypePlugins, defaultRemarkPlugins } from "streamdown";
import type { Pluggable, PluggableList } from "unified";
import {
  normalizeWorkspaceRelativeFilePath,
  parseMarkdownFileLinkTarget,
  resolveMarkdownFileLink,
} from "@/lib/markdownFileLink.js";
import { getPathLeaf } from "@/lib/path.js";
import type { Theme } from "@/useTheme.js";
import { hasFileExtension } from "@/next-message/messageFileLinks.js";
import type { MessageResponseProps } from "@/next-message/MessageResponse.js";

export type MessageStreamdownMode = "static" | "streaming";

type HastElementNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastElementNode[];
};

// @streamdown/math 默认不解析 `$...$` 行内公式，导致客户消息里块级 `$$...$$`
// 能渲染而 `$c(\mathbf{r})$` 会原样显示；聊天消息需要兼容常见 Markdown/LaTeX 输出。
const messageMathPlugin = createMathPlugin({ singleDollarTextMath: true });

function disableSingleTilde(plugin: Pluggable): Pluggable {
  if (!Array.isArray(plugin)) {
    return typeof plugin === "function" ? [plugin, { singleTilde: false }] : plugin;
  }

  const [attacher, existingOptions] = plugin;
  return [
    attacher,
    {
      ...(typeof existingOptions === "object" && existingOptions !== null ? existingOptions : {}),
      singleTilde: false,
    },
  ];
}

const messageCjkRemarkPluginsAfter = cjk.remarkPluginsAfter.map((plugin) => {
  const attacher = Array.isArray(plugin) ? plugin[0] : plugin;
  return attacher === remarkCjkFriendlyGfmStrikethrough ? disableSingleTilde(plugin) : plugin;
});
const messageCjkPlugin: typeof cjk = {
  ...cjk,
  remarkPlugins: [...cjk.remarkPluginsBefore, ...messageCjkRemarkPluginsAfter],
  remarkPluginsAfter: messageCjkRemarkPluginsAfter,
};
export const streamdownPlugins = { cjk: messageCjkPlugin, code, math: messageMathPlugin, mermaid };
// 外链统一由自研渲染层分流（工作区文件链接 / http(s) 外链 / 其它协议不可点），
// 因此关闭 Streamdown 自带的链接安全改写，避免它先把 file:// 标成 [blocked]。
export const messageLinkSafety = { enabled: false } as const;

const markdownFencePattern = /^(?: {0,3})(`{3,}|~{3,})/;
const likelyMathSyntaxPattern = /[\\{}^_=+\-*/<>|()[\]∇∂∫∑√∞≈≠≤≥±×÷πΠα-ωΑ-Ω]/u;
const texCommandPattern = /\\[A-Za-z]+/;
const simpleMathIdentifierPattern = /^(?:[A-Za-z]|[a-z][A-Za-z0-9]{1,2}|\d+(?:\.\d+)?)$/;
const compactCurrencyRangePrefixPattern = /^(?:\d[\d,]*(?:\.\d+)?|\.\d+)[+\-*/]$/;
const compactCurrencyAmountStartPattern = /^(?:\d|\.\d)/;
const fileUrlProtocolPattern = /^file:\/\//i;
const windowsDriveAbsolutePathPattern = /^[a-zA-Z]:[\\/]/;

export function hashMarkdownCacheKey(markdown: string): string {
  let hash = 2166136261;
  for (let index = 0; index < markdown.length; index += 1) {
    hash ^= markdown.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${markdown.length}:${hash >>> 0}`;
}

function getMarkdownFence(line: string): { marker: string; length: number } | null {
  const match = markdownFencePattern.exec(line);

  if (!match) {
    return null;
  }

  const sequence = match[1] ?? "";
  return {
    marker: sequence[0] ?? "",
    length: sequence.length,
  };
}

function isEscapedMarkdownCharacter(text: string, index: number): boolean {
  let slashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) {
    slashCount++;
  }

  return slashCount % 2 === 1;
}

function isSingleDollarDelimiter(text: string, index: number): boolean {
  return (
    text[index] === "$" &&
    text[index - 1] !== "$" &&
    text[index + 1] !== "$" &&
    !isEscapedMarkdownCharacter(text, index)
  );
}

function findClosingSingleDollarDelimiter(text: string, startIndex: number): number {
  for (let index = startIndex; index < text.length; index++) {
    if (isSingleDollarDelimiter(text, index)) {
      return index;
    }
  }

  return -1;
}

function isLikelySingleDollarMath(content: string): boolean {
  if (!content || content !== content.trim() || /[\r\n]/.test(content)) {
    return false;
  }

  if (texCommandPattern.test(content) || likelyMathSyntaxPattern.test(content)) {
    return true;
  }

  if (!/\s/.test(content) && simpleMathIdentifierPattern.test(content)) {
    return true;
  }

  return false;
}

function isLikelyCompactCurrencyRangeText(
  text: string,
  closingIndex: number,
  content: string,
): boolean {
  if (!compactCurrencyRangePrefixPattern.test(content)) {
    return false;
  }

  return compactCurrencyAmountStartPattern.test(text.slice(closingIndex + 1));
}

function normalizeSingleDollarMathInText(text: string): string {
  if (!text.includes("$")) {
    return text;
  }

  let output = "";

  for (let index = 0; index < text.length; index++) {
    if (!isSingleDollarDelimiter(text, index)) {
      output += text[index];
      continue;
    }

    const closingIndex = findClosingSingleDollarDelimiter(text, index + 1);

    if (closingIndex === -1) {
      output += text[index];
      continue;
    }

    const content = text.slice(index + 1, closingIndex);

    if (isLikelyCompactCurrencyRangeText(text, closingIndex, content)) {
      // `$5-$10` 这类紧凑价格区间的第二个 `$` 会被误当成公式闭合符。
      // 只转义当前 `$`，让整段继续按普通文本渲染并保留美元符号。
      output += "\\$";
      continue;
    }

    if (isLikelySingleDollarMath(content)) {
      output += text.slice(index, closingIndex + 1);
      index = closingIndex;
      continue;
    }

    // 开启 singleDollarTextMath 后，`$5 ... $10` / `$HOME ... $PATH`
    // 这类普通文本会被误当成公式。只转义当前 `$`，让后续 `$` 继续按原文本扫描。
    output += "\\$";
  }

  return output;
}

function normalizeSingleDollarMathOutsideInlineCode(line: string): string {
  let output = "";
  let cursor = 0;

  while (cursor < line.length) {
    const codeStart = line.indexOf("`", cursor);

    if (codeStart === -1) {
      output += normalizeSingleDollarMathInText(line.slice(cursor));
      break;
    }

    output += normalizeSingleDollarMathInText(line.slice(cursor, codeStart));

    let codeFenceEnd = codeStart + 1;
    while (line[codeFenceEnd] === "`") {
      codeFenceEnd++;
    }

    const codeMarker = line.slice(codeStart, codeFenceEnd);
    const codeEnd = line.indexOf(codeMarker, codeFenceEnd);

    if (codeEnd === -1) {
      output += normalizeSingleDollarMathInText(line.slice(codeStart));
      break;
    }

    output += line.slice(codeStart, codeEnd + codeMarker.length);
    cursor = codeEnd + codeMarker.length;
  }

  return output;
}

export function normalizeMessageSingleDollarMath(markdown: string): string {
  if (!markdown.includes("$")) {
    return markdown;
  }

  let output = "";
  let cursor = 0;
  let activeFence: { marker: string; length: number } | null = null;

  while (cursor < markdown.length) {
    const newlineIndex = markdown.indexOf("\n", cursor);
    const lineEnd = newlineIndex === -1 ? markdown.length : newlineIndex;
    const line = markdown.slice(cursor, lineEnd);
    const newline = newlineIndex === -1 ? "" : "\n";
    const fence = getMarkdownFence(line);

    if (activeFence) {
      output += line + newline;

      if (fence && fence.marker === activeFence.marker && fence.length >= activeFence.length) {
        activeFence = null;
      }
    } else {
      output += normalizeSingleDollarMathOutsideInlineCode(line) + newline;

      if (fence) {
        activeFence = fence;
      }
    }

    cursor = lineEnd + newline.length;
  }

  return output;
}

export function resolveMessageStreamdownMode(renderStreaming: boolean): MessageStreamdownMode {
  // 生产包里有用户命中 React #185，堆栈落在 MessageResponse -> Streamdown。
  // 之前完成态长消息也会为了分块缓存走 streaming mode，Streamdown 内部 block state
  // 在某些历史 markdown 上会反复同步状态。现在只有真实流式输出进入 streaming，
  // 历史/完成态内容固定走 static，避免重新挂载时再次参与更新循环。
  return renderStreaming ? "streaming" : "static";
}

function formatMarkdownFileLinkTargetHref(href: string): string {
  const parsedTarget = parseMarkdownFileLinkTarget(href);
  // Windows 盘符的 `C:` 会被 rehype-harden 当成未知 URI scheme，
  // 在自定义文件链接 renderer 运行前直接替换成 `[blocked]`。临时补成 `/C:/...`
  // 让安全层按普通 path 放行；resolveMarkdownFileLink 会在 Windows Host 上对称还原。
  const path = windowsDriveAbsolutePathPattern.test(parsedTarget.path)
    ? `/${parsedTarget.path.replaceAll("\\", "/")}`
    : fileUrlProtocolPattern.test(href)
      ? parsedTarget.path
      : parsedTarget.path.startsWith("./") ||
          parsedTarget.path.startsWith("/") ||
          parsedTarget.path.startsWith("#") ||
          parsedTarget.path.startsWith("../") ||
          /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(parsedTarget.path)
        ? parsedTarget.path
        : `./${parsedTarget.path}`;
  if (parsedTarget.lineNumber === null) {
    return path;
  }

  if (parsedTarget.columnNumber === null) {
    return `${path}:${parsedTarget.lineNumber}`;
  }

  return `${path}:${parsedTarget.lineNumber}:${parsedTarget.columnNumber}`;
}

function shouldRewriteMarkdownFileLinkHref(href: string): boolean {
  if (resolveMarkdownFileLink(undefined, href)) {
    return true;
  }

  const parsedTarget = parseMarkdownFileLinkTarget(href);
  return (
    Boolean(parsedTarget.path) &&
    !parsedTarget.path.startsWith("/") &&
    !parsedTarget.path.startsWith("#") &&
    !parsedTarget.path.startsWith("../") &&
    !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(parsedTarget.path) &&
    // 越界路径若先经过 rehype rewrite/harden，`..` 可能被 URL 归一后丢失，
    // 点击层就无法还原原始逃逸意图；必须在改写前复用相对路径词法边界校验。
    normalizeWorkspaceRelativeFilePath(parsedTarget.path) !== null &&
    // `[README.md](README.md)` 这类裸文件名链接以前不会在 harden 前改写，
    // Streamdown 会把它当成不安全链接渲染成 `[blocked]`。有扩展名的裸路径按工作区文件处理，
    // 先规整成 `./README.md`，再交给统一的文件链接打开逻辑解析。
    (parsedTarget.path.includes("/") ||
      parsedTarget.path.includes("\\") ||
      hasFileExtension(getPathLeaf(parsedTarget.path)))
  );
}

function rewriteLocalFileMarkdownTargetsRehypePlugin() {
  return (tree: HastElementNode) => {
    const visitNode = (node: HastElementNode) => {
      const targetProperty = node.tagName === "a" ? "href" : node.tagName === "img" ? "src" : null;
      if (
        node.type === "element" &&
        targetProperty &&
        typeof node.properties?.[targetProperty] === "string" &&
        shouldRewriteMarkdownFileLinkHref(node.properties[targetProperty])
      ) {
        // markdown 图片和链接一样会先经过 rehype-harden。`file://` 会被安全层硬拦，
        // 裸文件名又会被当成未知 URL；这里在 harden 前统一规整成本地路径/相对路径。
        node.properties[targetProperty] = formatMarkdownFileLinkTargetHref(
          node.properties[targetProperty],
        );
      }

      node.children?.forEach(visitNode);
    };

    visitNode(tree);
  };
}

export const messageRehypePlugins: PluggableList = [
  rewriteLocalFileMarkdownTargetsRehypePlugin,
  ...Object.values(defaultRehypePlugins),
];

export const messageDefaultRemarkPlugins: PluggableList = Object.entries(defaultRemarkPlugins).map(
  ([name, plugin]) => {
    if (name !== "gfm") {
      return plugin;
    }

    // remark-gfm 与 Streamdown CJK 删除线扩展都默认开启 singleTilde，
    // 后者还会覆盖前者的解析结果；两处必须同时关闭，才能让 `~text~` 按 GFM 规范保留原文。
    return disableSingleTilde(plugin);
  },
);

export function resolveMessageCodeTheme(
  theme: Theme,
  codePreviewSettings: { lightTheme: BundledTheme; darkTheme: BundledTheme },
): BundledTheme {
  if (theme === "system" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? codePreviewSettings.darkTheme
      : codePreviewSettings.lightTheme;
  }

  return theme === "dark" || theme === "zai-dark"
    ? codePreviewSettings.darkTheme
    : codePreviewSettings.lightTheme;
}

export function buildMessageStreamdownRenderKey(params: {
  attachmentReaderEpoch?: number;
  codeBlockTheme: BundledTheme;
  fontSizePx: number;
  renderZCodeFileCitations?: boolean;
  sessionId?: string;
  workspacePath?: string;
  workspaceHomePath?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  wrapLongLines: boolean;
}): string {
  // streaming/static 只是解析模式，不应参与 React key；否则流式状态抖动会卸载
  // 整棵 markdown 子树，让已显示的正文重新触发淡入动画。
  return [
    params.sessionId ?? "",
    params.attachmentReaderEpoch ?? 0,
    params.codeBlockTheme,
    params.fontSizePx,
    params.wrapLongLines ? "wrap" : "scroll",
    params.renderZCodeFileCitations ? "citations" : "plain",
    params.workspacePath ?? "",
    params.workspaceHomePath ?? "",
    params.workspaceIdentity ?? "",
    params.workspaceRemoteSessionId ?? "",
  ].join(":");
}

const attachmentReaderEpochs = new WeakMap<
  NonNullable<MessageResponseProps["readAttachment"]>,
  number
>();
let nextAttachmentReaderEpoch = 1;

export function getAttachmentReaderEpoch(
  readAttachment: MessageResponseProps["readAttachment"],
): number {
  if (!readAttachment) return 0;
  const existing = attachmentReaderEpochs.get(readAttachment);
  if (existing !== undefined) return existing;
  const epoch = nextAttachmentReaderEpoch++;
  attachmentReaderEpochs.set(readAttachment, epoch);
  return epoch;
}