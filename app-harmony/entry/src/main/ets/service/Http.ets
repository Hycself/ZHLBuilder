import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { zhlGetBaseUrl, zhlGetToken } from './SessionStore';
import { ZhlApiResp } from '../model/Types';

/**
 * 中枢 HTTP 客户端（/api/builder/*、/api/auth/*）。
 *
 * 双重失败形态（与桌面端 zhl-manager、安卓端 Api.kt 一致）：
 *  - HTTP 层失败/5xx → ZhlApiError(isNetwork = true)
 *  - HTTP 200 但 body.code !== 20000 → ZhlApiError(isNetwork = false)，message 是后端
 *    给的中文原文，界面必须原样展示（规格 §七），本地不改写、不翻译。
 * 敏感操作带 X-Builder-Session（PIN 会话）头。
 */

export class ZhlApiError extends Error {
  isNetwork: boolean;

  constructor(isNetwork: boolean, msg: string) {
    super(msg);
    this.isNetwork = isNetwork;
  }
}

/** JWT 失效（登录过期）时把全局登录态置为未登录，由 Index 切回登录页 */
function zhlNotifyAuthExpired(): void {
  AppStorage.setOrCreate('zhlAuthState', 'loggedOut');
}

/** 业务成功但 data 为空时的统一空对象（ArkTS 不允许返回无类型对象字面量） */
function zhlEmptyData(): Object {
  return JSON.parse('{}') as Object;
}

function zhlLooksLikeAuthExpired(msg: string): boolean {
  return msg.indexOf('登录') >= 0 || msg.indexOf('token') >= 0 || msg.indexOf('Token') >= 0;
}

async function zhlCall(path: string, method: http.RequestMethod, body: Object | undefined,
                       pinSession: string | undefined): Promise<Object> {
  const baseUrl: string = zhlGetBaseUrl();
  const token: string = await zhlGetToken();
  const header: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token.length > 0) {
    header['Authorization'] = `Bearer ${token}`;
  }
  if (pinSession !== undefined && pinSession.length > 0) {
    header['X-Builder-Session'] = pinSession;
  }
  const options: http.HttpRequestOptions = {
    method: method,
    header: header,
    readTimeout: 20000,
    connectTimeout: 15000,
    expectDataType: http.HttpDataType.STRING,
  };
  if (body !== undefined) {
    options.extraData = JSON.stringify(body);
  }
  const request: http.HttpRequest = http.createHttp();
  try {
    const resp: http.HttpResponse = await request.request(`${baseUrl}${path}`, options);
    const text: string = resp.result as string;
    let code: number = 0;
    let message: string = '';
    let data: Object | undefined = undefined;
    if (text.length > 0) {
      try {
        const parsed: ZhlApiResp = JSON.parse(text) as ZhlApiResp;
        code = Number(parsed.code);
        message = String(parsed.message ?? '');
        data = parsed.data;
      } catch (parseErr) {
        code = 0;
      }
    }
    if (resp.responseCode !== 200) {
      if (message.length > 0) {
        if (zhlLooksLikeAuthExpired(message) || resp.responseCode === 401) {
          zhlNotifyAuthExpired();
        }
        throw new ZhlApiError(false, message);
      }
      if (resp.responseCode === 401) {
        zhlNotifyAuthExpired();
      }
      throw new ZhlApiError(true, `HTTP ${resp.responseCode}`);
    }
    if (code !== 20000) {
      if (message.length > 0 && zhlLooksLikeAuthExpired(message)) {
        zhlNotifyAuthExpired();
      }
      if (message.length > 0) {
        throw new ZhlApiError(false, message);
      }
      throw new ZhlApiError(false, '操作失败');
    }
    if (data === undefined) {
      return zhlEmptyData();
    }
    return data;
  } catch (err) {
    if (err instanceof ZhlApiError) {
      throw err;
    }
    let detail: string = String(err);
    const be: BusinessError = err as BusinessError;
    if (be.message !== undefined && be.message.length > 0) {
      detail = be.message;
    }
    throw new ZhlApiError(true, `网络异常：${detail}`);
  } finally {
    request.destroy();
  }
}

export function zhlGet(path: string, pinSession?: string): Promise<Object> {
  return zhlCall(path, http.RequestMethod.GET, undefined,
    pinSession === undefined ? '' : pinSession);
}

export function zhlPost(path: string, body: Object | undefined, pinSession?: string): Promise<Object> {
  return zhlCall(path, http.RequestMethod.POST, body,
    pinSession === undefined ? '' : pinSession);
}

export function zhlDelete(path: string, pinSession?: string): Promise<Object> {
  return zhlCall(path, http.RequestMethod.DELETE, undefined,
    pinSession === undefined ? '' : pinSession);
}

/** 统一的错误文案取用：业务失败给后端原文，网络失败给网络提示 */
export function zhlErrorText(err: Object): string {
  if (err instanceof ZhlApiError) {
    return err.message;
  }
  return String(err);
}