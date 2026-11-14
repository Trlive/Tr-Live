import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' as rtc;
import 'package:shared_preferences/shared_preferences.dart';

/// Mikrofon ses işleme yöntemi (Android). Uygulama açılırken, LiveKit / WebRTC kullanılmadan önce bir kez uygulanır.
///
/// Varsayılan (v2.100.3): **telefonun kendi ses işlemesi**. Ortam kalabalığına (arkadaki insan sesleri) karşı en etkili
/// ücretsiz araç telefonun çoklu mikrofonla yaptığı işlemedir (ağızdan gelmeyen sesleri kısar); telefonda engelleyici
/// yoksa WebRTC'nin yazılım gürültü bastırması zaten devreye girer. v2.100.2'de varsayılan "uygulamanın ses işlemesi"
/// yapılmıştı; bu, telefonun çoklu mikrofon işlemesini de kapattığı için kalabalık sesini artırabiliyordu.
///
/// "Uygulamanın ses işlemesi" (seçenek): telefonun efektleri kapatılır, WebRTC'nin yazılım işlemesi (AEC3, gürültü
/// bastırma, otomatik ses düzeyi, düşük frekans süzgeci) her telefonda aynı çalışır. Telefonun kendi işlemesi kötü olan
/// (sesi boğan, gürültüyü geçiren) cihazlar için.
///
/// LiveKit'in kendi "bypassVoiceProcessing" ayarı KULLANILMAZ: o, WebRTC'nin yazılım işlemesini de kapatır (yankı olur).
/// Burada yalnız ses aygıtı katmanında (flutter_webrtc) telefonun efektleri kapatılır; LiveKit yazılım işlemeyi ister.
///
/// [platform] = false: uygulamanın ses işlemesi (Efekt ve ses'ten); uygulama yeniden açılınca geçerli olur.
class AudioProcessing {
  AudioProcessing._();
  // Anahtar v2.100.3'te değişti: v2.100.2'nin varsayılanı (uygulamanın işlemesi) taşınmaz, herkes telefonun işlemesine döner.
  static const _key = 'audio_platform_processing_v2';

  /// Kayıtlı tercih: telefonun kendi ses işlemesi (varsayılan).
  static bool platform = true;

  /// Bu oturumda gerçekten uygulanan yöntem (değişiklik yeniden açılışta geçerli olur).
  static bool applied = true;

  static bool get supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<void> init() async {
    if (!supported) return;
    try {
      platform = (await SharedPreferences.getInstance()).getBool(_key) ?? true;
    } catch (_) {}
    applied = platform;
    if (platform) return; // varsayılan WebRTC ayarı (telefonun efektleri)
    try {
      await rtc.WebRTC.initialize(options: {'bypassVoiceProcessing': true}).timeout(const Duration(seconds: 3));
    } catch (_) {
      applied = true; // başlatılamadıysa telefonun işlemesiyle devam
    }
  }

  static Future<void> setPlatform(bool v) async {
    platform = v;
    try {
      await (await SharedPreferences.getInstance()).setBool(_key, v);
    } catch (_) {}
  }

  /// Seçim bu oturumdakinden farklı mı (uygulamayı yeniden açmak gerekir).
  static bool get restartNeeded => supported && platform != applied;
}
