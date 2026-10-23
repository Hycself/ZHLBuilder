import { BrowserWindow, app, safeStorage } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { net } from "electron";

/**
 * ZHLBuilder 桌面端 ZHL 账号登录（签派 OAuth2，公共客户端 + PKCE + 应用内授权页）。
 *
 * 流程：主窗口就绪后弹模态登录门 → 门内 WebView 打开
 *   https://dis.zhl.asia/#/oauth2/authorize?client_id=zhlbuilder-desktop&...
 * 用户在签派页登录并授权 → 重定向 loopback 回调（被拦截，不真正出网）→
 * 主进程用 code 换令牌 → safeStorage 落盘 → 关门。
 *
 * 「暂不登录」走挽留二次确认；跳过后本次启动不再弹，主窗口标题加 [未登录]。
 */

const AUTHORIZE_URL = "https://dis.zhl.asia/#/oauth2/authorize";
const TOKEN_URL = "https://dis.zhl.asia/api/oauth2/token";
const USERINFO_URL = "https://dis.zhl.asia/api/oauth2/userinfo";
const CLIENT_ID = "zhlbuilder-desktop";
// 单独具名而不是取 LOOPBACK_PREFIXES[0]：base 开了 noUncheckedIndexedAccess，
// 下标读出来是 string | undefined，而这三处都当 string 用（redirect_uri 必须与
// 授权时完全一致），具名常量既没有类型噪音也不会让人误以为这里可能为空。
const LOOPBACK_REDIRECT_URI = "http://127.0.0.1:8540/callback";
const LOOPBACK_PREFIXES = [
  LOOPBACK_REDIRECT_URI,
  "http://127.0.0.1:8541/callback",
  "http://127.0.0.1:8542/callback",
];
const AUTH_FILE = () => join(app.getPath("userData"), "zhl-auth.json");

export interface ZhlIdentity {
  username: string;
  accessToken: string;
  refreshToken: string;
}

let cachedIdentity: ZhlIdentity | null | undefined;

export function loadZhlIdentity(): ZhlIdentity | null {
  if (cachedIdentity !== undefined) return cachedIdentity;
  try {
    const p = AUTH_FILE();
    if (!existsSync(p)) {
      cachedIdentity = null;
      return null;
    }
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const token = safeStorage.decryptString(Buffer.from(raw.accessTokenEnc, "base64"));
    cachedIdentity = {
      username: String(raw.username ?? ""),
      accessToken: token,
      refreshToken: String(raw.refreshToken ?? ""),
    };
  } catch {
    cachedIdentity = null;
  }
  return cachedIdentity;
}

export function isZhlLoginSkipped(): boolean {
  const p = join(app.getPath("userData"), "zhl-gate.json");
  try {
    return JSON.parse(readFileSync(p, "utf8")).skipped === true;
  } catch {
    return false;
  }
}

function persistIdentity(identity: ZhlIdentity): void {
  // safeStorage 不可用时绝不退化成 base64 落盘：那不是加密，只是把访问令牌和
  // refresh token 换成一种看起来像密文的写法留在 %APPDATA% 里。
  // 之前正是这条退化路径让 loadZhlIdentity 下一次启动必然 decryptString 抛错，
  // 令牌既没保护也没能用上，还白留在磁盘上。现在只在内存里持有，下次启动重新登录。
  if (!safeStorage.isEncryptionAvailable()) {
    cachedIdentity = identity;
    console.warn("[zhl-gate] 系统安全存储不可用，令牌仅保留在本次进程内存中，不写盘");
    return;
  }
  const enc = safeStorage.encryptString(identity.accessToken).toString("base64");
  writeFileSync(AUTH_FILE(), JSON.stringify({ username: identity.username, accessTokenEnc: enc, refreshToken: identity.refreshToken }, null, 2), "utf8");
  cachedIdentity = identity;
}

function persistSkipped(): void {
  writeFileSync(join(app.getPath("userData"), "zhl-gate.json"), JSON.stringify({ skipped: true }), "utf8");
}

/**
 * 登出：清掉本地身份，并把"跳过登录门"的标记一起复位。
 *
 * 复位 skipped 是必须的——之前有人点过"跳过"，只删 token 的话下次启动仍然不进
 * 登录门，用户会以为登出没生效。refreshToken 只在本地删除；服务端令牌的自然过期
 * 由签派侧 OAuth 生命周期负责，本 fork 没有接吊销端点，这里不假装调用了它。
 */
export function clearZhlIdentity(): void {
  try {
    if (existsSync(AUTH_FILE())) rmSync(AUTH_FILE());
  } catch (e) {
    console.warn("[zhl-gate] 删除身份文件失败", e);
  }
  try {
    const gate = join(app.getPath("userData"), "zhl-gate.json");
    if (existsSync(gate)) rmSync(gate);
  } catch (e) {
    console.warn("[zhl-gate] 复位跳过标记失败", e);
  }
  cachedIdentity = null;
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

const GATE_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:"HarmonyOS Sans SC","Microsoft YaHei",sans-serif; }
  body { background:#05090F; color:#E6EDF6; height:100vh; display:flex; align-items:center; justify-content:center; }
  .card { width: 360px; text-align:center; }
  .logo { width:84px; height:84px; margin:0 auto 20px; border-radius:20px; display:grid; place-items:center;
          background:linear-gradient(135deg,#123047,#0A1B2B); border:1px solid rgba(34,211,238,.35);
          box-shadow:0 0 50px rgba(34,211,238,.25); }
  .logo img { width:56px; }
  h1 { font-size:24px; font-weight:800; letter-spacing:1px; }
  .sub { color:#8CA0B8; font-size:13px; margin-top:10px; line-height:1.7; }
  .btn { display:block; width:100%; margin-top:16px; padding:13px 0; border-radius:10px; font-size:15px; font-weight:700;
         cursor:pointer; border:none; }
  .primary { background:#22D3EE; color:#06222B; }
  .primary:hover { filter:brightness(1.1); }
  .ghost { background:transparent; color:#8CA0B8; border:1px solid #1B2839; }
  .ghost:hover { color:#E6EDF6; }
  .retention { display:none; margin-top:16px; padding:14px; border:1px solid #FBBF24; border-radius:10px;
               color:#FBBF24; font-size:13px; line-height:1.7; text-align:left; }
  .retention .btn { margin-top:10px; }
  .status { margin-top:16px; color:#8CA0B8; font-size:13px; min-height:20px; }
  .err { color:#F87171; }
</style></head>
<body><div class="card">
  <div class="logo"><img src="https://dis.zhl.asia/assets/xfszhl-logo-CzNsnBtm.png" onerror="this.style.display='none'"></div>
  <h1>登录 ZHL 账号</h1>
  <div class="sub">登录后可使用设备绑定与远程任务。<br>将跳转至签派站 (dis.zhl.asia) 完成授权。</div>
  <button class="btn primary" id="go">使用 ZHL 账号登录</button>
  <button class="btn ghost" id="skip">暂不登录</button>
  <div class="retention" id="retention">
    确定跳过？未登录将无法使用：<br>· 设备绑定与远程任务<br>· 账号同步与后续新功能
    <button class="btn ghost" id="back">返回登录</button>
    <button class="btn ghost" id="skip2">仍要跳过</button>
  </div>
  <div class="status" id="status"></div>
</div>
<script>
  const st = document.getElementById('status');
  // 状态通道：门窗口没有 preload，原先这里调 window.zhlGate.onStatus(...) 是不存在的桥，
  // 一行就抛错，于是 state 校验失败/令牌交换失败永远看不见。改由主进程 executeJavaScript 调用。
  window.__setStatus = (msg, isErr) => {
    st.textContent = msg;
    st.className = 'status' + (isErr ? ' err' : '');
  };
</script></body></html>`;

export interface ZhlGateResult {
  kind: "logged-in" | "skipped";
  identity?: ZhlIdentity;
}

/** 弹模态登录门；解析为登录结果或跳过。 */
export function ensureZhlLogin(parent: BrowserWindow): Promise<ZhlGateResult> {
  return new Promise((resolveGate) => {
    let settled = false;
    let detachLoopback: () => void = () => undefined;
    const finish = (result: ZhlGateResult) => {
      if (settled) return;
      settled = true;
      // 回调装在 session 上，而门窗口用的就是主窗口的默认 session：不摘掉的话
      // 整个应用生命周期内 127.0.0.1:8540-8542/callback* 都会被取消，并且每走一次
      // 登录门就叠一层——旧那层持着上一次的 state，会先把新回调判成"state 校验失败"。
      detachLoopback();
      try { gate.close(); } catch { /* 已关闭 */ }
      resolveGate(result);
    };

    const gate = new BrowserWindow({
      width: 460,
      height: 620,
      parent,
      modal: true,
      show: false,
      resizable: false,
      title: "登录 ZHLBuilder",
      backgroundColor: "#05090F",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    gate.once("ready-to-show", () => gate.show());
    gate.on("closed", () => finish({ kind: "skipped" }));

    // 授权页重定向到 loopback 回调时拦截 code（不真正出站）
    const { verifier, challenge } = pkce();
    const state = randomBytes(16).toString("hex");
    const gateSession = gate.webContents.session;
    const loopbackFilter = { urls: LOOPBACK_PREFIXES.map((p) => p + "*") };
    detachLoopback = () => {
      try {
        gateSession.webRequest.onBeforeRequest(loopbackFilter, null);
      } catch { /* session 已销毁 */ }
    };

    const pushStatus = (msg: string, isErr: boolean): void => {
      if (gate.isDestroyed() || gate.webContents.isDestroyed()) return;
      gate.webContents
        .executeJavaScript(`window.__setStatus && window.__setStatus(${JSON.stringify(msg)}, ${String(isErr)})`)
        .catch(() => undefined);
    };

    gateSession.webRequest.onBeforeRequest(
      loopbackFilter,
      (details, callback) => {
        callback({ cancel: true });
        const url = new URL(details.url);
        if (url.searchParams.get("state") !== state) {
          pushStatus("state 校验失败，请重试", true);
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          pushStatus("授权失败：未收到授权码", true);
          return;
        }
        exchangeCode(code, verifier)
          .then((identity) => {
            persistIdentity(identity);
            finish({ kind: "logged-in", identity });
          })
          .catch((e) => {
            pushStatus("令牌交换失败：" + String(e).slice(0, 80), true);
          });
      },
    );

    const authorize = [
      AUTHORIZE_URL,
      "?client_id=" + CLIENT_ID,
      "&redirect_uri=" + encodeURIComponent(LOOPBACK_REDIRECT_URI),
      "&response_type=code",
      "&scope=" + encodeURIComponent("openid profile"),
      "&state=" + state,
      "&code_challenge=" + challenge,
      "&code_challenge_method=S256",
    ].join("");

    const started = loadZhlIdentity();
    gate.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(GATE_HTML))
      .then(() => {
        if (started) {
          // 已有身份：直接通过（理论上入口已挡，双保险）
          finish({ kind: "logged-in", identity: started });
          return;
        }
        gate.webContents.executeJavaScript(`
          document.getElementById('go').onclick = () => {
            window.__setStatus('正在打开授权页…', false);
            location.href = ${JSON.stringify(authorize)};
          };
          document.getElementById('skip').onclick = () => { document.getElementById('retention').style.display='block'; };
          document.getElementById('back').onclick = () => { document.getElementById('retention').style.display='none'; };
          document.getElementById('skip2').onclick = () => { window.__SKIPPED__ = true; };
        `);
      });

    // 跳过 + 状态通道：通过 will-navigate 与轮询 __SKIPPED__ 简化实现
    gate.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith(LOOPBACK_REDIRECT_URI)) return; // 已由 webRequest 拦截
    });
    const poll = setInterval(() => {
      if (settled || gate.isDestroyed()) {
        clearInterval(poll);
        return;
      }
      gate.webContents.executeJavaScript("window.__SKIPPED__ === true").then((v) => {
        if (v === true && !settled) {
          clearInterval(poll);
          persistSkipped();
          finish({ kind: "skipped" });
        }
      }).catch(() => clearInterval(poll));
    }, 500);
  });
}

async function exchangeCode(code: string, verifier: string): Promise<ZhlIdentity> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: LOOPBACK_REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  const resp = await net.fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok || typeof data.access_token !== "string") {
    throw new Error(String(data.error_description ?? data.error ?? "HTTP " + resp.status));
  }
  const uiResp = await net.fetch(USERINFO_URL, {
    headers: { Authorization: "Bearer " + data.access_token },
  });
  let username = "";
  if (uiResp.ok) {
    const ui = (await uiResp.json()) as Record<string, unknown>;
    username = String(ui.username ?? ui.sub ?? "");
  }
  return {
    username,
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token ?? ""),
  };
}
