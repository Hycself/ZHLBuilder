package com.zhl.builder.store

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.zhl.builder.MainActivity

/**
 * 任务状态变化 → 系统通知栏推送。
 *
 * 手机轮询检测到任务从「运行中」变为「完成/失败/停止」时触发。
 * 不需要 WS / FCM / 长连接 —— 基于 2s 轮询 + 本地通知，简单可靠。
 */
object NotificationHelper {

    private const val CHANNEL_ID = "zhlbuilder_tasks"
    private const val CHANNEL_NAME = "任务通知"

    fun createChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = ctx.getString(ctx.resources.getIdentifier("notification_channel_desc", "string", ctx.packageName)) }
            ctx.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    fun hasPermission(ctx: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else true
    }

    fun notifyTaskFinished(ctx: Context, taskId: Long, deviceName: String, status: Int, exitNote: String?) {
        if (!hasPermission(ctx)) return
        val label = when (status) {
            2 -> "✅ 完成"
            3 -> "❌ 失败"
            4 -> "⏹ 已停止"
            else -> return
        }
        val text = "任务 #$taskId $label" + (exitNote?.let { " — $it" } ?: "")
        val intent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(ctx, taskId.toInt(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(ctx.resources.getIdentifier("ic_launcher", "mipmap", ctx.packageName))
            .setContentTitle(deviceName)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(taskId.toInt(), notification)
        } catch (_: SecurityException) { }
    }

    fun notifyDeviceOnline(ctx: Context, deviceName: String) {
        if (!hasPermission(ctx)) return
        val intent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(ctx, deviceName.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(ctx.resources.getIdentifier("ic_launcher", "mipmap", ctx.packageName))
            .setContentTitle("设备上线")
            .setContentText("$deviceName 已连接中枢")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(deviceName.hashCode(), notification)
        } catch (_: SecurityException) { }
    }
}
