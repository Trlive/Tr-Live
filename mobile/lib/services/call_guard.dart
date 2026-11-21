import 'dart:async';
import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'room_audio.dart';

/// Telefon araması (ya da WhatsApp gibi bir arama) gelince Android, uygulamaya "sesi geçici olarak bırak" der.
/// Bu sınıf o sinyali dinler: [inCall] true olunca oda sesi ve mikrofon kapatılır, arama bitince geri açılır.
/// (Oda müziği çalar zaten aynı sinyalle kendiliğinden durup devam eder.)
class CallGuard {
  CallGuard._();
  static final CallGuard instance = CallGuard._();

  /// Şu an bir arama sürüyor mu.
  final ValueNotifier<bool> inCall = ValueNotifier<bool>(false);
  StreamSubscription<AudioInterruptionEvent>? _sub;
  // Açık oda sayısı: oda değiştirirken yeni oda eskisi kapanmadan açılabilir; son oda kapanınca bırakılır.
  int _users = 0;
  Timer? _poll;
  bool _phoneMode = false; // telefonun ses modu: çalıyor / görüşmede
  bool _native = false; // Android'in arama durumu (MainActivity: TelephonyManager + ses modu)
  StreamSubscription<dynamic>? _nativeSub;
  static const _phoneCall = EventChannel('trlive/phone_call');
  static bool _askedPermission = false;

  // Ses odağı kaybı arama sayılmaz: başka uygulamaya geçip video/müzik açınca da odak gider ve mikrofon yanlışlıkla
  // kapanıyordu (arka planda konuşma sesi gitmiyordu). Arama yalnızca telefonun arama durumu / ses modundan anlaşılır.
  void _update() => inCall.value = _phoneMode || _native;

  /// Asıl arama sinyali: Android'in kendi arama durumu. Oda sesi sistemi ses odağını kendisi aldığı için
  /// odak sinyali çoğu telefonda uygulamaya hiç gelmiyor; bu yol her durumda çalışır ("telefon durumu" izniyle).
  void _startNative() {
    if (_nativeSub != null || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      var got = false;
      _nativeSub = _phoneCall.receiveBroadcastStream().listen((v) {
        got = true;
        _native = v == true;
        _update();
      }, onError: (_) {
        // Yerel izleyici çalışmıyorsa (çok eski APK) yedek yol: ses modunu ara ara oku.
        if (_users > 0) _startPoll();
      });
      // Yerel izleyici başlarken hemen ilk durumu yollar; 3 sn'de hiç gelmediyse (kanal yok) yedek yola geç.
      Timer(const Duration(seconds: 3), () {
        if (!got && _nativeSub != null && _users > 0) _startPoll();
      });
    } catch (_) {
      if (_users > 0) _startPoll(); // eski APK: kanal yok
    }
  }

  /// "Telefon durumu" iznini (bir kez) ister. Diğer izin pencereleri kapandıktan sonra çağrılır
  /// (Android aynı anda iki izin penceresi açmaz; ikincisi sessizce reddedilir).
  Future<void> requestPhonePermission() async {
    // Ek izin penceresi açılmaz (kullanıcıyı yormamak için). Telefon izni zaten verilmişse arama durumu ondan da okunur;
    // verilmemişse arama telefonun ses modundan anlaşılır.
    if (_askedPermission || defaultTargetPlatform != TargetPlatform.android) return;
    _askedPermission = true;
  }

  /// YEDEK: Android'in ses modunu 2 sn'de bir okur (zil çalıyor / görüşme sürüyor). Normalde gerekmez; ses modunu
  /// MainActivity zaten izliyor (Android 12+ olayla, sorgusuz). Yalnızca yerel kanal yoksa devreye girer (pil).
  void _startPoll() {
    if (_poll != null || defaultTargetPlatform != TargetPlatform.android) return;
    final am = AndroidAudioManager();
    var busy = false;
    _poll = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (busy) return;
      busy = true;
      try {
        final m = await am.getMode();
        if (_poll != null) {
          _phoneMode = m == AndroidAudioHardwareMode.ringtone || m == AndroidAudioHardwareMode.inCall;
          _update();
        }
      } catch (_) {
        // Okunamayan mod (yeni Android sürümlerindeki yönlendirme modları): arama sayılmaz, ses takılı kalmasın.
        if (_poll != null) {
          _phoneMode = false;
          _update();
        }
      } finally {
        busy = false;
      }
    });
  }

  /// Oda açılınca çağrılır.
  Future<void> start() async {
    _users++;
    _startNative();
    if (_sub != null) return;
    try {
      // Ses oturumunu artık RoomAudio kurar (oda açıkken görüşme yolu, kapalıyken medya yolu).
      // Burada yalnızca kesinti (arama) sinyali dinlenir; iki yerden ayar yapılırsa biri diğerini ezer
      // ve kulaklık yönlendirmesi bozulurdu.
      _sub ??= (await RoomAudio.interruptions()).listen((_) {/* yalnızca odak sinyalini almak için */});
    } catch (_) {/* desteklenmeyen cihaz: arama algılanmaz, oda yine çalışır */}
  }

  /// Oda kapanınca çağrılır. Ses odağını RoomAudio bırakır.
  Future<void> stop() async {
    if (_users > 0) _users--;
    if (_users > 0) return;
    await _sub?.cancel();
    _sub = null;
    _poll?.cancel();
    _poll = null;
    await _nativeSub?.cancel();
    _nativeSub = null;
    _native = false;
    _phoneMode = false;
    inCall.value = false;
  }
}
