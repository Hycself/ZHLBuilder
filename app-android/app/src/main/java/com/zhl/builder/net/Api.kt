package com.zhl.builder.net

import android.content.Context
import com.zhl.builder.store.Store
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * ZHL 平台 API 客户端。
 *
 * 双重失败形态约定（与桌面端 zhl-manager 一致）：
 *  - HTTP 层失败/5xx -> ApiException(net)
 *  - 业务失败 = HTTP 200 + body code != 20000 -> ApiException(biz, message)
 *
 * data 可能是对象或数组（Result.ok(list)），统一用 [Any] 返回再按需取。
 */
class ApiException(val isNetwork: Boolean, message: String) : Exception(message)

object Api {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val json = "application/json; charset=utf-8".toMediaType()

    private fun base(ctx: Context) = Store.getBaseUrl(ctx)

    /** 返回 body.data（JSONObject 或 JSONArray） */
    private fun call(ctx: Context, req: Request): Any {
        val resp = try {
            client.newCall(req).execute()
        } catch (e: Exception) {
            throw ApiException(true, "网络异常：${e.message}")
        }
        resp.use {
            val body = it.body?.string() ?: "{}"
            if (!it.isSuccessful) throw ApiException(true, "HTTP ${it.code}")
            val obj = JSONObject(body)
            if (obj.optInt("code") != 20000) {
                throw ApiException(false, obj.optString("message", "操作失败"))
            }
            return obj.opt("data") ?: JSONObject()
        }
    }

    private fun request(ctx: Context, url: String, method: String = "GET", body: JSONObject? = null,
                        pinSession: String? = null): Any {
        val b = Request.Builder().url(url)
            .header("Authorization", "Bearer ${Store.getToken(ctx) ?: ""}")
        if (pinSession != null) b.header("X-Builder-Session", pinSession)
        when (method) {
            "POST" -> b.post((body ?: JSONObject()).toString().toRequestBody(json))
            "DELETE" -> b.delete()
        }
        return call(ctx, b.build())
    }

    // ---------- 认证 ----------

    fun login(ctx: Context, account: String, password: String): JSONObject =
        request(ctx, "${base(ctx)}/api/auth/login", "POST",
            JSONObject().put("account", account).put("password", password)) as JSONObject

    // ---------- 设备 ----------

    fun myDevices(ctx: Context): List<JSONObject> =
        asList(request(ctx, "${base(ctx)}/api/builder/devices"))

    fun claim(ctx: Context, pairCode: String, pin: String): JSONObject =
        request(ctx, "${base(ctx)}/api/builder/devices/claim", "POST",
            JSONObject().put("pairCode", pairCode).put("pin", pin)) as JSONObject

    fun verifyPin(ctx: Context, deviceId: Long, pin: String): JSONObject =
        request(ctx, "${base(ctx)}/api/builder/devices/$deviceId/verify-pin", "POST",
            JSONObject().put("pin", pin)) as JSONObject

    fun changePin(ctx: Context, deviceId: Long, currentPin: String, newPin: String) {
        request(ctx, "${base(ctx)}/api/builder/devices/$deviceId/pin", "POST",
            JSONObject().put("currentPin", currentPin).put("newPin", newPin))
    }

    fun deviceStatus(ctx: Context, deviceId: Long, pinSession: String): JSONObject =
        request(ctx, "${base(ctx)}/api/builder/devices/$deviceId/status", pinSession = pinSession) as JSONObject

    fun unpair(ctx: Context, deviceId: Long) {
        request(ctx, "${base(ctx)}/api/builder/devices/$deviceId", "DELETE")
    }

    // ---------- 任务 ----------

    fun createTask(ctx: Context, deviceId: Long, pinSession: String, prompt: String, cwd: String?): JSONObject {
        val body = JSONObject().put("prompt", prompt)
        if (!cwd.isNullOrBlank()) body.put("cwd", cwd)
        return request(ctx, "${base(ctx)}/api/builder/devices/$deviceId/tasks", "POST", body, pinSession) as JSONObject
    }

    fun tasks(ctx: Context, deviceId: Long, pinSession: String, limit: Int = 10): List<JSONObject> =
        asList(request(ctx, "${base(ctx)}/api/builder/devices/$deviceId/tasks?limit=$limit", pinSession = pinSession))

    fun taskOutput(ctx: Context, deviceId: Long, pinSession: String, taskId: Long, since: Int): JSONObject =
        request(ctx, "${base(ctx)}/api/builder/devices/$deviceId/tasks/$taskId/output?since=$since",
            pinSession = pinSession) as JSONObject

    fun stopTask(ctx: Context, deviceId: Long, pinSession: String, taskId: Long) {
        request(ctx, "${base(ctx)}/api/builder/devices/$deviceId/tasks/$taskId/stop", "POST", null, pinSession)
    }

    // ---------- 工具 ----------

    private fun asList(data: Any): List<JSONObject> {
        val arr = when (data) {
            is JSONArray -> data
            is JSONObject -> data.optJSONArray("items") ?: JSONArray()
            else -> JSONArray()
        }
        return (0 until arr.length()).map { arr.getJSONObject(it) }
    }
}
