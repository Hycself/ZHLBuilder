/* eslint-disable max-lines -- 子智能体管理页集中维护作用域列表、表单和启用状态，避免状态分散 */
//
// 界面自研重写 v2（A3）：本文件收敛为「服务接线 + 列表编排」——
// 名册行在 next-agent/SubagentRoster.tsx，编辑表单（基础/高级分区）在
// next-agent/SubagentEditor.tsx，共用纯函数在 next-agent/subagentState.ts。
// 行为、testid 与旧实现逐条一致。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  ZCODE_AGENT_PROVIDER,
  type AgentsCapability,
  type AgentSummary,
  type SubAgentConfig,
} from "@zhlbuilder/shared";
import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useModelSelectionServiceView } from "@/hooks/useModelSelectionView.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { buildRegistryModelSelectGroups } from "@/lib/modelSelectionGroups.js";
import { logger } from "@/logger.js";
import { AgentListRow } from "@/next-agent/SubagentRoster.js";
import { SubagentForm } from "@/next-agent/SubagentEditor.js";
import {
  getBuiltInSubagentName,
  groupAgentsByScope,
  groupPluginAgentsById,
  isBuiltInAgent,
  isEditableUserAgent,
  projectSettingsSubagents,
  supportsEnabledToggle,
  toSubagentModelSelection,
} from "@/next-agent/subagentState.js";
import {
  PluginInstallEmptyState,
  PluginLoadingState,
  PluginSearchEmptyState,
} from "@/settings/PluginInstallEmptyState.js";
import {
  PluginScopeMenu,
  getPluginWorkspaceKey,
  isPluginScopeWorkspaceConnected,
} from "@/settings/PluginScopeMenu.js";
import { SettingsBreadcrumbReporter } from "@/settings/SettingsHeaderBreadcrumb.js";
import { SettingsResourceGroupHeader } from "@/settings/SettingsResourceGroupHeader.js";
import { SettingsResourceHeaderActions } from "@/settings/SettingsResourceHeaderActions.js";
import { SettingsSearchInput } from "@/settings/SettingsSearchInput.js";
import {
  resolvePluginDisplayName,
  resolveUniquePluginListingByName,
} from "@/settings/pluginStoreListing.js";
import { refreshLoadedSubagentsStoreForWorkspace } from "@/store/subagentsStore.js";
import { usePluginManagementStore } from "@/store/pluginManagementStore.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { toast } from "@/components/ui/toast.js";

interface SubagentsSectionProps {
  onManageModels?: () => void;
  workspacePath?: string | null;
  workspaceIdentity?: string;
}

export function SubagentsSection({ onManageModels }: SubagentsSectionProps) {
  const { intl, locale } = useZCodeIntl();
  const confirmDialog = useConfirmDialog();
  const plugins = usePluginManagementStore((state) => state.plugins);
  const availablePlugins = usePluginManagementStore((state) => state.availablePlugins);
  const initializePlugins = usePluginManagementStore((state) => state.initialize);
  const localHostServices = useBaseWorkspaceServices();
  const modelSelectionRead = useModelSelectionServiceView(localHostServices.modelSelectionService);
  const modelSelectionView =
    modelSelectionRead.state.status === "ready" ? modelSelectionRead.state.view : null;
  // 非 Ready 生命周期均保留表单中的模型意图；error/unavailable 不能被误判成模型已失效。
  const modelSelectionLoading = modelSelectionRead.state.status !== "ready";
  const tabs = useTabStore((state) => state.tabs);
  const workspaceTabs = useMemo(() => {
    const seen = new Set<string>();
    return (
      tabs
        .filter(isWorkspaceTab)
        .filter(isPluginScopeWorkspaceConnected)
        // Subagent Settings 只管理 Local Environment；远程配置浏览/编辑是独立产品能力。
        .filter((tab) => !tab.remoteTarget && !tab.remoteSessionId && !tab.workspaceIdentity)
        .filter((tab) => {
          const key = getPluginWorkspaceKey(tab);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
    );
  }, [tabs]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [capability, setCapability] = useState<AgentsCapability | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [operatingAgentId, setOperatingAgentId] = useState<string | null>(null);
  const [selectedScopeKey, setSelectedScopeKey] = useState("user");
  const selectedWorkspace = workspaceTabs.find(
    (tab) => getPluginWorkspaceKey(tab) === selectedScopeKey,
  );
  const targetWorkspacePath = selectedWorkspace?.workspacePath ?? "";
  const targetWorkspaceIdentity = undefined;
  const { pluginManagementService, subagentsService } = localHostServices;
  const activeScope = selectedWorkspace ? "workspace" : "user";
  const latestRequestIdRef = useRef(0);
  const pluginInventoryWorkspacePath = targetWorkspacePath || workspaceTabs[0]?.workspacePath;
  const chatModelSelectGroups = useMemo(() => {
    if (!modelSelectionView) return [];
    return buildRegistryModelSelectGroups(ZCODE_AGENT_PROVIDER, modelSelectionView, {
      startPlanBadgeLabel: intl.formatMessage({
        id: "settings.modelProvider.connectionMode.startPlanBadge",
      }),
      apiKeyLabel: intl.formatMessage({
        id: "settings.modelProvider.apiKey",
      }),
      codingPlanLabel: intl.formatMessage({
        id: "settings.modelProvider.connectionMode.codingPlan",
      }),
    });
  }, [intl, modelSelectionView]);
  const subagentModelSelectGroups = chatModelSelectGroups;
  const loadAgents = useCallback(
    async (showBlockingLoading: boolean) => {
      setLoading(showBlockingLoading);
      setRefreshing(!showBlockingLoading);
      setError(null);
      const requestId = ++latestRequestIdRef.current;
      try {
        const result = await subagentsService.list({
          workspacePath: targetWorkspacePath ?? "",
          workspaceIdentity: targetWorkspaceIdentity,
          provider: ZCODE_AGENT_PROVIDER,
          mode: activeScope === "user" ? "settingsUserOnly" : "allRuntimeScopes",
        });
        if (requestId !== latestRequestIdRef.current) {
          return;
        }
        // 插件 agent 是运行时 profile 的只读投影；设置页展示它们，但仍不展示工作区级编辑入口。
        setAgents(projectSettingsSubagents(result));
        setCapability(result.capability);
        setLoading(false);
        setRefreshing(false);
      } catch (loadError) {
        if (requestId !== latestRequestIdRef.current) {
          return;
        }
        setLoading(false);
        setRefreshing(false);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    },
    [subagentsService, activeScope, targetWorkspaceIdentity, targetWorkspacePath],
  );

  useEffect(() => {
    void loadAgents(true);
  }, [loadAgents]);

  useEffect(() => {
    if (!pluginInventoryWorkspacePath) return;
    let active = true;
    // 冷启动 seed 晚于文件首读，旧用户页又跳过 inventory 初始化，导致插件直到重进才出现。
    // 复用已有初始化完成事件刷新只读资源，不阻塞用户列表、不轮询，也不把项目配置带入用户页。
    void (async () => {
      try {
        await initializePlugins({
          workspacePath: pluginInventoryWorkspacePath,
          workspaceIdentity: targetWorkspaceIdentity,
          configScope: activeScope === "user" ? "user" : undefined,
          pluginService: pluginManagementService,
        });
        if (active) await loadAgents(false);
      } catch (initializationError) {
        if (active)
          logger.warn("[subagents] 插件资源初始化失败，保留当前列表", initializationError);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    activeScope,
    initializePlugins,
    loadAgents,
    pluginInventoryWorkspacePath,
    pluginManagementService,
    targetWorkspaceIdentity,
  ]);

  const refresh = useCallback(async () => {
    await loadAgents(false);
  }, [loadAgents]);

  const refreshMentionStore = useCallback(async () => {
    await refreshLoadedSubagentsStoreForWorkspace({
      workspacePath: targetWorkspacePath,
      workspaceIdentity: targetWorkspaceIdentity,
      subagentsService,
    });
  }, [subagentsService, targetWorkspaceIdentity, targetWorkspacePath]);

  const handleSave = useCallback(
    async (config: SubAgentConfig) => {
      setSaving(true);
      try {
        if (editingAgent) {
          await subagentsService.updateAgent({
            agentId: editingAgent.id,
            config,
            oldFilePath: editingAgent.path,
            provider: ZCODE_AGENT_PROVIDER,
            scope: editingAgent.scope === "workspace" ? "workspace" : "user",
            workspacePath: editingAgent.projectPath ?? targetWorkspacePath ?? undefined,
            workspaceIdentity: targetWorkspaceIdentity,
          });
        } else {
          await subagentsService.createAgent({
            config,
            provider: ZCODE_AGENT_PROVIDER,
            scope: activeScope,
            workspacePath: targetWorkspacePath ?? undefined,
            workspaceIdentity: targetWorkspaceIdentity,
          });
        }
        setShowForm(false);
        setEditingAgent(null);
        await Promise.all([refresh(), refreshMentionStore()]);
      } catch (saveError) {
        toast(saveError instanceof Error ? saveError.message : String(saveError));
      } finally {
        setSaving(false);
      }
    },
    [
      activeScope,
      editingAgent,
      refresh,
      refreshMentionStore,
      subagentsService,
      targetWorkspaceIdentity,
      targetWorkspacePath,
    ],
  );

  const handleDelete = useCallback(
    async (agent: AgentSummary) => {
      if (!isEditableUserAgent(agent)) {
        return;
      }
      const confirmed = await confirmDialog({
        title: intl.formatMessage({ id: "settings.subagents.delete.title" }),
        description: intl.formatMessage(
          { id: "settings.subagents.delete.description" },
          { name: agent.name },
        ),
        confirmLabel: intl.formatMessage({ id: "common.delete" }),
      });
      if (!confirmed) {
        return;
      }
      setOperatingAgentId(agent.id);
      try {
        await subagentsService.deleteAgent({
          agentId: agent.id,
          filePath: agent.path,
        });
        setEditingAgent(null);
        setShowForm(false);
        await Promise.all([refresh(), refreshMentionStore()]);
      } catch (deleteError) {
        toast(deleteError instanceof Error ? deleteError.message : String(deleteError));
      } finally {
        setOperatingAgentId(null);
      }
    },
    [confirmDialog, intl, refresh, refreshMentionStore, subagentsService],
  );

  const handleToggle = useCallback(
    async (agent: AgentSummary, enabled: boolean) => {
      if (!supportsEnabledToggle(agent)) {
        return;
      }
      setOperatingAgentId(agent.id);
      try {
        await subagentsService.setEnabled({
          agentId: agent.id,
          enabled,
        });
        await Promise.all([refresh(), refreshMentionStore()]);
      } catch (toggleError) {
        toast(toggleError instanceof Error ? toggleError.message : String(toggleError));
      } finally {
        setOperatingAgentId(null);
      }
    },
    [refresh, refreshMentionStore, subagentsService],
  );

  const handleModelOverrideChange = useCallback(
    async (agent: AgentSummary, config: { model?: string; thoughtLevel?: string }) => {
      const agentName = getBuiltInSubagentName(agent);
      if (!agentName && agent.source !== "plugin") {
        return;
      }
      setOperatingAgentId(agent.id);
      try {
        const modelSelection = toSubagentModelSelection(config.model, config.thoughtLevel);
        if (agentName) {
          await subagentsService.setBuiltInModelOverride({ agentName, modelSelection });
        } else {
          // 稳定 ID 不含插件版本；升级换目录后继续读取同一份用户 Selection 覆盖。
          await subagentsService.setPluginAgentModelOverride({ agentId: agent.id, modelSelection });
        }
      } catch (changeError) {
        toast(changeError instanceof Error ? changeError.message : String(changeError));
        setOperatingAgentId(null);
        throw changeError;
      }
      try {
        await Promise.all([refresh(), refreshMentionStore()]);
      } catch (refreshError) {
        // 持久化成功即为提交点；后续投影刷新失败只能提示，不能让控件回滚磁盘状态。
        toast(refreshError instanceof Error ? refreshError.message : String(refreshError));
      } finally {
        setOperatingAgentId(null);
      }
    },
    [refresh, refreshMentionStore, subagentsService],
  );

  const handleEdit = useCallback((agent: AgentSummary) => {
    if (!isEditableUserAgent(agent)) {
      return;
    }
    setEditingAgent(agent);
    setShowForm(false);
  }, []);

  const canManageUserAgents =
    activeScope === "workspace"
      ? Boolean(targetWorkspacePath)
      : capability?.userScopeAvailable === true;

  const handleAddNew = useCallback(() => {
    if (!canManageUserAgents) {
      return;
    }
    setEditingAgent(null);
    setShowForm(true);
  }, [canManageUserAgents]);

  const handleCancelForm = useCallback(() => {
    setEditingAgent(null);
    setShowForm(false);
  }, []);

  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (activeScope === "user") {
        if (agent.scope === "workspace") return false;
      } else {
        if (isBuiltInAgent(agent) || agent.scope !== "workspace") return false;
        if (agent.source === "plugin" && agent.projectPath !== targetWorkspacePath) return false;
        if (
          agent.source !== "plugin" &&
          agent.projectPath &&
          agent.projectPath !== targetWorkspacePath
        )
          return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        agent.name,
        agent.description,
        agent.modelSelection
          ? `${agent.modelSelection.providerId}/${agent.modelSelection.modelId}`
          : undefined,
        agent.path,
        agent.scope,
        agent.source,
        agent.tools?.join(" "),
        agent.disallowedTools?.join(" "),
        agent.skills?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeScope, agents, query, targetWorkspacePath]);

  const groupedAgents = useMemo(() => groupAgentsByScope(filteredAgents), [filteredAgents]);
  const pluginGroups = useMemo(
    () => groupPluginAgentsById(groupedAgents.plugin),
    [groupedAgents.plugin],
  );
  const pluginListingById = useMemo(
    () => new Map(availablePlugins.map((plugin) => [plugin.id, plugin.listing])),
    [availablePlugins],
  );
  const pluginIconItemById = useMemo(
    () =>
      new Map(
        plugins.map((plugin) => [
          plugin.id,
          { name: plugin.name, listing: pluginListingById.get(plugin.id) },
        ]),
      ),
    [pluginListingById, plugins],
  );
  const filteredAgentCount =
    groupedAgents.user.length + groupedAgents.plugin.length + groupedAgents.builtIn.length;
  const currentEditingAgent = useMemo(() => {
    if (!editingAgent) {
      return null;
    }
    return agents.find((agent) => agent.id === editingAgent.id) ?? editingAgent;
  }, [agents, editingAgent]);
  const isFormView = canManageUserAgents && (showForm || currentEditingAgent !== null);

  if (isFormView) {
    return (
      <div className="space-y-6">
        <SettingsBreadcrumbReporter
          items={[
            {
              label:
                currentEditingAgent?.name ??
                intl.formatMessage({ id: "settings.subagents.addNew" }),
            },
          ]}
          onSectionSelect={handleCancelForm}
        />
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-ui-xl tracking-ink font-semibold text-foreground">
              {editingAgent
                ? intl.formatMessage({ id: "settings.subagents.edit" })
                : intl.formatMessage({ id: "settings.subagents.addNew" })}
            </h3>
            <p className="text-ui-base text-foreground-subtle">
              {editingAgent
                ? intl.formatMessage({
                    id: "settings.subagents.editDescription",
                  })
                : intl.formatMessage({
                    id: "settings.subagents.addDescription",
                  })}
            </p>
          </div>

          <SubagentForm
            initial={currentEditingAgent ?? undefined}
            modelSelectionView={modelSelectionView}
            modelSelectionLoading={modelSelectionLoading}
            modelSelectGroups={subagentModelSelectGroups}
            onManageModels={onManageModels}
            saving={saving}
            onCancel={handleCancelForm}
            onDelete={handleDelete}
            onSave={handleSave}
            scopeKey={selectedScopeKey}
            workspaceTabs={workspaceTabs}
            onScopeKeyChange={setSelectedScopeKey}
          />
        </div>
      </div>
    );
  }

  const renderAgentList = (items: AgentSummary[]) => (
    <div className="overflow-hidden rounded-lg bg-surface">
      {items.map((agent, index) => (
        <div key={agent.id}>
          {index > 0 ? <div className="h-px bg-border/50" aria-hidden="true" /> : null}
          <AgentListRow
            agent={agent}
            pluginIconItem={
              agent.pluginId
                ? pluginIconItemById.get(agent.pluginId)
                : agent.pluginName
                  ? {
                      name: agent.pluginName,
                      listing: resolveUniquePluginListingByName(availablePlugins, agent.pluginName),
                    }
                  : undefined
            }
            isOperating={operatingAgentId === agent.id || refreshing}
            modelGroups={chatModelSelectGroups}
            modelSelectionView={modelSelectionView}
            modelSelectionLoading={modelSelectionLoading}
            modelSelectGroups={subagentModelSelectGroups}
            onModelOverrideChange={handleModelOverrideChange}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onToggle={handleToggle}
          />
        </div>
      ))}
    </div>
  );

  const hasSearchResultEmpty = Boolean(query.trim()) && filteredAgentCount === 0;
  return (
    <div className="space-y-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <PluginScopeMenu
            align="start"
            selectedScopeKey={selectedScopeKey}
            workspaceTabs={workspaceTabs}
            onScopeKeyChange={setSelectedScopeKey}
          />
          <div className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
          <div className="flex h-7 items-center gap-1 px-3 text-ui-base font-medium text-foreground">
            <span>{intl.formatMessage({ id: "settings.subagents.title" })}</span>
            <span className="text-ui-sm text-foreground-subtle">{filteredAgentCount}</span>
          </div>
        </div>
        <SettingsSearchInput
          containerClassName="w-full sm:ml-auto sm:w-64"
          clearLabel={intl.formatMessage({ id: "settings.search.clear" })}
          value={query}
          onClear={() => setQuery("")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={intl.formatMessage({
            id: "settings.subagents.searchPlaceholder",
          })}
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-ui-base text-destructive">
          <span>{error}</span>
        </div>
      ) : null}

      {modelSelectionRead.state.status === "error" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-ui-base text-destructive">
          <span>{intl.formatMessage({ id: "settings.subagents.modelLoadFailed" })}</span>
          <Button type="button" variant="ghost" size="sm" onClick={modelSelectionRead.reload}>
            {intl.formatMessage({ id: "common.retry" })}
          </Button>
        </div>
      ) : null}

      {capability && !capability.userScopeAvailable ? (
        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-ui-base text-foreground-subtle">
          {intl.formatMessage({
            id: "settings.subagents.userScopeDesktopOnly",
          })}
        </div>
      ) : null}

      {loading ? (
        <PluginLoadingState label={intl.formatMessage({ id: "common.loading" })} />
      ) : hasSearchResultEmpty ? (
        <PluginSearchEmptyState label={intl.formatMessage({ id: "settings.subagents.empty" })} />
      ) : (
        <div className="space-y-6">
          <section
            className={query.trim() && groupedAgents.user.length === 0 ? "hidden" : "space-y-4"}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SettingsResourceGroupHeader
                count={groupedAgents.user.length}
                title={intl.formatMessage({
                  id: "settings.subagents.group.user",
                })}
              />
              <SettingsResourceHeaderActions
                onRefresh={() => void Promise.all([refresh(), refreshMentionStore()])}
                onNew={canManageUserAgents ? handleAddNew : undefined}
                refreshing={refreshing}
              />
            </div>
            {groupedAgents.user.length > 0 ? (
              renderAgentList(groupedAgents.user)
            ) : (
              <PluginInstallEmptyState
                title={intl.formatMessage({ id: "settings.subagents.empty" })}
                description={intl.formatMessage({
                  id: "settings.subagents.addDescription",
                })}
                actions={
                  canManageUserAgents ? (
                    <Button type="button" variant="default" size="lg" onClick={handleAddNew}>
                      <Plus data-icon="inline-start" aria-hidden="true" />
                      {intl.formatMessage({ id: "settings.create.action" })}
                    </Button>
                  ) : null
                }
              />
            )}
          </section>
          {pluginGroups.map(([pluginId, items]) => (
            <section key={pluginId} className="space-y-4">
              <SettingsResourceGroupHeader
                count={items.length}
                title={resolvePluginDisplayName(
                  {
                    name: items[0]?.pluginName ?? pluginId,
                    listing:
                      (items[0]?.pluginId ? pluginListingById.get(items[0].pluginId) : undefined) ??
                      resolveUniquePluginListingByName(
                        availablePlugins,
                        items[0]?.pluginName ?? pluginId,
                      ),
                  },
                  locale,
                )}
              />
              {renderAgentList(items)}
            </section>
          ))}
          {groupedAgents.builtIn.length > 0 ? (
            <section className="space-y-4">
              <SettingsResourceGroupHeader
                count={groupedAgents.builtIn.length}
                title={intl.formatMessage({
                  id: "settings.subagents.group.builtIn",
                })}
              />
              {renderAgentList(groupedAgents.builtIn)}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
