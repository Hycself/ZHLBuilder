/*
 * 界面自研重写 v2（A3）：子代理管理面的纯函数与常量。
 * 模型值编解码 / 思考档状态 / 工具集处理 / 表单初始态 / 作用域分组——
 * 由设置区（settings/SubagentsSection.tsx）、名册行（SubagentRoster）
 * 与编辑表单（SubagentEditor）共用；本身不依赖 React 与服务。
 */
import type {
  AgentColor,
  AgentSummary,
  AgentsListResult,
  BuiltInSubagentName,
  ModelSelection,
} from "@zhlbuilder/shared";
import type { ModelSelectionView } from "@zhlbuilder/services";
import type { ModelSelectGroup } from "@/ModelConfigSelect.js";
import { resolveModelDisplayName } from "@/lib/modelSelectionGroups.js";
import { resolveModelThoughtOption } from "@/lib/modelThoughtOption.js";
import { SUBAGENT_COLORS, SUBAGENT_COLOR_CLASS } from "@/lib/subagentColors.js";
import { parseModelPickerValue } from "@/lib/zcodeSessionProjection.js";
import { encodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";
import type { SubagentReasoningFieldState } from "@/settings/SubagentReasoningField.js";

export const AGENT_COLORS: AgentColor[] = [...SUBAGENT_COLORS];
export const COLOR_DOT_CLASS: Record<AgentColor, string> = SUBAGENT_COLOR_CLASS;
export const MODEL_ITEM_NEVER_LOCKED = () => false;
export const INHERIT_MODEL_VALUE = "inherit";
export const TOOL_OPTIONS = [
  "Read",
  "Grep",
  "Glob",
  "Bash",
  "Edit",
  "Write",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
] as const;
export const TOOL_OPTION_SET = new Set<string>(TOOL_OPTIONS);
export const RISKY_TOOLS = new Set<string>(["Bash", "Edit", "Write"]);

export interface AgentGroups {
  builtIn: AgentSummary[];
  plugin: AgentSummary[];
  user: AgentSummary[];
}

export interface SubagentFormInitialState {
  name: string;
  description: string;
  color: AgentColor;
  model: string;
  thoughtLevel?: string;
  injectAgentsMd: boolean;
  inheritAllTools: boolean;
  selectedTools: string[];
  preservedTools: string[];
  systemPrompt: string;
}

export function projectSettingsSubagents(result: AgentsListResult): AgentSummary[] {
  // result.agents 是运行时调用投影，插件 agent 可能同时有规范名称与裸名称别名；
  // 设置页按已安装资源展示，插件部分必须改用一文件一条的 pluginAgents 投影。
  return [...result.agents.filter((agent) => agent.source !== "plugin"), ...result.pluginAgents];
}

export function isEditableUserAgent(agent: AgentSummary): boolean {
  return (
    (agent.scope === "user" || agent.scope === "workspace") &&
    agent.source === "user" &&
    agent.readOnly !== true
  );
}

// runtime 只对 user scope 应用 disabledAgentIds（CLI 侧 isDisabledUserProfile 对
// source !== "user" 直接返回 false，workspace profile 的 source 是 "project"），服务端
// attachEnabledState 也据此对非 user scope 恒返回 enabled: true。因此 workspace agent 不能
// 展示启用开关——点了会静默回弹，还会往 user 级 agents-state.json 写入永不生效的记录。
export function supportsEnabledToggle(agent: AgentSummary): boolean {
  return isEditableUserAgent(agent) && agent.scope === "user";
}

export function isBuiltInAgent(agent: AgentSummary): boolean {
  return agent.scope === "built-in" || agent.source === "built-in";
}

/**
 * 内置 general-purpose / Explore 与插件 agent 都是只读 profile，配置入口统一为行内
 * model / effort 覆盖控件；插件 md 属于插件安装目录，升级会覆写，所以不能像 user agent 那样改文件。
 */
export function supportsModelOverride(agent: AgentSummary): boolean {
  return getBuiltInSubagentName(agent) !== null || agent.source === "plugin";
}

export function getBuiltInSubagentName(agent: AgentSummary): BuiltInSubagentName | null {
  if (!isBuiltInAgent(agent)) {
    return null;
  }
  return agent.name === "general-purpose" || agent.name === "Explore" ? agent.name : null;
}

export function getKnownTools(values: readonly string[] | undefined): string[] {
  return values?.filter((tool) => TOOL_OPTION_SET.has(tool)) ?? [];
}

export function getPreservedTools(values: readonly string[] | undefined): string[] {
  return values?.filter((tool) => !TOOL_OPTION_SET.has(tool)) ?? [];
}

export function mergeTools(
  selectedTools: readonly string[],
  preservedTools: readonly string[],
): string[] | undefined {
  const result = [...selectedTools, ...preservedTools].filter(
    (tool, index, tools) => tool.length > 0 && tools.indexOf(tool) === index,
  );
  return result.length > 0 ? result : undefined;
}

export function allowsAllTools(tools: readonly string[] | undefined): boolean {
  // 通配符 * 表示全部工具，不能按数组长度显示成 1 个工具。
  return !tools || tools.length === 0 || tools.some((tool) => tool.trim() === "*");
}

export function toPersistedModel(model: string): string | undefined {
  const trimmedModel = model.trim();
  return trimmedModel && trimmedModel !== INHERIT_MODEL_VALUE ? trimmedModel : undefined;
}

export function toSubagentModelValue(selection: ModelSelection | undefined): string {
  return selection
    ? encodeCustomModelValue(selection.providerId, selection.modelId)
    : INHERIT_MODEL_VALUE;
}

export function toSubagentModelSelection(
  model: string | undefined,
  thoughtLevel?: string,
): ModelSelection | undefined {
  const persistedModel = model ? toPersistedModel(model) : undefined;
  if (!persistedModel) return undefined;
  const selection = parseModelPickerValue(persistedModel);
  const reasoningLevel = thoughtLevel?.trim();
  return {
    providerId: selection.providerId,
    modelId: selection.modelId,
    ...(reasoningLevel ? { options: { reasoningLevel } } : {}),
  };
}

export type SubagentThoughtOptionState = SubagentReasoningFieldState;

export function resolveSubagentThoughtOptionState(params: {
  model: string;
  modelAvailable: boolean;
  modelSelectionView?: ModelSelectionView | null;
  modelSelectionLoading: boolean;
  thoughtLevel?: string;
}): SubagentThoughtOptionState {
  const persistedModel = toPersistedModel(params.model);
  if (!persistedModel || !params.modelAvailable) {
    return { kind: "not-applicable" };
  }
  const modelSelection = parseModelPickerValue(persistedModel);
  const explicitThoughtLevel = params.thoughtLevel?.trim();

  // Settings 只管理 Local Environment，模型能力与候选统一来自 Local Host View。
  // Workspace presentation 的 configOptions 不是第二份模型目录，也不参与 reasoning 判断。
  const metadataOption = params.modelSelectionView
    ? resolveModelThoughtOption({
        modelSelectionView: params.modelSelectionView,
        providerId: modelSelection.providerId,
        modelId: modelSelection.modelId,
        currentValue: explicitThoughtLevel,
      })
    : null;
  if (metadataOption) {
    return {
      kind: "supported",
      option: metadataOption,
    };
  }
  if (params.modelSelectionLoading) {
    return { kind: "unknown", status: "loading" };
  }
  return { kind: "unsupported" };
}

export function isSubagentThoughtLevelAvailable(
  state: SubagentThoughtOptionState,
  thoughtLevel: string | undefined,
): boolean {
  const normalizedThoughtLevel = thoughtLevel?.trim();
  if (!normalizedThoughtLevel) {
    return true;
  }
  if (state.kind === "unknown" || state.kind === "not-applicable") {
    return true;
  }
  if (state.kind === "unsupported") {
    return false;
  }
  return Boolean(
    state.option.type === "select" &&
    state.option.options?.some((entry) => entry.value === normalizedThoughtLevel),
  );
}

export function resolvedSubagentThoughtLevel(
  state: SubagentThoughtOptionState,
): string | undefined {
  return state.kind === "supported" && typeof state.option.currentValue === "string"
    ? state.option.currentValue
    : undefined;
}

export function isSubagentModelAvailable(
  modelGroups: readonly ModelSelectGroup[],
  model: string | undefined,
  modelSelectionLoading = false,
): boolean {
  const trimmedModel = model?.trim();
  if (!trimmedModel || trimmedModel === INHERIT_MODEL_VALUE) {
    return true;
  }
  if (modelSelectionLoading) {
    return true;
  }
  return modelGroups.some((group) => group.items.some((item) => item.value === trimmedModel));
}

export function createSubagentFormInitialState(
  initial?: Pick<
    AgentSummary,
    | "name"
    | "description"
    | "color"
    | "modelSelection"
    | "tools"
    | "systemPrompt"
    | "injectAgentsMd"
  >,
): SubagentFormInitialState {
  return {
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    color: initial?.color ?? "yellow",
    model: toSubagentModelValue(initial?.modelSelection),
    thoughtLevel: initial?.modelSelection?.options?.reasoningLevel,
    injectAgentsMd: initial?.injectAgentsMd ?? true,
    inheritAllTools: initial?.tools === undefined || initial.tools.length === 0,
    selectedTools: getKnownTools(initial?.tools),
    preservedTools: getPreservedTools(initial?.tools),
    systemPrompt: initial?.systemPrompt ?? "",
  };
}

export function createSubagentFormInitialStateKey(initial?: AgentSummary): string {
  return JSON.stringify({
    id: initial?.id ?? null,
    ...createSubagentFormInitialState(initial),
  });
}

export function resolveSubagentModelLabel(params: {
  inheritLabel: string;
  modelGroups: readonly ModelSelectGroup[];
  model: string | undefined;
}): string {
  const trimmedModel = params.model?.trim();
  if (!trimmedModel || trimmedModel === INHERIT_MODEL_VALUE) {
    return params.inheritLabel;
  }
  // Registry 只包含当前可选模型，但历史 Subagent 配置仍需展示原模型身份，
  // 方便用户理解并修复失效配置。候选列表与保存校验继续以 Registry 为准。
  return resolveModelDisplayName(params.modelGroups, trimmedModel) ?? trimmedModel;
}

export function groupAgentsByScope(agents: readonly AgentSummary[]): AgentGroups {
  const groups: AgentGroups = { builtIn: [], plugin: [], user: [] };
  for (const agent of agents) {
    if (isEditableUserAgent(agent)) {
      groups.user.push(agent);
    } else if (agent.source === "plugin") {
      groups.plugin.push(agent);
    } else {
      groups.builtIn.push(agent);
    }
  }
  return groups;
}

/** 按完整插件 ID 分组，避免同名 marketplace 的子智能体互相合并。 */
export function groupPluginAgentsById(
  agents: readonly AgentSummary[],
): Array<[string, AgentSummary[]]> {
  const groups = new Map<string, AgentSummary[]>();
  for (const agent of agents) {
    const key =
      agent.pluginId?.trim() || agent.pluginName?.trim() || agent.name.split(":", 1)[0] || "Plugin";
    groups.set(key, [...(groups.get(key) ?? []), agent]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}