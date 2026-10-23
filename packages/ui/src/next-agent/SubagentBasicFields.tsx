/*
 * 界面自研重写 v2（A3）：子代理编辑表单——基础段（只读展示件）。
 * 作用域 / 名称 / 颜色 / 模型与推理档 / 描述；控制与校验归 SubagentEditor（容器）。
 */
import type { AgentColor } from "@zhlbuilder/shared";
import { cn } from "@/components/lib/utils.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  AGENT_COLORS,
  COLOR_DOT_CLASS,
  MODEL_ITEM_NEVER_LOCKED,
  type SubagentThoughtOptionState,
} from "@/next-agent/subagentState.js";
import {
  ModelConfigSelect,
  type ModelSelectFooterAction,
  type ModelSelectGroup,
} from "@/ModelConfigSelect.js";
import { PluginScopeMenu } from "@/settings/PluginScopeMenu.js";
import { SubagentReasoningField } from "@/settings/SubagentReasoningField.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";

export function FormFieldLabel({ children }: { children: string }) {
  return (
    <label className="mb-1.5 block text-ui-base font-medium text-foreground-subtle">
      {children}
    </label>
  );
}

export function SubagentBasicFields({
  color,
  description,
  descriptionError,
  footerActions,
  model,
  modelError,
  modelSelectGroups,
  modelTriggerLabel,
  name,
  nameError,
  onColorChange,
  onDescriptionChange,
  onManageModels,
  onModelChange,
  onNameChange,
  onScopeKeyChange,
  onThoughtLevelCommit,
  saving,
  scopeKey,
  scopeLocked,
  thoughtLevelInvalid,
  thoughtLevelState,
  workspaceTabs,
}: {
  color: AgentColor;
  description: string;
  descriptionError: string | null;
  footerActions: ModelSelectFooterAction[];
  model: string;
  modelError: string | null;
  modelSelectGroups: readonly ModelSelectGroup[];
  modelTriggerLabel: string;
  name: string;
  nameError: string | null;
  onColorChange: (color: AgentColor) => void;
  onDescriptionChange: (description: string) => void;
  onManageModels?: () => void;
  onModelChange: (model: string) => void;
  onNameChange: (name: string) => void;
  onScopeKeyChange: (scopeKey: string) => void;
  onThoughtLevelCommit: (thoughtLevel: string) => void;
  saving: boolean;
  scopeKey: string;
  /** 编辑既有 agent 时作用域不可改（与旧实现一致）。 */
  scopeLocked: boolean;
  thoughtLevelInvalid: boolean;
  thoughtLevelState: SubagentThoughtOptionState;
  workspaceTabs: WorkspaceTabState[];
}) {
  const { intl } = useZCodeIntl();
  const selectedColorIndex = Math.max(0, AGENT_COLORS.indexOf(color));

  return (
    <>
      <div className="flex justify-end">
        <label className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <span className="shrink-0 text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: "settings.scope.label" })}
          </span>
          <PluginScopeMenu
            align="end"
            disabled={scopeLocked}
            selectedScopeKey={scopeKey}
            workspaceTabs={workspaceTabs}
            onScopeKeyChange={onScopeKeyChange}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(12rem,14rem)_auto_minmax(0,1fr)] md:items-start">
        <div className="space-y-1.5">
          <FormFieldLabel>
            {intl.formatMessage({ id: "settings.subagents.form.name.label" })}
          </FormFieldLabel>
          <Input
            type="text"
            size="lg"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={intl.formatMessage({
              id: "settings.subagents.form.name.placeholder",
            })}
          />
          {nameError ? <p className="text-ui-base text-destructive">{nameError}</p> : null}
        </div>
        <div className="space-y-1.5">
          <FormFieldLabel>
            {intl.formatMessage({ id: "settings.subagents.form.color.label" })}
          </FormFieldLabel>
          <div
            role="radiogroup"
            className="relative inline-grid w-56 grid-cols-8 rounded-lg border border-input-border bg-input p-1"
          >
            <span
              className="pointer-events-none absolute top-1 size-6 rounded-full border border-border-hover bg-surface shadow-xs transition-[left]"
              style={{
                left: `calc(0.25rem + ((100% - 0.5rem) / ${AGENT_COLORS.length}) * ${selectedColorIndex})`,
              }}
              aria-hidden="true"
            />
            {AGENT_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={color === option}
                aria-label={intl.formatMessage({
                  id: `settings.subagents.color.${option}`,
                })}
                className="relative z-10 flex size-6 items-center justify-center rounded-full outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onColorChange(option)}
              >
                <span className={cn("size-3.5 rounded-full", COLOR_DOT_CLASS[option])} />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <FormFieldLabel>
            {intl.formatMessage({ id: "settings.subagents.form.model.label" })}
          </FormFieldLabel>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ModelConfigSelect
              modelGroups={modelSelectGroups}
              normalizedValue={model}
              triggerLabel={modelTriggerLabel}
              showManageModelsAction={Boolean(onManageModels)}
              lockReasonMessage=""
              isItemLocked={MODEL_ITEM_NEVER_LOCKED}
              onValueChange={onModelChange}
              footerActions={footerActions}
              manageModelsLabel={intl.formatMessage({
                id: "chat.toolbar.model.manageModels",
              })}
              onManageModels={onManageModels}
              // 聊天工具栏的模型菜单默认向上弹；Subagents add/edit 表单位于设置页正文，
              // 菜单项应贴着按钮下方展开，避免覆盖上面的表单字段。
              contentSide="bottom"
              focusSelectorOnClose={null}
              labelVisibilityClassName="inline-flex min-w-0"
              triggerClassName="h-8 w-fit max-w-full min-w-0 justify-between rounded-lg border border-input-border bg-input bg-clip-border px-3 py-1.5 text-foreground hover:border-input-border-hover hover:bg-input focus-visible:border-input-border-focused focus-visible:bg-input-focused"
              triggerLabelClassName="inline-flex min-w-0 truncate text-left"
            />
            <SubagentReasoningField
              intl={intl}
              state={thoughtLevelState}
              disabled={saving}
              labelVisibilityClassName="inline-flex min-w-0"
              onValueCommit={onThoughtLevelCommit}
            />
          </div>
          {modelError ? <p className="text-ui-base text-destructive">{modelError}</p> : null}
          {thoughtLevelInvalid ? (
            <p className="text-ui-base text-destructive">
              {intl.formatMessage({
                id: "settings.subagents.form.validation.thoughtLevelUnavailable",
              })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <FormFieldLabel>
          {intl.formatMessage({
            id: "settings.subagents.form.description.label",
          })}
        </FormFieldLabel>
        <Input
          type="text"
          size="lg"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder={intl.formatMessage({
            id: "settings.subagents.form.description.placeholder",
          })}
        />
        {descriptionError ? (
          <p className="text-ui-base text-destructive">{descriptionError}</p>
        ) : null}
      </div>
    </>
  );
}