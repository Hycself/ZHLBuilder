/*
 * 界面自研重写 v2（A3）：子代理编辑表单——容器（状态 / 校验 / 提交）。
 * 基础段在 SubagentBasicFields.tsx（作用域/名称/颜色/模型/描述），
 * 高级段在 SubagentAdvancedFields.tsx（工具/系统提示词/AGENTS.md，折叠）。
 * 校验规则、保存载荷与旧实现逐条一致。
 */
import type { AgentColor, AgentSummary, SubAgentConfig } from "@zhlbuilder/shared";
import { completeNewModelSelection } from "@zhlbuilder/provider";
import type { ModelSelectionView } from "@zhlbuilder/services";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button.js";
import { hasExplicitModelChanged } from "@/lib/startPlanRecommendation.js";
import { parseModelPickerValue } from "@/lib/zcodeSessionProjection.js";
import type { ModelSelectFooterAction, ModelSelectGroup } from "@/ModelConfigSelect.js";
import { useStartPlanRecommendation } from "@/hooks/useStartPlanRecommendation.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SubagentAdvancedFields } from "@/next-agent/SubagentAdvancedFields.js";
import { SubagentBasicFields } from "@/next-agent/SubagentBasicFields.js";
import {
  INHERIT_MODEL_VALUE,
  TOOL_OPTIONS,
  createSubagentFormInitialState,
  createSubagentFormInitialStateKey,
  isSubagentModelAvailable,
  isSubagentThoughtLevelAvailable,
  mergeTools,
  resolveSubagentModelLabel,
  resolveSubagentThoughtOptionState,
  toPersistedModel,
  toSubagentModelSelection,
} from "@/next-agent/subagentState.js";
import { SettingsFormActions } from "@/settings/SettingsFormActions.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";

export function SubagentForm({
  initial,
  modelSelectionView,
  modelSelectionLoading,
  modelSelectGroups,
  onManageModels,
  saving,
  onCancel,
  onDelete,
  onSave,
  scopeKey,
  workspaceTabs,
  onScopeKeyChange,
}: {
  initial?: AgentSummary;
  modelSelectionView?: ModelSelectionView | null;
  modelSelectionLoading: boolean;
  modelSelectGroups: readonly ModelSelectGroup[];
  onManageModels?: () => void;
  saving: boolean;
  onCancel: () => void;
  onDelete?: (agent: AgentSummary) => void;
  onSave: (config: SubAgentConfig) => Promise<void>;
  scopeKey: string;
  workspaceTabs: WorkspaceTabState[];
  onScopeKeyChange: (scopeKey: string) => void;
}) {
  const recommendStartPlan = useStartPlanRecommendation(modelSelectionView, "subagent");
  const { intl } = useZCodeIntl();
  const initialFormStateKey = createSubagentFormInitialStateKey(initial);
  const initialFormState = useMemo(
    () => createSubagentFormInitialState(initial),
    [initial, initialFormStateKey],
  );
  const previousInitialFormStateKeyRef = useRef(initialFormStateKey);
  const [name, setName] = useState(initialFormState.name);
  const [description, setDescription] = useState(initialFormState.description);
  const [color, setColor] = useState<AgentColor>(initialFormState.color);
  const [model, setModel] = useState(initialFormState.model);
  const [thoughtLevel, setThoughtLevel] = useState(initialFormState.thoughtLevel);
  const [injectAgentsMd, setInjectAgentsMd] = useState(initialFormState.injectAgentsMd);
  const [inheritAllTools, setInheritAllTools] = useState(initialFormState.inheritAllTools);
  const [selectedTools, setSelectedTools] = useState<string[]>(initialFormState.selectedTools);
  const [systemPrompt, setSystemPrompt] = useState(initialFormState.systemPrompt);
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const inheritModelLabel = intl.formatMessage({
    id: "settings.subagents.model.inherit",
  });
  const handleModelChange = useCallback(
    (nextModel: string) => {
      if (nextModel === model) {
        return;
      }
      setModel(nextModel);
      const identity = toPersistedModel(nextModel);
      const selected =
        identity && modelSelectionView
          ? completeNewModelSelection(modelSelectionView, parseModelPickerValue(identity))
          : undefined;
      setThoughtLevel(selected?.options?.reasoningLevel ?? "");
      setModelError(null);
    },
    [model, modelSelectionView],
  );
  const persistedModel = toPersistedModel(model);
  const modelAvailable = isSubagentModelAvailable(modelSelectGroups, model, modelSelectionLoading);
  // 候选已明确失效时仍展示原型号会误导用户；只改触发器文案，不清空草稿或补回候选。
  // 非 ready 阶段由可用性函数保留原意图，不能把读取失败当成模型被删除。
  const modelTriggerLabel = modelAvailable
    ? resolveSubagentModelLabel({
        inheritLabel: inheritModelLabel,
        modelGroups: modelSelectGroups,
        model,
      })
    : intl.formatMessage({ id: "settings.subagents.model.select" });
  const footerActions = useMemo<ModelSelectFooterAction[]>(
    () => [
      {
        key: "subagent-model:inherit",
        label: inheritModelLabel,
        onSelect: () => handleModelChange(INHERIT_MODEL_VALUE),
        selected: model === INHERIT_MODEL_VALUE,
      },
    ],
    [handleModelChange, inheritModelLabel, model],
  );
  const thoughtLevelState = resolveSubagentThoughtOptionState({
    model,
    modelAvailable,
    modelSelectionView,
    modelSelectionLoading,
    thoughtLevel,
  });
  const thoughtLevelInvalid = Boolean(
    persistedModel &&
    thoughtLevel &&
    modelAvailable &&
    !isSubagentThoughtLevelAvailable(thoughtLevelState, thoughtLevel),
  );
  const trimmedName = name.trim();
  const canSave = Boolean(
    trimmedName.length >= 3 &&
    trimmedName.length <= 50 &&
    /^[a-zA-Z0-9-]+$/u.test(trimmedName) &&
    description.trim() &&
    systemPrompt.trim() &&
    modelAvailable &&
    !thoughtLevelInvalid,
  );

  useEffect(() => {
    if (previousInitialFormStateKeyRef.current === initialFormStateKey) {
      return;
    }
    previousInitialFormStateKeyRef.current = initialFormStateKey;
    const nextInitialState = createSubagentFormInitialState(initial);

    // 保存/刷新后表单组件可能复用旧实例；必须按最新 agent 快照回灌字段，
    // 否则已写入 Markdown 的 model 会继续停留在本地 inherit 状态。
    setName(nextInitialState.name);
    setDescription(nextInitialState.description);
    setColor(nextInitialState.color);
    setModel(nextInitialState.model);
    setThoughtLevel(nextInitialState.thoughtLevel);
    setInjectAgentsMd(nextInitialState.injectAgentsMd);
    setInheritAllTools(nextInitialState.inheritAllTools);
    setSelectedTools(nextInitialState.selectedTools);
    setSystemPrompt(nextInitialState.systemPrompt);
    setNameError(null);
    setDescriptionError(null);
    setPromptError(null);
    setModelError(null);
  }, [initial, initialFormStateKey]);

  const validate = (): boolean => {
    const trimmedName = name.trim();
    let valid = true;
    if (trimmedName.length < 3 || trimmedName.length > 50) {
      setNameError(
        intl.formatMessage(
          { id: "settings.subagents.form.validation.nameLength" },
          { min: "3", max: "50" },
        ),
      );
      valid = false;
    } else if (!/^[a-zA-Z0-9-]+$/u.test(trimmedName)) {
      setNameError(
        intl.formatMessage({
          id: "settings.subagents.form.validation.nameCharacters",
        }),
      );
      valid = false;
    } else {
      setNameError(null);
    }
    if (!description.trim()) {
      setDescriptionError(
        intl.formatMessage({
          id: "settings.subagents.form.validation.descriptionRequired",
        }),
      );
      valid = false;
    } else {
      setDescriptionError(null);
    }
    if (!systemPrompt.trim()) {
      setPromptError(
        intl.formatMessage({
          id: "settings.subagents.form.validation.promptRequired",
        }),
      );
      valid = false;
    } else {
      setPromptError(null);
    }
    // 不可用模型会展示为“选择模型”，保存时也必须阻止历史值被静默写回。
    if (!isSubagentModelAvailable(modelSelectGroups, model, modelSelectionLoading)) {
      setModelError(
        intl.formatMessage({
          id: "settings.subagents.form.validation.modelUnavailable",
        }),
      );
      valid = false;
    } else {
      setModelError(null);
    }
    if (thoughtLevelInvalid) {
      valid = false;
    }
    return valid;
  };

  const toggleTool = (tool: string) => {
    setInheritAllTools(false);
    setSelectedTools((current) =>
      current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool],
    );
  };

  const handleToolsModeChange = (value: string) => {
    const nextInheritAllTools = value === "all";
    setInheritAllTools(nextInheritAllTools);
    if (!nextInheritAllTools && selectedTools.length === 0) {
      setSelectedTools([...TOOL_OPTIONS]);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }
    let selection = toSubagentModelSelection(persistedModel, thoughtLevel);
    if (hasExplicitModelChanged(initial?.modelSelection, selection)) {
      const chosen = await recommendStartPlan(selection);
      if (!chosen) return;
      selection = chosen;
    }
    await onSave({
      name: name.trim(),
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
      color,
      injectAgentsMd,
      ...(selection ? { modelSelection: selection } : {}),
      tools: inheritAllTools
        ? undefined
        : mergeTools(selectedTools, initialFormState.preservedTools),
      disallowedTools: initial?.disallowedTools,
      skills: initial?.skills,
      permissionMode: initial?.permissionMode,
      ...(initial?.maxTurns ? { maxTurns: initial.maxTurns } : {}),
      ...(initial?.background !== undefined ? { background: initial.background } : {}),
      mcpServers: initial?.mcpServers,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border p-4">
      <SubagentBasicFields
        color={color}
        description={description}
        descriptionError={descriptionError}
        footerActions={footerActions}
        model={model}
        modelError={modelError}
        modelSelectGroups={modelSelectGroups}
        modelTriggerLabel={modelTriggerLabel}
        name={name}
        nameError={nameError}
        onColorChange={setColor}
        onDescriptionChange={setDescription}
        onManageModels={onManageModels}
        onModelChange={handleModelChange}
        onNameChange={setName}
        onScopeKeyChange={onScopeKeyChange}
        onThoughtLevelCommit={setThoughtLevel}
        saving={saving}
        scopeKey={scopeKey}
        scopeLocked={Boolean(initial)}
        thoughtLevelInvalid={thoughtLevelInvalid}
        thoughtLevelState={thoughtLevelState}
        workspaceTabs={workspaceTabs}
      />

      <SubagentAdvancedFields
        inheritAllTools={inheritAllTools}
        injectAgentsMd={injectAgentsMd}
        onInjectAgentsMdChange={setInjectAgentsMd}
        onSystemPromptChange={setSystemPrompt}
        onToolsModeChange={handleToolsModeChange}
        onToggleTool={toggleTool}
        promptError={promptError}
        selectedTools={selectedTools}
        systemPrompt={systemPrompt}
      />

      <SettingsFormActions
        leadingAction={
          initial && onDelete ? (
            <Button
              type="button"
              variant="link"
              size="lg"
              className="px-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(initial)}
              disabled={saving}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {intl.formatMessage({ id: "common.delete" })}
            </Button>
          ) : undefined
        }
      >
        <Button type="submit" variant="default" size="lg" disabled={!canSave || saving}>
          {saving
            ? intl.formatMessage({ id: "common.saving" })
            : intl.formatMessage({ id: "common.save" })}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={saving}>
          {intl.formatMessage({ id: "common.cancel" })}
        </Button>
      </SettingsFormActions>
    </form>
  );
}