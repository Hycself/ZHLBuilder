import { http } from '@kit.NetworkKit';
import { preferences } from '@kit.ArkData';

/**
 * ZHL 平台 API 客户端（鸿蒙端）。
 *
 * 双重失败形态：HTTP 200 + body code != 20000 为业务失败。
 * JWT 与 PIN 会话用 preferences 持久化（后续版本可加 HUKS 加密）。
 */

export class ApiError extends Error {
  isNetwork: boolean;
  constructor(isNetwork: boolean, message: string) {
    super(message);
    this.isNetwork = isNetwork;
  }
}

let store: preferences.Preferences | null = null;

export async function getStore(ctx: Context): Promise<preferences.Preferences> {
  if (!store) {
    store = await preferences.getPreferences(ctx, 'zhlbuilder');
  }
  return store;
}

export async function getToken(ctx: Context): Promise<string> {
  return (await getStore(ctx)).getSync('jwt', '') as string;
}

export async function setToken(ctx: Context, token: string): Promise<void> {
  (await getStore(ctx)).putSync('jwt', token);
  (await getStore(ctx)).flush();
}

export async function getPinSession(ctx: Context, deviceId: number): Promise<string> {
  return (await getStore(ctx)).getSync(`pin_session_${deviceId}`, '') as string;
}

export async function setPinSession(ctx: Context, deviceId: number, token: string): Promise<void> {
  const p = await getStore(ctx);
  p.putSync(`pin_session_${deviceId}`, token);
  p.flush();
}

async function call(ctx: Context, path: string, method: string, body?: object,
                    pinSession?: string): Promise<object> {
  const baseUrl = (await getStore(ctx)).getSync('base_url', 'https://dis.zhl.asia') as string;
  const token = await getToken(ctx);
  const req = http.createHttp();
  const opt: http.HttpRequestOptions = {
    method: method as http.HttpRequestMethod,
    header: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(pinSession ? { 'X-Builder-Session': pinSession } : {}),
    } as Record<string, string>,
    readTimeout: 20000,
    connectTimeout: 15000,
    expectDataType: http.HttpDataType.STRING,
  };
  if (body) {
    opt.extraData = JSON.stringify(body);
  }
  try {
    const resp = await req.request(`${baseUrl}${path}`, opt);
    if (resp.responseCode !== 200) {
      throw new ApiError(true, `HTTP ${resp.responseCode}`);
    }
    const obj = JSON.parse(resp.result as string) as Record<string, Object>;
    if (Number(obj.code) !== 20000) {
      throw new ApiError(false, String(obj.message ?? '操作失败'));
    }
    return (obj.data ?? {}) as object;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(true, `网络异常：${String(e)}`);
  } finally {
    req.destroy();
  }
}

function asArray(data: object): Array<Record<string, Object>> {
  return Array.isArray(data) ? data as Array<Record<string, Object>> : [];
}

// ---------- 认证 ----------

export function login(ctx: Context, account: string, password: string): Promise<Record<string, Object>> {
  return call(ctx, '/api/auth/login', http.RequestMethod.POST,
    { account: account, password: password }) as Promise<Record<string, Object>>;
}

// ---------- 设备 ----------

export function myDevices(ctx: Context): Promise<Array<Record<string, Object>>> {
  return call(ctx, '/api/builder/devices', http.RequestMethod.GET).then(asArray);
}

export function claim(ctx: Context, pairCode: string, pin: string): Promise<Record<string, Object>> {
  return call(ctx, '/api/builder/devices/claim', http.RequestMethod.POST,
    { pairCode: pairCode, pin: pin }) as Promise<Record<string, Object>>;
}

export function verifyPin(ctx: Context, deviceId: number, pin: string): Promise<Record<string, Object>> {
  return call(ctx, `/api/builder/devices/${deviceId}/verify-pin`, http.RequestMethod.POST,
    { pin: pin }) as Promise<Record<string, Object>>;
}

export function deviceStatus(ctx: Context, deviceId: number, pinSession: string): Promise<Record<string, Object>> {
  return call(ctx, `/api/builder/devices/${deviceId}/status`, http.RequestMethod.GET,
    undefined, pinSession) as Promise<Record<string, Object>>;
}

export function unpair(ctx: Context, deviceId: number): Promise<object> {
  return call(ctx, `/api/builder/devices/${deviceId}`, http.RequestMethod.DELETE);
}

// ---------- 任务 ----------

export function createTask(ctx: Context, deviceId: number, pinSession: string,
                           prompt: string): Promise<Record<string, Object>> {
  return call(ctx, `/api/builder/devices/${deviceId}/tasks`, http.RequestMethod.POST,
    { prompt: prompt }, pinSession) as Promise<Record<string, Object>>;
}

export function tasks(ctx: Context, deviceId: number, pinSession: string,
                      limit: number): Promise<Array<Record<string, Object>>> {
  return call(ctx, `/api/builder/devices/${deviceId}/tasks?limit=${limit}`,
    http.RequestMethod.GET, undefined, pinSession).then(asArray);
}

export function taskOutput(ctx: Context, deviceId: number, pinSession: string,
                           taskId: number, since: number): Promise<Record<string, Object>> {
  return call(ctx, `/api/builder/devices/${deviceId}/tasks/${taskId}/output?since=${since}`,
    http.RequestMethod.GET, undefined, pinSession) as Promise<Record<string, Object>>;
}

export function stopTask(ctx: Context, deviceId: number, pinSession: string, taskId: number): Promise<object> {
  return call(ctx, `/api/builder/devices/${deviceId}/tasks/${taskId}/stop`,
    http.RequestMethod.POST, {}, pinSession);
}
