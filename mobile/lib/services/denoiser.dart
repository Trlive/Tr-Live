import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';

/// Yapay zekâ gürültü azaltma (RNNoise). Mikrofon sesi, telefonun / WebRTC'nin gürültü bastırmasından sonra ve
/// gönderilmeden hemen önce RNNoise'tan geçer (flutter_webrtc'nin mikrofon işleme yuvası).
///
/// Ne işe yarar: klavye, tabak-çatal, TV müziği, trafik gibi konuşma dışı sesleri ek olarak azaltır.
/// Sınırı: RNNoise insan sesine benzeyen her şeyi korur; yanınızda konuşan birinin sesi büyük ölçüde geçer.
///
/// ## ŞU AN DEVRE DIŞI — eklenti kaynağı kayboldu
///
/// Eklenti `github.com/SERDUN/flutter_webrtc_noise_suppression` deposundan geliyordu. O depo
/// artık erişilemiyor (silinmiş ya da özel yapılmış): `git clone` kimlik doğrulaması istiyor.
/// Bu yüzden **her APK derlemesi `flutter pub get` adımında kırılıyordu** — bağımlılık
/// indirilemediği için derleme hiç başlayamıyordu.
///
/// Bir üretim derlemesini, kontrolümüz dışındaki bir kişisel depoya bağlı bırakmak baştan
/// kırılgandı; pubspec'teki not da bunu öngörüyordu: *"Sorun çıkarsa bu satır ve denoiser.dart'taki
/// içe aktarma kaldırılır."* Şimdi o durum gerçekleşti.
///
/// Sınıf **yerinde bırakıldı** ve çağrı noktaları (oda ekranı, efekt ayarları) olduğu gibi
/// çalışıyor — yalnızca hiçbir şey yapmıyor. Çağrıları tek tek sökmek, eklenti geri geldiğinde
/// ya da yerine bir başkası konduğunda hepsini yeniden yazmak demekti.
///
/// `supported` artık **false**: arayüz, açılamayacak bir anahtarı kullanıcıya göstermez.
///
/// Yerine ne var: WebRTC'nin kendi gürültü bastırması (`noiseSuppression`) ve ses yalıtımı
/// (`voiceIsolation`) oda ekranında zaten açık — temel gürültü azaltma çalışmaya devam ediyor.
/// Kaybedilen, RNNoise'un klavye/tabak gibi sesler için verdiği EK kazanç.
class Denoiser {
  Denoiser._();
  static const _key = 'ai_denoise';

  static bool enabled = true;
  static bool _loaded = false;
  static int _users = 0; // açık oda sayısı (küçültülmüş oda + yeni oda geçişi)

  /// Eklenti kaynağı kaybolduğu için şu an hiçbir platformda desteklenmiyor.
  /// Yerine bir eklenti konduğunda burası tekrar açılır; çağrı noktaları değişmez.
  static bool get supported => false;

  static Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      enabled = (await SharedPreferences.getInstance()).getBool(_key) ?? true;
    } catch (_) {}
  }

  /// Oda ses bağlantısı kurulunca çağrılır.
  static Future<void> roomStarted() async {
    _users++;
    await _sync();
  }

  /// Oda kapanınca çağrılır.
  static Future<void> roomStopped() async {
    if (_users > 0) _users--;
    await _sync();
  }

  static Future<void> setEnabled(bool v) async {
    enabled = v;
    try {
      await (await SharedPreferences.getInstance()).setBool(_key, v);
    } catch (_) {}
    await _sync();
  }

  /// Eklenti yokken yapacak bir şey yok. Tercih yine de saklanıyor: eklenti geri geldiğinde
  /// kullanıcının ayarı olduğu gibi devam etsin.
  static Future<void> _sync() async {
    if (!supported) return;
    await load();
  }
}
