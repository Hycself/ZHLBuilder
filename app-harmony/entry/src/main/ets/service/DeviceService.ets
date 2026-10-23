import { zhlDelete, zhlGet, zhlPost } from './Http';
import { ZhlCapabilities, ZhlClaimData, ZhlDevice, ZhlPinSessionData } from '../model/Types';

/**
 * 设备相关接口（/api/builder/devices*）。
 * 字段名与返回结构以服务端 BuilderController / BuilderHubService 为准。
 */

export interface ZhlClaimBody {
  pairCode: string;
  pin: string;
}

export interface ZhlVerifyPinBody {
  pin: string;
}

export interface ZhlChangePinBody {
  currentPin: string;
  newPin: string;
}

function zhlDeviceListOf(data: Object): Array<ZhlDevice> {
  if (Array.isArray(data)) {
    return data as Array<ZhlDevice>;
  }
  return [];
}

/** 我的设备列表（JWT，无需 PIN 会话） */
export async function zhlDeviceList(): Promise<Array<ZhlDevice>> {
  const data: Object = await zhlGet('/api/builder/devices');
  return zhlDeviceListOf(data);
}

/** 扫码后认领设备：消费配对码并设置 6 位 PIN */
export async function zhlDeviceClaim(pairCode: string, pin: string): Promise<ZhlClaimData> {
  const body: ZhlClaimBody = { pairCode: pairCode, pin: pin };
  const data: Object = await zhlPost('/api/builder/devices/claim', body);
  return data as ZhlClaimData;
}

/** 校验设备 PIN → 15 分钟会话 token */
export async function zhlDeviceVerifyPin(deviceId: number, pin: string): Promise<ZhlPinSessionData> {
  const body: ZhlVerifyPinBody = { pin: pin };
  const data: Object = await zhlPost(`/api/builder/devices/${deviceId}/verify-pin`, body);
  return data as ZhlPinSessionData;
}

/** 修改 PIN（需当前 PIN） */
export async function zhlDeviceChangePin(deviceId: number, currentPin: string, newPin: string): Promise<void> {
  const body: ZhlChangePinBody = { currentPin: currentPin, newPin: newPin };
  await zhlPost(`/api/builder/devices/${deviceId}/pin`, body);
}

/** 设备实时状态（含 agentState：running / not_started / offline） */
export async function zhlDeviceStatus(deviceId: number, pinSession: string): Promise<ZhlDevice> {
  const data: Object = await zhlGet(`/api/builder/devices/${deviceId}/status`, pinSession);
  return data as ZhlDevice;
}

/** 设备上报的模型目录与权限模式（诚实规则见规格 §七之三） */
export async function zhlDeviceCapabilities(deviceId: number, pinSession: string): Promise<ZhlCapabilities> {
  const data: Object = await zhlGet(`/api/builder/devices/${deviceId}/models`, pinSession);
  return data as ZhlCapabilities;
}

/** 解绑设备 */
export async function zhlDeviceUnpair(deviceId: number): Promise<void> {
  await zhlDelete(`/api/builder/devices/${deviceId}`);
}