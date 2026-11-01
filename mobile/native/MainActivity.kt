package com.trlive.tr_live

import android.Manifest
import android.annotation.TargetApi
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.ConnectivityManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

// TR Live ana ekranı (GitHub derlemesi bu dosyayı flutter create'in ürettiği MainActivity'nin yerine koyar).
//  * Ekran yalnızca oda ekranı açıkken açık tutulur (Flutter "keepScreenOn" çağırır); diğer sayfalarda telefonun
//    kendi ekran zaman aşımı geçerlidir (pil tasarrufu).
//  * Telefon araması: Android'in arama durumu (TelephonyManager) ve ses modu izlenir, Flutter'a "trlive/phone_call"
//    kanalından true/false gönderilir. Oda sesi kendi ses odağını aldığı için odak sinyali gelmeyen telefonlarda da çalışır.
class MainActivity : FlutterActivity() {
    private val main = Handler(Looper.getMainLooper())
    private var events: EventChannel.EventSink? = null
    private var telephony: TelephonyManager? = null
    private var callback: Any? = null
    private var legacyListener: PhoneStateListener? = null
    private var phoneBusy = false
    private var modeBusy = false
    private var lastSent: Boolean? = null
    private var polling = false
    private var headsetSink: EventChannel.EventSink? = null
    private var deviceCallback: AudioDeviceCallback? = null

    /// Kablolu kulaklık / kulaklık girişi / USB kulaklık / Bluetooth kulaklık bağlı mı.
    private fun headsetConnected(): Boolean {
        return try {
            val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return false
            am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any {
                it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                    it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                    it.type == AudioDeviceInfo.TYPE_USB_HEADSET ||
                    it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                    it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                    it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
            }
        } catch (e: Exception) {
            false
        }
    }

    private var modeListener: Any? = null

    /// Telefonun ses modu: zil çalıyor / normal görüşme sürüyorsa arama var.
    private fun readMode() {
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            val m = am?.mode ?: AudioManager.MODE_NORMAL
            modeBusy = m == AudioManager.MODE_IN_CALL || m == AudioManager.MODE_RINGTONE || m == 4 // 4: MODE_CALL_SCREENING
        } catch (e: Exception) {
            modeBusy = false
        }
        emit()
    }

    // Yalnızca mod dinleyicisi kurulamayan (Android 11 ve öncesi) telefonlarda: 2 sn'de bir okunur.
    private val modePoll = object : Runnable {
        override fun run() {
            if (!polling || modeListener != null) return
            readMode()
            main.postDelayed(this, 2000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Ekran artık her zaman açık tutulmaz (pil): yalnızca oda ekranı açıkken Flutter "keepScreenOn" ile açar.
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        MethodChannel(messenger, "trlive/device").setMethodCallHandler { call, result ->
            when (call.method) {
                "keepScreenOn" -> {
                    val on = (call.arguments as? Boolean) ?: true
                    if (on) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }
                    result.success(null)
                }
                "scanAudio" -> {
                    // Telefondaki ses dosyaları (MediaStore). İzin yoksa istenir; Flutter tekrar taratır.
                    val perm = if (Build.VERSION.SDK_INT >= 33) "android.permission.READ_MEDIA_AUDIO" else Manifest.permission.READ_EXTERNAL_STORAGE
                    if (checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) {
                        try {
                            requestPermissions(arrayOf(perm), 7342)
                        } catch (e: Exception) {
                        }
                        result.success(mapOf("permission" to false))
                    } else {
                        Thread {
                            val files = ArrayList<Map<String, Any?>>()
                            try {
                                @Suppress("DEPRECATION")
                                val proj = arrayOf(
                                    MediaStore.Audio.Media.DATA,
                                    MediaStore.Audio.Media.TITLE,
                                    MediaStore.Audio.Media.ARTIST,
                                    MediaStore.Audio.Media.DURATION,
                                    MediaStore.Audio.Media.SIZE,
                                    MediaStore.Audio.Media.DISPLAY_NAME,
                                )
                                val cursor = contentResolver.query(
                                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                                    proj,
                                    MediaStore.Audio.Media.DURATION + " >= 20000",
                                    null,
                                    MediaStore.Audio.Media.DISPLAY_NAME + " COLLATE NOCASE ASC",
                                )
                                cursor?.use { c ->
                                    while (c.moveToNext() && files.size < 3000) {
                                        val path = c.getString(0) ?: continue
                                        files.add(
                                            mapOf(
                                                "path" to path,
                                                "title" to c.getString(1),
                                                "artist" to c.getString(2),
                                                "durationMs" to c.getLong(3),
                                                "size" to c.getLong(4),
                                                "name" to c.getString(5),
                                            ),
                                        )
                                    }
                                }
                            } catch (e: Exception) {
                            }
                            main.post { result.success(mapOf("permission" to true, "files" to files)) }
                        }.start()
                    }
                }
                "headsetConnected" -> result.success(headsetConnected())
                "isMetered" -> {
                    // Mobil veri / kotalı bağlantı mı (Wi-Fi değilse true). Hediye dosyaları yalnızca kotasız ağda önceden iner.
                    val metered = try {
                        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                        cm?.isActiveNetworkMetered ?: true
                    } catch (e: Exception) {
                        true
                    }
                    result.success(metered)
                }
                "hasMicPermission" -> {
                    result.success(checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                }
                "requestPhoneState" -> {
                    if (hasPhonePermission()) {
                        result.success(true)
                    } else {
                        try {
                            requestPermissions(arrayOf(Manifest.permission.READ_PHONE_STATE), 7341)
                        } catch (e: Exception) {
                        }
                        result.success(false)
                    }
                }
                else -> result.notImplemented()
            }
        }
        // Güzellik filtresi (BeautyFilter.java): kamera takibine bağlan, ayarları değiştir.
        MethodChannel(messenger, "trlive/beauty").setMethodCallHandler { call, result ->
            try {
                val args = call.arguments as? Map<*, *>
                val params = HashMap<String, Any?>()
                args?.forEach { (k, v) -> if (k is String) params[k] = v }
                when (call.method) {
                    "setParams" -> {
                        BeautyFilter.setParams(params)
                        result.success(null)
                    }
                    "attach" -> {
                        BeautyFilter.setParams(params)
                        // Bu (ana) motorun WebRTC eklentisi; yüzen balonun ikinci motorundaki örnek değil.
                        val plugin: Any? = try {
                            @Suppress("UNCHECKED_CAST")
                            val cls = Class.forName("com.cloudwebrtc.webrtc.FlutterWebRTCPlugin") as Class<out FlutterPlugin>
                            flutterEngine.plugins.get(cls)
                        } catch (e: Throwable) {
                            null
                        }
                        result.success(BeautyFilter.attach(params["trackId"] as? String, plugin))
                    }
                    "detach" -> {
                        BeautyFilter.detach()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Throwable) {
                result.error("beauty", e.toString(), null)
            }
        }
        // Kulaklık (kablolu / Bluetooth) takılınca / çıkarılınca true / false gönderilir.
        EventChannel(messenger, "trlive/headset").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
                headsetSink = sink
                sink?.success(headsetConnected())
                val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
                val cb = object : AudioDeviceCallback() {
                    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
                        headsetSink?.success(headsetConnected())
                    }

                    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
                        headsetSink?.success(headsetConnected())
                    }
                }
                try {
                    am.registerAudioDeviceCallback(cb, main)
                    deviceCallback = cb
                } catch (e: Exception) {
                }
            }

            override fun onCancel(arguments: Any?) {
                headsetSink = null
                val cb = deviceCallback
                if (cb != null) {
                    try {
                        (getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.unregisterAudioDeviceCallback(cb)
                    } catch (e: Exception) {
                    }
                }
                deviceCallback = null
            }
        })
        EventChannel(messenger, "trlive/phone_call").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
                events = sink
                lastSent = null
                startWatch()
                emit()
            }

            override fun onCancel(arguments: Any?) {
                events = null
                stopWatch()
            }
        })
    }

    override fun onResume() {
        super.onResume()
        // İzin penceresinden dönünce (izin yeni verildiyse) arama izleme yeniden kurulur.
        if (events != null && callback == null && legacyListener == null) startWatch()
    }

    override fun onDestroy() {
        stopWatch()
        try {
            deviceCallback?.let { (getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.unregisterAudioDeviceCallback(it) }
        } catch (e: Exception) {
        }
        deviceCallback = null
        headsetSink = null
        super.onDestroy()
    }

    private fun hasPhonePermission(): Boolean =
        checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

    private fun emit() {
        val v = phoneBusy || modeBusy
        if (v == lastSent) return
        lastSent = v
        try {
            events?.success(v)
        } catch (e: Exception) {
        }
    }

    private fun startWatch() {
        if (!polling) {
            polling = true
            readMode()
            if (Build.VERSION.SDK_INT >= 31) {
                // Android 12+: mod değişince sistem haber verir; sürekli sorgu yok (pil).
                try {
                    val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                    if (am != null) modeListener = ModeWatch.register(am, mainExecutor) { main.post { readMode() } }
                } catch (e: Exception) {
                    modeListener = null
                }
            }
            if (modeListener == null) main.postDelayed(modePoll, 2000)
        }
        if (callback != null || legacyListener != null) return
        val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return
        telephony = tm
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                if (hasPhonePermission()) {
                    val cb = CallStateCallback { busy ->
                        main.post {
                            phoneBusy = busy
                            emit()
                        }
                    }
                    tm.registerTelephonyCallback(mainExecutor, cb)
                    callback = cb
                }
            } else {
                val l = LegacyCallListener { busy ->
                    phoneBusy = busy
                    emit()
                }
                @Suppress("DEPRECATION")
                tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
                legacyListener = l
            }
        } catch (e: Exception) {
        }
    }

    private fun stopWatch() {
        polling = false
        main.removeCallbacks(modePoll)
        val ml = modeListener
        modeListener = null
        if (ml != null && Build.VERSION.SDK_INT >= 31) {
            try {
                (getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.let { ModeWatch.unregister(it, ml) }
            } catch (e: Exception) {
            }
        }
        val tm = telephony
        try {
            if (tm != null && Build.VERSION.SDK_INT >= 31) {
                val cb = callback
                if (cb is TelephonyCallback) tm.unregisterTelephonyCallback(cb)
            }
            val l = legacyListener
            if (tm != null && l != null) {
                @Suppress("DEPRECATION")
                tm.listen(l, PhoneStateListener.LISTEN_NONE)
            }
        } catch (e: Exception) {
        }
        callback = null
        legacyListener = null
        phoneBusy = false
        modeBusy = false
    }
}

/// Android 12+ ses modu dinleyicisi (OnModeChangedListener). Eski sürümlerde bu sınıf hiç yüklenmez.
@TargetApi(31)
private object ModeWatch {
    fun register(am: AudioManager, executor: java.util.concurrent.Executor, onChange: () -> Unit): Any {
        val l = AudioManager.OnModeChangedListener { onChange() }
        am.addOnModeChangedListener(executor, l)
        return l
    }

    fun unregister(am: AudioManager, l: Any) {
        if (l is AudioManager.OnModeChangedListener) am.removeOnModeChangedListener(l)
    }
}

@TargetApi(31)
private class CallStateCallback(private val onBusy: (Boolean) -> Unit) : TelephonyCallback(), TelephonyCallback.CallStateListener {
    override fun onCallStateChanged(state: Int) {
        onBusy(state != TelephonyManager.CALL_STATE_IDLE)
    }
}

@Suppress("DEPRECATION")
private class LegacyCallListener(private val onBusy: (Boolean) -> Unit) : PhoneStateListener() {
    @Deprecated("Android 12 öncesi")
    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
        onBusy(state != TelephonyManager.CALL_STATE_IDLE)
    }
}
