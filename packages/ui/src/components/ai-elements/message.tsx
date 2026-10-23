/*
 * Derived from vercel/ai-elements (packages/elements/src/message.tsx).
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * Modified by ZCode: local integration, formatting and adaptations.
 * See THIRD-PARTY-NOTICES.md in the repository root for license and provenance.
 *
 * 界面自研重写 v2（A2b）：本文件只剩导出点——消息流 v2 的实现已拆入 @/next-message/*：
 *   - messageShells.tsx           消息容器 / 操作区 / 分支切换 / 工具条
 *   - MessageResponse.tsx         流式桥接组件（归一化流水线接线 + 错误边界降级）
 *   - messageMarkdownParse.ts     解析侧（Streamdown 只做解析的收口）
 *   - messageMarkdownElements.tsx 渲染侧（自研元素渲染表）
 * 调用点、props 与 testid 不变（并置替换，可独立回滚）。
 */
"use client";

export {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageToolbar,
} from "@/next-message/messageShells.js";
export type {
  MessageActionProps,
  MessageActionsProps,
  MessageBranchContentProps,
  MessageBranchNextProps,
  MessageBranchPageProps,
  MessageBranchPreviousProps,
  MessageBranchProps,
  MessageBranchSelectorProps,
  MessageContentProps,
  MessageProps,
  MessageToolbarProps,
} from "@/next-message/messageShells.js";

export { MessageResponse, messageResponsePropsAreEqual } from "@/next-message/MessageResponse.js";
export type { MessageResponseProps } from "@/next-message/MessageResponse.js";

export {
  buildMessageFileLinkTarget,
  openMessageFileLinkInEditor,
} from "@/next-message/messageFileLinks.js";
export type { MessageFileLinkTarget } from "@/next-message/messageFileLinks.js";

export {
  buildMessageStreamdownRenderKey,
  resolveMessageStreamdownMode,
} from "@/next-message/messageMarkdownParse.js";