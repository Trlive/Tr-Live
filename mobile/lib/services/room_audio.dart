import 'dart:async';
import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Odadaki **tüm** sesin tek sahibi.
///
/// ## Çözdüğü iki sorun
///
/// Bir sesli odada iki ayrı ses yolu vardı:
///
/// * **Görüşme yolu** — LiveKit/WebRTC mikrofonu ve odadaki konuşmaları buradan taşır. Android'de
///   bu `voiceCommunication` kullanımıdır; Bluetooth kulaklıkta SCO (görüşme) bağlantısı açılır.
/// * **Medya yolu** — oda müziği ve hediye sesleri `just_audio` ile buradan çalıyordu
///   (`usage: media`). Bluetooth kulaklıkta bu A2DP (müzik) bağlantısıdır.
///
/// Çoğu telefon SCO ile A2DP'yi **aynı anda** kullanamaz. İkisi birden istenince biri susar:
/// kullanıcı "kulaklıkta uygulama sesi gelmiyor" der. (1. sorun)
///
/// Daha kötüsü: yankı gidericinin (AEC) iptal edebilmesi için sesin **referans olarak görünmesi**
/// gerekir. Yankı giderici yalnızca görüşme yolundan çıkan sesi bilir. Medya yolundan çıkan müzik
/// ve hediye sesi hoparlörden çıkıp mikrofona geri girdiğinde AEC onu tanımaz ve **iptal edemez**:
/// karşı taraf odanın müziğini yankı olarak duyar. (2. sorun)
///
/// ## Çözüm
///
/// Oda açıkken uygulamanın bütün sesi görüşme yoluna alınır. Böylece:
/// tek Bluetooth bağlantısı kullanılır (kulaklık sorunu biter) ve müzik/hediye sesi yankı
/// gidericinin referansına girer (yankı biter).
///
/// **Bedeli dürüstçe:** Bluetooth kulaklıkta görüşme bağlantısı dar bantlıdır; müzik hoparlördeki
/// kadar "hi-fi" duyulmaz. Sesli sohbet uygulamasında doğru takas budur — karşı tarafa yankı
/// gitmesindense müzik biraz daha tok duyulur. Kablolu kulaklıkta ve hoparlörde fark yoktur.
///
/// Sorun çıkarsa panelden `voiceAudioPath` kapatılır; uygulama eski davranışa (medya yolu) döner.
/// Bunun için yeni APK gerekmez.
class RoomAudio {
  RoomAudio._();

  /// Oda açıkken sesin görüşme yolundan çalınıp çalınmadığı. Çalarlar (müzik, hediye) bunu dinler:
  /// değer değişince yeni ses yolunu kullanmak için kendilerini yeniden kurarlar.
  static final ValueNotifier<bool> voicePath = ValueNotifier<bool>(false);

  /// Sunucudan gelen ayar (panel → Uygulama ayarları). Oda açılmadan önce yazılır.
  static bool enabled = true;

  /// Telefonun ses seviyesi en altta mı (oda açıkken). Odada ses görüşme kanalından çalar ve Android bu kanalı çoğu
  /// telefonda sıfıra indirmez (en düşük seviye hâlâ duyulur). Kullanıcı sesi sonuna kadar kısınca konuşmalar, oda
  /// müziği ve hediye sesleri uygulama tarafından tamamen susturulur; bir kademe açınca geri gelir.
  static final ValueNotifier<bool> systemSilent = ValueNotifier<bool>(false);
  static StreamSubscription<dynamic>? _volSub;
  static const _volume = EventChannel('trlive/call_volume');

  static void _watchVolume(bool on) {
    if (!on) {
      _volSub?.cancel();
      _volSub = null;
      systemSilent.value = false;
      return;
    }
    if (_volSub != null || kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      _volSub = _volume.receiveBroadcastStream().listen((v) => systemSilent.value = v == true, onError: (_) {});
    } catch (_) {/* eski APK: kanal yok */}
  }

  /// Odada şu an biri konuşuyor mu (ses sunucusunun "konuşanlar" bildirimi). Konuşma varken oda müziği ve hediye
  /// sesleri otomatik kısılır (konuşmanın üstüne çıkmasın); konuşma bitince [_duckHold] kadar sonra geri açılır
  /// (cümle aralarındaki kısa sessizliklerde müzik inip çıkıp "pompalamasın").
  static final ValueNotifier<bool> speaking = ValueNotifier<bool>(false);
  static Timer? _duckTimer;
  static const _duckHold = Duration(milliseconds: 900);

  static void setSpeaking(bool v) {
    if (v) {
      _duckTimer?.cancel();
      _duckTimer = null;
      speaking.value = true;
      return;
    }
    if (!speaking.value || _duckTimer != null) return;
    _duckTimer = Timer(_duckHold, () {
      _duckTimer = null;
      speaking.value = false;
    });
  }

  /// Konuşma varken müzik bu oranda çalar (yaklaşık -6 dB).
  static const musicDuck = 0.5;

  /// Hediye / araç sesi düzeyi: normalde ve konuşma varken. Hediye videolarının sesi çoğu zaman çok yüksek
  /// kaydedilmiş; tam düzeyde çalınca konuşmaları bastırıyordu.
  static double get effectVolume => speaking.value ? 0.3 : 0.6;

  static int _rooms = 0;
  static AudioSession? _session;

  static Future<AudioSession> _ensure() async => _session ??= await AudioSession.instance;

  /// Oda açılınca çağrılır (ses sunucusuna bağlanmadan ÖNCE).
  /// Oda değiştirirken yeni oda, eskisi kapanmadan açılabilir: sayaçla korunur.
  static Future<void> enter() async {
    _rooms++;
    _watchVolume(true);
    if (_rooms > 1 && voicePath.value == enabled) return; // zaten doğru moddayız
    await _configure(enabled);
  }

  /// Oda kapanınca çağrılır. Son oda da kapandıysa ses medya moduna döner
  /// (uygulamanın geri kalanında müzik/video normal kalitede çalsın).
  static Future<void> leave() async {
    if (_rooms > 0) _rooms--;
    if (_rooms > 0) return;
    _watchVolume(false);
    _duckTimer?.cancel();
    _duckTimer = null;
    speaking.value = false;
    await _configure(false);
    try {
      await (await _ensure()).setActive(false);
    } catch (_) {/* desteklenmeyen cihaz */}
  }

  static Future<void> _configure(bool voice) async {
    try {
      final s = await _ensure();
      await s.configure(voice ? _voiceConfig : _mediaConfig);
      await s.setActive(true);
      voicePath.value = voice;
    } catch (_) {
      // Ses oturumu kurulamadı (desteklenmeyen cihaz): oda yine çalışır, eski davranış sürer.
      voicePath.value = false;
    }
  }

  /// Görüşme yolu: ses, mikrofonla aynı hattan çıkar. Yankı giderici bu sesi referans olarak görür.
  static const _voiceConfig = AudioSessionConfiguration(
    avAudioSessionCategory: AVAudioSessionCategory.playAndRecord,
    avAudioSessionCategoryOptions: AVAudioSessionCategoryOptions.allowBluetooth,
    avAudioSessionMode: AVAudioSessionMode.voiceChat,
    androidAudioAttributes: AndroidAudioAttributes(
      contentType: AndroidAudioContentType.speech,
      usage: AndroidAudioUsage.voiceCommunication,
    ),
    // Arama gelince ses tamamen susar (kısılmaz): arama sinyalini CallGuard böyle yakalar.
    androidAudioFocusGainType: AndroidAudioFocusGainType.gain,
    androidWillPauseWhenDucked: false,
  );

  /// Medya yolu: oda kapalıyken (ve ayar kapalıyken) eski davranış.
  static const _mediaConfig = AudioSessionConfiguration(
    androidAudioAttributes: AndroidAudioAttributes(
      contentType: AndroidAudioContentType.music,
      usage: AndroidAudioUsage.media,
    ),
    androidAudioFocusGainType: AndroidAudioFocusGainType.gain,
    androidWillPauseWhenDucked: false,
  );

  /// Ses oturumu kesinti akışı (arama algılama). CallGuard kullanır.
  static Future<Stream<AudioInterruptionEvent>> interruptions() async => (await _ensure()).interruptionEventStream;
}
