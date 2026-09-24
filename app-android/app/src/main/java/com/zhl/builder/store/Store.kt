package com.zhl.builder.store

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * 会话与设备状态存储。
 *
 * JWT/PIN 会话用 EncryptedSharedPreferences（Keystore 主密钥）落盘；
 * 设备 PIN 会话是 15 分钟短令牌，仅存内存即可，这里一并持久化以便进程被杀后短时恢复。
 */
object Store {

    private var prefs: SharedPreferences? = null

    private fun p(ctx: Context): SharedPreferences {
        if (prefs == null) {
            val masterKey = MasterKey.Builder(ctx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            prefs = EncryptedSharedPreferences.create(
                ctx, "zhlbuilder_secure",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }
        return prefs!!
    }

    fun getBaseUrl(ctx: Context): String =
        p(ctx).getString("base_url", "https://dis.zhl.asia") ?: "https://dis.zhl.asia"

    fun setBaseUrl(ctx: Context, url: String) {
        p(ctx).edit().putString("base_url", url.trimEnd('/')).apply()
    }

    fun getToken(ctx: Context): String? = p(ctx).getString("jwt", null)

    fun setToken(ctx: Context, token: String?) {
        p(ctx).edit().putString("jwt", token).apply()
    }

    fun getUserName(ctx: Context): String? = p(ctx).getString("username", null)

    fun setUserName(ctx: Context, name: String) {
        p(ctx).edit().putString("username", name).apply()
    }

    /** 设备 PIN 会话（15 分钟），按 deviceId 存 */
    fun getPinSession(ctx: Context, deviceId: Long): String? =
        p(ctx).getString("pin_session_$deviceId", null)

    fun setPinSession(ctx: Context, deviceId: Long, token: String) {
        p(ctx).edit().putString("pin_session_$deviceId", token).apply()
    }

    fun logout(ctx: Context) {
        p(ctx).edit().clear().apply()
    }
}
