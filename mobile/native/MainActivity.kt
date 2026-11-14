package com.trlive.tr_live

import android.Manifest
import android.annotation.TargetApi
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
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
import java.lang.reflect.Constructor
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.roundToInt

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
    private var shotSink: EventChannel.EventSink? = null
    private var shotCallback: Any? = null
    private var shotObserver: ContentObserver? = null
    private var lastShotAt = 0L

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
                "secure" -> {
                    // Profil fotoğrafı sayfaları: ekran görüntüsü ve ekran kaydı engellenir (görüntü siyah çıkar).
                    val on = (call.arguments as? Boolean) ?: false
                    if (on) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    }
                    result.success(null)
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
        // Güzellik filtresi (aşağıdaki BeautyFilter): kamera takibine bağlan, ayarları değiştir.
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
        // Uygulama açıkken alınan ekran görüntüsü: Flutter'a olay gönderilir (görüntünün kendisi okunmaz).
        EventChannel(messenger, "trlive/screenshot").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
                shotSink = sink
                startShotWatch()
            }

            override fun onCancel(arguments: Any?) {
                shotSink = null
                stopShotWatch()
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

    override fun onStart() {
        super.onStart()
        if (shotSink != null) startShotWatch()
    }

    override fun onStop() {
        stopShotWatch()
        super.onStop()
    }

    private fun emitShot() {
        val now = System.currentTimeMillis()
        if (now - lastShotAt < 3000) return // aynı görüntü için birden çok bildirim
        lastShotAt = now
        main.post {
            try {
                shotSink?.success(now)
            } catch (e: Exception) {
            }
        }
    }

    private fun startShotWatch() {
        if (shotCallback != null || shotObserver != null) return
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                // Android 14+: sistemin resmi bildirimi. İzin (DETECT_SCREEN_CAPTURE) uygulamada tanımlı değilse denenmez.
                if (checkSelfPermission("android.permission.DETECT_SCREEN_CAPTURE") == PackageManager.PERMISSION_GRANTED) {
                    shotCallback = registerShotCallback()
                }
            } else if (Build.VERSION.SDK_INT <= 32 && checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
                // Android 12 ve öncesi: galeri izni zaten verilmişse yeni "Screenshot" dosyası fark edilir. İzin istenmez.
                val obs = object : ContentObserver(main) {
                    override fun onChange(selfChange: Boolean, uri: Uri?) {
                        if (isNewScreenshot()) emitShot()
                    }
                }
                contentResolver.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, obs)
                shotObserver = obs
            }
        } catch (e: Throwable) {
            shotCallback = null
            shotObserver = null
        }
    }

    private fun stopShotWatch() {
        try {
            val cb = shotCallback
            if (cb != null && Build.VERSION.SDK_INT >= 34) unregisterShotCallback(cb)
            shotObserver?.let { contentResolver.unregisterContentObserver(it) }
        } catch (e: Throwable) {
        }
        shotCallback = null
        shotObserver = null
    }

    /** Android 14+ ekran görüntüsü bildirimi, yansıtma ile (Activity.ScreenCaptureCallback). Kayıt nesnesi ya da null. */
    @TargetApi(34)
    private fun registerShotCallback(): Any? {
        return try {
            val iface = Class.forName("android.app.Activity\$ScreenCaptureCallback")
            val handler = InvocationHandler { proxy, method, args ->
                when (method.name) {
                    "onScreenCaptured" -> {
                        emitShot()
                        null
                    }
                    "hashCode" -> System.identityHashCode(proxy)
                    "equals" -> args != null && args.size == 1 && args[0] === proxy
                    "toString" -> "TrLiveShot"
                    else -> null
                }
            }
            val cb = Proxy.newProxyInstance(iface.classLoader, arrayOf(iface), handler)
            val reg = android.app.Activity::class.java.getMethod("registerScreenCaptureCallback", java.util.concurrent.Executor::class.java, iface)
            reg.invoke(this, mainExecutor, cb)
            cb
        } catch (e: Throwable) {
            null
        }
    }

    @TargetApi(34)
    private fun unregisterShotCallback(cb: Any) {
        try {
            val iface = Class.forName("android.app.Activity\$ScreenCaptureCallback")
            android.app.Activity::class.java.getMethod("unregisterScreenCaptureCallback", iface).invoke(this, cb)
        } catch (e: Throwable) {
        }
    }

    /** Son 10 sn içinde eklenen en yeni görselin adı / klasörü "screenshot" içeriyor mu (yalnızca ad okunur). */
    @Suppress("DEPRECATION")
    private fun isNewScreenshot(): Boolean {
        var found = false
        var cursor: android.database.Cursor? = null
        try {
            val proj = arrayOf(MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.DATA, MediaStore.Images.Media.DATE_ADDED)
            cursor = contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, null, null, MediaStore.Images.Media.DATE_ADDED + " DESC")
            if (cursor != null && cursor.moveToFirst()) {
                val name = ((cursor.getString(0) ?: "") + " " + (cursor.getString(1) ?: "")).lowercase()
                val added = cursor.getLong(2)
                val recent = System.currentTimeMillis() / 1000 - added <= 10
                found = recent && (name.contains("screenshot") || name.contains("ekran"))
            }
        } catch (e: Exception) {
            found = false
        } finally {
            try {
                cursor?.close()
            } catch (e: Exception) {
            }
        }
        return found
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

// ------------------------------------------------------------------ Güzellik filtresi

private fun clampByte(x: Int): Byte = (if (x < 0) 0 else if (x > 255) 255 else x).toByte()

/**
 * TR Live güzellik filtresi (kendi filtremiz, ücretli SDK yok). Kameranın her karesini yayına ve önizlemeye gitmeden
 * önce işler: cilt pürüzsüzleştirme (kenarları koruyan yumuşatma), aydınlatma, beyazlatma, pembelik, renk filtreleri.
 *
 * flutter_webrtc'nin yerel takip arayüzüne (LocalVideoTrack.ExternalVideoFrameProcessing) yansıtmayla (reflection)
 * bağlanır; derleme hiçbir WebRTC sınıfına bağlı değildir. Bir şey uymazsa kare olduğu gibi geçer (yayın bozulmaz) ve
 * attach() nedenini döner. (MainActivity.kt içinde: GitHub derlemesi yalnızca bu dosyayı uygulamaya kopyalar.)
 */
object BeautyFilter : InvocationHandler {
    private var proxy: Any? = null
    private var track: Any? = null
    private var trackId: String? = null
    private var removeMethod: Method? = null

    /** Ayarlar tek parça olarak değiştirilir (kamera iş parçacığı yarım ayar görmez). */
    private class Params(val smooth: Float, bright: Float, white: Float, rosy: Float, tone: Int) {
        val on: Boolean = smooth > 0.01f || bright > 0.01f || white > 0.01f || rosy > 0.01f || tone != 0
        val smoothK: Int = (smooth * 230f).roundToInt() // 0..230 (yumuşatma karışım oranı /256)
        val y = ByteArray(256)
        val u = ByteArray(256)
        val v = ByteArray(256)

        init {
            val gamma = 1.0 / (1.0 + 0.55 * bright)
            for (i in 0 until 256) {
                var f = Math.pow(i / 255.0, gamma)
                f += white * 0.24 * (1.0 - f) * (0.35 + f)
                y[i] = clampByte((f * 255.0).roundToInt())
            }
            var sat = 1.0 - white * 0.18
            var du = 0.0
            var dv = 0.0
            when (tone) {
                1 -> { du = -7.0; dv = 9.0 } // sıcak
                2 -> { du = 9.0; dv = -6.0 } // soğuk
                3 -> sat *= 1.32 // canlı
                4 -> { du = 4.0; dv = 11.0; sat *= 1.05 } // pembe
                5 -> sat = 0.0 // siyah-beyaz
                6 -> { sat *= 0.7; du = -4.0; dv = 5.0 } // nostalji
            }
            dv += rosy * 12
            du += rosy * 2
            for (i in 0 until 256) {
                u[i] = clampByte((128 + (i - 128) * sat + du).roundToInt())
                v[i] = clampByte((128 + (i - 128) * sat + dv).roundToInt())
            }
        }
    }

    @Volatile private var params = Params(0f, 0f, 0f, 0f, 0)
    @Volatile private var failures = 0

    private fun num(m: Map<String, *>, k: String): Float = ((m[k] as? Number)?.toFloat() ?: 0f).coerceIn(0f, 1f)

    /** smooth, bright, white, rosy: 0..1; tone: 0 doğal, 1 sıcak, 2 soğuk, 3 canlı, 4 pembe, 5 siyah-beyaz, 6 nostalji. */
    fun setParams(m: Map<String, *>?) {
        if (m == null) return
        var tone = (m["tone"] as? Number)?.toInt() ?: 0
        if (tone < 0 || tone > 6) tone = 0
        params = Params(num(m, "smooth"), num(m, "bright"), num(m, "white"), num(m, "rosy"), tone)
        failures = 0
    }

    /**
     * Kamera takibine bağlanır (aynı takipse bir şey yapmaz). "ok" ya da neden bağlanamadığı döner.
     * [pluginInstance]: ana motorun FlutterWebRTCPlugin örneği (yüzen balonun ikinci motoru da bir örnek oluşturur);
     * bulunamazsa sharedSingleton denenir.
     */
    @Synchronized
    fun attach(id: String?, pluginInstance: Any?): String {
        if (id.isNullOrEmpty()) {
            detach()
            return "no_track"
        }
        if (id == trackId && track != null) return "ok"
        detach()
        return try {
            val plugin = Class.forName("com.cloudwebrtc.webrtc.FlutterWebRTCPlugin")
            val get = plugin.getMethod("getLocalTrack", String::class.java)
            var t: Any? = null
            if (pluginInstance != null && plugin.isInstance(pluginInstance)) t = get.invoke(pluginInstance, id)
            if (t == null) {
                val single = plugin.getField("sharedSingleton").get(null)
                if (single != null && single !== pluginInstance) t = get.invoke(single, id)
            }
            if (t == null) {
                "no_track"
            } else {
                val lvt = Class.forName("com.cloudwebrtc.webrtc.video.LocalVideoTrack")
                if (!lvt.isInstance(t)) {
                    "not_video"
                } else {
                    val iface = Class.forName("com.cloudwebrtc.webrtc.video.LocalVideoTrack\$ExternalVideoFrameProcessing")
                    val px = proxy ?: Proxy.newProxyInstance(iface.classLoader, arrayOf(iface), this).also { proxy = it }
                    lvt.getMethod("addProcessor", iface).invoke(t, px)
                    removeMethod = lvt.getMethod("removeProcessor", iface)
                    track = t
                    trackId = id
                    "ok"
                }
            }
        } catch (e: Throwable) {
            "error: $e"
        }
    }

    @Synchronized
    fun detach() {
        try {
            val t = track
            val rm = removeMethod
            val px = proxy
            if (t != null && rm != null && px != null) rm.invoke(t, px)
        } catch (e: Throwable) {
        }
        track = null
        trackId = null
        removeMethod = null
    }

    override fun invoke(p: Any?, m: Method?, args: Array<out Any?>?): Any? {
        val n = m?.name
        if (n == "onFrame" && args != null && args.size == 1) {
            val frame = args[0] ?: return null
            return process(frame)
        }
        if (n == "hashCode") return System.identityHashCode(p)
        if (n == "equals") return args != null && args.size == 1 && args[0] === p
        if (n == "toString") return "TrLiveBeauty"
        return null
    }

    // ---------------------------------------------------------------- WebRTC sınıflarına yansıtmayla erişim

    private class Refl(val loader: ClassLoader?) {
        private val frame: Class<*> = Class.forName("org.webrtc.VideoFrame", false, loader)
        private val buffer: Class<*> = Class.forName("org.webrtc.VideoFrame\$Buffer", false, loader)
        private val i420: Class<*> = Class.forName("org.webrtc.VideoFrame\$I420Buffer", false, loader)
        private val javaBuf: Class<*> = Class.forName("org.webrtc.JavaI420Buffer", false, loader)
        private val int: Class<*> = Integer.TYPE
        val getBuffer: Method = frame.getMethod("getBuffer")
        val getRotation: Method = frame.getMethod("getRotation")
        val getTimestampNs: Method = frame.getMethod("getTimestampNs")
        val toI420: Method = buffer.getMethod("toI420")
        val width: Method = buffer.getMethod("getWidth")
        val height: Method = buffer.getMethod("getHeight")
        val release: Method = buffer.getMethod("release")
        val dataY: Method = i420.getMethod("getDataY")
        val dataU: Method = i420.getMethod("getDataU")
        val dataV: Method = i420.getMethod("getDataV")
        val strideY: Method = i420.getMethod("getStrideY")
        val strideU: Method = i420.getMethod("getStrideU")
        val strideV: Method = i420.getMethod("getStrideV")
        val wrap: Method = javaBuf.getMethod(
            "wrap", int, int, ByteBuffer::class.java, int, ByteBuffer::class.java, int, ByteBuffer::class.java, int, Runnable::class.java,
        )
        val frameCtor: Constructor<*> = frame.getConstructor(buffer, int, java.lang.Long.TYPE)
    }

    @Volatile private var refl: Refl? = null

    /** Çıkış kareleri için yeniden kullanılan bellek (kare bırakılınca havuza döner). */
    private class Planes(val w: Int, val h: Int) {
        val cw = (w + 1) / 2
        val ch = (h + 1) / 2
        val y: ByteBuffer = ByteBuffer.allocateDirect(w * h)
        val u: ByteBuffer = ByteBuffer.allocateDirect(cw * ch)
        val v: ByteBuffer = ByteBuffer.allocateDirect(cw * ch)
    }

    private val pool = ConcurrentLinkedQueue<Planes>()

    private fun takePlanes(w: Int, h: Int): Planes {
        while (true) {
            val p = pool.poll() ?: break
            if (p.w == w && p.h == h) return p
        }
        return Planes(w, h)
    }

    // Kamera iş parçacığında yeniden kullanılan çalışma dizileri.
    private var srcY = ByteArray(0)
    private var outY = ByteArray(0)
    private var srcU = ByteArray(0)
    private var srcV = ByteArray(0)
    private var integral = IntArray(0)

    private fun process(frame: Any): Any {
        val pr = params
        if (!pr.on || failures > 20) return frame
        return try {
            build(frame, pr)
        } catch (e: Throwable) {
            failures++
            frame
        }
    }

    private fun build(frame: Any, pr: Params): Any {
        var r = refl
        val cl = frame.javaClass.classLoader
        if (r == null || r.loader !== cl) {
            r = Refl(cl)
            refl = r
        }
        val buf = r.getBuffer.invoke(frame)
        val i420 = r.toI420.invoke(buf) ?: return frame
        try {
            val w = r.width.invoke(i420) as Int
            val h = r.height.invoke(i420) as Int
            if (w <= 0 || h <= 0) return frame
            val out = takePlanes(w, h)
            synchronized(this) { filter(pr, r, i420, out, w, h) }
            val onRelease = Runnable { if (pool.size < 4) pool.offer(out) }
            val outBuf = r.wrap.invoke(null, w, h, out.y, w, out.u, out.cw, out.v, out.cw, onRelease)
            val rot = r.getRotation.invoke(frame) as Int
            val ts = r.getTimestampNs.invoke(frame) as Long
            val result = r.frameCtor.newInstance(outBuf, rot, ts)
            failures = 0
            return result
        } finally {
            r.release.invoke(i420)
        }
    }

    private fun readPlane(src: ByteBuffer, stride: Int, w: Int, h: Int, dst: ByteArray) {
        val b = src.duplicate()
        for (row in 0 until h) {
            b.position(row * stride)
            b.get(dst, row * w, w)
        }
    }

    private fun filter(pr: Params, r: Refl, i420: Any, out: Planes, w: Int, h: Int) {
        val n = w * h
        val cw = out.cw
        val ch = out.ch
        val cn = cw * ch
        if (srcY.size < n) {
            srcY = ByteArray(n)
            outY = ByteArray(n)
        }
        if (srcU.size < cn) {
            srcU = ByteArray(cn)
            srcV = ByteArray(cn)
        }
        val sY = srcY
        val oY = outY
        val sU = srcU
        val sV = srcV
        readPlane(r.dataY.invoke(i420) as ByteBuffer, r.strideY.invoke(i420) as Int, w, h, sY)
        readPlane(r.dataU.invoke(i420) as ByteBuffer, r.strideU.invoke(i420) as Int, cw, ch, sU)
        readPlane(r.dataV.invoke(i420) as ByteBuffer, r.strideV.invoke(i420) as Int, cw, ch, sV)
        val lut = pr.y
        if (pr.smoothK > 0) {
            smooth(sY, oY, w, h, pr)
            for (i in 0 until n) oY[i] = lut[oY[i].toInt() and 0xFF]
        } else {
            for (i in 0 until n) oY[i] = lut[sY[i].toInt() and 0xFF]
        }
        val lu = pr.u
        val lv = pr.v
        for (i in 0 until cn) {
            sU[i] = lu[sU[i].toInt() and 0xFF]
            sV[i] = lv[sV[i].toInt() and 0xFF]
        }
        out.y.clear()
        out.y.put(oY, 0, n)
        out.y.position(0)
        out.u.clear()
        out.u.put(sU, 0, cn)
        out.u.position(0)
        out.v.clear()
        out.v.put(sV, 0, cn)
        out.v.position(0)
    }

    /**
     * Kenarı koruyan yumuşatma (yüzey bulanıklığı benzeri): her pikselin çevresindeki ortalama integral görüntüyle
     * (yarıçaptan bağımsız hızda) alınır; ortalamaya yakın pikseller (cilt dokusu, gözenek) ona doğru çekilir, belirgin
     * kenarlar (göz, kaş, dudak, saç) olduğu gibi kalır.
     */
    private fun smooth(src: ByteArray, dst: ByteArray, w: Int, h: Int, pr: Params) {
        val iw = w + 1
        val need = iw * (h + 1)
        if (integral.size < need) integral = IntArray(need)
        val ii = integral
        for (x in 0..w) ii[x] = 0
        for (y in 1..h) {
            var rowSum = 0
            val o = y * iw
            val po = (y - 1) * iw
            val so = (y - 1) * w
            ii[o] = 0
            for (x in 1..w) {
                rowSum += src[so + x - 1].toInt() and 0xFF
                ii[o + x] = ii[po + x] + rowSum
            }
        }
        val rad = maxOf(2, (minOf(w, h) / 90f * (0.6f + pr.smooth)).roundToInt())
        val k = pr.smoothK
        val t1 = 10
        val t2 = 30
        // Kenar dışındaki tam kutular için bölme yerine sabit noktalı çarpma (hız).
        val full = (2 * rad + 1) * (2 * rad + 1)
        val inv = (65536 + full / 2) / full
        for (y in 0 until h) {
            val y1 = maxOf(0, y - rad)
            val y2 = minOf(h, y + rad + 1)
            val r1 = y1 * iw
            val r2 = y2 * iw
            val dh = y2 - y1
            val row = y * w
            for (x in 0 until w) {
                val x1 = maxOf(0, x - rad)
                val x2 = minOf(w, x + rad + 1)
                val sum = ii[r2 + x2] - ii[r1 + x2] - ii[r2 + x1] + ii[r1 + x1]
                val area = dh * (x2 - x1)
                val mean = if (area == full) (sum * inv) ushr 16 else sum / area
                val v = src[row + x].toInt() and 0xFF
                val d = mean - v
                val ad = if (d < 0) -d else d
                val wgt = if (ad <= t1) k else if (ad >= t2) 0 else k * (t2 - ad) / (t2 - t1)
                dst[row + x] = (v + ((d * wgt) shr 8)).toByte()
            }
        }
    }
}
