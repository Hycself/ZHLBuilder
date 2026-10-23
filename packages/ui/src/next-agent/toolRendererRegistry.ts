// ============================================================
// 工具卡渲染注册表（自研重写 v2 · A1）：tool identity → 具体 renderer
// ============================================================
// 集中管理的意义：新增工具 = 加一行；顺序即优先级。分三层——
//   1. **结构直判**：changesGroup / executeGroup / cuaGroup 这类「一批工具一组卡」
//      先认领自己（不需要解析 identity）。
//   2. **按名先摘**：可复用工作流 / 观察类工作流 / 模型目录 / 升级问答这些工具今天不在
//      shared 的已知工具表里（identity 回 unknown），若不先按名认领会掉进 raw JSON 兜底；
//      而一旦将来被登记进 `workflow` family，family 兜底又会把它们画成 CreateWorkflow 卡。
//      按名先判定让「登记前 / 登记后」两种世界都成立。
//   3. **identity 分流**：node-repl（MCP 注册但要有专用交互）→ MCP 通用 → family 兜底
//      （family 内再按工具名细分：message / task-control / workflow）。
// 顺序不与任何一条互换：每一条的 `note` 都写着它为什么在这个位置。
//
// 本文件只做纯分流：不含 JSX、不碰 context 装配；`resolveRenderer.ts` 只剩导出点。
import type { ReactNode } from "react";
import { EditToolCallBlock } from "@/ToolCallBlocks/renderers/edit.js";
import { AgentToolCallBlock } from "@/ToolCallBlocks/renderers/agent.js";
import { ChangesGroupToolCallBlock } from "@/ToolCallBlocks/renderers/changes-group.js";
import { CreateWorkflowToolCallBlock } from "@/ToolCallBlocks/renderers/create-workflow.js";
import { EscalateToolCallBlock } from "@/ToolCallBlocks/renderers/escalate.js";
import { EvalWorkflowSnippetToolCallBlock } from "@/ToolCallBlocks/renderers/eval-workflow-snippet.js";
import { ExploreToolCallBlock } from "@/ToolCallBlocks/renderers/explore.js";
import { ExecuteToolCallBlock } from "@/ToolCallBlocks/renderers/execute.js";
import { ExecuteGroupToolCallBlock } from "@/ToolCallBlocks/renderers/execute-group.js";
import { FallbackToolCallBlock } from "@/ToolCallBlocks/renderers/fallback.js";
import { GetWorkflowRunToolCallBlock } from "@/ToolCallBlocks/renderers/get-workflow-run.js";
import { ListModelsToolCallBlock } from "@/ToolCallBlocks/renderers/list-models.js";
import { ListSavedWorkflowsToolCallBlock } from "@/ToolCallBlocks/renderers/list-saved-workflows.js";
import { ListWorkflowRunsToolCallBlock } from "@/ToolCallBlocks/renderers/list-workflow-runs.js";
import { ResumeWorkflowRunToolCallBlock } from "@/ToolCallBlocks/renderers/resume-workflow-run.js";
import { ResolveWorkflowQuestionToolCallBlock } from "@/ToolCallBlocks/renderers/resolve-workflow-question.js";
import { SaveWorkflowToolCallBlock } from "@/ToolCallBlocks/renderers/save-workflow.js";
import {
  isEscalateToolCall,
  isEvalWorkflowSnippetToolCall,
  isGetWorkflowRunToolCall,
  isListModelsToolCall,
  isListSavedWorkflowsToolCall,
  isListWorkflowRunsToolCall,
  isResolveWorkflowQuestionToolCall,
  isResumeWorkflowRunToolCall,
  isSaveWorkflowToolCall,
} from "@/lib/workflowToolNames.js";
import { CuaToolCallBlock, isCuaToolCall } from "@/ToolCallBlocks/renderers/cua.js";
import { CuaGroupToolCallBlock } from "@/ToolCallBlocks/renderers/cua-group.js";
import { GoalToolCallBlock } from "@/ToolCallBlocks/renderers/goal.js";
import { NodeReplToolCallBlock } from "@/ToolCallBlocks/renderers/node-repl.js";
import { McpToolCallBlock, readMcpToolPresentation } from "@/ToolCallBlocks/renderers/mcp.js";
import { PlanGuidanceToolCallBlock } from "@/ToolCallBlocks/renderers/plan-guidance.js";
import { ReadToolCallBlock } from "@/ToolCallBlocks/renderers/read.js";
import { ReadSessionContextToolCallBlock } from "@/ToolCallBlocks/renderers/read-session-context.js";
import { RespondToCoordinatorToolCallBlock } from "@/ToolCallBlocks/renderers/respond-to-coordinator.js";
import { SearchToolCallBlock } from "@/ToolCallBlocks/renderers/search.js";
import { SendMessageToolCallBlock } from "@/ToolCallBlocks/renderers/send-message.js";
import { SkillToolCallBlock } from "@/ToolCallBlocks/renderers/skill.js";
import { SubmitResultToolCallBlock } from "@/ToolCallBlocks/renderers/submit-result.js";
import { SwitchModeToolCallBlock } from "@/ToolCallBlocks/renderers/switch-mode.js";
import { TaskOutputToolCallBlock } from "@/ToolCallBlocks/renderers/task-output.js";
import { TaskStopToolCallBlock } from "@/ToolCallBlocks/renderers/task-stop.js";
import { TodoToolCallBlock } from "@/ToolCallBlocks/renderers/todo.js";
import { AskQuestionToolCallBlock } from "@/ToolCallBlocks/renderers/ask-question.js";
import { resolveToolCallIdentity, type ToolCallIdentity } from "@/lib/toolIdentity.js";
import type { ToolCallBlockRenderContext } from "@/ToolCallBlocks/shared.js";

/** 一个工具卡的 renderer：吃渲染上下文，交出一段 JSX。 */
export type ToolCallRenderer = (context: ToolCallBlockRenderContext) => ReactNode;

export interface ToolRendererEntry {
  /** 认领条件。`identityOf` 懒取：不调它的条目不触发 identity 解析。 */
  when: (context: ToolCallBlockRenderContext, identityOf: () => ToolCallIdentity) => boolean;
  renderer: ToolCallRenderer;
  /** 为什么在这一行、为什么排这个位置（给下一位改表的人）。 */
  note: string;
}

const kindIs =
  (kind: string) =>
  (context: ToolCallBlockRenderContext): boolean =>
    context.toolCallNode.toolCall.kind === kind;

const namedBy = (claim: (toolCall: ToolCallBlockRenderContext["toolCallNode"]["toolCall"]) => boolean) =>
  (context: ToolCallBlockRenderContext): boolean => claim(context.toolCallNode.toolCall);

const familyIs =
  (family: string) =>
  (_context: ToolCallBlockRenderContext, identityOf: () => ToolCallIdentity): boolean =>
    identityOf().family === family;

const toolNameIs =
  (toolName: string) =>
  (context: ToolCallBlockRenderContext, identityOf: () => ToolCallIdentity): boolean =>
    identityOf().toolName === toolName;

export const TOOL_RENDERER_REGISTRY: readonly ToolRendererEntry[] = [
  // ── 1. 结构直判（一批工具一组卡）──
  { note: "改动的成组卡", renderer: ChangesGroupToolCallBlock, when: kindIs("changesGroup") },
  { note: "命令执行的成组卡", renderer: ExecuteGroupToolCallBlock, when: kindIs("executeGroup") },
  { note: "电脑控制的成组卡", renderer: CuaGroupToolCallBlock, when: kindIs("cuaGroup") },
  { note: "电脑控制单步", renderer: CuaToolCallBlock, when: (context) => isCuaToolCall(context.toolCallNode.toolCall) },
  // ── 2. 按名先摘（认领不在已知工具表里、或被 family 兜底画错的名字）──
  { note: "可复用工作流：保存", renderer: SaveWorkflowToolCallBlock, when: namedBy(isSaveWorkflowToolCall) },
  { note: "可复用工作流：列表", renderer: ListSavedWorkflowsToolCallBlock, when: namedBy(isListSavedWorkflowsToolCall) },
  { note: "观察类工作流：看一次运行", renderer: GetWorkflowRunToolCallBlock, when: namedBy(isGetWorkflowRunToolCall) },
  { note: "观察类工作流：列运行", renderer: ListWorkflowRunsToolCallBlock, when: namedBy(isListWorkflowRunsToolCall) },
  { note: "观察类工作流：片段求值", renderer: EvalWorkflowSnippetToolCallBlock, when: namedBy(isEvalWorkflowSnippetToolCall) },
  { note: "观察类工作流：恢复运行", renderer: ResumeWorkflowRunToolCallBlock, when: namedBy(isResumeWorkflowRunToolCall) },
  { note: "模型目录（providerId 开头的 <models> 文本不能原样摊进聊天区）", renderer: ListModelsToolCallBlock, when: namedBy(isListModelsToolCall) },
  { note: "升级问答：子代理提问", renderer: EscalateToolCallBlock, when: namedBy(isEscalateToolCall) },
  { note: "升级问答：主代理作答", renderer: ResolveWorkflowQuestionToolCallBlock, when: namedBy(isResolveWorkflowQuestionToolCall) },
  // ── 3. identity 分流 ──
  {
    note: "宿主 Node REPL 也走 MCP 注册：先按可信 identity 保留专用卡，再让通用 MCP 兜",
    renderer: NodeReplToolCallBlock,
    when: (_, identityOf) => identityOf().family === "node-repl",
  },
  {
    note: "通用 MCP presentation",
    renderer: McpToolCallBlock,
    when: (context) => readMcpToolPresentation(context) !== null,
  },
  { note: "计划引导", renderer: PlanGuidanceToolCallBlock, when: familyIs("plan-guidance") },
  { note: "子代理", renderer: AgentToolCallBlock, when: familyIs("agent") },
  { note: "待办", renderer: TodoToolCallBlock, when: familyIs("todo") },
  { note: "用户提问", renderer: AskQuestionToolCallBlock, when: familyIs("ask-user-question") },
  {
    note: "message family 内按名分派：作答对象不同，卡面不同",
    renderer: SendMessageToolCallBlock,
    when: (context, identityOf) =>
      identityOf().family === "message" && identityOf().toolName !== "RespondToCoordinator",
  },
  {
    note: "message family 内按名分派：RespondToCoordinator",
    renderer: RespondToCoordinatorToolCallBlock,
    when: (_, identityOf) =>
      identityOf().family === "message" && identityOf().toolName === "RespondToCoordinator",
  },
  {
    note: "task-control family 内按名分派：TaskOutput",
    renderer: TaskOutputToolCallBlock,
    when: (_, identityOf) =>
      identityOf().family === "task-control" && identityOf().toolName === "TaskOutput",
  },
  {
    note: "task-control family 内按名分派：TaskStop",
    renderer: TaskStopToolCallBlock,
    when: (_, identityOf) =>
      identityOf().family === "task-control" && identityOf().toolName !== "TaskOutput",
  },
  { note: "技能", renderer: SkillToolCallBlock, when: familyIs("skill") },
  {
    note: "workflow family 内按名分派：submit_result 是 actor 提交的结果，与图/脚本卡面不同",
    renderer: SubmitResultToolCallBlock,
    when: toolNameIs("submit_result"),
  },
  { note: "workflow family 兜底：图/脚本", renderer: CreateWorkflowToolCallBlock, when: familyIs("workflow") },
  { note: "会话上下文", renderer: ReadSessionContextToolCallBlock, when: familyIs("session-context") },
  { note: "读文件", renderer: ReadToolCallBlock, when: familyIs("file-read") },
  { note: "写文件", renderer: EditToolCallBlock, when: familyIs("file-write") },
  { note: "探索", renderer: ExploreToolCallBlock, when: familyIs("explore") },
  { note: "模式切换", renderer: SwitchModeToolCallBlock, when: familyIs("switch-mode") },
  { note: "搜索", renderer: SearchToolCallBlock, when: familyIs("search") },
  { note: "命令执行", renderer: ExecuteToolCallBlock, when: familyIs("shell") },
  { note: "目标", renderer: GoalToolCallBlock, when: familyIs("goal") },
];

/**
 * 按注册表顺序认领 renderer；identity 懒解析（前四类结构直判与首个按名条目之后才用到），
 * 谁都不认领时交给 raw JSON 兜底卡。
 */
export function resolveToolCallRenderer(context: ToolCallBlockRenderContext): ToolCallRenderer {
  let identity: ToolCallIdentity | undefined;
  const identityOf = () => (identity ??= resolveToolCallIdentity(context.toolCallNode.toolCall));
  for (const entry of TOOL_RENDERER_REGISTRY) {
    if (entry.when(context, identityOf)) return entry.renderer;
  }
  return FallbackToolCallBlock;
}