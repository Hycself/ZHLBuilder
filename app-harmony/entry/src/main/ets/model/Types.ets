/**
 * ZHLBuilder 鸿蒙端的数据类型。
 *
 * 字段名逐条来自中枢源码（BuilderController / BuilderHubService / entity 包），
 * 不是猜的：
 *  - 设备列表 listDevices   → id/name/platform/agentVersion/online/agentState/lastSeen/meta
 *  - 设备状态 /status       → 同上（含 agentState）
 *  - 任务列表 listTasks     → id/prompt/status/stage/exitNote/createdAt/finishedAt/threadId/turnNo/modelSelection/mode
 *  - 事件 /events           → taskId/status/stage/exitNote/events[{seq,type,ts,payload}]/lastSeq/keepEvents/truncated
 *  - 能力 /models           → deviceId/agentState/models[{id,name,provider,default}]/modes[{value,label}]/reported
 *  - 登录 /api/auth/login   → token + user（UserVO：username/callsign/level/levelName/points/balance/flightHours…）
 *
 * 时间字段后端用 LocalDateTime，Spring Boot 默认序列化为 ISO 字符串
 * （如 "2026-10-10T17:30:00"），解析统一走 common/Format.ets 的 zhlParseTime。
 */

/** 统一响应 { code, message, data }；code === 20000 才算成功 */
export interface ZhlApiResp {
  code: number;
  message?: string;
  data?: Object;
}

/** 登录返回的 user 对象（服务端 UserVO 的子集，界面真正用到的字段） */
export interface ZhlUserInfo {
  id?: number;
  username?: string;
  qq?: string;
  callsign?: string;
  email?: string;
  role?: string;
  status?: number;
  flightHours?: number;
  balance?: number;
  points?: number;
  level?: number;
  levelName?: string;
  createdAt?: Object;
}

export interface ZhlLoginData {
  token?: string;
  user?: ZhlUserInfo;
}

/**
 * 注册返回。注意：服务端还会返回 botToken（首个管理员才有），
 * 规格明令客户端必须丢弃——所以这里连字段都不声明，解析后不落地、不打日志。
 */
export interface ZhlRegisterData {
  status?: number;
  joinCode?: string;
  joinCodeExpire?: Object;
  username?: string;
  callsign?: string;
  isFirstAdmin?: boolean;
}

/** 设备（listDevices / status 共用） */
export interface ZhlDevice {
  id?: number;
  name?: string;
  platform?: string;
  agentVersion?: string;
  online?: boolean;
  agentState?: string;
  lastSeen?: Object;
  meta?: string;
}

/** 任务（listTasks / taskBrief 字段并集） */
export interface ZhlTask {
  id?: number;
  prompt?: string;
  status?: number;
  stage?: string;
  exitNote?: string;
  createdAt?: Object;
  finishedAt?: Object;
  threadId?: number;
  turnNo?: number;
  modelSelection?: string;
  mode?: string;
}

/** 结构化事件的一项 */
export interface ZhlTaskEventItem {
  seq?: number;
  type?: string;
  ts?: Object;
  payload?: Object;
}

/** 事件增量批次 */
export interface ZhlEventBatch {
  taskId?: number;
  status?: number;
  stage?: string;
  exitNote?: string;
  events?: Array<ZhlTaskEventItem>;
  lastSeq?: number;
  keepEvents?: number;
  truncated?: boolean;
}

/** 纯文本输出行（/output，降级路径） */
export interface ZhlOutputLine {
  seq?: number;
  line?: string;
}

export interface ZhlOutputBatch {
  taskId?: number;
  status?: number;
  exitNote?: string;
  lines?: Array<ZhlOutputLine>;
  lastSeq?: number;
}

/** 设备上报的模型目录一项（id 形如 providerId/modelId，默认项 default:true） */
export interface ZhlModelOption {
  id?: string;
  name?: string;
  provider?: string;
  default?: boolean;
}

/** 设备上报的权限模式一项（value 固定 build/edit/plan/yolo） */
export interface ZhlModeOption {
  value?: string;
  label?: string;
}

/** /devices/{id}/models 返回 */
export interface ZhlCapabilities {
  deviceId?: number;
  agentState?: string;
  models?: Array<ZhlModelOption>;
  modes?: Array<ZhlModeOption>;
  reported?: boolean;
}

/** /devices/claim 返回 */
export interface ZhlClaimData {
  deviceId?: number;
  name?: string;
}

/** /devices/{id}/verify-pin 返回 */
export interface ZhlPinSessionData {
  sessionToken?: string;
  ttlMinutes?: number;
}

/** 事件 payload 的常用键（服务端归一化后的窄事件集） */
export interface ZhlEventPayload {
  text?: string;
  phase?: string;
  name?: string;
  callId?: string;
  summary?: string;
  decision?: string;
  kind?: string;
  prompt?: string;
  id?: string;
  turnId?: string;
}

// ===== 路由参数（ArkTS 禁止无类型对象字面量，pushDestination 的 param 先声明类型）=====

/** 设备详情页入参 */
export interface ZhlDeviceDetailParam {
  deviceId: number;
  deviceName: string;
}

/** 任务输出页入参：threadId 用于把多轮任务聚合成一段对话 */
export interface ZhlTaskOutputParam {
  deviceId: number;
  taskId: number;
  deviceName: string;
}

/**
 * PIN 页入参。
 *  - mode = 'pair'：扫码绑定，输入两次 PIN → claim 认领设备
 *  - mode = 'gate'：进入设备会话，输一次 PIN → verifyPin 换 15 分钟会话
 *  - nextPage：解锁成功后要替换到达的页面名（空串表示只返回上一页）
 */
export interface ZhlPinGateParam {
  mode: string;
  pairCode: string;
  deviceId: number;
  deviceName: string;
  nextPage: string;
}