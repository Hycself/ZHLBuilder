import { preferences } from '@kit.ArkData';
import { huks } from '@kit.UniversalKeystoreKit';
import { util } from '@kit.ArkTS';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';

/**
 * 凭据与本地偏好存储。
 *
 * 规格 §七 硬要求：凭据一律 HUKS 加密存储，PIN 不落盘，日志不得出现 token/PIN/密码。
 *  - JWT（登录令牌）：用 HUKS 里的 AES-256-GCM 密钥加密，密文与随机 nonce 拼成
 *    "nonce.密文" 存 preferences；这是「记住我」的全部依赖，杀掉 App 重开仍保持登录。
 *  - 每台设备的 PIN 会话 token：只放内存（见下方 pinSessions），进程结束即消失，
 *    所以重开后保持登录、但进入设备操控仍要重新输 6 位 PIN。
 *  - PIN 本身只在内存里过一次，这里没有任何写 PIN 的接口。
 *  - 服务器地址、缓存账号、账号资料这类非凭据项明文存 preferences。
 *  - 本文件不打任何日志（避免凭据进日志）。
 */

const STORE_NAME: string = 'zhlbuilder';
const DEFAULT_BASE_URL: string = 'https://dis.zhl.asia';
const HUKS_ALIAS: string = 'zhl_credential_aes_gcm_v1';
const HUKS_AAD: string = 'zhlbuilder.credential.v1';

const KEY_BASE_URL: string = 'base_url';
const KEY_JWT: string = 'jwt_sealed';
const KEY_ACCOUNT: string = 'cached_account';
const KEY_PROFILE: string = 'cached_profile';

let prefs: preferences.Preferences | null = null;
let huksReady: boolean = false;
let initTask: Promise<void> | null = null;

/**
 * 应用启动时调用一次；之后所有读写都走这个实例。幂等，可重复调用、可 await。
 *
 * 为什么必须由 UIAbility.onCreate 来调，而不是页面 aboutToAppear：
 * 页面阶段 `getUIContext().getHostContext()` 可能还没就绪，拿不到 context 就打不开
 * preferences，而旧写法 `if (prefs === null) { prefs = await ... }` 一旦 reject，
 * prefs 会永远停在 null，后面每个读取都静默走 `zhlGet` 的默认值 —— token 恒为空，
 * 用户看到的就是「勾了记住我，杀掉 App 重开还是要重新登录」。
 * 现在把进行中的 Promise 缓存下来：成功就复用，失败就清掉缓存让下次能重试。
 */
export function zhlInitSessionStore(ctx: Context): Promise<void> {
  const running: Promise<void> | null = initTask;
  if (running !== null) {
    return running;
  }
  const task: Promise<void> = preferences.getPreferences(ctx, STORE_NAME)
    .then((instance: preferences.Preferences) => {
      prefs = instance;
    })
    .catch((err: Error) => {
      initTask = null;
      throw err;
    });
  initTask = task;
  return task;
}

/**
 * 登录门在首帧之前等的就是这个 Promise。
 * EntryAbility.onCreate 一定早于 loadContent，所以正常路径下 initTask 已存在；
 * 兜底 resolve 只是保证「万一没初始化过」时页面不会永远卡在恢复中。
 */
export function zhlSessionStoreReady(): Promise<void> {
  const running: Promise<void> | null = initTask;
  if (running === null) {
    return Promise.resolve();
  }
  return running;
}

function zhlPrefs(): preferences.Preferences | null {
  return prefs;
}

async function zhlPut(key: string, value: string): Promise<void> {
  const p: preferences.Preferences | null = zhlPrefs();
  if (p === null) {
    return;
  }
  p.putSync(key, value);
  await p.flush();
}

async function zhlRemove(key: string): Promise<void> {
  const p: preferences.Preferences | null = zhlPrefs();
  if (p === null) {
    return;
  }
  p.deleteSync(key);
  await p.flush();
}

function zhlGet(key: string, defValue: string): string {
  const p: preferences.Preferences | null = zhlPrefs();
  if (p === null) {
    return defValue;
  }
  return p.getSync(key, defValue) as string;
}

// ===== HUKS 封装 =====

function zhlKeyProps(): Array<huks.HuksParam> {
  const props: Array<huks.HuksParam> = [];
  props.push({ tag: huks.HuksTag.HUKS_TAG_ALGORITHM, value: huks.HuksKeyAlg.HUKS_ALG_AES });
  props.push({ tag: huks.HuksTag.HUKS_TAG_KEY_SIZE, value: huks.HuksKeySize.HUKS_AES_KEY_SIZE_256 });
  props.push({
    tag: huks.HuksTag.HUKS_TAG_PURPOSE,
    value: huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_ENCRYPT | huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_DECRYPT,
  });
  props.push({ tag: huks.HuksTag.HUKS_TAG_PADDING, value: huks.HuksKeyPadding.HUKS_PADDING_NONE });
  props.push({ tag: huks.HuksTag.HUKS_TAG_BLOCK_MODE, value: huks.HuksCipherMode.HUKS_MODE_GCM });
  return props;
}

/** 生成（或复用）用于凭据加密的设备级密钥，密钥本身不出 HUKS */
async function zhlEnsureKey(): Promise<void> {
  if (huksReady) {
    return;
  }
  const exist: boolean = await huks.isKeyItemExist(HUKS_ALIAS, { properties: zhlKeyProps() });
  if (!exist) {
    await huks.generateKeyItem(HUKS_ALIAS, { properties: zhlKeyProps() });
  }
  huksReady = true;
}

function zhlUtf8(text: string): Uint8Array {
  const encoder: util.TextEncoder = new util.TextEncoder();
  return encoder.encodeInto(text);
}

function zhlFromUtf8(data: Uint8Array): string {
  const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
  return decoder.decodeToString(data);
}

function zhlRandomBytes(len: number): Uint8Array {
  const random: cryptoFramework.Random = cryptoFramework.createRandom();
  return random.generateRandomSync(len).data;
}

function zhlB64(data: Uint8Array): string {
  const helper: util.Base64Helper = new util.Base64Helper();
  return helper.encodeToStringSync(data, util.Type.BASIC);
}

function zhlUnB64(text: string): Uint8Array {
  const helper: util.Base64Helper = new util.Base64Helper();
  return helper.decodeSync(text, util.Type.BASIC);
}

async function zhlSeal(plain: string): Promise<string> {
  await zhlEnsureKey();
  const nonce: Uint8Array = zhlRandomBytes(12);
  const props: Array<huks.HuksParam> = zhlKeyProps();
  props.push({ tag: huks.HuksTag.HUKS_TAG_NONCE, value: nonce });
  props.push({ tag: huks.HuksTag.HUKS_TAG_ASSOCIATED_DATA, value: zhlUtf8(HUKS_AAD) });
  const options: huks.HuksOptions = { properties: props, inData: zhlUtf8(plain) };
  const handle: huks.HuksSessionHandle = await huks.initSession(HUKS_ALIAS, options);
  const result: huks.HuksReturnResult = await huks.finishSession(handle.handle, options);
  const cipher: Uint8Array = result.outData ?? new Uint8Array(0);
  return `${zhlB64(nonce)}.${zhlB64(cipher)}`;
}

async function zhlOpen(sealed: string): Promise<string> {
  await zhlEnsureKey();
  const dot: number = sealed.indexOf('.');
  if (dot <= 0) {
    return '';
  }
  const nonce: Uint8Array = zhlUnB64(sealed.substring(0, dot));
  const cipher: Uint8Array = zhlUnB64(sealed.substring(dot + 1));
  const props: Array<huks.HuksParam> = zhlKeyProps();
  props.push({ tag: huks.HuksTag.HUKS_TAG_NONCE, value: nonce });
  props.push({ tag: huks.HuksTag.HUKS_TAG_ASSOCIATED_DATA, value: zhlUtf8(HUKS_AAD) });
  const options: huks.HuksOptions = { properties: props, inData: cipher };
  const handle: huks.HuksSessionHandle = await huks.initSession(HUKS_ALIAS, options);
  const result: huks.HuksReturnResult = await huks.finishSession(handle.handle, options);
  const plain: Uint8Array = result.outData ?? new Uint8Array(0);
  return zhlFromUtf8(plain);
}

// ===== 非凭据项 =====

export function zhlGetBaseUrl(): string {
  return zhlGet(KEY_BASE_URL, DEFAULT_BASE_URL);
}

export async function zhlSetBaseUrl(url: string): Promise<void> {
  const trimmed: string = url.trim();
  if (trimmed.length === 0) {
    await zhlPut(KEY_BASE_URL, DEFAULT_BASE_URL);
    return;
  }
  await zhlPut(KEY_BASE_URL, trimmed);
}

/** 登录页「还没有账号？去注册」用：注册成功后回登录页保留已填账号 */
export function zhlGetCachedAccount(): string {
  return zhlGet(KEY_ACCOUNT, '');
}

export async function zhlSetCachedAccount(account: string): Promise<void> {
  await zhlPut(KEY_ACCOUNT, account);
}

/** 账号资料（我的页账号卡）：非凭据，明文缓存，进入我的页时会向后端刷新 */
export function zhlGetProfileJson(): string {
  return zhlGet(KEY_PROFILE, '');
}

export async function zhlSetProfileJson(json: string): Promise<void> {
  await zhlPut(KEY_PROFILE, json);
}

// ===== 凭据项（HUKS 加密）=====

function zhlSealedGet(key: string): string {
  return zhlGet(key, '');
}

export async function zhlGetToken(): Promise<string> {
  const sealed: string = zhlSealedGet(KEY_JWT);
  if (sealed.length === 0) {
    return '';
  }
  try {
    return await zhlOpen(sealed);
  } catch (e) {
    // 密文损坏或设备不支持 HUKS：当作未登录，让用户重新登录，不做静默降级
    return '';
  }
}

export async function zhlSetToken(token: string): Promise<void> {
  if (token.length === 0) {
    await zhlRemove(KEY_JWT);
    return;
  }
  try {
    await zhlPut(KEY_JWT, await zhlSeal(token));
  } catch (e) {
    await zhlRemove(KEY_JWT);
  }
}

export async function zhlClearToken(): Promise<void> {
  await zhlRemove(KEY_JWT);
}

// ===== PIN 会话（只在内存，不落盘）=====

/**
 * `verify-pin` 换来的 15 分钟操作凭据存在这里，进程结束即消失。
 *
 * 为什么不加密落盘（旧实现落过盘）：它等价于「输对 PIN 的门票」。一旦持久化，
 * 杀掉 App 重开就能在 TTL 内免 PIN 直接下发任务、看输出，跟规格 §七「PIN 不落盘」
 * 和验收第 6 条「重开仍保持登录，但进入设备操控仍需 PIN」直接冲突。
 * 登录态（JWT）继续加密落盘，PIN 门槛只靠这段内存态维持。
 */
const pinSessions: Map<number, string> = new Map<number, string>();

// 下面三个函数保持 async 只为兼容既有调用方（都是 `.then()` 写法）；
// 内存读写本身是同步的，别把它们改成同步函数而漏改 6 处调用点。
export async function zhlGetPinSession(deviceId: number): Promise<string> {
  const cached: string | undefined = pinSessions.get(deviceId);
  if (cached === undefined) {
    return '';
  }
  return cached;
}

export async function zhlSetPinSession(deviceId: number, sessionToken: string): Promise<void> {
  if (sessionToken.length === 0) {
    pinSessions.delete(deviceId);
    return;
  }
  pinSessions.set(deviceId, sessionToken);
}

export async function zhlClearPinSession(deviceId: number): Promise<void> {
  pinSessions.delete(deviceId);
}