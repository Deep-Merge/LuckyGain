package com.luckygain.luckygain_mobile

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.UUID

class BleSync(
    private val activity: FlutterFragmentActivity,
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
    private val main = Handler(Looper.getMainLooper())
    private var events: EventChannel.EventSink? = null
    private var permissionResult: MethodChannel.Result? = null
    private var startResult: MethodChannel.Result? = null
    private var server: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var notifyChar: BluetoothGattCharacteristic? = null
    private var central: BluetoothDevice? = null
    private var mtu = 23
    private val prepared = java.io.ByteArrayOutputStream()
    private var preparing = false
    private var notifyWait: ((Boolean) -> Unit)? = null
    private var advertising = false
    var launchPermission: ((Array<String>) -> Unit)? = null

    fun attach(messenger: BinaryMessenger) {
        MethodChannel(messenger, CHANNEL).setMethodCallHandler(this)
        EventChannel(messenger, EVENTS).setStreamHandler(this)
    }

    fun onPermissions(grants: Map<String, Boolean>) {
        val result = permissionResult
        permissionResult = null
        result?.success(grants.values.all { it })
    }

    fun permissions(): Array<String> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE,
            )
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    fun hasPermissions(): Boolean {
        return permissions().all {
            ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "prepare" -> {
                if (hasPermissions()) {
                    result.success(true)
                } else {
                    val launch = launchPermission
                    if (launch == null) {
                        result.error(
                            "permission",
                            "Allow Bluetooth for LuckyGain, then tap Connect again.",
                            null,
                        )
                    } else {
                        permissionResult = result
                        launch(permissions())
                    }
                }
            }
            "start" -> start(result)
            "stop" -> {
                stop()
                result.success(null)
            }
            "write" -> {
                val bytes = call.argument<ByteArray>("bytes")
                if (bytes == null) {
                    result.error("failed", "Missing sync bytes.", null)
                } else {
                    write(bytes, 0, result)
                }
            }
            else -> result.notImplemented()
        }
    }

    fun requestPermissions(launch: (Array<String>) -> Unit, result: MethodChannel.Result) {
        if (hasPermissions()) {
            result.success(true)
            return
        }
        permissionResult = result
        launch(permissions())
    }

    private fun start(result: MethodChannel.Result) {
        val manager = activity.getSystemService(BluetoothManager::class.java)
        val adapter = manager?.adapter
        if (adapter == null || !adapter.isEnabled) {
            result.error("failed", "Turn on Bluetooth, then tap Connect again.", null)
            return
        }
        val advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            result.error("failed", "This phone cannot share over Bluetooth.", null)
            return
        }
        this.advertiser = advertiser
        startResult = result
        val server = try {
            manager.openGattServer(activity, callback)
        } catch (error: SecurityException) {
            startResult = null
            result.error(
                "permission",
                "Allow Bluetooth for LuckyGain, then tap Connect again.",
                null,
            )
            return
        }
        if (server == null) {
            startResult = null
            result.error(
                "failed",
                "Turn Bluetooth off and on, then tap Connect again.",
                null,
            )
            return
        }
        this.server = server
        val service = BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val write = BluetoothGattCharacteristic(
            WRITE,
            BluetoothGattCharacteristic.PROPERTY_WRITE or
                BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE,
        )
        val notify = BluetoothGattCharacteristic(
            NOTIFY,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ,
        )
        notify.addDescriptor(
            BluetoothGattDescriptor(
                CCCD,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE,
            ),
        )
        service.addCharacteristic(write)
        service.addCharacteristic(notify)
        notifyChar = notify
        server.addService(service)
    }

    private fun advertise() {
        val advertiser = advertiser ?: return
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .build()
        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE))
            .setIncludeDeviceName(false)
            .build()
        val response = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .build()
        advertiser.startAdvertising(settings, data, response, advertiseCallback)
    }

    fun stop() {
        advertising = false
        try {
            advertiser?.stopAdvertising(advertiseCallback)
        } catch (_: Exception) {
        }
        try {
            server?.close()
        } catch (_: Exception) {
        }
        server = null
        central = null
        notifyChar = null
        preparing = false
        prepared.reset()
        keepAwake(false)
    }

    private fun keepAwake(on: Boolean) {
        main.post {
            val flags = android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            if (on) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
        }
    }

    private fun write(bytes: ByteArray, offset: Int, result: MethodChannel.Result) {
        val device = central
        val characteristic = notifyChar
        val server = server
        if (device == null || characteristic == null || server == null) {
            result.error("failed", "The computer is not connected.", null)
            return
        }
        if (offset >= bytes.size) {
            result.success(null)
            return
        }
        val size = (mtu - 3).coerceIn(20, 160)
        val end = (offset + size).coerceAtMost(bytes.size)
        val chunk = bytes.copyOfRange(offset, end)
        notifyWait = { ok ->
            if (!ok) {
                result.error("failed", "The computer stopped listening.", null)
            } else {
                write(bytes, end, result)
            }
        }
        val sent = if (Build.VERSION.SDK_INT >= 33) {
            server.notifyCharacteristicChanged(device, characteristic, false, chunk) == 0
        } else {
            characteristic.value = chunk
            server.notifyCharacteristicChanged(device, characteristic, false)
        }
        if (!sent) {
            notifyWait = null
            result.error("failed", "Could not send to the computer.", null)
        }
    }

    private fun emit(type: String, extra: Map<String, Any?> = emptyMap()) {
        val payload = HashMap<String, Any?>(extra)
        payload["type"] = type
        main.post { events?.success(payload) }
    }

    private val callback = object : BluetoothGattServerCallback() {
        override fun onServiceAdded(status: Int, service: BluetoothGattService) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                main.post {
                    startResult?.error(
                        "failed",
                        "Bluetooth could not add the sync service.",
                        null,
                    )
                    startResult = null
                }
                return
            }
            advertise()
        }

        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            if (newState == BluetoothGatt.STATE_CONNECTED) {
                central = device
                keepAwake(true)
                emit("connected")
            } else if (newState == BluetoothGatt.STATE_DISCONNECTED && central?.address == device.address) {
                central = null
                keepAwake(false)
                emit("disconnected")
            }
        }

        override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
            if (mtu > 23) {
                this@BleSync.mtu = mtu
                emit("mtu", mapOf("mtu" to mtu))
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray,
        ) {
            if (preparedWrite) {
                if (offset == 0 || !preparing) {
                    prepared.reset()
                    preparing = true
                }
                prepared.write(value)
                if (responseNeeded) {
                    server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                }
                return
            }
            emit("rx", mapOf("bytes" to value))
            if (responseNeeded) {
                server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }

        override fun onExecuteWrite(device: BluetoothDevice, requestId: Int, execute: Boolean) {
            val bytes = prepared.toByteArray()
            prepared.reset()
            preparing = false
            if (execute && bytes.isNotEmpty()) emit("rx", mapOf("bytes" to bytes))
            server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
        }

        override fun onNotificationSent(device: BluetoothDevice, status: Int) {
            val wait = notifyWait
            notifyWait = null
            main.post { wait?.invoke(status == BluetoothGatt.GATT_SUCCESS) }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray,
        ) {
            if (responseNeeded) {
                server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            advertising = true
            main.post {
                startResult?.success(null)
                startResult = null
            }
        }

        override fun onStartFailure(errorCode: Int) {
            main.post {
                startResult?.error(
                    "failed",
                    "Could not make this phone visible. Turn Bluetooth off and on, then try again.",
                    null,
                )
                startResult = null
            }
        }
    }

    override fun onListen(arguments: Any?, sink: EventChannel.EventSink) {
        events = sink
    }

    override fun onCancel(arguments: Any?) {
        events = null
    }

    companion object {
        const val CHANNEL = "luckygain/sync"
        const val EVENTS = "luckygain/sync-events"
        val SERVICE: UUID = UUID.fromString("8c0e1000-7b3a-4c3e-9b2a-6f1d4a8e0001")
        val WRITE: UUID = UUID.fromString("8c0e1000-7b3a-4c3e-9b2a-6f1d4a8e0002")
        val NOTIFY: UUID = UUID.fromString("8c0e1000-7b3a-4c3e-9b2a-6f1d4a8e0003")
        val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }
}
