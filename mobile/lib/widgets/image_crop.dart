import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

/// Kırpma biçimi: çerçeve oranı (genişlik / yükseklik), çıktı genişliği (px) ve daire kılavuzu.
/// Çıktı her zaman JPEG'dir (veritabanında az yer kaplar).
class CropSpec {
  final double aspect;
  final int outWidth;
  final bool circle;
  final String title;

  /// true: görsel çerçevenin içine sığana kadar küçültülebilir ("Sığdır"); boş kalan yer görselin bulanık, koyu hâliyle
  /// dolar. Çıktı her zaman [outWidth] genişliğindedir. (Oda teması: dikey çerçeveye geniş fotoğraf da tamamen sığsın.)
  final bool allowFit;
  const CropSpec(this.aspect, this.outWidth, {this.circle = false, required this.title, this.allowFit = false});

  /// Profil fotoğrafı: kare, daire kılavuzlu.
  static const avatar = CropSpec(1, 512, circle: true, title: 'Profil fotoğrafını ayarla');

  /// Profil kapak fotoğrafı: profil sayfasındaki alanla aynı oran (Figma: 375 × 343).
  static const profileCover = CropSpec(375 / 343, 1080, title: 'Kapak fotoğrafını ayarla');

  /// Oda fotoğrafı: oda kartındaki kare görsel.
  static const roomCover = CropSpec(1, 600, title: 'Oda fotoğrafını ayarla');

  /// Ana sayfa bannerı: 3:1.
  static const banner = CropSpec(3, 1200, title: 'Bannerı ayarla');

  /// Mesajlar > duyuru kartı görseli (kartta 1,8:1).
  static const announcement = CropSpec(1.8, 1080, title: 'Duyuru görselini ayarla');

  /// Oda teması: dikey 9:16, 1080x1920 (sunucu da aynı boyuta getirir).
  static const roomTheme = CropSpec(9 / 16, 1080, title: 'Tema görselini ayarla', allowFit: true);

  int get outHeight => (outWidth / aspect).round();
}

/// Kırpma ekranını açar; kullanıcı "Kullan" derse JPEG baytlarını, vazgeçerse null döndürür.
Future<Uint8List?> cropImage(BuildContext context, Uint8List bytes, CropSpec spec) async {
  ui.Image? source;
  try {
    final codec = await ui.instantiateImageCodec(bytes);
    source = (await codec.getNextFrame()).image;
    codec.dispose();
  } catch (_) {
    source = null;
  }
  if (source == null) return null;
  final ui.Image decoded = source;
  if (!context.mounted) {
    decoded.dispose();
    return null;
  }
  // Görsel, kırpma ekranı tamamen kapanınca (State.dispose) bırakılır: kapanma animasyonu sırasında hâlâ çiziliyor.
  return Navigator.of(context, rootNavigator: true).push<Uint8List>(
    MaterialPageRoute(fullscreenDialog: true, builder: (_) => _CropScreen(source: decoded, spec: spec)),
  );
}

class _CropScreen extends StatefulWidget {
  final ui.Image source;
  final CropSpec spec;
  const _CropScreen({required this.source, required this.spec});

  @override
  State<_CropScreen> createState() => _CropScreenState();
}

class _CropScreenState extends State<_CropScreen> {
  Rect _frame = Rect.zero; // kırpma çerçevesi (ekran koordinatı)
  double _base = 1; // görselin çerçeveyi tam örttüğü ölçek
  double _zoom = 1; // kullanıcının yakınlaştırması (1..5)
  Offset _offset = Offset.zero; // görselin sol üst köşesi (ekran koordinatı)
  Size _laidOut = Size.zero;
  bool _busy = false;

  @override
  void dispose() {
    widget.source.dispose();
    super.dispose();
  }

  // Sıkıştırma hareketinin başlangıç durumu
  double _startZoom = 1;
  Offset _startFocal = Offset.zero;
  Offset _startOffset = Offset.zero;

  double get _imgW => widget.source.width.toDouble();
  double get _imgH => widget.source.height.toDouble();
  double get _scale => _base * _zoom;

  /// En küçük yakınlaştırma: normalde 1 (görsel çerçeveyi tamamen örter); "Sığdır" açıksa görselin tamamı çerçeveye sığar.
  double get _minZoom => widget.spec.allowFit ? math.min(1.0, math.min(_frame.width / _imgW, _frame.height / _imgH) / _base) : 1.0;
  bool get _isFitted => (_zoom - _minZoom).abs() < 0.001 && _minZoom < 0.999;

  void _center() => _offset = Offset(_frame.center.dx - _imgW * _scale / 2, _frame.center.dy - _imgH * _scale / 2);

  /// Sığdır ↔ Doldur (yalnızca allowFit).
  void _toggleFit() => setState(() {
        _zoom = _isFitted ? 1.0 : _minZoom;
        _center();
      });

  /// Ekran ölçüsü değişince (ilk açılış, döndürme) çerçeve yeniden kurulur ve görsel ortalanır.
  void _layout(Size size) {
    if (size == _laidOut) return;
    _laidOut = size;
    const pad = 20.0;
    final maxW = size.width - pad * 2;
    // Dikey (9:16) çerçevede ekranın daha büyük kısmı kullanılır; başlık ve düğmeler yine görünür kalır.
    final maxH = size.height * (widget.spec.allowFit ? 0.70 : 0.62);
    var fw = maxW;
    var fh = fw / widget.spec.aspect;
    if (fh > maxH) {
      fh = maxH;
      fw = fh * widget.spec.aspect;
    }
    _frame = Rect.fromCenter(center: Offset(size.width / 2, size.height * (widget.spec.allowFit ? 0.475 : 0.46)), width: fw, height: fh);
    _base = math.max(_frame.width / _imgW, _frame.height / _imgH);
    _zoom = 1;
    _offset = Offset(_frame.center.dx - _imgW * _scale / 2, _frame.center.dy - _imgH * _scale / 2);
  }

  /// Görsel çerçeveden büyükse çerçeveyi her zaman örter; küçükse ("Sığdır") çerçevenin içinde kalır.
  Offset _clamp(Offset o) {
    final w = _imgW * _scale;
    final h = _imgH * _scale;
    double axis(double v, double start, double end, double len) {
      final lo = math.min(end - len, start);
      final hi = math.max(end - len, start);
      // Kayan nokta payı: alt sınır üst sınırı birkaç milyarda bir geçebilir (clamp hata vermesin).
      return v.clamp(lo, hi).toDouble();
    }

    return Offset(axis(o.dx, _frame.left, _frame.right, w), axis(o.dy, _frame.top, _frame.bottom, h));
  }

  void _onStart(ScaleStartDetails d) {
    _startZoom = _zoom;
    _startFocal = d.focalPoint;
    _startOffset = _offset;
  }

  void _onUpdate(ScaleUpdateDetails d) {
    setState(() {
      final z = (_startZoom * d.scale).clamp(_minZoom, 5.0).toDouble();
      // Parmakların altındaki görsel noktası parmakların altında kalır (yakınlaştırma + kaydırma birlikte).
      final anchor = (_startFocal - _startOffset) / (_base * _startZoom);
      _zoom = z;
      _offset = _clamp(d.focalPoint - anchor * _scale);
    });
  }

  Future<void> _done() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final s = _scale;
      // Çerçevede görünen alan aynen çıktıya çizilir (doldur da sığdır da aynı hesap).
      final visibleW = _frame.width / s; // çerçeve boyunca görselin kaç pikseli var
      // Kaynak görsel küçükse büyütülmez (bulanıklaşmasın); tema görseli ise her zaman tam boyutta üretilir.
      final outW = widget.spec.allowFit ? widget.spec.outWidth : math.min(math.max(visibleW.round(), 64), widget.spec.outWidth);
      final outH = math.max((outW / widget.spec.aspect).round(), 32);
      final k = outW / _frame.width; // ekran → çıktı ölçeği
      final full = Rect.fromLTWH(0, 0, _imgW, _imgH);
      final dst = Rect.fromLTWH((_offset.dx - _frame.left) * k, (_offset.dy - _frame.top) * k, _imgW * s * k, _imgH * s * k);
      final out = Rect.fromLTWH(0, 0, outW.toDouble(), outH.toDouble());
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder, out);
      canvas.clipRect(out);
      canvas.drawColor(Colors.black, BlendMode.src);
      final coversAll = dst.left <= 0.5 && dst.top <= 0.5 && dst.right >= out.width - 0.5 && dst.bottom >= out.height - 0.5;
      if (widget.spec.allowFit && !coversAll) {
        // Boş kalan kenarlar: görselin çerçeveyi örten, bulanık ve koyulaştırılmış kopyası.
        final cover = math.max(out.width / _imgW, out.height / _imgH);
        final bg = Rect.fromCenter(center: out.center, width: _imgW * cover, height: _imgH * cover);
        canvas.drawImageRect(widget.source, full, bg, Paint()
          ..filterQuality = FilterQuality.low
          ..imageFilter = ui.ImageFilter.blur(sigmaX: 28, sigmaY: 28, tileMode: TileMode.clamp));
        canvas.drawRect(out, Paint()..color = const Color(0x73000000));
      }
      canvas.drawImageRect(widget.source, full, dst, Paint()..filterQuality = FilterQuality.high);
      final picture = recorder.endRecording();
      final image = await picture.toImage(outW, outH);
      picture.dispose();
      final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      image.dispose();
      if (data == null) throw StateError('Görsel işlenemedi');
      final rgba = data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
      final jpg = await compute(_encodeJpg, (rgba, outW, outH));
      if (mounted) Navigator.of(context).pop(jpg);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Fotoğraf hazırlanamadı: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: LayoutBuilder(builder: (context, box) {
        _layout(box.biggest);
        final w = _imgW * _scale;
        final h = _imgH * _scale;
        // fit: expand → kırpma alanı tüm ekranı kaplar. (Yalnızca başlık yazısı konumsuz olduğu için yığın onun
        // genişliğine küçülüyor, görsel ve çerçeve sağdan kesiliyordu.)
        return Stack(fit: StackFit.expand, children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onScaleStart: _onStart,
              onScaleUpdate: _onUpdate,
              child: Stack(children: [
                // Sığdır: çerçevede boş kalan yer, kaydedilecek görseldeki gibi bulanık arka planla gösterilir.
                if (widget.spec.allowFit && (w < _frame.width - 0.5 || h < _frame.height - 0.5))
                  Positioned.fromRect(
                    rect: _frame,
                    child: ClipRect(
                      child: ImageFiltered(
                        imageFilter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14, tileMode: TileMode.clamp),
                        child: ColorFiltered(
                          colorFilter: const ColorFilter.mode(Color(0x73000000), BlendMode.darken),
                          child: RawImage(image: widget.source, fit: BoxFit.cover, filterQuality: FilterQuality.low),
                        ),
                      ),
                    ),
                  ),
                Positioned(left: _offset.dx, top: _offset.dy, width: w, height: h, child: RawImage(image: widget.source, fit: BoxFit.fill, filterQuality: FilterQuality.medium)),
                Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: _MaskPainter(_frame, widget.spec.circle)))),
              ]),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Column(children: [
                Text(widget.spec.title, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text(widget.spec.allowFit ? 'Sürükle, iki parmakla büyüt/küçült. Tamamı görünsün istersen "Sığdır".' : 'Sürükle ve iki parmakla büyüt/küçült',
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60, fontSize: 13)),
                if (widget.spec.allowFit && _minZoom < 0.999) ...[
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white38), visualDensity: VisualDensity.compact, shape: const StadiumBorder()),
                    onPressed: _busy ? null : _toggleFit,
                    icon: Icon(_isFitted ? Icons.fullscreen : Icons.fit_screen, size: 18),
                    label: Text(_isFitted ? 'Doldur' : 'Sığdır'),
                  ),
                ],
              ]),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Row(children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white38), minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
                      onPressed: _busy ? null : () => Navigator.of(context).pop(),
                      child: const Text('Vazgeç', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
                      onPressed: _busy ? null : _done,
                      child: _busy
                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                          : const Text('Kullan', style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                ]),
              ),
            ),
          ),
        ]);
      }),
    );
  }
}

/// Çerçevenin dışını karartır; çerçeveye ince beyaz kenar (profil fotoğrafında daire) çizer.
class _MaskPainter extends CustomPainter {
  final Rect frame;
  final bool circle;
  _MaskPainter(this.frame, this.circle);

  @override
  void paint(Canvas canvas, Size size) {
    final hole = Path();
    if (circle) {
      hole.addOval(frame);
    } else {
      hole.addRect(frame);
    }
    final mask = Path.combine(PathOperation.difference, Path()..addRect(Offset.zero & size), hole);
    canvas.drawPath(mask, Paint()..color = const Color(0xD9000000)); // çerçeve dışı belirgin koyu: neyin kesileceği açıkça görünsün
    final line = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawPath(hole, line);
    if (circle) canvas.drawRect(frame, line..color = Colors.white24);
  }

  @override
  bool shouldRepaint(_MaskPainter old) => old.frame != frame || old.circle != circle;
}

/// Ayrı iş parçacığında: ham RGBA → JPEG (%88 kalite).
Uint8List _encodeJpg((Uint8List, int, int) a) {
  final (rgba, w, h) = a;
  final image = img.Image.fromBytes(width: w, height: h, bytes: rgba.buffer, bytesOffset: rgba.offsetInBytes, numChannels: 4, rowStride: w * 4);
  // 84: gözle fark edilmez, dosya ~%25 küçük (herkes bu resmi indirir → daha az internet).
  return img.encodeJpg(image, quality: 84);
}
