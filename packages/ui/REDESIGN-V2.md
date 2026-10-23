# ZHLBuilder 自研 UI 规范 v2（界面层全自研重写）

状态：**已冻结（P1，2026-10-11）** ｜ 适用：`packages/ui` 界面层 ｜ 依据：已批准的《ZHLBuilder 界面自研重写与 Windows 修复计划》

## 0. 总则与边界

- **功能与协议沿用 ZCode 上游契约**：不修改 `packages/shared/src/zcode-protocol`(+v4)、`packages/rpc`、`packages/services` 公开接口、`packages/ui/src/hooks`、`packages/ui/src/store`；UI 只消费。
- **界面层全部自研**：业务形态（信息架构、布局、组件实现、交互）由本项目自行设计与实现；不再沿用上游/现有业务组件形态。
- **不可协商底座**：`styles.css` 设计令牌、`text-ui-*` 排版体系、根 `DESIGN.md`；`components/ui/*` 原语作为机制层复用（三方原语内部不改）。
- **接线原则**：`组件 → hooks → services/context`，只换渲染、不动数据源与命令语义；保留 testid（E2E 契约）；新增文案以 zh-CN 为主源、en-US 同步。

## 1. 应用级信息架构（IA）

一级分区（侧栏 + 路由）：

1. **会话（Chat）**——当前工作区任务流；运行实例以"引用卡"出现在会话里。
2. **工作流（Workflows）**——中枢：保存的工作流、运行历史、实例详情（独立"家"页，不再只藏在侧板）。
3. **电脑控制（Computer Use & 远程）**——本机能力就绪、设备配对、远程渠道。
4. **设置（Settings）**——偏好与能力开关。

导航模型：

- 侧栏保持三段：顶部动作区（新建/搜索/中枢入口）｜任务区（项目分组）｜底栏（账户/主题/设置）。
- 「工作流」与「电脑控制」从中枢/设置里提升为一等入口；会话里的运行卡、侧板 tab 是"引用"，点击落到中枢对应实例页。
- 侧板（Side Pane）作为全应用右侧承载位保留（tab 行为与契约不变），内容全部由自研组件渲染。

## 2. 模块级设计概念

### 2.1 Workflow（W1–W3）

- **W1 运行时间线 →「阶段账本 Ledger」**：弃轨道/弧/站/灯/檐五层叠图。形态 = 垂直账本：每阶段一行（序号、状态点、名称、代理数、进度 settled/observed、轮次 ⟳n），运行行就地展开明细（药丸 / 名册），历史行折叠为一行摘要；点行展开/收起，点「详情」开运行面板。词汇统一为：阶段 / 代理 / 轮次 / 交付。
  - **每阶段耗时不在 ZCode 上游契约里**（`workflowRuns` 投影没有时间戳，只有待答问题的 `askedAt`），账本以进度 / 轮次 / 待答替代，**不伪造时间**——将来若协议加戳，再在行尾补一段。
  - 卡上超过 8 行折成**摘要窗口**：running / failed 行永远在场，其余从最早补位，跳过的区间折成一行「还有 n 个阶段」（点它开运行面板）；面板显示全部行。
  - 实施（2026-10-11）：`packages/ui/src/next-workflow/`（`ledger-model.ts` / `WorkflowLedgerRow.tsx` / `WorkflowRunDigest.tsx` / `WorkflowRunPhaseList.tsx`）；旧入口 `components/workflow-timeline/WorkflowRunDigest.tsx` 与 `app-shell/WorkflowRunPhaseList.tsx` 改为 re-export（调用点与 testid 不变）。
- **W2 运行详情 →「三段抽屉」**：①实时（状态头 + 停止/恢复/配置）②过程（账本 + 待答问题）③交付（产物卡列表）。三段可折叠；实时段常显；错误/终止红条常显、不折叠。
- **W3 工作流中枢 →「卡片流 + 运行表」**：保存的工作流卡（名称/说明/作用域/最近运行/操作）+ 运行历史表（账本紧凑行：状态点/名称/耗时/产物数）。
  - 实施（2026-10-12）：**运行表** = `next-workflow/SavedWorkflowRunLedger.tsx`——一行只说状态点 / 时间 / 耗时 / 产物数（全局档带项目列），点行就地展开明细（tokens / 实参芯片 / **可点的产物药丸**）；「查看实例」是主操作、不折叠。**卡片流** = `next-workflow/SavedWorkflowCard.tsx`——补上**作用域芯片**（项目 / 全局），名称 / 说明 / 最近运行 / 实参芯片 / 运行与 ⋯ 逐条保留。旧入口（`SavedWorkflowRunHistoryPanel.tsx`、`SavedWorkflowCard.tsx`）改 re-export。
  - 注：运行行的**耗时在契约里**（journal 行的 `createdAt` / `updatedAt`），与 W1 每阶段耗时（投影无时间戳）不同——两处都不要伪造。
  - 「工作流图」部分无需重写：React Flow 板面在前一轮已退役，`components/workflow-graph/*` 只剩纯模型/呈现助手（被账本与卡消费）。

### 2.2 电脑控制（C1–C3）

- **C1 就绪检查表**：总状态一行（可用/待授权/不可用）；下挂检查项（辅助功能、录屏、系统版本地板等），每项 = 状态徽标 + 一键直达 + 重启回执；说明展开显示。
  - 实施（2026-10-12）：`next-cua/CuaReadinessChecklist.tsx`（纯展示 + 回调）——总状态行 = 灯 + 词（可用/待授权/不可用）+ 一句读数（远端/Linux/Web 说为什么、低于地板说 current/minimum、待授权说「n 项等待授权」）；检查项 = 系统版本（达标说「满足要求」）/ 辅助功能 / 录屏，每项状态徽标 + 说明（默认收起）+ 该态的动作（denied → 一键直达；stale → 重启 Helper + 「重启 ZHLBuilder」兜底），未启用插件时退成一行「先打开总开关」。`settings/ComputerUseSection.tsx` 改为「总开关 + 检查表 + 折叠的输入框入口」，**权限项的直达/重启门控与旧行逐条相同**（直达要 `openCuaPermissionOnboarding`、重启要 workspace 路径）。
  - 注：macOS 版本地板的查询失败按「无门槛」处理（同旧行）；二手证据：本机 Linux 面只能截「不可用」一格，macOS 各态靠本机预览页合成数据验收。
- **C2 设备与远程中心**：本机配对（二维码卡、PIN、连接状态）+ 渠道卡（飞书/微信/Telegram/Webhook：连接与凭据 / 回复与访问 / 危险区，三段折叠）+ 远程会话入口。
  - 实施（2026-10-12）：**本机配对卡** = `next-cua/ZhlDevicePairCard.tsx`——状态行（灯 + 词：未绑定/等待扫码/已绑定/在线/连接失败 + 一句读数）常显，下挂该状态的动作面（生成二维码 / 二维码卡 + 配对码 / 启动设备代理 / 重试），解绑就地二次确认；旧实现里**硬编码的中文文案全部转 i18n**（zh/en 新增 `zhlPair.*`），按钮改用共享 `Button`；桥契约（`zhlDevice` 五方法）与 busy single-flight、phase 推进清错等行为逐条保留。旧入口 `ZhlAppPairSection.tsx` 改 re-export。
  - **渠道卡三段折叠与远程会话入口在前一轮已就位**（核对）：`BotsDialog` 的右侧详情 = BotSummaryCard（主卡）+ `bots.section.connection`（连接与凭据 = ProviderSettingsCard：凭据 / 绑定码 / 飞书与微信扫码注册）+ `bots.section.behavior`（回复与访问 = 回复粒度 + 允许工作区）+ `bots.delete`（危险区），节头走同一枚 `rotate-90` chevron；`WebRemoteControlDialog` 是远程会话入口（Bot Channel 四渠道 + 本机配对卡），触发器在侧栏底栏。
- **C3 浏览器运行监视器**：当前任务条 + 画面预览位 + 步骤日志（自研三栏布局）。
  - 实施（2026-10-12）：**当前任务条** = `next-cua/BrowserTaskBar.tsx`，接在浏览器地址行与画面之间（`UnifiedBrowserView`）——slim 常显横条：灯 + 词 + 一句读数，数据只读那一个 5 秒 operation deadline（`useBrowserUseOperationActive`，与标签页图标、自由尺寸警告共用同一判断）：在场 = 「电脑控制正在操作浏览器」（琥珀旋转灯），缺席 = 「浏览器就绪」（灰灯）。**画面预览位**不动（guest surface + 自由尺寸工具条 + 拖拽手柄，前一轮已就位）。
  - **步骤日志暂缺（照实不伪造）**：浏览器操作序列不在 UI 层可得——契约里只有 operation deadline 与截图 surface（`browserUseOperationUntil` + prepare payload），没有步骤流；将来若事件流带操作序列，再在这条横条以下接第三栏。

### 2.3 Agent / 提示词（A1–A3）

- **A1 工具卡 →「统一渲染注册表」**：一种工具一种自研卡；行级摘要（工具名 + 关键参数 + 状态 + 耗时）恒显，详情体默认折叠；注册表集中管理 tool→渲染器映射，替代 49 个各自为政的定制布局。
  - 实施（2026-10-12）：**注册表** = `next-agent/toolRendererRegistry.ts`——声明式表 `TOOL_RENDERER_REGISTRY`（三层：结构直判 → 按名先摘 → identity 分流），每条 `when` 配 `note`（为什么在这一行）；identity **懒取**（不调它的条目不触发解析，与原链式代码同一时机）；顺序即优先级，`FallbackToolCallBlock` 兜底。旧入口 `ToolCallBlocks/resolveRenderer.ts` 只 re-export。
  - **行级摘要 / 折叠详情已由机制层统一承载**（核对）：63 个 renderer 全部经 `ToolLayout` → `ToolSummaryRow`（kindLabel / kindDetail / primaryText / secondaryText / statusNode / chevron + Collapsible，详情默认收起）；注册表只决定「哪张卡」，不碰卡内形态。
  - 注：注册表放 `next-agent/` 而 renderer 仍 import `@/ToolCallBlocks.js` 构成既有的晚绑定环（原样式同款）——数组字面量在所有 renderer 模块求值完之后才创建，Tdz 无风险；顺序证据：tsc 0 错 + oxlint 0 警告。
- **A2 对话原语 →「消息流 v2」**：自研 message/conversation 组件群（角色标识、时间、引用块、代码块、附件、操作条），统一排版与折叠规则。
  - 盘点（2026-10-12）：`components/ai-elements/*` 共 46 文件，分三类——①**ZCode 侧本就要用的外壳**（`conversation.tsx` 只是 StickToBottom + cn 的薄壳，操作条 `MessageActions/MessageToolbar` 由 `v4/ConversationRowView.tsx`（角色标识与时间也在这里）装配，属自研层）；②**上游派生但已被 ZCode 改写**（`message.tsx` 的 `MessageResponse` = streamdown/markdown 桥，1670 行，带 vercel/ai-elements 的 Apache-2.0 出处声明）；③**附件/代码块/引用块**（attachments 565、code-block 550、markdown-blockquote、markdown-table/list/image）——统一排版与折叠规则的落点。
  - 切片计划（**不盲改**）：A2a 校对 attachments/code-block/blockquote 的排版与折叠规则（与 DESIGN.md 折叠节头对齐）；A2b `MessageResponse` 的流式渲染桥按「自研渲染 + streamdown 只做解析」拆分（替换上游 UI 层，保留许可与出处声明到改写完成再议）；A2c 操作条（复制/分支/下载）与行级时间的排版统一。逐片走 tsc/oxlint + 浅深 zh/en 截图，改一片验一片。
  - **A2a 实施（2026-10-12）**：查出一类系统性排版偏差——ai-elements 从上游带来 **`muted` 家族令牌在本主题里根本不存在**（`text-muted-foreground` ×45、`bg-muted` ×18、`bg-muted-foreground` ×1，`styles.css` 无定义 → 类不生成、颜色回落继承）。已按项目令牌统一替换 17 个文件：次级文字 → `text-foreground-subtle`；静态填充 → `bg-surface`（保留 `/NN` 透明度）；hover 填充 → `hover:bg-surface-hover` / `hover:bg-hover`；滚动/下载按钮的 `dark:bg-background dark:hover:bg-muted` → `bg-background hover:bg-surface-hover`（令牌本身分主题，去 dark: 前缀）。复核：全目录零 `muted` 死类；`packages/ui` tsc 退出码 0、oxlint 0 错（全包 39 警告，与基线同量）。
  - **跨模块清账（2026-10-12，当日续）**：把同一批死令牌从 ai-elements 扩到全包清完——①`muted` 家族再清 9 文件（`ErrorBoundary`、`ConversationShareConfirmationDock`、`Root`、`ConversationQueuePanel`、`ChatMediaAttachmentPreviewDialog`、`ConversationComposer`、`lib/fileDisplay`、`settings/StatusDot`、`ToolSnapshotFieldNotice`）；②`border-outline/60`（`ToolCallBody`）、`border-outline/40`（`TaskList`）→ `border-border/NN`（`--color-outline` 全库 0 定义）；③`text-danger`（`BackgroundBashOutputSidePane`、`ConversationFileRewindDialog`）与 `text-[var(--color-danger)]`（`SubagentDirectorySidePane`、`v4/SessionPane`）→ `text-destructive`（危险色唯一合法令牌，`--color-danger` 全库 0 定义）；④`bg-btn-alt-bg`/`text-btn-alt-text`/`hover:bg-surface-raised`（`LocaleSwitcher`）→ `bg-surface`/`text-foreground-subtle`/`hover:bg-surface-hover`。
  - **清账复核口径**（可复跑）：脚本比对 `packages/ui/src` 全部 ts/tsx 的 Tailwind 颜色类与内联 `var(--color-*)` 引用 vs `styles.css` 143 个令牌 + Tailwind v4 默认调色板白名单 → **0 个未定义 var 引用；未定义类仅剩 `components/ui/*` 原语内部**（`bg-muted`/`text-muted-foreground`/`text-on-surface-muted/40`——按 §不可协商底座「三方原语内部不改」豁免，模块重写时若替换原语再一并清）。`text-wrap-phrase`（`next-workflow/SavedWorkflowCard` 等 3 处）经核实是 styles.css 自定义 utility（定义在 L68/L76），保留；`shimmer.tsx` 的 `var(--color-muted-foreground, fallback)` 兼容兜底保留。复核：`packages/ui` tsc 退出码 0、oxlint 0 错（39 警告，与基线同量）。
  - **A2b 实施（2026-10-12）——MessageResponse 按「自研渲染 + streamdown 只做解析」拆分**：`components/ai-elements/message.tsx`（1670 行）拆入 `next-message/` 五文件，旧入口只 re-export（并置替换；对外实际被引用的仅 `MessageAction/MessageActions/MessageFileLinkTarget/MessageResponse` 四个符号，导出面原样保留，调用点与 testid 不变）：
    - `messageShells.tsx` 消息容器/操作区/分支切换/工具条；`MessageResponse.tsx` 桥接件（归一化流水线接线 + 错误边界降级 `MessageResponseMarkdownBoundary`）；`messageMarkdownParse.ts` 解析侧（**唯一收口**：Streamdown 插件装配/GFM singleTilde/`$` 数学归一化/文件链接 rehype/渲染 key/reader epoch）；`messageMarkdownElements.tsx` 渲染侧（自研元素渲染表）；`messageFileLinks.tsx` 文件/外链渲染组（样式常量 + 目标模型 + 两个按钮）。
    - **「替换上游 UI 层」的精确边界（查证 streamdown dist）**：其内部 `components = {...上游默认表 ko, ...我们的自定义表}`，上游默认表含 `ol/li/ul/hr/strong/a/h1-h6/table 系/code/img/pre/sup/sub/p/section`；此前仅剩 **`hr`/`sup`/`sub`** 由上游 UI 承接（`pre` 是 `data-block` 标记接线、`section` 是流式块壳，均非 UI，保留）。本轮补自研 `MarkdownHr/MarkdownSup/MarkdownSub`；sup/sub 文案尺寸从 Tailwind 默认 `text-sm` 收敛到 `text-ui-xs`。
    - 验收：`packages/ui` tsc 0 错、oxlint 0 错（39 警告=基线）；临时验收台（Platform+Intl+TooltipProvider）浅深 × zh/en 截图 4 张 + 流式未闭合片段 1 张：DOM 探针命中 `hr→my-6 border-border`、`sup/sub→text-ui-xs leading-none`（新渲染件生效）；表格/任务列表/引用块/行内与块级数学/代码卡（ts 高亮+控件）/外链/文件链接全部正常；流式未闭合围栏渲染为代码卡、未闭合 `**` 保持原文不伪造闭合；验收台缺 TooltipProvider 时按设计走边界降级（纯文本，无白屏），即降级链路亦被实测覆盖。
    - 说明：`message.tsx` 头部及五个新文件均保留 vercel/ai-elements 的 Apache-2.0 出处声明（THIRD-PARTY-NOTICES 登记）；「替换上游 UI 层」以渲染层为界，Markdown 解析仍由 streamdown 承担。
  - **A2c 实施（2026-10-12）——行级操作条与行级时间排版统一**：新增 `next-message/messageRowActions.tsx`，把此前散在四个装配点的显现规则与时间排版收口为一处：
    - **显现规则单一定义**：`MessageRowActions`（scope: `user-row` / `assistant-row` / `assistant-turn`）——桌面保持 `opacity-0 + group-hover/focus-within` 降噪；**触屏/手机远控（`matchMedia("(hover: none)")`，沿用 TaskListItem / task-row 既有判定模式）改为常显**。原代码注释写明「远控直接显示」但类名从未实现该分支（复制/编辑入口在触屏不可发现），本轮按注释意图与仓库既有惯例补齐——这是本次唯一的可见行为修正，动作集与 testid 一概不变。四个装配点（user 行、assistant 行内、轮尾工具栏、钩子详情条）全部改走该组件；全库复查「group-hover/*-row:opacity-100」字面量只剩此一处。
    - **`MessageRowTime`**：行级时间统一为 `text-ui-sm text-foreground-subtlest tabular-nums + ml-1 + select-none + whitespace-nowrap`，文案仍走 `formatMessageTimeLabel`（今天 HH:mm / 昨天 HH:mm / M/D HH:mm / Y/M/D HH:mm，zh/en 同源）；`ConversationAssistantTextActions` 增加 `actionsScope` 参数（默认 `assistant-row`，轮尾传 `assistant-turn`），`formatMessageTimeLabel` 的调用从装配点收进组件。
    - 验收：`packages/ui` tsc 0 错、oxlint 0 错（39 警告=基线）；临时验收台探针：桌面 idle opacity=0 → hover=1（悬停显现保留）、触屏仿真 `(hover:none)=true` 且 opacity=1（常显生效）、en 时间四桶 = `10:36 PM / Yesterday 10:36 PM / 9/2, 10:36 PM / 9/7/2025, 10:36 PM`（zh 对应「22:36 / 昨天 22:36 / 9/2 22:36 / 2025/9/7 22:36」）；浅深 × zh/en 截图 4 张。
    - 说明：「操作条（复制/分支/下载）」中的**下载动作当前产品里不存在**（现行动作集 = 复制 / 赞 / 踩 / 分支 / 钩子详情 / 时间），按「照实不伪造」不新增动作，只做排版与显现规则统一。
  - 说明：`message.tsx` / `conversation.tsx` 的上游派生是**合规表面**（THIRD-PARTY-NOTICES 有登记），重写必须带着出处处理一起做，不能只换皮。
- **A3 提示词工作台**：composer 外壳（输入域 + 附件 + 模式/模型行）+ 子代理管理（列表 + 抽屉式编辑，基础/高级分区）。
  - **A3a 实施（2026-10-12）——子代理管理面落位 `next-agent/`**（设置区名册 + 编辑表单；行为、testid、服务接线逐条不变）：
    - `next-agent/subagentState.ts` 纯函数与常量（模型值编解码 / 思考档状态 / 工具集 / 表单初始态 / 作用域分组，全部导出）；`next-agent/SubagentRoster.tsx` 名册行（头像 + 名称 + 模型/工具徽标 + 描述 + 行内 model-effort 覆盖控件 + 启用开关 + 删除；`TID_SUBAGENT_ROW` / `TID_SUBAGENT_BUILT_IN_MODEL_TRIGGER` 保留）；`next-agent/SubagentEditor.tsx` 容器（状态 / 校验 / 提交）+ `SubagentBasicFields.tsx` 基础段（作用域 / 名称 / 颜色 / 模型与推理档 / 描述）+ `SubagentAdvancedFields.tsx` 高级段（折叠节头 h-9 + 工具模式摘要 + rotate-90 chevron；工具白名单 / 系统提示词 / AGENTS.md）。编辑既有 agent 时作用域锁定、推理档 `saving` 禁用等语义与旧实现逐条对齐。
    - `settings/SubagentsSection.tsx` 1872 → 638 行：收敛为「服务接线 + 列表编排」（loadAgents / 保存 / 删除 / 启用 / 覆盖刷新 / 搜索过滤 / 分组节头），从 next-agent 引入行与表单；`renderAgentList` 等标记未动。
    - 验收：`packages/ui` tsc 0 错、oxlint 0 错（39 警告=基线）；临时验收台（Intl+Tooltip）浅深 × zh/en 截图 12 张，DOM 探针：行 2 枚、内置行覆盖控件 1 枚、启用开关仅 user 行 1 枚（语义正确）、表单输入 2 枚；交互探针：高级段展开（`aria-expanded=true`）与切「自定义可用工具」后 9 个工具复选（Bash/Edit/Write 风险红点）在 zh/en × 浅深四格全部命中；无运行时错误。
    - 说明：服务字段语义检查发现并修正了提取期的一处参数混用（作用域锁定 vs saving 禁用），已按旧实现拆成 `scopeLocked` / `saving` 两个参数。
  - **A3b 实施（2026-10-12）——composer 输入外壳落位 `next-prompt/`**：
    - `git mv` 三文件：`ChatPromptActionMenu.tsx`（附件/提及动作菜单）、`usePromptEditorDragState.ts`、`useComposerToolbarFit.ts` → `next-prompt/`；旧路径（`prompt-editor/*`）全部改为一行 re-export（调用点 `ConversationComposer` / `ConversationRowView` 不变）。
    - `next-prompt/ChatPromptEditor.tsx`（外壳实现）：结构 = 输入域（LexicalChatInput）+ 附件（动作菜单 + 拖拽投放）+ 模式/模型行（leading 插槽 + 收起优先级工具栏）；拖拽反馈覆层与「取消 / 第二动作 / 主提交」拆入 `next-prompt/ChatPromptComposerParts.tsx`——**去掉原文件头的 `oxlint-disable max-lines`**（拆后合规，无 disable）。类名、props、testid（`TID_CHAT_SEND_BUTTON` 默认）与旧实现逐条一致，零视觉差。
    - 验收：`packages/ui` tsc 0 错、oxlint 0 错（39 警告=基线）；临时验收台（Intl+Tooltip+TabStore+Platform+Service 惰性桩）四态 × 浅深 × zh/en 截图 4 张，DOM 探针：编辑器 4 枚、动作菜单/提交按钮 2 枚、拖拽覆层命中、提交中 spinner 命中、testid 4 枚；`pageerror=0`。注：验收台的服务桩按路径缓存（否则服务对象每次新建会触发 useEffect 无限循环），此为验收台实现细节、与产品代码无关。
  - **`Subagent*SidePane`（核对结论：已是自研形态，不改）**：`app-shell/SubagentDirectorySidePane.tsx` = 子代理目录抽屉（运行中 / 已结束两组节头 + 状态灯 + 相对时间 + 加载更多 + 空态/错误），`SubagentSessionSidePane.tsx` = scope 薄壳（memo + `V4PaneConversationProvider` + SessionPane readOnly）。两者均无上游派生、无死令牌，排版与本轮各模块同源，无需重写。

### 2.4 P5 排版收敛（滚动切片）

- **P5-1 非 `text-ui-*` 字号收敛（2026-10-12）**：按 DESIGN.md「All interface typography must use the dedicated `text-ui-*` scale（仅 code/Diff/terminal 内容例外）」做全包扫描（排除 `components/ui/*` 三方原语），修掉全部可按语义归位的字面量：
  - **对话框/一级标题 `text-lg` → `text-ui-xl`**（18px = 18px，默认零视觉差、且随 `--ui-font-size` 缩放）：`GitActionMenu`、`BotsDialog`、`git-branch-switcher/GitBranchDialogs` ×3、`RemoteConnectionWizardChrome`、`onboarding/OnboardingDialogParts`（向导节头）、`ErrorBoundary`（应用错误标题）；`v4/ConversationComposer` 队列确认标题 `text-xl sm:text-2xl` → `text-ui-xl`；`onboarding/OnboardingFlowParts` 完成页标题 `text-2xl` → `text-ui-xl`。
  - **Coding Plan 价格标题 `text-lg font-semibold` → `text-ui-xl`**（`settings/model-provider-section/Detail.tsx` ×3：售罄横幅 / 英文价 / 中文金额段）。
  - **CUA 工具卡（A1 未覆盖的卡内排版）**：`cuaDetails`（dl `text-sm`→`text-ui-base`；7 处 h4 `text-sm`→`text-ui-sm`；结果行/说明段 `text-sm`→`text-ui-base`）、`cuaListDetails`（条目名/窗口标题→`text-ui-base`；活跃标记/主窗·焦点标记/尺寸→`text-ui-sm`；h4→`text-ui-sm`）、`CuaScreenshotSection`（h4/空态→`text-ui-sm`；dl→`text-ui-base`）。
  - **其余**：`previewPaneOfficeXlsxContent` 错误文案 ×2 `text-sm`→`text-ui-base`。
  - **暂缓清单（记给对应面 P5 重写时定夺，均为 display/hero 层，超出 `text-ui-*` 上限 18px）**：`SettingsPage:1629` 分区大标题（2xl/3xl）、`PluginStorePage:399` 与 `PluginStoreDetailView:134` 页 h1、`OnboardingWelcomeView:27` 欢迎 hero（4xl）、`OnboardingWelcomeAsciiVisual:18` 项目选择器 hero（3xl）、`StartPlanCard:54`/`Detail:1026` 指标数字（2xl）、`ConversationDraftEmptyState:202` greeting 测量镜像（动态字号体系 `--v4-draft-greeting-font-size`，非静态排版）。处理方式二选一：为展示层补 token，或在各面重写时按现有 hero 设计拍板降档——不在切片阶段擅自压平页面层级。
  - 验收：`packages/ui` tsc 0 错、oxlint 0 错（39 警告=基线）；复扫：除上述暂缓清单外，非三方文件已无 `text-xs/sm/base/lg/xl/2xl/3xl/4xl` 字面量（`text-ui-*` 与自定义 `text-mobile-input-safe` 不受影响）。

### 2.5 P5 死代码清账（滚动切片）

- **P5-2 ai-elements 死代码清账（2026-10-12）**：A2b/A3 落地后对 `components/ai-elements/*` 做了一次**导入图可达性审计**（非人工目测），把「上游派生但已无任何消费方」的文件整批移除——46 文件 → **16 可达 / 30 零消费方（删除）**：
  - 审计口径：对 `packages/ui/src` 全量文件解析 `import` / 动态 `import()` 说明符（`@/` 别名与相对路径都按真实文件解析、`.js → .ts/.tsx` 映射），以 ai-elements 目录之外的全部文件为种子做闭包；再全仓（`packages/*/src`、`scripts`、`tests`、`e2e`，含测试与 html/json）逐名复核删除名单无任何字面引用。
  - 删除名单（30）：`agent`、`artifact`、`canvas`、`checkpoint`、`commit`、`confirmation`、`connection`、`controls`、`conversation`、`edge`、`image`、`node`、`panel`、`persona`、`plan`、`prompt-input`（含 actions / buttons / primitives / textarea 四件套）、`queue`、`sandbox`、`shimmer`、`snippet`、`sources`、`suggestion`、`task`、`terminal`、`test-results`、`toolbar`。
  - 复扫证据：删除后可达性重跑 = 16/16 全可达、不可达 0；全包带「Derived from vercel/ai-elements」出处头的文件只剩 **11 个（ai-elements 6 + next-message 5），全部在真实渲染路径上**。
  - **更正 §2.3 A2 盘点的旧结论**：「conversation.tsx 是 ZCode 侧本就要用的外壳（StickToBottom + cn 薄壳）」经审计不成立——`use-stick-to-bottom` 在包内仅被该文件自身引用、零消费方，聊天列渲染并未消费它，随该批一并删除。
  - 合规面：`THIRD-PARTY-NOTICES.md` 对 ai-elements 是**目录级登记**（`packages/ui/src/components/ai-elements`），保留的 `message / code-block / attachments / context / reasoning / tool` 仍为派生文件、登记继续有效；`packages/ui/package.json` 的 `./message` 导出指向保留的 barrel，未动。
  - 验收：`packages/ui` tsc 0 错（exit 0）、oxlint 0 错（39 警告=基线）。

- **P5-3 触屏可发现性补齐（2026-10-12）**：按 A2c 既定标准（「点不动 = 阈值；`(hover: none)` 兜底」）全包扫「hover-only 显现」条目，逐点判定「动作闸口（触屏不可发现）/ 仅提示（有替代路径）」，只修闸口，不churn 提示层：
  - **附件删除入口（v4/composer，5 处）**：`ContextAttachmentPill` 的「移除全部」X、`CodeCommentAttachmentChip` / `ConversationSelectionReferenceChip` / `PptxElementReferenceChip` / `WebElementContextAttachmentChip` 浮层内逐条删除 → 补 `[@media(hover:none)]:opacity-100`（同目录 `ConversationComposer:1945` 早已有此兜底，本轮把同族补齐）。
  - **侧栏草稿行（workspace-grouped-tasks/draft-task-row）**：绿点→X 的换装原为 `hidden + group-hover:flex`，触屏无法丢弃草稿 → 改为 task-row 同款 `matchMedia("(hover: none)")` 初始化判定：触屏常显 X、绿点让位；桌面维持悬停换装（零差）。
  - **空态项目芯片分离按钮（ChatEmptyState）**：`pointer-events-none + opacity-0` hover 显现 → 补 `[@media(hover:none)]:opacity-100/pointer-events-auto`。
  - **判定为「仅提示、有替代路径、不改」**：`ToolSummaryRow` / `reasoning` / `WorkflowWorkspaceCard` 的 chevron（整行可点）、`V4ComposerModeControls` 灯泡→X（按钮本体常显可点）、`TaskInteractionBadge` 悬停换 snooze 文案（点击即 snooze）、`markdown-table` 虚拟滚动条（触摸可滚内容）、`ResponsiveBrowserResizeHandles`（鼠标拖拽物理手势）。
  - 验收：`packages/ui` tsc 0 错、oxlint 0 错（39 警告=基线）；临时验收台（三芯片 + 草稿行，zh-CN）双上下文实测：**桌面** idle 移除 X=opacity 0 → 悬停=1、浮层内行悬停 Trash=1、草稿行 X 悬停显现且绿点让位；**触屏（CDP `hover:none/pointer:coarse` 于加载前注入）** 三枚移除 X=1 常显、草稿行 X 常显且点击命中 `onClose`、浮层内两条 Trash=1；两上下文 `pageerror=0`；截图 6 张（`p5-3-desktop-*` / `p5-3-touch-*`）。

- **P5 扫描覆盖结论（2026-10-12 滚动）**：对「设置页 sections / 侧栏任务列（workspace-grouped-tasks + WorkspaceSidebar）/ 外壳（WorkspaceShellLayout、App）」按已定族的只读侦察收口——**死令牌、非 `text-ui-*` 字号、硬编码中文文案、hover-only 动作闸口、折叠节头（h-9 + `rotate-90`）/分段触发惯例** 五族均无真实偏差，未做无据改动。残余仅 §2.4 的 7 处 display/hero 字号（按规范「不在切片阶段压平」，留对应面重写时按两选项拍板）。

## 3. 组件清单（命名与落位）

- 命名：`next-<domain>-<Component>`；目录 `packages/ui/src/next-<domain>/`（如 `next-workflow/`、`next-cua/`、`next-agent/`）。
- **落位策略：并置替换**——新实现与旧实现并存；旧入口文件（导出点）改为 re-export 新实现，调用点与 testid 不变；每模块可独立灰度与回滚。
- 组件骨架在各模块启动（P2+）时按本节命名与布局创建；首个模块（W1）即作为模式样板。
- 底座复用：`components/ui/*`、`ControlHintTooltip`、`logger`、`useZCodeIntl`；不新建平行原语。

## 4. 可访问性、键盘与双语

- 折叠/展开：按钮 + `aria-expanded`，焦点环 `focus-visible:ring-2 ring-ring/40`；账本/列表行键盘可达（Enter/Space 展开）。
- 运行态变化用 `role="status"` / `aria-live`（节流，避免刷屏）。
- 快捷键沿用既有 label 注入（如 `toggleSidePaneShortcutLabel`）；不新增全局快捷键。
- 文案：`zh-CN.ts` 唯一主源，`en-US.ts` 同步同 key；单复数各自一个 key（仓库惯例）；技术值（路径、命令、标识符）用 `font-mono`。

## 5. 与 DESIGN.md / 令牌的关系

- 令牌与排版规则以 `DESIGN.md` 为唯一权威；本规范不改令牌。
- `DESIGN.md` 增补「自研重写 v2」章（指针 + 边界 + 惯例）。
- 既有「渐进披露 / 折叠摘要行」规范继续有效：折叠节头 = h-9 行 + 收起态摘要提示 + `rotate-90` chevron。

## 6. 验收口径（每模块）

- 契约零改动（diff 仅 `packages/ui` 渲染层 + 必要的 `packages/desktop` 构建配置）；`pnpm typecheck` / `pnpm lint` 不新增 error。
- 本机 UOS 真机截图（浅/深、zh/en）逐模块验收；Windows 真机出包验收（复用 P0 修复后的打包链路）。
- testid 保留；i18n 双语同步。