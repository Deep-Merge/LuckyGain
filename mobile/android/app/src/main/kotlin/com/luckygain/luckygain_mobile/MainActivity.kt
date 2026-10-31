package com.luckygain.luckygain_mobile

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val ble = BleSync(this)
    private val blePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        ble.onPermissions(grants)
    }
    private var awaitingOverlay = false
    private var projectionOpen = false

    private val projectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        projectionOpen = false
        val data = result.data
        if (result.resultCode != Activity.RESULT_OK || data == null) {
            ShotSession.dropConsent()
            ShotSession.successNull()
            return@registerForActivityResult
        }
        ShotSession.resultCode = result.resultCode
        ShotSession.resultData = data
        ShotSession.activity = java.lang.ref.WeakReference(this)
        ContextCompat.startForegroundService(
            this,
            Intent(this, ScreenshotService::class.java),
        )
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        ble.launchPermission = { blePermissionLauncher.launch(it) }
        ble.attach(flutterEngine.dartExecutor.binaryMessenger)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        MethodChannel(messenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "capture") {
                    beginCapture(result)
                } else {
                    result.notImplemented()
                }
            }
        MethodChannel(messenger, FILES)
            .setMethodCallHandler { call, result ->
                if (call.method != "saveDownloads") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val name = call.argument<String>("name")
                val path = call.argument<String>("path")
                if (name.isNullOrBlank() || path.isNullOrBlank()) {
                    result.error("failed", "Could not save the backup.", null)
                    return@setMethodCallHandler
                }
                try {
                    result.success(saveToDownloads(name, path))
                } catch (_: Exception) {
                    result.error("failed", "Could not save the backup.", null)
                }
            }
    }

    override fun onResume() {
        super.onResume()
        if (awaitingOverlay) {
            awaitingOverlay = false
            if (Settings.canDrawOverlays(this)) {
                launchProjection()
            } else {
                ShotSession.dropConsent()
                ShotSession.fail(
                    "overlay",
                    "Allow LuckyGain to appear over other apps, then tap Screen again.",
                )
            }
            return
        }
        if (ShotSession.hasShot()) {
            ShotSession.noteReturned()
            window.decorView.post { ShotSession.flushIfReady() }
            return
        }
        if (ShotSession.capturing) {
            ShotSession.capturing = false
            ShotSession.wentBack = false
            ShotSession.overlayShowing = false
            return
        }
        if (ShotSession.wentBack) {
            ShotSession.wentBack = false
            ShotSession.overlayShowing = false
            ScreenshotService.hideOverlay()
            ShotSession.successNull()
        }
    }

    override fun onDestroy() {
        ble.stop()
        if (isFinishing) {
            ShotSession.dropConsent()
            ShotSession.successNull()
            stopService(Intent(this, ScreenshotService::class.java))
        }
        super.onDestroy()
    }

    private fun beginCapture(result: MethodChannel.Result) {
        if (!ShotSession.claim(result)) {
            result.error("failed", "A screenshot is already in progress.", null)
            return
        }
        ShotSession.activity = java.lang.ref.WeakReference(this)
        if (!Settings.canDrawOverlays(this)) {
            awaitingOverlay = true
            val settings = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName"),
            )
            try {
                startActivity(settings)
            } catch (_: Exception) {
                awaitingOverlay = false
                ShotSession.dropConsent()
                ShotSession.fail(
                    "overlay",
                    "Allow LuckyGain to appear over other apps, then tap Screen again.",
                )
            }
            return
        }
        if (ScreenshotService.isReady()) {
            ContextCompat.startForegroundService(
                this,
                Intent(this, ScreenshotService::class.java),
            )
            return
        }
        launchProjection()
    }

    private fun launchProjection() {
        if (projectionOpen) return
        projectionOpen = true
        val manager = getSystemService(MediaProjectionManager::class.java)
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            manager.createScreenCaptureIntent(
                MediaProjectionConfig.createConfigForDefaultDisplay(),
            )
        } else {
            manager.createScreenCaptureIntent()
        }
        projectionLauncher.launch(intent)
    }

    private fun saveToDownloads(name: String, path: String): String {
        val source = java.io.File(path)
        if (!source.isFile) throw IllegalStateException("missing backup")
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("no downloads row")
        contentResolver.openOutputStream(uri)?.use { stream ->
            source.inputStream().use { it.copyTo(stream) }
        } ?: throw IllegalStateException("no downloads stream")
        return name
    }

    companion object {
        const val CHANNEL = "luckygain/screenshot"
        const val FILES = "luckygain/files"
    }
}
