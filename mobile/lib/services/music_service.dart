import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'api.dart';
import 'call_guard.dart';
import 'effect_prefs.dart';
import 'room_audio.dart';

/// Odadaki ortak müziği her cihazda yerel olarak, sunucu konumuna senkron çalar.
/// Sunucu "positionMs" (alındığı andaki konum) gönderir; şimdiki konum = positionMs + (şimdi - alındığıAn).
class MusicService {
  MusicService._();
  static final MusicService instance = MusicService._();

  final ValueNotifier<Map<String, dynamic>?> state = ValueNotifier<Map<String, dynamic>?>(null);
  final ValueNotifier<String?> error = ValueNotifier<String?>(null);
  final ValueNotifier<double> volume = ValueNotifier<double>(1.0);
  final ValueNotifier<bool> muted = ValueNotifier<bool>(false);

  AudioPlayer? _player;
  String? _roomId;
  String? _trackId;
  DateTime _receivedAt = DateTime.now();
  Timer? _resync;
  int _gen = 0; // her yeni durum/odadan çıkış sayacı artırır; eski (geç gelen) işlemler sonucu ezmesin

  /// Çaların hangi ses yoluyla kurulduğu. Oda açılıp ses görüşme yoluna alınınca (RoomAudio) çalar
  /// yeniden kurulur: just_audio, ses aygıtı ayarlarını çaları yaratırken okur, sonradan değiştirmez.
  bool? _playerVoicePath;

  AudioPlayer get _p {
    final want = RoomAudio.voicePath.value;
    if (_player != null && _playerVoicePath != want) {
      final old = _player;
      _player = null;
      old?.dispose().catchError((_) {});
    }
    _playerVoicePath = want;
    return _player ??= AudioPlayer();
  }

  /// DJ telefonunda şarkı sunucudan indirilmez, telefondaki dosyadan çalar (sunucu kimliği → dosya yolu).
  final Map<String, String> _localFiles = {};

  /// Yükleme sürerken DJ telefonunda şarkı hemen yerelden başlar; bu sırada gelen eski sunucu durumları çaları ellemez.
  String? _pendingLocal;

  /// Çalarda şu an yerel önizlemesi açık olan dosya (başarısızlıkta durdurmak için).
  String? _previewPath;

  /// DJ: seçilen şarkıyı yükleme beklemeden telefondaki dosyadan hemen çalmaya başlar. Açılamazsa false.
  Future<bool> startLocalPreview(String path) async {
    _gen++; // yolda olan eski durum işlemleri önizlemeyi bozmasın
    _pendingLocal = path;
    _previewPath = path;
    _trackId = null;
    try {
      await _p.setFilePath(path);
      if (_pendingLocal != path) return false;
      await _p.setVolume(_vol);
      unawaited(_p.play().catchError((_) {}));
      return true;
    } catch (_) {
      // Yerel dosya açılamadı: yükleme sonrası sunucudan çalınır.
      if (_pendingLocal == path) {
        _pendingLocal = null;
        _previewPath = null;
      }
      return false;
    }
  }

  /// Yerel önizlemenin şu anki konumu (yükleme bitince odadakiler buradan başlar).
  int get localPositionMs => _pendingLocal == null ? 0 : _p.position.inMilliseconds;

  /// Sunucudaki şarkı [trackId] bu telefondaki [path] dosyasıdır: DJ telefonu onu indirmeden yerelden çalar.
  void registerLocalFile(String trackId, String path) => _localFiles[trackId] = path;

  /// Oda şarkıya geçti: çalar yeniden yüklenmeden devam eder. [restart]: odadakiler baştan başladıysa DJ de başa döner.
  void finishLocalPreview(String path, String trackId, {bool restart = false}) {
    _localFiles[trackId] = path;
    if (_pendingLocal != path) return;
    _pendingLocal = null;
    _previewPath = null;
    _trackId = trackId;
    if (restart) _p.seek(Duration.zero).catchError((_) {});
  }

  /// Yükleme / başlatma başarısız: yerel önizleme durur, odadaki duruma dönülür.
  Future<void> cancelLocalPreview(String path) async {
    final mine = _pendingLocal == path || _previewPath == path;
    if (_pendingLocal == path) _pendingLocal = null;
    if (_previewPath == path) _previewPath = null;
    if (!mine) return;
    _trackId = null;
    try {
      await _player?.stop();
    } catch (_) {}
    await refresh();
  }

  /// Müziği dinlenen oda.
  String? get roomId => _roomId;
  bool _callHooked = false;

  /// Odanın müzik ses düzeyi (0–1): müziği çalan kişi (DJ) ayarlar, herkeste aynı.
  double get roomVolume => (_pendingVol ?? (state.value?['volume'] as num?)?.toDouble() ?? 1.0).clamp(0.0, 1.0);

  /// DJ'nin kaydırdığı, henüz sunucudan geri gelmemiş düzey (eski yayın kaydırıcıyı geri zıplatmasın).
  double? _pendingVol;

  /// Müzik kutusunu bu telefon mu yönetiyor (müziği çalan kişi). Kutu yalnızca ona görünür.
  bool isController(String? userId) => userId != null && state.value?['controlledBy']?.toString() == userId && mapOf(state.value?['track']) != null;

  /// Çalınacak ses düzeyi: kullanıcı kıstıysa ya da telefon araması sürüyorsa 0; değilse oda düzeyi × kendi düzeyi.
  double get _vol => muted.value || EffectPrefs.roomMuted.value || CallGuard.instance.inCall.value || RoomAudio.systemSilent.value ? 0 : volume.value * roomVolume * trackGain * (RoomAudio.speaking.value ? RoomAudio.musicDuck : 1.0);

  /// Parçanın ses yüksekliği eşitleme kazancı (sunucu ölçer: music_tracks.gain_db, yalnızca kısar). Ölçülmemiş
  /// parça (yeni yüklenmiş, telefondaki önizleme, dış adres) ortalama bir düzeyde (-4 dB) çalar: ölçülen parçaların
  /// çoğu (günümüz kayıtları) bu düzeyin altına iner, kısık kayıtlar ise bu düzeyin üstünde kalmaz.
  double get trackGain {
    final g = (mapOf(state.value?['track'])?['gainDb'] as num?)?.toDouble();
    if (_trackId == null || g == null) return 0.63;
    return math.pow(10, g.clamp(-20.0, 0.0) / 20).toDouble();
  }

  /// Konuşma başlayınca / bitince müzik düzeyi birden değil ~300 ms'de yumuşakça değişir.
  Timer? _ramp;
  void _rampVolume() {
    final p = _player;
    if (p == null) return;
    _ramp?.cancel();
    final from = p.volume;
    final to = _vol;
    var i = 0;
    _ramp = Timer.periodic(const Duration(milliseconds: 50), (t) {
      i++;
      final v = i >= 6 ? to : from + (to - from) * i / 6;
      p.setVolume(v).catchError((_) {});
      if (i >= 6) t.cancel();
    });
  }

  Timer? _volSend;

  /// DJ ses düzeyini değiştirir: kendi telefonunda hemen, odadakilerde kısa bir beklemeyle (kaydırırken istek yağmasın).
  void setRoomVolume(double v) {
    final id = _roomId;
    final s = state.value;
    if (id == null || s == null) return;
    _pendingVol = v;
    state.value = {...s, 'volume': v};
    _player?.setVolume(_vol).catchError((_) {});
    _volSend?.cancel();
    _volSend = Timer(const Duration(milliseconds: 350), () async {
      await Api.post('/api/rooms/$id/music/volume', {'volume': double.parse(v.toStringAsFixed(2))}).catchError((_) => <String, dynamic>{});
      // Bu arada yeni kaydırma yoksa sunucu değeri esas alınır.
      if (_pendingVol == v && _volSend?.isActive != true) _pendingVol = null;
    });
  }

  /// Panelde ilerleme çubuğu için şimdiki konum (ms).
  int currentPositionMs() {
    final s = state.value;
    if (s == null) return 0;
    final base = (s['positionMs'] as num?)?.toInt() ?? 0;
    if (s['status'] != 'playing') return base;
    final dur = (mapOf(s['track'])?['durationMs'] as num?)?.toInt() ?? 1 << 30;
    final pos = base + DateTime.now().difference(_receivedAt).inMilliseconds;
    return pos > dur ? dur : pos;
  }

  Future<void> bind(String roomId) async {
    _roomId = roomId;
    if (!_callHooked) {
      _callHooked = true;
      CallGuard.instance.inCall.addListener(() => _player?.setVolume(_vol).catchError((_) {}));
      // Ses yolu değişince (oda açıldı / kapandı) çalan şarkı yeni yoldan devam eder.
      RoomAudio.voicePath.addListener(_rebindPlayer);
      EffectPrefs.roomMuted.addListener(() => _player?.setVolume(_vol).catchError((_) {}));
      RoomAudio.systemSilent.addListener(() => _player?.setVolume(_vol).catchError((_) {}));
      RoomAudio.speaking.addListener(_rampVolume);
    }
    await refresh();
    _resync?.cancel();
    // Sapmayı düzeltmek için dakikada bir sunucu durumuyla yeniden eşitle — yalnızca müzik çalarken (durum değişiklikleri
    // zaten soketten anında gelir; müzik yokken boşuna sorulmaz).
    _resync = Timer.periodic(const Duration(seconds: 60), (_) {
      if (state.value?['status'] == 'playing') refresh();
    });
  }

  Future<void> refresh() async {
    final id = _roomId;
    if (id == null) return;
    final g = _gen;
    try {
      final r = await Api.get('/api/rooms/$id/music');
      final s = mapOf(r['state']);
      // Bu sırada soketten daha yeni bir durum geldiyse (g değişti) eski yanıt uygulanmaz.
      if (s != null && _roomId == id && g == _gen) await apply(s);
    } catch (_) {/* oda kapanmış olabilir */}
  }

  Future<void> apply(Map<String, dynamic> s) async {
    final g = ++_gen;
    bool stale() => g != _gen || _roomId == null; // odadan çıkıldı ya da daha yeni durum geldi
    _receivedAt = DateTime.now();
    state.value = s;
    final track = mapOf(s['track']);
    final status = s['status'];
    if (_pendingLocal != null) return; // DJ yerel önizlemede; yükleme bitince sunucu durumuna geçilir
    try {
      if (track == null || status == 'stopped') {
        _trackId = null;
        await _player?.stop();
        return;
      }
      final url = Api.absoluteUrl(track['url'] as String?);
      if (url == null) return;
      var fresh = false;
      if (track['id'] != _trackId) {
        _trackId = null; // yükleme başarısız olursa sonraki durumda yeniden denensin
        final local = _localFiles[track['id']];
        // DJ telefonu: dosya telefonda varsa indirmeden yerelden çalar.
        if (local != null) {
          try {
            await _p.setFilePath(local);
          } catch (_) {
            if (stale()) return;
            _localFiles.remove(track['id']);
            await _p.setUrl(url);
          }
        } else {
          await _p.setUrl(url);
        }
        if (stale()) return;
        _trackId = track['id'] as String?;
        fresh = true;
      }
      error.value = null;
      if (_p.volume != _vol) await _p.setVolume(_vol);
      if (stale()) return;
      final position = (s['positionMs'] as num?)?.toInt() ?? 0;
      final target = Duration(milliseconds: position + (status == 'playing' ? 150 : 0));
      // Yalnızca yeni şarkıda ya da gerçek sapmada konum atlanır. Her eşitlemede atlamak (seek) akışı
      // yeniden arabelleğe aldırıyor, müzik takılıp ağır çalışıyordu.
      if (fresh || (_p.position - target).inMilliseconds.abs() > 1500) {
        await _p.seek(target);
        if (stale()) return;
      }
      if (status == 'playing') {
        if (!_p.playing) unawaited(_p.play().catchError((_) {})); // play() şarkı bitene kadar tamamlanmaz; beklenmez
      } else if (_p.playing) {
        await _p.pause();
      }
    } catch (e) {
      if (!stale()) error.value = 'Müzik çalınamadı. Bağlantınızı kontrol edin.';
    }
  }

  Future<void> setVolume(double v) async {
    volume.value = v;
    await _player?.setVolume(_vol);
  }

  Future<void> setMuted(bool m) async {
    muted.value = m;
    await _player?.setVolume(_vol);
  }

  Future<void> unbind() async {
    _gen++;
    _pendingLocal = null;
    _previewPath = null;
    _volSend?.cancel();
    _pendingVol = null;
    _resync?.cancel();
    _resync = null;
    _roomId = null;
    _trackId = null;
    state.value = null;
    error.value = null;
    try {
      await _player?.stop();
    } catch (_) {/* yoksay */}
  }

  /// Ses yolu değişti: çalar yeni ses aygıtı ayarıyla yeniden kurulur, şarkı kaldığı yerden sürer.
  void _rebindPlayer() {
    if (_player == null || _playerVoicePath == RoomAudio.voicePath.value) return;
    final playing = _player!.playing;
    final pos = _player!.position;
    final st = state.value;
    if (!playing || st == null) {
      final old = _player;
      _player = null;
      _playerVoicePath = RoomAudio.voicePath.value;
      old?.dispose().catchError((_) {});
      return;
    }
    // _p alıcısı eski çaları bırakıp yenisini kurar; sonra aynı konumdan devam edilir.
    final url = _trackId == null ? _previewPath : null;
    unawaited(() async {
      try {
        final player = _p; // yeni çalar
        if (url != null) {
          await player.setFilePath(url);
        } else {
          await refresh(); // sunucu durumundan yeniden kurulur (konum sunucudan gelir)
          return;
        }
        await player.seek(pos);
        await player.setVolume(_vol);
        unawaited(player.play().catchError((_) {}));
      } catch (_) {/* yeni yolda açılamadı: sonraki durum güncellemesinde düzelir */}
    }());
  }
}
