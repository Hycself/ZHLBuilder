package com.zhl.builder

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.zhl.builder.net.Api
import com.zhl.builder.net.ApiException
import com.zhl.builder.store.Store
import com.zhl.builder.ui.AccentButton
import com.zhl.builder.ui.InfoCard
import com.zhl.builder.ui.StatusDot
import com.zhl.builder.ui.ZhlColors
import com.zhl.builder.ui.ZhlField
import com.zhl.builder.ui.ZhlScreen
import com.zhl.builder.ui.ZhlTitle
import kotlinx.coroutines.delay
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private enum class Screen { Login, Devices, Detail }

    private var selectedDeviceId by mutableStateOf(0L)

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        scanResult = result.contents
    }
    private var scanResult by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(
                background = ZhlColors.bg, surface = ZhlColors.panel,
            )) {
                App()
            }
        }
    }

    @Composable
    private fun App() {
        var screen by remember { mutableStateOf(Screen.Login) }
        var token by remember { mutableStateOf(Store.getToken(this@MainActivity)) }

        LaunchedEffect(token) {
            if (token != null) screen = Screen.Devices
        }

        // 扫码结果 → 配对（设 PIN）
        scanResult?.let { raw ->
            PairSheet(raw) { ok ->
                scanResult = null
                if (ok) screen = Screen.Devices
            }
        }

        when (screen) {
            Screen.Login -> LoginScreen {
                token = Store.getToken(this@MainActivity)
                screen = Screen.Devices
            }
            Screen.Devices -> DevicesScreen(
                onScan = {
                    val opts = ScanOptions().apply {
                        setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                        setPrompt("扫描设备端 zhlbuilder device pair 的二维码")
                        setBeepEnabled(true)
                    }
                    scanLauncher.launch(opts)
                },
                onOpen = { id ->
                    selectedDeviceId = id
                    screen = Screen.Detail
                },
            )
            Screen.Detail -> DeviceDetailScreen(selectedDeviceId, onBack = { screen = Screen.Devices })
        }
    }

    // ================= 登录 =================

    @Composable
    private fun LoginScreen(onDone: () -> Unit) {
        var account by remember { mutableStateOf("") }
        var password by remember { mutableStateOf("") }
        var server by remember { mutableStateOf(Store.getBaseUrl(this)) }
        var showServer by remember { mutableStateOf(false) }
        var err by remember { mutableStateOf("") }
        var loading by remember { mutableStateOf(false) }

        ZhlScreen {
            ZhlTitle()
            Spacer(Modifier.height(48.dp))
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.imePadding(),
            ) {
                ZhlField(account, { account = it }, "账号（用户名或邮箱）")
                ZhlField(password, { password = it }, "密码", obscure = true)
                Row {
                    TextButton(onClick = { showServer = !showServer }) {
                        Text(if (showServer) "收起服务器设置" else "服务器设置", color = ZhlColors.faint, fontSize = 12.sp)
                    }
                }
                if (showServer) ZhlField(server, { server = it }, "https://dis.zhl.asia")
                if (err.isNotBlank()) Text(err, color = ZhlColors.down, fontSize = 13.sp)
                AccentButton("登录", enabled = account.isNotBlank() && password.isNotBlank(), loading = loading) {
                    loading = true; err = ""
                    Thread {
                        try {
                            Store.setBaseUrl(this@MainActivity, server)
                            val r = Api.login(this@MainActivity, account.trim(), password)
                            Store.setToken(this@MainActivity, r.getString("token"))
                            Store.setUserName(this@MainActivity, r.optJSONObject("user")?.optString("username") ?: account)
                            runOnUiThread { loading = false; onDone() }
                        } catch (e: ApiException) {
                            runOnUiThread { loading = false; err = e.message ?: "登录失败" }
                        }
                    }.start()
                }
            }
        }
    }

    // ================= 设备列表 =================

    @Composable
    private fun DevicesScreen(onScan: () -> Unit, onOpen: (Long) -> Unit) {
        var devices by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
        var err by remember { mutableStateOf("") }
        var deleteTarget by remember { mutableStateOf<JSONObject?>(null) }

        fun refresh() {
            Thread {
                try {
                    devices = Api.myDevices(this@MainActivity)
                    err = ""
                } catch (e: ApiException) {
                    if (!e.isNetwork && (e.message?.contains("登录") == true)) {
                        Store.logout(this@MainActivity)
                        runOnUiThread { err = "登录已过期，请重新登录"; }
                    } else err = e.message ?: ""
                }
            }.start()
        }
        LaunchedEffect(Unit) { while (true) { refresh(); delay(10_000) } }

        ZhlScreen {
            ZhlTitle()
            Spacer(Modifier.height(14.dp))
            if (err.isNotBlank()) Text(err, color = ZhlColors.warn, fontSize = 13.sp)
            Spacer(Modifier.height(8.dp))
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                devices.forEach { d ->
                    InfoCard(
                        title = d.optString("name"),
                        modifier = Modifier.clickable { onOpen(d.optLong("id")) },
                        subtitle = buildString {
                            append(if (d.optBoolean("online")) "在线" else "离线")
                            d.optString("platform").takeIf { it.isNotBlank() }?.let { append(" · $it") }
                            d.optString("agentVersion").takeIf { it.isNotBlank() }?.let { append(" · v$it") }
                        },
                        trailing = {
                            Row {
                                StatusDot(d.optBoolean("online"))
                                Spacer(Modifier.width(10.dp))
                                TextButton(onClick = { deleteTarget = d }) { Text("解绑", color = ZhlColors.down, fontSize = 12.sp) }
                            }
                        },
                    )
                }
                Spacer(Modifier.height(6.dp))
                AccentButton("扫码添加设备", onClick = onScan)
            }
        }

        deleteTarget?.let { d ->
            AlertDialog(
                onDismissRequest = { deleteTarget = null },
                containerColor = ZhlColors.panel2,
                titleContentColor = ZhlColors.txt,
                textContentColor = ZhlColors.dim,
                title = { Text("解绑设备") },
                text = { Text("确定解绑「${d.optString("name")}」？设备端令牌将被吊销，需重新扫码配对。") },
                confirmButton = {
                    TextButton(onClick = {
                        Thread { try { Api.unpair(this@MainActivity, d.optLong("id")) } catch (_: Exception) {} }.start()
                        deleteTarget = null
                    }) { Text("解绑", color = ZhlColors.down) }
                },
                dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("取消", color = ZhlColors.dim) } },
            )
        }
    }

    // ================= 配对（扫码后设 PIN） =================

    @Composable
    private fun PairSheet(raw: String, onDone: (Boolean) -> Unit) {
        var pairCode by remember { mutableStateOf("") }
        var pin1 by remember { mutableStateOf("") }
        var pin2 by remember { mutableStateOf("") }
        var err by remember { mutableStateOf("") }
        var loading by remember { mutableStateOf(false) }

        LaunchedEffect(raw) {
            try {
                val o = JSONObject(raw)
                pairCode = o.optString("pairCode")
                o.optString("server").takeIf { it.isNotBlank() }?.let { Store.setBaseUrl(this@MainActivity, it) }
            } catch (e: Exception) {
                // 兼容纯配对码
                if (raw.matches(Regex("[A-Z2-9]{8}"))) pairCode = raw
                else err = "二维码内容无法识别"
            }
        }

        AlertDialog(
            onDismissRequest = { onDone(false) },
            containerColor = ZhlColors.panel2,
            titleContentColor = ZhlColors.txt,
            textContentColor = ZhlColors.dim,
            title = { Text("绑定设备") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("配对码 $pairCode", color = ZhlColors.accent, fontWeight = FontWeight.Bold)
                    Text("为该设备设置 6 位数字 PIN，之后每次进入设备会话都要输入。", fontSize = 13.sp)
                    ZhlField(pin1, { pin1 = it.filter { c -> c.isDigit() }.take(6) }, "6 位 PIN", obscure = true)
                    ZhlField(pin2, { pin2 = it.filter { c -> c.isDigit() }.take(6) }, "再输一次", obscure = true)
                    if (err.isNotBlank()) Text(err, color = ZhlColors.down, fontSize = 13.sp)
                }
            },
            confirmButton = {
                AccentButton("绑定", enabled = pin1.length == 6 && pin1 == pin2, loading = loading) {
                    loading = true; err = ""
                    Thread {
                        try {
                            Api.claim(this@MainActivity, pairCode, pin1)
                            runOnUiThread { loading = false; onDone(true) }
                        } catch (e: ApiException) {
                            runOnUiThread { loading = false; err = e.message ?: "绑定失败" }
                        }
                    }.start()
                }
            },
            dismissButton = { TextButton(onClick = { onDone(false) }) { Text("取消", color = ZhlColors.dim) } },
        )
    }

    // ================= 设备详情（PIN 门 + 任务） =================

    @Composable
    private fun DeviceDetailScreen(deviceId: Long, onBack: () -> Unit) {
        var pinSession by remember { mutableStateOf(Store.getPinSession(this@MainActivity, deviceId) ?: "") }
        var needPin by remember { mutableStateOf(pinSession.isBlank()) }
        var pin by remember { mutableStateOf("") }
        var pinErr by remember { mutableStateOf("") }

        if (needPin) {
            AlertDialog(
                onDismissRequest = { onBack() },
                containerColor = ZhlColors.panel2,
                titleContentColor = ZhlColors.txt,
                textContentColor = ZhlColors.dim,
                title = { Text("输入设备 PIN") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("每次进入设备会话需要验证 6 位 PIN。", fontSize = 13.sp)
                        ZhlField(pin, { pin = it.filter { c -> c.isDigit() }.take(6) }, "6 位 PIN", obscure = true)
                        if (pinErr.isNotBlank()) Text(pinErr, color = ZhlColors.down, fontSize = 13.sp)
                    }
                },
                confirmButton = {
                    AccentButton("解锁", enabled = pin.length == 6) {
                        pinErr = ""
                        Thread {
                            try {
                                val r = Api.verifyPin(this@MainActivity, deviceId, pin)
                                pinSession = r.getString("sessionToken")
                                Store.setPinSession(this@MainActivity, deviceId, pinSession)
                                runOnUiThread { needPin = false }
                            } catch (e: ApiException) {
                                runOnUiThread { pinErr = e.message ?: "PIN 不正确" }
                            }
                        }.start()
                    }
                },
                dismissButton = { TextButton(onClick = { onBack() }) { Text("返回", color = ZhlColors.dim) } },
            )
            return
        }

        DeviceDetailBody(deviceId, pinSession, onBack)
    }

    @Composable
    private fun DeviceDetailBody(deviceId: Long, pinSession: String, onBack: () -> Unit) {
        var status by remember { mutableStateOf<JSONObject?>(null) }
        var tasks by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
        var openTaskId by remember { mutableStateOf(0L) }
        var output by remember { mutableStateOf("") }
        var taskDone by remember { mutableStateOf<Int>(-1) }
        var showNewTask by remember { mutableStateOf(false) }
        var err by remember { mutableStateOf("") }

        // 状态 + 任务列表轮询
        LaunchedEffect(deviceId, pinSession) {
            while (true) {
                try {
                    status = Api.deviceStatus(this@MainActivity, deviceId, pinSession)
                    tasks = Api.tasks(this@MainActivity, deviceId, pinSession)
                    err = ""
                } catch (e: ApiException) {
                    err = e.message ?: ""
                }
                delay(6_000)
            }
        }
        // 输出轮询
        LaunchedEffect(openTaskId) {
            if (openTaskId == 0L) return@LaunchedEffect
            var since = 0
            output = ""
            while (openTaskId != 0L) {
                try {
                    val o = Api.taskOutput(this@MainActivity, deviceId, pinSession, openTaskId, since)
                    val lines = o.optJSONArray("lines")
                    if (lines != null) {
                        for (i in 0 until lines.length()) {
                            output += lines.getJSONObject(i).optString("line") + "\n"
                        }
                    }
                    since = o.optInt("lastSeq", since)
                    taskDone = o.optInt("status", 1)
                } catch (e: ApiException) {
                    // 会话过期等：静默，下轮重试
                }
                delay(2_000)
            }
        }

        ZhlScreen {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("‹ 返回", color = ZhlColors.dim) }
                Text(status?.optString("name") ?: "设备", color = ZhlColors.txt, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                StatusDot(status?.optBoolean("online") == true)
                Spacer(Modifier.width(6.dp))
                Text(if (status?.optBoolean("online") == true) "在线" else "离线", color = ZhlColors.dim, fontSize = 13.sp)
            }
            Spacer(Modifier.height(10.dp))
            if (err.isNotBlank()) Text(err, color = ZhlColors.warn, fontSize = 13.sp)
            AccentButton("下发新任务", enabled = status?.optBoolean("online") == true, onClick = { showNewTask = true })
            Spacer(Modifier.height(12.dp))

            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                tasks.forEach { t ->
                    val tid = t.optLong("id")
                    val running = t.optInt("status") == 1
                    Card(
                        onClick = { openTaskId = tid; output = "" },
                        colors = androidx.compose.material3.CardDefaults.cardColors(
                            containerColor = if (openTaskId == tid) ZhlColors.panel2 else ZhlColors.panel),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Row {
                                Text("#$tid", color = ZhlColors.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    when (t.optInt("status")) {
                                        0 -> "待下发"; 1 -> "运行中"; 2 -> "完成"; 3 -> "失败"; else -> "已停止"
                                    },
                                    color = when (t.optInt("status")) {
                                        1 -> ZhlColors.accent; 2 -> ZhlColors.ok; 3 -> ZhlColors.down; else -> ZhlColors.faint
                                    },
                                    fontSize = 12.sp,
                                )
                            }
                            Text(t.optString("prompt"), color = ZhlColors.txt, fontSize = 13.5.sp, maxLines = 2, modifier = Modifier.padding(top = 4.dp))
                            if (running && openTaskId == tid) {
                                TextButton(onClick = {
                                    Thread { try { Api.stopTask(this@MainActivity, deviceId, pinSession, tid) } catch (_: Exception) {} }.start()
                                }) { Text("停止任务", color = ZhlColors.down, fontSize = 12.sp) }
                            }
                        }
                    }
                    if (openTaskId == tid) {
                        Box(
                            Modifier.fillMaxWidth().background(ZhlColors.panel, RoundedCornerShape(12.dp)).padding(12.dp),
                        ) {
                            Text(
                                output.ifBlank { if (taskDone in listOf(2, 3, 4)) "(无输出)" else "等待输出…" },
                                color = Color(0xFF9FB6CE), fontSize = 12.sp, lineHeight = 16.sp,
                            )
                        }
                    }
                }
                if (tasks.isEmpty()) {
                    InfoCard("暂无任务", "点击「下发新任务」向设备发送一条指令")
                }
            }
        }

        if (showNewTask) {
            var prompt by remember { mutableStateOf("") }
            var sending by remember { mutableStateOf(false) }
            AlertDialog(
                onDismissRequest = { showNewTask = false },
                containerColor = ZhlColors.panel2,
                titleContentColor = ZhlColors.txt,
                textContentColor = ZhlColors.dim,
                title = { Text("下发任务") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        ZhlField(prompt, { prompt = it }, "要给 agent 的指令…")
                        Text("任务将在设备上以 agent 执行，输出实时回传。", fontSize = 12.sp)
                    }
                },
                confirmButton = {
                    AccentButton("下发", enabled = prompt.isNotBlank(), loading = sending) {
                        sending = true
                        Thread {
                            try {
                                Api.createTask(this@MainActivity, deviceId, pinSession, prompt.trim(), null)
                                runOnUiThread { sending = false; showNewTask = false }
                            } catch (e: ApiException) {
                                runOnUiThread { sending = false }
                            }
                        }.start()
                    }
                },
                dismissButton = { TextButton(onClick = { showNewTask = false }) { Text("取消", color = ZhlColors.dim) } },
            )
        }
    }
}
