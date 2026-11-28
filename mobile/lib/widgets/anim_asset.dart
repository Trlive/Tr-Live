import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_vap_kit/flutter_vap_kit.dart';
import 'package:just_audio/just_audio.dart';
import 'package:lottie/lottie.dart';
import '../services/call_guard.dart';
import '../services/effect_prefs.dart';
import '../services/fx_load.dart';
import '../services/media_cache.dart';
import '../services/room_audio.dart';
import 'common.dart' show kFrameScale, frameScaleOf;
import 'net_image.dart';
import 'svga_lite.dart';

/// Adresin uzantısına göre doğru oynatıcıyı seçer: svga, Lottie (json), şeffaf mp4 (VAP), webp/gif/png.
/// [repeat] true ise döngüde oynar (avatar çerçevesi); false ise bir kez oynar ve [onDone] çağrılır.
class AnimAsset extends StatefulWidget {
  final String url;
  final BoxFit fit;
  final bool repeat;
  final VoidCallback? onDone;
  final String? format;

  /// Animasyon açılamazsa gösterilecek durağan görsel (hediyenin simgesi).
  ///
  /// Bu olmadan, animasyon hata verdiğinde `SizedBox.shrink()` dönüyordu: kullanıcı
  /// hediyeyi gönderiyor, coin'i gidiyor ve ekranda HİÇBİR ŞEY görmüyordu. Hediyenin
  /// simgesini göstermek, hiç göstermemekten her zaman iyidir.
  final String? fallbackUrl;
  /// Oynatılamazsa nedenini bildirir (ekranda gösterilir; sorun bulmak için).
  final ValueChanged<String>? onFail;
  /// true: dosya telefon belleğine indirilir (hediyeler). false: doğrudan internetten oynar (çerçeveler).
  final bool cache;
  /// true: sesli MP4'lerin sesi de çalınır (hediye ve giriş efektleri; "Hediye ve araç sesleri" ayarı açıksa).
  final bool sound;
  /// true: ikincil efekt (koltuk içi animasyon). MP4 çözücülerinden biri her zaman tam ekran hediyeye ayrılır.
  final bool lowPriority;
  const AnimAsset({
    super.key,
    required this.url,
    this.fit = BoxFit.contain,
    this.repeat = false,
    this.onDone,
    this.format,
    this.fallbackUrl,
    this.onFail,
    this.cache = true,
    this.sound = false,
    this.lowPriority = false,
  });

  static String extOf(String url) {
    final path = url.toLowerCase().split('?').first;
    final i = path.lastIndexOf('.');
    return i < 0 ? '' : path.substring(i + 1);
  }

  /// Oynatıcının kendi bitişini bildirdiği türler (diğerleri için çağıran zamanlayıcı kullanır).
  static bool reportsEnd(String url, [String? format]) {
    final e = extOf(url);
    return e == 'svga' || e == 'mp4' || e == 'json' || format == 'svga' || format == 'mp4' || format == 'lottie';
  }

  @override
  State<AnimAsset> createState() => _AnimAssetState();
}

class _AnimAssetState extends State<AnimAsset> {
  File? _file;

  bool _failed = false;
  bool _done = false;
  Timer? _doneTimer;

  AudioPlayer? _audio;
  bool _soundSlot = false;

  bool get _isMp4 => AnimAsset.extOf(widget.url) == 'mp4' || widget.format == 'mp4';

  // MP4 telefonun donanım video çözücüsünü kullanır; aynı anda oynayan sayısı sınırlıdır (FxLoad). Yer yoksa bu
  // animasyon oynatılmaz: tek seferlik olan hemen "bitti" sayılır (sıra ilerler), döngülü olan yer açılınca başlar.
  bool _mp4Slot = false;
  bool _mp4Denied = false;
  Timer? _slotTimer;

  void _claimMp4() {
    if (!_isMp4 || _mp4Slot) return;
    if (FxLoad.acquireMp4(loop: widget.repeat, low: widget.lowPriority)) {
      _mp4Slot = true;
      _mp4Denied = false;
      return;
    }
    _mp4Denied = true;
    if (widget.repeat) {
      _slotTimer?.cancel();
      _slotTimer = Timer(const Duration(seconds: 4), () {
        if (!mounted) return;
        _claimMp4(); // yine yer yoksa kendini yeniden kurar
        if (!_mp4Slot) return;
        if (widget.cache && _file == null) {
          _resolve();
        } else {
          setState(() {});
          _startSound(_file?.path);
        }
      });
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _finish());
    }
  }

  void _releaseMp4() {
    _slotTimer?.cancel();
    _slotTimer = null;
    if (_mp4Slot) {
      _mp4Slot = false;
      FxLoad.releaseMp4(loop: widget.repeat);
    }
  }

  /// Konuşma başlayınca / bitince hediye sesi kısılır / eski düzeyine döner.
  void _onSpeaking() => _audio?.setVolume(RoomAudio.effectVolume).catchError((_) {});

  /// Arama başlayınca çalan hediye / araç sesi hemen susar.
  void _onCall() {
    if (!_soundAllowed) _audio?.pause().catchError((_) {});
  }

  @override
  void initState() {
    super.initState();
    CallGuard.instance.inCall.addListener(_onCall);
    EffectPrefs.roomMuted.addListener(_onCall);
    RoomAudio.systemSilent.addListener(_onCall);
    RoomAudio.speaking.addListener(_onSpeaking);
    EffectPrefs.version.addListener(_onCall);
    _claimMp4();
    if (_mp4Denied) return;
    if (widget.cache) {
      _resolve();
    } else if (_isMp4) {
      _startSound(null);
    }
  }

  /// Aynı parça başka bir dosyayla yeniden kurulursa (anahtarsız kullanım) yer, ses ve dosya baştan alınır.
  @override
  void didUpdateWidget(covariant AnimAsset old) {
    super.didUpdateWidget(old);
    if (old.url == widget.url && old.format == widget.format && old.repeat == widget.repeat && old.cache == widget.cache) return;
    _slotTimer?.cancel();
    _slotTimer = null;
    if (_mp4Slot) {
      _mp4Slot = false;
      FxLoad.releaseMp4(loop: old.repeat);
    }
    _audio?.dispose();
    _audio = null;
    if (_soundSlot) {
      _soundSlot = false;
      FxLoad.releaseSound();
    }
    _file = null;
    _done = false;
    _failed = false;
    _mp4Denied = false;
    _claimMp4();
    if (_mp4Denied) return;
    if (widget.cache) {
      _resolve();
    } else if (_isMp4) {
      _startSound(null);
    }
  }

  @override
  void dispose() {
    CallGuard.instance.inCall.removeListener(_onCall);
    EffectPrefs.roomMuted.removeListener(_onCall);
    RoomAudio.systemSilent.removeListener(_onCall);
    RoomAudio.speaking.removeListener(_onSpeaking);
    EffectPrefs.version.removeListener(_onCall);
    _doneTimer?.cancel();
    _releaseMp4();
    _audio?.dispose();
    _audio = null;
    if (_soundSlot) {
      _soundSlot = false;
      FxLoad.releaseSound();
    }
    super.dispose();
  }

  /// MP4 animasyon oynatıcısı (VAP) yalnızca görüntüyü çizer; dosyadaki ses ayrıca çalınır (aynı anda başlar).
  /// Sessiz dosyada bir şey duyulmaz. Arama sürerken ya da ayar kapalıysa çalınmaz.
  Future<void> _startSound(String? path) async {
    await _prepareSound(path);
    _playSound();
  }

  bool get _soundAllowed => !(EffectPrefs.giftSound == false || EffectPrefs.roomMuted.value || CallGuard.instance.inCall.value || RoomAudio.systemSilent.value);

  /// Sesi önceden yükler (dosya açılır); görüntü ile birlikte [_playSound] ile başlatılır → ses geriden gelmez.
  Future<void> _prepareSound(String? path) async {
    if (!widget.sound || !_isMp4 || _audio != null || widget.repeat) return;
    if (!_soundAllowed) return;
    // Aynı anda en çok birkaç hediye sesi (her ses ayrı bir oynatıcıdır; hediye yağmurunda üst üste yığılmasın).
    if (!FxLoad.acquireSound()) return;
    _soundSlot = true;
    final p = _audio = AudioPlayer();
    p.setVolume(RoomAudio.effectVolume).catchError((_) {});
    try {
      if (path != null) {
        await p.setFilePath(path);
      } else {
        await p.setUrl(widget.url);
      }
    } catch (_) {
      // Ses izi yok ya da açılamadı: animasyon sessiz oynar.
    }
  }

  void _playSound() {
    final p = _audio;
    if (p == null || !mounted) return;
    // Yükleme sürerken ayar kapatıldıysa (eskiden bu durumda ses yine de başlıyordu) hiç başlamaz.
    if (!_soundAllowed) {
      p.pause().catchError((_) {});
      return;
    }
    p.play().catchError((_) {});
  }

  /// Oynatma bitti: yalnızca bir kez ve bu parça hâlâ ekrandayken bildirilir
  /// (eski bir zamanlayıcı sıradaki hediyenin animasyonunu erken kesmesin).
  void _finish() {
    if (_done || !mounted) return;
    _done = true;
    widget.onDone?.call();
  }

  /// Hata bir kez ve çizim bittikten sonra bildirilir (build sırasında bildirim/kayıt açmak sorun çıkarır).
  void _fail(String message) {
    if (_failed) return;
    _failed = true;
    // Yedek görsel varsa gösterilebilsin diye yeniden çiziliyor. setState doğrudan
    // çağrılamaz: _fail çoğu zaman bir errorBuilder'ın İÇİNDEN, yani çizim sırasında
    // geliyor ve orada setState çağırmak Flutter'da hata.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.onFail?.call(message);
      if ((widget.fallbackUrl ?? '').isNotEmpty) setState(() {});
    });
  }

  Future<void> _resolve() async {
    final url = widget.url;
    try {
      final f = await MediaCache.get(url);
      if (mounted && widget.url == url) {
        await _prepareSound(f.path); // ses hazır olunca görüntüyle aynı anda başlar
        if (!mounted || widget.url != url) return;
        setState(() => _file = f);
        _playSound();
      }
    } catch (e) {
      if (mounted && widget.url == url) {
        _fail('İndirilemedi: $e');
        _finish();
      }
    }
  }

  // Animasyon kendi katmanında çizilir: her karede çevresindeki ekran (koltuklar, sohbet, arka plan) yeniden çizilmez.
  @override
  Widget build(BuildContext context) {
    final fb = widget.fallbackUrl ?? '';
    // Animasyon açılamadıysa hediyenin simgesini göster. Simge de açılamazsa boş kalır;
    // orada yapacak bir şey yok.
    if (_failed && fb.isNotEmpty) {
      return RepaintBoundary(
        child: NetImg(fb, fit: widget.fit, gaplessPlayback: true, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
      );
    }
    return RepaintBoundary(child: _player());
  }

  Widget _player() {
    final w = widget;
    final ext = AnimAsset.extOf(w.url);
    final fmt = w.format ?? '';
    if (_isMp4 && !_mp4Slot) return const SizedBox.shrink();
    if (!w.cache) return _network(w, ext, fmt);
    final file = _file;
    if (file == null) return const SizedBox.shrink();
    if (ext == 'svga' || fmt == 'svga') return SvgaLite(file: file, fit: w.fit, repeat: w.repeat, onDone: w.onDone == null ? null : _finish, onFail: w.onFail == null ? null : _fail);
    if (ext == 'mp4' || fmt == 'mp4') {
      return VapPlayer.file(file.path, fit: w.fit, loop: w.repeat, onComplete: w.repeat ? null : _finish, onError: (err) {
        _fail('MP4 oynatılamadı: $err');
        _finish();
      });
    }
    if (ext == 'json' || fmt == 'lottie') {
      return Lottie.file(
        file,
        fit: w.fit,
        repeat: w.repeat,
        onLoaded: (c) {
          if (!w.repeat && w.onDone != null) {
            _doneTimer?.cancel();
            _doneTimer = Timer(c.duration + const Duration(milliseconds: 300), _finish);
          }
        },
        errorBuilder: (_, err, ___) {
          _fail('Lottie açılamadı: $err');
          return const SizedBox.shrink();
        },
      );
    }
    return Image.file(file, fit: w.fit, gaplessPlayback: true, errorBuilder: (_, err, ___) {
      _fail('Görsel açılamadı: $err');
      return const SizedBox.shrink();
    });
  }

  Widget _network(AnimAsset w, String ext, String fmt) {
    if (ext == 'svga' || fmt == 'svga') return SvgaLite(url: w.url, fit: w.fit, repeat: w.repeat, onDone: w.onDone == null ? null : _finish, onFail: w.onFail == null ? null : _fail);
    if (ext == 'mp4' || fmt == 'mp4') {
      return VapPlayer.network(w.url, fit: w.fit, loop: w.repeat, onComplete: w.repeat ? null : _finish, onError: (err) {
        _fail('MP4 oynatılamadı: $err');
        _finish();
      });
    }
    if (ext == 'json' || fmt == 'lottie') {
      return Lottie.network(w.url, fit: w.fit, repeat: w.repeat, errorBuilder: (_, err, ___) {
        _fail('Lottie açılamadı: $err');
        return const SizedBox.shrink();
      });
    }
    return NetImg(w.url, fit: w.fit, gaplessPlayback: true, errorBuilder: (_, err, ___) {
      _fail('Görsel açılamadı: $err');
      return const SizedBox.shrink();
    });
  }
}


/// Avatar çerçevesi: düzende her zaman avatar çapı × [kFrameScale] yer kaplar; çerçevenin kendi oranı
/// daha büyükse taşarak çizilir (yerleşim kaymaz), avatarla aynı merkezde.
class FrameBox extends StatelessWidget {
  final String url;
  final double avatarRadius;
  const FrameBox({super.key, required this.url, required this.avatarRadius});

  @override
  Widget build(BuildContext context) {
    final base = avatarRadius * 2 * kFrameScale;
    final size = avatarRadius * 2 * frameScaleOf(url);
    return IgnorePointer(
      child: SizedBox(
        width: base,
        height: base,
        child: OverflowBox(
          minWidth: size,
          maxWidth: size,
          minHeight: size,
          maxHeight: size,
          child: AnimAsset(key: ValueKey(url), url: url, repeat: true, cache: false),
        ),
      ),
    );
  }
}
