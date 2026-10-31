package com.luckygain.luckygain_mobile

import android.app.ActivityManager
import android.app.ActivityOptions
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import java.io.ByteArrayOutputStream
import kotlin.math.hypot
import kotlin.math.max

class ScreenshotService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var projection: MediaProjection? = null
    private var reader: ImageReader? = null
    private var display: VirtualDisplay? = null
    private var button: View? = null
    private var windowManager: WindowManager? = null
    @Volatile private var closed = false
    private var frames = 0
    private var projectionHeld = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        live = this
        val worker = HandlerThread("luckygain-shot")
        worker.start()
        thread = worker
        handler = Handler(worker.looper)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        main.post { arm() }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        abandon()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        if (live === this) live = null
        release()
        thread?.quitSafely()
        thread = null
        super.onDestroy()
    }

    private fun arm() {
        closed = false
        ShotSession.capturing = false
        if (projection != null) {
            showButton()
            return
        }
        begin()
    }

    private fun begin() {
        val data = ShotSession.resultData
        if (data == null) {
            failAndStop("failed", "Could not take that screenshot.")
            return
        }
        val manager = getSystemService(MediaProjectionManager::class.java)
        val next = try {
            manager.getMediaProjection(ShotSession.resultCode, data)
        } catch (_: Exception) {
            null
        }
        if (next == null) {
            failAndStop("failed", "Could not take that screenshot.")
            return
        }
        projection = next
        projectionHeld = true
        next.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                projectionHeld = false
                abandon()
            }
        }, main)
        showButton()
    }

    private fun showButton() {
        if (button != null) {
            ShotSession.overlayShowing = true
            notifyBusy()
            main.postDelayed({
                if (button == null) return@postDelayed
                ShotSession.wentBack = true
                ShotSession.activity?.get()?.moveTaskToBack(true)
            }, 80)
            return
        }
        val wm = getSystemService(WindowManager::class.java)
        windowManager = wm
        val size = dp(76)
        val params = WindowManager.LayoutParams(
            size,
            size,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            val (screenWidth, screenHeight) = screenSize()
            x = screenWidth - size - dp(12)
            y = (screenHeight - size) / 2
        }
        val view = ShotButton(
            context = this,
            onTap = { capture() },
            onDrag = { dx, dy ->
                val (screenWidth, screenHeight) = screenSize()
                params.x = (params.x + dx).coerceIn(0, (screenWidth - size).coerceAtLeast(0))
                params.y = (params.y + dy).coerceIn(0, (screenHeight - size).coerceAtLeast(0))
                try {
                    wm.updateViewLayout(button, params)
                } catch (_: Exception) {
                }
            },
        )
        try {
            wm.addView(view, params)
        } catch (_: Exception) {
            failAndKeep(
                "overlay",
                "Allow LuckyGain to appear over other apps, then tap Screen again.",
            )
            return
        }
        button = view
        ShotSession.overlayShowing = true
        notifyBusy()
        main.postDelayed({
            if (button == null) return@postDelayed
            ShotSession.wentBack = true
            ShotSession.activity?.get()?.moveTaskToBack(true)
        }, 80)
    }

    private fun capture() {
        if (closed || ShotSession.capturing) return
        ShotSession.capturing = true
        removeButton()
        handler?.postDelayed({ openDisplay() }, 280) ?: failAndKeep(
            "failed",
            "Could not take that screenshot.",
        )
    }

    private fun openDisplay() {
        if (closed) return
        val projection = projection ?: run {
            failAndKeep("failed", "Could not take that screenshot.")
            return
        }
        val (screenWidth, screenHeight) = screenSize()
        val width = (screenWidth / 2) * 2
        val height = (screenHeight / 2) * 2
        val density = resources.displayMetrics.densityDpi
        val imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
        reader = imageReader
        frames = 0
        imageReader.setOnImageAvailableListener({ source ->
            val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
            frames += 1
            if (frames < 2) {
                image.close()
                return@setOnImageAvailableListener
            }
            imageReader.setOnImageAvailableListener(null, null)
            try {
                val bytes = imageToJpeg(image)
                image.close()
                deliver(bytes)
            } catch (_: Exception) {
                image.close()
                failAndKeep("failed", "Could not take that screenshot.")
            }
        }, handler)
        try {
            display = projection.createVirtualDisplay(
                "LuckyGain",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.surface,
                null,
                handler,
            )
        } catch (_: Exception) {
            failAndKeep("failed", "Could not take that screenshot.")
            return
        }
        handler?.postDelayed({
            if (!closed && frames < 2 && ShotSession.capturing) {
                failAndKeep("failed", "Could not take that screenshot.")
            }
        }, 1600)
    }

    private fun deliver(bytes: ByteArray) {
        main.post {
            closed = false
            releaseDisplay()
            removeButton()
            ShotSession.overlayShowing = false
            ShotSession.hold(bytes)
            bringAppForward()
            notifyReady()
        }
    }

    private fun bringAppForward() {
        try {
            getSystemService(ActivityManager::class.java).appTasks.firstOrNull()?.moveToFront()
        } catch (_: Exception) {
        }
        val reopen = Intent(this, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
            )
        }
        try {
            val options = ActivityOptions.makeBasic()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                options.setPendingIntentBackgroundActivityStartMode(
                    ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED,
                )
            }
            startActivity(reopen, options.toBundle())
        } catch (_: Exception) {
            try {
                startActivity(reopen)
            } catch (_: Exception) {
            }
        }
    }

    private fun abandon() {
        val failedMidCapture = ShotSession.capturing
        releaseAll()
        removeButton()
        ShotSession.dropConsent()
        if (failedMidCapture) {
            ShotSession.fail("failed", "Could not take that screenshot.")
        } else {
            ShotSession.successNull()
        }
        stopInForeground()
        stopSelf()
    }

    private fun failAndStop(code: String, message: String) {
        releaseAll()
        removeButton()
        ShotSession.dropConsent()
        ShotSession.fail(code, message)
        stopInForeground()
        stopSelf()
    }

    private fun failAndKeep(code: String, message: String) {
        closed = false
        ShotSession.capturing = false
        releaseDisplay()
        removeButton()
        ShotSession.overlayShowing = false
        ShotSession.fail(code, message)
        notifyReady()
    }

    private fun releaseDisplay() {
        try {
            display?.release()
        } catch (_: Exception) {
        }
        display = null
        try {
            reader?.close()
        } catch (_: Exception) {
        }
        reader = null
    }

    private fun releaseAll() {
        closed = true
        projectionHeld = false
        releaseDisplay()
        try {
            projection?.stop()
        } catch (_: Exception) {
        }
        projection = null
        removeButton()
    }

    private fun release() {
        releaseAll()
    }

    private fun removeButton() {
        val view = button ?: return
        button = null
        try {
            windowManager?.removeView(view)
        } catch (_: Exception) {
        }
    }

    private fun stopInForeground() {
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }
    }

    private fun notifyReady() {
        try {
            startInForeground("Screen is allowed")
        } catch (_: Exception) {
        }
    }

    private fun notifyBusy() {
        try {
            startInForeground("Tap the gold button")
        } catch (_: Exception) {
        }
    }

    private fun startInForeground(text: String = "Tap the gold button") {
        val notification = notification(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun notification(text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shot)
            .setContentTitle("LuckyGain")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Screenshot",
            NotificationManager.IMPORTANCE_LOW,
        )
        channel.setSound(null, null)
        channel.enableVibration(false)
        channel.description = "Shown while the screenshot button is on screen."
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun screenSize(): Pair<Int, Int> {
        val metrics = resources.displayMetrics
        return metrics.widthPixels to metrics.heightPixels
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics,
        ).toInt()
    }

    private fun imageToJpeg(image: Image): ByteArray {
        val width = image.width
        val height = image.height
        val plane = image.planes[0]
        val buffer = plane.buffer
        val pixelStride = plane.pixelStride.coerceAtLeast(1)
        val paddedWidth = plane.rowStride / pixelStride
        val bitmap = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
        bitmap.copyPixelsFromBuffer(buffer)
        val cropped = if (paddedWidth == width) {
            bitmap
        } else {
            Bitmap.createBitmap(bitmap, 0, 0, width, height).also { bitmap.recycle() }
        }
        val longSide = max(cropped.width, cropped.height)
        val scaled = if (longSide <= 1600) {
            cropped
        } else {
            val scale = 1600f / longSide
            Bitmap.createScaledBitmap(
                cropped,
                (cropped.width * scale).toInt().coerceAtLeast(1),
                (cropped.height * scale).toInt().coerceAtLeast(1),
                true,
            ).also { if (it != cropped) cropped.recycle() }
        }
        val out = ByteArrayOutputStream()
        var quality = 82
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
        while (out.size() > 2_200_000 && quality > 55) {
            out.reset()
            quality -= 10
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }
        scaled.recycle()
        return out.toByteArray()
    }

    companion object {
        private const val CHANNEL_ID = "luckygain.screenshot"
        private const val NOTIFICATION_ID = 41

        @Volatile private var live: ScreenshotService? = null

        fun isReady(): Boolean = live?.projectionHeld == true && live?.projection != null

        fun hideOverlay() {
            val service = live ?: return
            service.main.post {
                service.removeButton()
                service.notifyReady()
            }
        }
    }
}

private class ShotButton(
    context: Context,
    private val onTap: () -> Unit,
    private val onDrag: (Int, Int) -> Unit,
) : View(context) {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFBF8F2.toInt() }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(2.2f)
        color = 0xFFC19A55.toInt()
    }
    private val icon = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(1.8f)
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = 0xFFA8823D.toInt()
    }
    private val shadow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x33000000
        maskFilter = BlurMaskFilter(dp(7f), BlurMaskFilter.Blur.NORMAL)
    }
    private var lastX = 0f
    private var lastY = 0f
    private var dragging = false
    private val slop = ViewConfiguration.get(context).scaledTouchSlop.toFloat()

    init {
        setLayerType(LAYER_TYPE_SOFTWARE, null)
        contentDescription = "Take screenshot"
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val radius = width * 0.34f
        canvas.drawCircle(cx, cy + dp(2f), radius, shadow)
        canvas.drawCircle(cx, cy, radius, fill)
        canvas.drawCircle(cx, cy, radius - ring.strokeWidth / 2f, ring)
        val side = radius * 0.92f
        val rect = RectF(cx - side / 2f, cy - side * 0.42f, cx + side / 2f, cy + side * 0.28f)
        canvas.drawRoundRect(rect, dp(2.5f), dp(2.5f), icon)
        canvas.drawLine(cx - side * 0.22f, cy + side * 0.46f, cx + side * 0.22f, cy + side * 0.46f, icon)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.rawX
                lastY = event.rawY
                dragging = false
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.rawX - lastX
                val dy = event.rawY - lastY
                if (!dragging && hypot(dx.toDouble(), dy.toDouble()) > slop) dragging = true
                if (dragging) {
                    onDrag(dx.toInt(), dy.toInt())
                    lastX = event.rawX
                    lastY = event.rawY
                }
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (!dragging && event.actionMasked == MotionEvent.ACTION_UP) onTap()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun dp(value: Float): Float {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value,
            resources.displayMetrics,
        )
    }
}
