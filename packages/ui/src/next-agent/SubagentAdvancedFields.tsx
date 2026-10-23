/*
 * 界面自研重写 v2（A3）：子代理编辑表单——高级段（工具 / 系统提示词 / AGENTS.md）。
 * 折叠节头惯例：h-9 行 + 收起态工具模式摘要 + rotate-90 chevron；展开态才有可编辑字段。
 * 展开状态自带（本地），字段值与回调归 SubagentEditor（容器）。
 */
import { Check, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/lib/utils.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Switch } from "@/components/ui/switch.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { RISKY_TOOLS, TOOL_OPTIONS } from "@/next-agent/subagentState.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { FormFieldLabel } from "@/next-agent/SubagentBasicFields.js";

function ToolCheckbox({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-surface-hover",
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-sm border transition-colors",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input-border bg-input text-transparent",
          )}
        >
          <Check className="size-3.5" />
        </span>
      </span>
      <span className="min-w-0 flex-1 truncate text-ui-base font-medium text-foreground">
        {label}
      </span>
      {RISKY_TOOLS.has(label) ? (
        <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export function SubagentAdvancedFields({
  inheritAllTools,
  injectAgentsMd,
  onInjectAgentsMdChange,
  onSystemPromptChange,
  onToolsModeChange,
  onToggleTool,
  promptError,
  selectedTools,
  systemPrompt,
}: {
  inheritAllTools: boolean;
  injectAgentsMd: boolean;
  onInjectAgentsMdChange: (inject: boolean) => void;
  onSystemPromptChange: (prompt: string) => void;
  onToolsModeChange: (value: string) => void;
  onToggleTool: (tool: string) => void;
  promptError: string | null;
  selectedTools: string[];
  systemPrompt: string;
}) {
  const { intl } = useZCodeIntl();
  // 渐进披露：工具 / 系统提示词 / AGENTS.md 是低频调整项，默认折叠为摘要行。
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <button
        aria-expanded={advancedOpen}
        className="flex h-9 w-full cursor-pointer items-center gap-2 px-3 text-left text-ui-base font-medium text-foreground outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => setAdvancedOpen((value) => !value)}
        type="button"
      >
        {intl.formatMessage({ id: "settings.subagents.form.advanced" })}
        <span className="min-w-0 truncate text-ui-sm font-normal text-foreground-subtlest">
          {intl.formatMessage({
            id: inheritAllTools
              ? "settings.subagents.form.tools.mode.all"
              : "settings.subagents.form.tools.mode.custom",
          })}
        </span>
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "ml-auto size-3.5 shrink-0 text-foreground-subtlest transition-transform",
            advancedOpen && "rotate-90",
          )}
        />
      </button>
      {advancedOpen ? (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">
          <div className="space-y-2 pt-1">
            <FormFieldLabel>
              {intl.formatMessage({ id: "settings.subagents.form.tools.label" })}
            </FormFieldLabel>
            <div className="flex min-w-0 items-center gap-2">
              <Select
                value={inheritAllTools ? "all" : "custom"}
                onValueChange={onToolsModeChange}
              >
                <SelectTrigger size="lg" className="w-fit justify-between">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {intl.formatMessage({
                      id: "settings.subagents.form.tools.mode.all",
                    })}
                  </SelectItem>
                  <SelectItem value="custom">
                    {intl.formatMessage({
                      id: "settings.subagents.form.tools.mode.custom",
                    })}
                  </SelectItem>
                </SelectContent>
              </Select>
              <span className="min-w-0 text-ui-base font-normal text-foreground-subtle">
                {intl.formatMessage({
                  id: "settings.subagents.form.tools.card.title",
                })}
              </span>
            </div>
            {inheritAllTools ? null : (
              <div className="rounded-lg border border-border bg-card p-1">
                <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {TOOL_OPTIONS.map((tool) => (
                    <ToolCheckbox
                      key={tool}
                      checked={selectedTools.includes(tool)}
                      disabled={false}
                      label={tool}
                      onToggle={() => onToggleTool(tool)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <FormFieldLabel>
              {intl.formatMessage({
                id: "settings.subagents.form.systemPrompt.label",
              })}
            </FormFieldLabel>
            <SettingsFormTextarea
              value={systemPrompt}
              onChange={(event) => onSystemPromptChange(event.target.value)}
              rows={3}
              className="max-h-56 min-h-16 resize-y overflow-y-auto text-ui-base"
              placeholder={intl.formatMessage({
                id: "settings.subagents.form.systemPrompt.placeholder",
              })}
            />
            {promptError ? <p className="text-ui-base text-destructive">{promptError}</p> : null}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="min-w-0 text-ui-base font-medium text-foreground">
              {intl.formatMessage({
                id: "settings.subagents.form.injectAgentsMd.label",
              })}
            </p>
            <Switch
              checked={injectAgentsMd}
              onCheckedChange={onInjectAgentsMdChange}
              aria-label={intl.formatMessage({
                id: "settings.subagents.form.injectAgentsMd.label",
              })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}