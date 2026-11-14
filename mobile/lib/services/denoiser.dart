import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc_noise_suppression/flutter_webrtc_noise_suppression.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Yapay zekâ gürültü azaltma (RNNoise). Mikrofon sesi, telefonun / WebRTC'nin gürültü bastırmasından sonra ve
/// gönderilmeden hemen önce RNNoise'tan geçer (flutter_webrtc'nin mikrofon işleme yuvası).
///
/// Ne işe yarar: klavye, tabak-çatal, TV müziği, trafik gibi konuşma dışı sesleri ek olarak azaltır.
/// Sınırı: RNNoise insan sesine benzeyen her şeyi korur; yanınızda konuşan birinin sesi büyük ölçüde geçer.
///
/// Deneysel: Efekt ve ses'ten kapatılabilir (anında). Bağlama oda ses bağlantısı kurulduktan sonra yapılır
/// (eklenti, flutter_webrtc'nin ses altyapısı oluşmadan bağlanamaz); odadan çıkınca çıkarılır.
class Denoiser {
  Denoiser._();
  static const _key = 'ai_denoise';
  static const _bridge = WebrtcNoiseSuppressionBridge();

  static bool enabled = true;
  static bool _loaded = false;
  static bool _attached = false;
  static int _users = 0; // açık oda sayısı (küçültülmüş oda + yeni oda geçişi)

  static bool get supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

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

  static Future<void> _sync() async {
    if (!supported) return;
    await load();
    final want = enabled && _users > 0;
    if (want && !_attached) {
      // Ses altyapısı henüz hazır değilse eklenti false döner: kısa aralıkla birkaç kez denenir.
      for (var i = 0; i < 3 && !_attached; i++) {
        try {
          _attached = await _bridge.attach().timeout(const Duration(seconds: 6));
        } catch (_) {
          _attached = false;
        }
        if (!_attached) await Future<void>.delayed(const Duration(seconds: 2));
        if (!(enabled && _users > 0)) break;
      }
      if (_attached && !(enabled && _users > 0)) await _detach();
    } else if (!want && _attached) {
      await _detach();
    }
  }

  static Future<void> _detach() async {
    _attached = false;
    try {
      await _bridge.detach().timeout(const Duration(seconds: 4));
    } catch (_) {}
  }
}
