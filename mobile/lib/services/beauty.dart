import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:livekit_client/livekit_client.dart' as lk;
import 'package:shared_preferences/shared_preferences.dart';

/// Güzellik ayarları (0..1) ve renk filtresi.
@immutable
class BeautySettings {
  final double smooth; // pürüzsüzleştirme
  final double bright; // aydınlatma
  final double white; // beyazlatma
  final double rosy; // pembelik (allık)
  final int tone; // 0 doğal, 1 sıcak, 2 soğuk, 3 canlı, 4 pembe, 5 siyah-beyaz, 6 nostalji

  const BeautySettings({this.smooth = 0, this.bright = 0, this.white = 0, this.rosy = 0, this.tone = 0});

  /// Önerilen başlangıç (tek dokunuşla "Doğal güzellik").
  static const natural = BeautySettings(smooth: 0.55, bright: 0.25, white: 0.25, rosy: 0.15);

  bool get isOff => smooth < 0.01 && bright < 0.01 && white < 0.01 && rosy < 0.01 && tone == 0;

  BeautySettings copyWith({double? smooth, double? bright, double? white, double? rosy, int? tone}) => BeautySettings(
        smooth: smooth ?? this.smooth,
        bright: bright ?? this.bright,
        white: white ?? this.white,
        rosy: rosy ?? this.rosy,
        tone: tone ?? this.tone,
      );

  Map<String, Object> toMap() => {'smooth': smooth, 'bright': bright, 'white': white, 'rosy': rosy, 'tone': tone};

  static double _d(Object? v) => v is num ? v.toDouble().clamp(0.0, 1.0) : 0.0;

  factory BeautySettings.fromMap(Map<String, dynamic> m) => BeautySettings(
        smooth: _d(m['smooth']),
        bright: _d(m['bright']),
        white: _d(m['white']),
        rosy: _d(m['rosy']),
        tone: m['tone'] is int ? (m['tone'] as int).clamp(0, 6) : 0,
      );
}

/// Güzellik filtresi: kendi kamera karemizi telefonda (yerel kodla) işler; yayına ve önizlemeye işlenmiş görüntü gider.
/// Ayarlar telefonda saklanır ve kamera her açıldığında yeniden uygulanır.
class Beauty {
  Beauty._();

  static const _ch = MethodChannel('trlive/beauty');
  static const _key = 'beauty_v1';
  static final ValueNotifier<BeautySettings> settings = ValueNotifier(const BeautySettings());
  static bool _loaded = false;
  static String? _trackId;

  /// Son bağlanma sonucu: true → bu cihazda çalışıyor, false → desteklenmiyor, null → henüz kamera yok.
  static final ValueNotifier<bool?> supported = ValueNotifier(null);

  static Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_key);
      if (raw != null) settings.value = BeautySettings.fromMap(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {/* varsayılan: kapalı */}
  }

  /// Kamera takibine bağlanır (takip değişince, ör. kamera çevrilince, yeniden çağrılır).
  static Future<void> attach(lk.LocalVideoTrack? track) async {
    await load();
    final id = track?.mediaStreamTrack.id;
    if (id == null || id.isEmpty) return;
    if (id == _trackId && supported.value == true) return;
    try {
      final r = await _ch.invokeMethod<String>('attach', {'trackId': id, ...settings.value.toMap()});
      _trackId = r == 'ok' ? id : null;
      supported.value = r == 'ok';
      if (r != 'ok') debugPrint('Güzellik filtresi bağlanamadı: $r');
    } catch (e) {
      _trackId = null;
      supported.value = false;
      debugPrint('Güzellik filtresi bağlanamadı: $e');
    }
  }

  /// Katılımcının yayındaki kamera takibine bağlanır.
  static Future<void> attachParticipant(lk.LocalParticipant? p) async {
    if (p == null) return;
    for (final pub in p.videoTrackPublications) {
      final t = pub.track;
      if (t != null) {
        await attach(t);
        return;
      }
    }
  }

  static Future<void> detach() async {
    _trackId = null;
    try {
      await _ch.invokeMethod('detach');
    } catch (_) {}
  }

  static Future<void> update(BeautySettings s, {bool save = true}) async {
    settings.value = s;
    try {
      await _ch.invokeMethod('setParams', s.toMap());
    } catch (_) {}
    if (!save) return;
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_key, jsonEncode(s.toMap()));
    } catch (_) {}
  }
}
