package com.luckygain.luckygain_mobile

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.MethodChannel
import java.lang.ref.WeakReference

/**
 * One in-flight screen capture, shared by the activity and the capture service.
 * The Flutter call stays open until the gold button takes a shot or the user comes back.
 */
internal object ShotSession {
    private val main = Handler(Looper.getMainLooper())
    private val gate = Any()
    private var pending: MethodChannel.Result? = null

    var resultCode: Int = Activity.RESULT_CANCELED
    var resultData: Intent? = null
    var activity: WeakReference<MainActivity>? = null

    @Volatile var overlayShowing: Boolean = false
    @Volatile var capturing: Boolean = false
    @Volatile var wentBack: Boolean = false
    @Volatile private var shot: ByteArray? = null

    fun claim(result: MethodChannel.Result): Boolean = synchronized(gate) {
        if (pending != null) return false
        pending = result
        true
    }

    fun hold(bytes: ByteArray) {
        shot = bytes
        capturing = true
    }

    fun hasShot(): Boolean = shot != null

    fun noteReturned() {
        capturing = false
        wentBack = false
        overlayShowing = false
    }

    fun flushIfReady() {
        val bytes = shot ?: return
        shot = null
        success(bytes)
    }

    fun success(bytes: ByteArray) {
        val current = take() ?: return
        main.post {
            try {
                current.success(bytes)
            } catch (_: Exception) {
            }
        }
    }

    fun successNull() {
        val current = take() ?: return
        main.post {
            try {
                current.success(null)
            } catch (_: Exception) {
            }
        }
    }

    fun fail(code: String, message: String) {
        val current = take() ?: return
        main.post {
            try {
                current.error(code, message, null)
            } catch (_: Exception) {
            }
        }
    }

    fun clearFlags() {
        overlayShowing = false
        capturing = false
        wentBack = false
        shot = null
    }

    fun dropConsent() {
        clearFlags()
        resultData = null
        resultCode = Activity.RESULT_CANCELED
    }

    private fun take(): MethodChannel.Result? = synchronized(gate) {
        val current = pending
        pending = null
        current
    }
}
