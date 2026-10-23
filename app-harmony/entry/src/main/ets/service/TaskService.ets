import { zhlDelete, zhlGet, zhlPost } from './Http';
import { ZhlEventBatch, ZhlOutputBatch, ZhlTask } from '../model/Types';

/**
 * 任务接口（/api/builder/devices/{id}/tasks*）。
 *
 *  - 事件 /events 是新的主接口（结构化：assistant_text / reasoning / tool_call / waiting_input）；
 *    /output 是纯文本降级路径，两套 seq 相互独立，游标各自维护。
 *  - 续话走 /messages（同一 threadId 追加一轮），不要用 POST /tasks 新建（那会开一个新会话）。
 */

export interface ZhlCreateTaskBody {
  prompt: string;
  modelSelection?: string;
  mode?: string;
}

export interface ZhlMessageBody {
  text: string;
  modelSelection?: string;
  mode?: string;
}

function zhlTaskListOf(data: Object): Array<ZhlTask> {
  if (Array.isArray(data)) {
    return data as Array<ZhlTask>;
  }
  return [];
}

/** 下发任务（可选 modelSelection = "providerId/modelId"，mode = build/edit/plan/yolo） */
export async function zhlTaskCreate(deviceId: number, pinSession: string, prompt: string,
                                    modelSelection: string, mode: string): Promise<ZhlTask> {
  const body: ZhlCreateTaskBody = { prompt: prompt };
  if (modelSelection.length > 0) {
    body.modelSelection = modelSelection;
  }
  if (mode.length > 0) {
    body.mode = mode;
  }
  const data: Object = await zhlPost(`/api/builder/devices/${deviceId}/tasks`, body, pinSession);
  return data as ZhlTask;
}

/** 续话：同一线程追加一轮 */
export async function zhlTaskAppendMessage(deviceId: number, pinSession: string, taskId: number,
                                           text: string, modelSelection: string, mode: string): Promise<ZhlTask> {
  const body: ZhlMessageBody = { text: text };
  if (modelSelection.length > 0) {
    body.modelSelection = modelSelection;
  }
  if (mode.length > 0) {
    body.mode = mode;
  }
  const data: Object = await zhlPost(`/api/builder/devices/${deviceId}/tasks/${taskId}/messages`,
    body, pinSession);
  return data as ZhlTask;
}

/** 最近任务列表（含 threadId / turnNo / modelSelection / mode，不用另开请求） */
export async function zhlTaskList(deviceId: number, pinSession: string, limit: number): Promise<Array<ZhlTask>> {
  const data: Object = await zhlGet(`/api/builder/devices/${deviceId}/tasks?limit=${limit}`, pinSession);
  return zhlTaskListOf(data);
}

/** 结构化事件增量（游标口径：只回 seq 大于 since 的项） */
export async function zhlTaskEvents(deviceId: number, pinSession: string, taskId: number,
                                    since: number): Promise<ZhlEventBatch> {
  const data: Object = await zhlGet(
    `/api/builder/devices/${deviceId}/tasks/${taskId}/events?since=${since}`, pinSession);
  return data as ZhlEventBatch;
}

/** 纯文本输出增量（老接口，降级用） */
export async function zhlTaskOutput(deviceId: number, pinSession: string, taskId: number,
                                    since: number): Promise<ZhlOutputBatch> {
  const data: Object = await zhlGet(
    `/api/builder/devices/${deviceId}/tasks/${taskId}/output?since=${since}`, pinSession);
  return data as ZhlOutputBatch;
}

export async function zhlTaskStop(deviceId: number, pinSession: string, taskId: number): Promise<void> {
  await zhlPost(`/api/builder/devices/${deviceId}/tasks/${taskId}/stop`, undefined, pinSession);
}

export async function zhlTaskDelete(deviceId: number, pinSession: string, taskId: number): Promise<void> {
  await zhlDelete(`/api/builder/devices/${deviceId}/tasks/${taskId}`, pinSession);
}