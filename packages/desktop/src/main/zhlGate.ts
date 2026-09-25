import { BrowserWindow, app, safeStorage } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
const LOOPBACK_PREFIXES = [
  "http://127.0.0.1:8540/callback",
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
  const enc = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(identity.accessToken).toString("base64")
    : Buffer.from(identity.accessToken, "utf8").toString("base64");
  writeFileSync(AUTH_FILE(), JSON.stringify({ username: identity.username, accessTokenEnc: enc, refreshToken: identity.refreshToken }, null, 2), "utf8");
  cachedIdentity = identity;
}

function persistSkipped(): void {
  writeFileSync(join(app.getPath("userData"), "zhl-gate.json"), JSON.stringify({ skipped: true }), "utf8");
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
  document.getElementById('go').onclick = () => {
    st.textContent = '正在打开授权页…';
    window.zhlGate.startAuth();
  };
  document.getElementById('skip').onclick = () => {
    document.getElementById('retention').style.display = 'block';
  };
  document.getElementById('back').onclick = () => {
    document.getElementById('retention').style.display = 'none';
  };
  document.getElementById('skip2').onclick = () => {
    window.zhlGate.skip();
  };
  window.zhlGate.onStatus((msg, isErr) => {
    st.textContent = msg;
    st.className = 'status' + (isErr ? ' err' : '');
  });
</script></body></html>`;

export interface ZhlGateResult {
  kind: "logged-in" | "skipped";
  identity?: ZhlIdentity;
}

/** 弹模态登录门；解析为登录结果或跳过。 */
export function ensureZhlLogin(parent: BrowserWindow): Promise<ZhlGateResult> {
  return new Promise((resolveGate) => {
    let settled = false;
    const finish = (result: ZhlGateResult) => {
      if (settled) return;
      settled = true;
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
    gate.webContents.session.webRequest.onBeforeRequest(
      { urls: LOOPBACK_PREFIXES.map((p) => p + "*") },
      (details, callback) => {
        callback({ cancel: true });
        const url = new URL(details.url);
        if (url.searchParams.get("state") !== state) {
          gate.webContents.send("zhl-gate:status", "state 校验失败，请重试", true);
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          gate.webContents.send("zhl-gate:status", "授权失败：未收到授权码", true);
          return;
        }
        exchangeCode(code, verifier)
          .then((identity) => {
            persistIdentity(identity);
            finish({ kind: "logged-in", identity });
          })
          .catch((e) => {
            gate.webContents.send("zhl-gate:status", "令牌交换失败：" + String(e).slice(0, 80), true);
          });
      },
    );

    const authorize = [
      AUTHORIZE_URL,
      "?client_id=" + CLIENT_ID,
      "&redirect_uri=" + encodeURIComponent(LOOPBACK_PREFIXES[0]),
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
          window.zhlGate = {
            startAuth: () => location.href = ${JSON.stringify(authorize)},
            skip: () => undefined,
            onStatus: (cb) => undefined,
          };
          document.getElementById('go').onclick = () => { location.href = ${JSON.stringify(authorize)}; };
          document.getElementById('skip').onclick = () => { document.getElementById('retention').style.display='block'; };
          document.getElementById('back').onclick = () => { document.getElementById('retention').style.display='none'; };
          document.getElementById('skip2').onclick = () => { window.__SKIPPED__ = true; };
        `);
      });

    // 跳过 + 状态通道：通过 will-navigate 与轮询 __SKIPPED__ 简化实现
    gate.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith(LOOPBACK_PREFIXES[0])) return; // 已由 webRequest 拦截
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
    redirect_uri: LOOPBACK_PREFIXES[0],
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
