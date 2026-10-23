import { zhlGet, zhlPost } from './Http';
import { ZhlLoginData, ZhlRegisterData, ZhlUserInfo } from '../model/Types';
import {
  zhlClearToken,
  zhlGetProfileJson,
  zhlGetToken,
  zhlSetCachedAccount,
  zhlSetProfileJson,
  zhlSetToken,
} from './SessionStore';

/**
 * 认证：登录 / 邮箱验证码 / 注册 / 退出。
 * 字段名与约束以服务端 DTO 为准（LoginRequest / SendEmailCodeRequest / RegisterRequest / JoinInfoVO）。
 */

/** ArkTS 不允许无类型对象字面量，请求体都先声明类型 */
export interface ZhlLoginBody {
  account: string;
  password: string;
}

export interface ZhlSendCodeBody {
  email: string;
}

export interface ZhlRegisterBody {
  username: string;
  callsign: string;
  email: string;
  password: string;
  emailCode: string;
}

export async function zhlAuthLogin(account: string, password: string): Promise<ZhlLoginData> {
  const body: ZhlLoginBody = { account: account, password: password };
  const data: Object = await zhlPost('/api/auth/login', body);
  const login: ZhlLoginData = data as ZhlLoginData;
  await zhlSetToken(login.token ?? '');
  await zhlSetCachedAccount(account);
  const user: ZhlUserInfo | undefined = login.user;
  if (user !== undefined) {
    await zhlSetProfileJson(JSON.stringify(user));
  }
  AppStorage.setOrCreate('zhlAuthState', 'loggedIn');
  return login;
}

export async function zhlAuthSendEmailCode(email: string): Promise<void> {
  const body: ZhlSendCodeBody = { email: email };
  await zhlPost('/api/auth/send-email-code', body);
}

export async function zhlAuthRegister(body: ZhlRegisterBody): Promise<ZhlRegisterData> {
  const data: Object = await zhlPost('/api/auth/register', body);
  const raw: ZhlRegisterData = data as ZhlRegisterData;
  // 规格 §三：botToken 是机器人管理令牌、服务端凭据，客户端拿到必须丢弃。
  // 这里显式白名单化返回，botToken 不进任何变量、不落盘、不打日志。
  const safe: ZhlRegisterData = {
    status: raw.status,
    joinCode: raw.joinCode,
    joinCodeExpire: raw.joinCodeExpire,
    username: raw.username,
    callsign: raw.callsign,
    isFirstAdmin: raw.isFirstAdmin,
  };
  return safe;
}

export async function zhlAuthLogout(): Promise<void> {
  await zhlClearToken();
  await zhlSetProfileJson('');
  AppStorage.setOrCreate('zhlAuthState', 'loggedOut');
}

/** 本地缓存的账号资料（我的页账号卡先渲染缓存，再向后端刷新） */
export function zhlLoadProfile(): ZhlUserInfo | undefined {
  const json: string = zhlGetProfileJson();
  if (json.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(json) as ZhlUserInfo;
  } catch (e) {
    return undefined;
  }
}

/** GET /api/user/me → UserVO（等级名/积分/余额/飞行小时都在这里） */
export async function zhlRefreshProfile(): Promise<ZhlUserInfo> {
  const data: Object = await zhlGet('/api/user/me');
  const user: ZhlUserInfo = data as ZhlUserInfo;
  await zhlSetProfileJson(JSON.stringify(user));
  return user;
}

export async function zhlHasToken(): Promise<boolean> {
  const token: string = await zhlGetToken();
  return token.length > 0;
}