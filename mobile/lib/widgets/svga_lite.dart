import 'dart:async';
import 'dart:io' show File, ZLibCodec;
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;
import '../services/api.dart';
import '../services/fx_load.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

// SVGA 2.x oynatıcısı (dış paket gerektirmez). Görsel katmanları (konum, ölçek, dönüş, saydamlık) oynatır.
// Desteklenmeyenler: vektör şekiller, kırpma yolu, matte maskeleri ve gömülü ses.

class _Reader {
  final Uint8List d;
  int p;
  final int end;
  _Reader(this.d, [int start = 0, int? stop])
      : p = start,
        end = stop ?? d.length;
  bool get more => p < end;
  int varint() {
    var r = 0;
    var shift = 0;
    while (p < end) {
      final b = d[p++];
      r |= (b & 0x7f) << shift;
      if (b & 0x80 == 0) break;
      shift += 7;
    }
    return r;
  }

  double f32() {
    final v = ByteData.sublistView(d, p, p + 4).getFloat32(0, Endian.little);
    p += 4;
    return v;
  }

  /// Uzunluk-önekli alanın içeriği için alt okuyucu.
  _Reader sub() {
    final len = varint();
    final r = _Reader(d, p, p + len);
    p += len;
    return r;
  }

  Uint8List bytes() {
    final len = varint();
    final v = Uint8List.sublistView(d, p, p + len);
    p += len;
    return v;
  }

  String str() => String.fromCharCodes(bytes());

  void skip(int wire) {
    if (wire == 0) {
      varint();
    } else if (wire == 1) {
      p += 8;
    } else if (wire == 2) {
      p += varint();
    } else if (wire == 5) {
      p += 4;
    } else {
      p = end;
    }
  }
}

class _SvgaFrame {
  final double alpha;
  final double w;
  final double h;
  final Float64List m4; // a b c d tx ty → 4×4 dönüşüm matrisi (çizimde her karede yeniden kurulmaz)
  _SvgaFrame(this.alpha, this.w, this.h, List<double> m) : m4 = Float64List.fromList(<double>[m[0], m[1], 0, 0, m[2], m[3], 0, 0, 0, 0, 1, 0, m[4], m[5], 0, 1]);
}

/// Ayrıştırılmış SVGA (görseller henüz çözülmemiş). Ayrı iş parçacığında üretilir ve bellekte kısa süre saklanır.
class _SvgaData {
  final double vw;
  final double vh;
  final int fps;
  final int frames;
  final List<_SvgaSprite> sprites;
  final Map<String, Uint8List> rawImages;
  _SvgaData(this.vw, this.vh, this.fps, this.frames, this.sprites, this.rawImages);

  int get bytes => rawImages.values.fold(0, (a, b) => a + b.length);
}

/// Ayrı iş parçacığında: zlib açma + protobuf ayrıştırma (büyük dosyada ana iş parçacığını yüzlerce ms kilitliyordu).
_SvgaData _inflateAndParse(Uint8List raw) => SvgaMovie._parseData(Uint8List.fromList(ZLibCodec().decode(raw)));

class _SvgaSprite {
  final String key;
  final List<_SvgaFrame?> frames;
  _SvgaSprite(this.key, this.frames);
}

/// Açılmış (görselleri çözülmüş) SVGA. Aynı dosyayı kullanan bütün oynatıcılar TEK kopyayı paylaşır: on beş koltukta
/// aynı çerçeve ya da art arda on kez oynayan aynı hediye görselleri bir kez çözer (eskiden her biri kendi kopyasını
/// çözüyordu; hediye yağmurunda bellek tükenip uygulama kapanabiliyordu). Kullanım: [acquire] ile alınır, iş bitince
/// [release] ile bırakılır; son kullanıcı bırakınca kısa süre bekletilir, sonra bellekten atılır.
class SvgaMovie {
  final double vw;
  final double vh;
  final int fps;
  final int frames;
  final List<_SvgaSprite> sprites;
  final Map<String, ui.Image> images;
  final String _key;
  SvgaMovie(this.vw, this.vh, this.fps, this.frames, this.sprites, this.images, [this._key = ''])
      : bytes = images.values.fold<int>(0, (a, i) => a + i.width * i.height * 4);

  Duration get duration => Duration(milliseconds: (frames * 1000 / (fps <= 0 ? 20 : fps)).round().clamp(100, 600000));

  int _refs = 0;
  bool _disposed = false;

  /// Açılmış görsellerin kapladığı bellek (bayt, yaklaşık: genişlik × yükseklik × 4).
  final int bytes;

  void _destroy() {
    if (_disposed) return;
    _disposed = true;
    for (final i in images.values) {
      i.dispose();
    }
  }

  // Kullanımdaki ve az önce bırakılmış (bekletilen) açılmış animasyonlar.
  static final Map<String, SvgaMovie> _live = {};
  static final Map<String, Future<SvgaMovie>> _decoding = {};
  static final Map<String, SvgaMovie> _idle = {};
  static final Map<String, DateTime> _idleAt = {};
  static Timer? _sweepTimer;
  static bool _purgerAdded = false;

  /// Açılmış animasyonu verir (yoksa açar). Her [acquire] için bir kez [release] çağrılmalıdır.
  static Future<SvgaMovie> acquire({File? file, String? url}) async {
    final key = file?.path ?? url!;
    if (!_purgerAdded) {
      _purgerAdded = true;
      FxLoad.addPurger(purgeIdle);
    }
    for (var attempt = 0; attempt < 3; attempt++) {
      var m = _live[key] ?? _idle[key];
      m ??= await _decodeOnce(key, file: file, url: url);
      // Beklerken başka bir kullanıcı alıp bırakmış ve bellekten atılmış olabilir: yeniden aç.
      if (m._disposed) continue;
      if (identical(_idle[key], m)) {
        _idle.remove(key);
        _idleAt.remove(key);
      }
      _live[key] = m;
      m._refs++;
      return m;
    }
    throw Exception('svga açılamadı');
  }

  /// Kullanım bitti. Son kullanıcıysa animasyon kısa süre bekletilir (hemen yeniden oynarsa tekrar çözülmesin).
  void release() {
    if (_disposed || _refs <= 0) return;
    _refs--;
    if (_refs > 0) return;
    if (identical(_live[_key], this)) _live.remove(_key);
    if (_key.isEmpty || bytes > FxLoad.svgaIdleBytes || FxLoad.cooling) {
      _destroy();
      return;
    }
    final old = _idle.remove(_key);
    if (old != null && !identical(old, this)) old._destroy();
    _idle[_key] = this; // en son bırakılan sona
    _idleAt[_key] = DateTime.now();
    _trimIdle();
    _sweepTimer ??= Timer.periodic(const Duration(seconds: 15), (_) => _sweep());
  }

  static void _trimIdle() {
    var total = _idle.values.fold<int>(0, (a, m) => a + m.bytes);
    while (total > FxLoad.svgaIdleBytes && _idle.isNotEmpty) {
      final first = _idle.keys.first;
      final m = _idle.remove(first)!;
      _idleAt.remove(first);
      total -= m.bytes;
      m._destroy();
    }
  }

  /// 30 sn'dir kullanılmayan bekletilenler atılır.
  static void _sweep() {
    final now = DateTime.now();
    for (final k in _idleAt.keys.toList()) {
      if (now.difference(_idleAt[k]!) > const Duration(seconds: 30)) {
        _idle.remove(k)?._destroy();
        _idleAt.remove(k);
      }
    }
    if (_idle.isEmpty) {
      _sweepTimer?.cancel();
      _sweepTimer = null;
    }
  }

  /// Bekletilen bütün animasyonları ve ayrıştırılmış dosya önbelleğini boşaltır (bellek azaldığında).
  static void purgeIdle() {
    for (final m in _idle.values) {
      m._destroy();
    }
    _idle.clear();
    _idleAt.clear();
    _memo.clear();
  }

  static Future<SvgaMovie> _decodeOnce(String key, {File? file, String? url}) {
    final running = _decoding[key];
    if (running != null) return running;
    final f = _decode(key, file: file, url: url);
    _decoding[key] = f;
    f.whenComplete(() => _decoding.remove(key)).ignore();
    return f;
  }

  // Son açılan birkaç SVGA'nın ayrıştırılmış hali: aynı çerçeve birden çok koltukta ya da aynı hediye art arda
  // gelince dosya yeniden indirilip açılmaz.
  static final Map<String, _SvgaData> _memo = {};
  static final Map<String, Future<_SvgaData>> _pending = {};
  static const int _memoMaxBytes = 24 * 1024 * 1024;

  static Future<_SvgaData> _data({File? file, String? url}) {
    final key = file?.path ?? url!;
    final hit = _memo.remove(key);
    if (hit != null) {
      _memo[key] = hit; // en son kullanılan sona
      return SynchronousFuture<_SvgaData>(hit);
    }
    final running = _pending[key];
    if (running != null) return running;
    final f = _fetch(key, file: file, url: url);
    _pending[key] = f;
    f.whenComplete(() => _pending.remove(key)).ignore();
    return f;
  }

  static Future<_SvgaData> _fetch(String key, {File? file, String? url}) async {
    final Uint8List raw;
    if (file != null) {
      raw = await file.readAsBytes();
    } else {
      final r = await Api.client.get(Uri.parse(url!)).timeout(const Duration(seconds: 60));
      if (r.statusCode != 200) throw Exception('svga indirilemedi (${r.statusCode})');
      raw = r.bodyBytes;
    }
    final d = await compute(_inflateAndParse, raw, debugLabel: 'svga');
    _memo[key] = d;
    var total = _memo.values.fold<int>(0, (a, b) => a + b.bytes);
    while (total > _memoMaxBytes && _memo.length > 1) {
      final first = _memo.keys.first;
      total -= _memo.remove(first)!.bytes;
    }
    return d;
  }

  /// Görselleri çözer. Toplam bellek [FxLoad.svgaBudgetBytes] bütçesini aşacaksa (kare kare çizilmiş büyük
  /// animasyonlar yüzlerce MB tutabilir) bütün görseller aynı oranda küçültülerek çözülür: animasyon biraz daha
  /// düşük çözünürlükte ama çökmeden oynar. Çizim hedef boyuta göre yapıldığı için yerleşim değişmez.
  static Future<SvgaMovie> _decode(String key, {File? file, String? url}) async {
    final d = await _data(file: file, url: url);
    final descs = <String, ui.ImageDescriptor>{};
    final bufs = <String, ui.ImmutableBuffer>{};
    var pixels = 0;
    for (final e in d.rawImages.entries) {
      ui.ImmutableBuffer? buf;
      try {
        buf = await ui.ImmutableBuffer.fromUint8List(e.value);
        final desc = await ui.ImageDescriptor.encoded(buf);
        descs[e.key] = desc;
        bufs[e.key] = buf;
        pixels += desc.width * desc.height;
      } catch (_) {
        buf?.dispose(); // görsel okunamazsa o katman çizilmez
      }
    }
    final total = pixels * 4;
    final budget = FxLoad.svgaBudgetBytes;
    final scale = total > budget ? math.sqrt(budget / total) : 1.0;
    final maxSide = FxLoad.svgaMaxSide;
    final images = <String, ui.Image>{};
    for (final e in descs.entries) {
      final desc = e.value;
      try {
        var s = scale;
        final longest = math.max(desc.width, desc.height);
        if (longest * s > maxSide) s = maxSide / longest;
        final ui.Codec codec;
        if (s < 0.999) {
          codec = await desc.instantiateCodec(
            targetWidth: math.max(1, (desc.width * s).round()),
            targetHeight: math.max(1, (desc.height * s).round()),
          );
        } else {
          codec = await desc.instantiateCodec();
        }
        final fr = await codec.getNextFrame();
        images[e.key] = fr.image;
        codec.dispose();
      } catch (_) {/* görsel çözülemezse o katman çizilmez */} finally {
        desc.dispose();
        bufs.remove(e.key)?.dispose();
      }
    }
    return SvgaMovie(d.vw, d.vh, d.fps, d.frames, d.sprites, images, key);
  }

  static _SvgaData _parseData(Uint8List data) {
    final rd = _Reader(data);
    double vw = 0, vh = 0;
    var fps = 20, frames = 0;
    final rawImages = <String, Uint8List>{};
    final sprites = <_SvgaSprite>[];
    while (rd.more) {
      final tag = rd.varint();
      final field = tag >> 3;
      final wire = tag & 7;
      if (field == 2 && wire == 2) {
        final s = rd.sub();
        while (s.more) {
          final t = s.varint();
          final f = t >> 3;
          final w = t & 7;
          if (f == 1 && w == 5) {
            vw = s.f32();
          } else if (f == 2 && w == 5) {
            vh = s.f32();
          } else if (f == 3 && w == 0) {
            fps = s.varint();
          } else if (f == 4 && w == 0) {
            frames = s.varint();
          } else {
            s.skip(w);
          }
        }
      } else if (field == 3 && wire == 2) {
        final e = rd.sub();
        String? key;
        Uint8List? val;
        while (e.more) {
          final t = e.varint();
          if (t >> 3 == 1 && t & 7 == 2) {
            key = e.str();
          } else if (t >> 3 == 2 && t & 7 == 2) {
            val = e.bytes();
          } else {
            e.skip(t & 7);
          }
        }
        if (key != null && val != null) rawImages[key] = val;
      } else if (field == 4 && wire == 2) {
        sprites.add(_parseSprite(rd.sub(), frames));
      } else {
        rd.skip(wire);
      }
    }
    if (vw <= 0 || vh <= 0 || frames <= 0) throw Exception('svga başlığı geçersiz');
    // Görsel baytları ana belleğin kopyası olarak taşınır (açılmış dosyanın tamamı tutulmasın).
    return _SvgaData(vw, vh, fps, frames, sprites, {for (final e in rawImages.entries) e.key: Uint8List.fromList(e.value)});
  }

  static _SvgaSprite _parseSprite(_Reader r, int total) {
    var key = '';
    final fr = <_SvgaFrame?>[];
    while (r.more) {
      final t = r.varint();
      final f = t >> 3;
      final w = t & 7;
      if (f == 1 && w == 2) {
        key = r.str();
      } else if (f == 2 && w == 2) {
        fr.add(_parseFrame(r.sub()));
      } else {
        r.skip(w);
      }
    }
    return _SvgaSprite(key, fr);
  }

  static _SvgaFrame? _parseFrame(_Reader r) {
    double alpha = 0, lw = 0, lh = 0;
    var m = <double>[1, 0, 0, 1, 0, 0];
    while (r.more) {
      final t = r.varint();
      final f = t >> 3;
      final w = t & 7;
      if (f == 1 && w == 5) {
        alpha = r.f32();
      } else if (f == 2 && w == 2) {
        final l = r.sub();
        while (l.more) {
          final lt = l.varint();
          final lf = lt >> 3;
          if (lt & 7 == 5) {
            final v = l.f32();
            if (lf == 3) lw = v;
            if (lf == 4) lh = v;
          } else {
            l.skip(lt & 7);
          }
        }
      } else if (f == 3 && w == 2) {
        final tr = r.sub();
        m = <double>[0, 0, 0, 0, 0, 0];
        while (tr.more) {
          final tt = tr.varint();
          final tf = tt >> 3;
          if (tt & 7 == 5) {
            final v = tr.f32();
            if (tf >= 1 && tf <= 6) m[tf - 1] = v;
          } else {
            tr.skip(tt & 7);
          }
        }
      } else {
        r.skip(w);
      }
    }
    if (alpha <= 0 || lw <= 0 || lh <= 0) return null;
    return _SvgaFrame(alpha, lw, lh, m);
  }
}

class _SvgaPainter extends CustomPainter {
  final SvgaMovie movie;
  final Animation<double> t;
  final BoxFit fit;
  _SvgaPainter(this.movie, this.t, this.fit) : super(repaint: t);

  @override
  void paint(Canvas canvas, Size size) {
    final idx = (t.value * movie.frames).floor().clamp(0, movie.frames - 1);
    final fitted = applyBoxFit(fit, Size(movie.vw, movie.vh), size);
    final dst = Alignment.center.inscribe(fitted.destination, Offset.zero & size);
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    canvas.translate(dst.left, dst.top);
    canvas.scale(dst.width / movie.vw, dst.height / movie.vh);
    final paint = Paint()..filterQuality = FilterQuality.medium;
    for (final s in movie.sprites) {
      if (s.key.endsWith('.matte') || idx >= s.frames.length) continue;
      final f = s.frames[idx];
      final img = movie.images[s.key];
      if (f == null || img == null) continue;
      canvas.save();
      canvas.transform(f.m4);
      paint.color = Color.fromRGBO(255, 255, 255, f.alpha.clamp(0.0, 1.0));
      canvas.drawImageRect(img, Rect.fromLTWH(0, 0, img.width.toDouble(), img.height.toDouble()), Rect.fromLTWH(0, 0, f.w, f.h), paint);
      canvas.restore();
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _SvgaPainter old) => old.movie != movie || old.fit != fit;
}

class SvgaLite extends StatefulWidget {
  final File? file;
  final String? url;
  final BoxFit fit;
  final bool repeat;
  final VoidCallback? onDone;
  final ValueChanged<String>? onFail;
  const SvgaLite({super.key, this.file, this.url, this.fit = BoxFit.contain, this.repeat = false, this.onDone, this.onFail});

  @override
  State<SvgaLite> createState() => _SvgaLiteState();
}

class _SvgaLiteState extends State<SvgaLite> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this);
  SvgaMovie? _movie;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final m = await SvgaMovie.acquire(file: widget.file, url: widget.url);
      if (!mounted) {
        m.release();
        return;
      }
      _c.duration = m.duration;
      setState(() => _movie = m);
      if (widget.repeat) {
        _c.repeat();
      } else {
        _c.forward().whenComplete(() {
          if (mounted) widget.onDone?.call();
        });
      }
    } catch (e) {
      if (mounted) {
        widget.onFail?.call('SVGA açılamadı: $e');
        widget.onDone?.call();
      }
    }
  }

  @override
  void dispose() {
    _c.dispose();
    _movie?.release();
    _movie = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = _movie;
    if (m == null) return const SizedBox.shrink();
    // Ayrı katman: her karede yalnızca animasyon yeniden çizilir, çevresindeki ekran değil.
    return RepaintBoundary(child: CustomPaint(painter: _SvgaPainter(m, _c, widget.fit), size: Size.infinite));
  }
}
