// ignore_for_file: experimental_member_use
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:livekit_client/livekit_client.dart' as lk;

/// Kulaklık (kablolu ve Bluetooth) takılı mı: yalnızca izlenir.
/// v2.118.1: Kulaklıkta ses artık "medya" moduna ALINMAZ. Oda açıkken medya moduna geçmek WebRTC'nin görüşme için kurulmuş
/// ses hattını bozuyordu: bazı telefonlarda kulaklıklı kullanıcının mikrofonu gitmiyor, odanın sesi de ona gelmiyordu.
/// Diğer sesli oda uygulamaları gibi her zaman "görüşme" modu kullanılır; ses LiveKit tarafından otomatik olarak
/// kulaklığa (Bluetooth / kablolu) yönlendirilir.
class HeadsetAudio {
  HeadsetAudio._();
  static final HeadsetAudio instance = HeadsetAudio._();

  final ValueNotifier<bool> connected = ValueNotifier<bool>(false);
  StreamSubscription<dynamic>? _sub;
  bool? _applied;
  bool _manual = false; // ses ayarını biz devraldık mı (kulaklık takıldı)

  /// Oda açılınca (ses bağlantısından önce) çağrılır.
  Future<void> start() async {
    if (defaultTargetPlatform != TargetPlatform.android) return;
    try {
      final now = await const MethodChannel('trlive/device').invokeMethod<bool>('headsetConnected') ?? false;
      await _apply(now);
    } catch (_) {/* eski derleme: varsayılan ayar */}
    if (_sub != null) return;
    try {
      _sub = const EventChannel('trlive/headset').receiveBroadcastStream().listen((v) => _apply(v == true), onError: (_) {});
    } catch (_) {}
  }

  /// Oda kapanınca (ses bağlantısı kapanmadan önce) çağrılır: ses ayarı LiveKit'e geri verilir.
  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    _applied = null;
    if (!_manual) return;
    _manual = false;
    try {
      await lk.AudioManager.instance.setAudioSessionOptions(const lk.AudioSessionOptions.communication());
      await lk.AudioManager.instance.setAudioSessionManagementMode(lk.AudioSessionManagementMode.automatic);
    } catch (_) {/* desteklenmeyen cihaz */}
  }

  Future<void> _apply(bool headset) async {
    connected.value = headset;
    if (_applied == headset) return;
    _applied = headset;
    // Eski sürümde medya moduna alınmışsa görüşme moduna ve LiveKit'in otomatik yönetimine geri döner.
    if (!_manual) return;
    _manual = false;
    try {
      await lk.AudioManager.instance.setAudioSessionOptions(const lk.AudioSessionOptions.communication());
      await lk.AudioManager.instance.setAudioSessionManagementMode(lk.AudioSessionManagementMode.automatic);
    } catch (_) {/* desteklenmeyen cihaz */}
  }
}
