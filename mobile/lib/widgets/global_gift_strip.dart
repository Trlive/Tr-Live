import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../services/api.dart';
import 'common.dart';

/// Global hediye şeridinin kademesi (hediyenin toplam değerine göre).
enum GiftTier { normal, big, legend }

/// 400 bine kadar normal, 400 bin – 1 milyon arası gelişmiş, 1 milyon ve üstü en gelişmiş (altın çerçeveli) şerit.
GiftTier giftTierOf(Object? totalCoins) {
  final v = num.tryParse('${totalCoins ?? 0}') ?? 0;
  if (v >= 1000000) return GiftTier.legend;
  if (v >= 400000) return GiftTier.big;
  return GiftTier.normal;
}

/// Şeridin ekranda kalma süresi (en büyük kademede daha uzun).
int globalGiftStripMs(Map<String, dynamic> e) => giftTierOf(e['totalCoins']) == GiftTier.legend ? 7000 : 5000;

/// Global hediye şeridi: kademeye göre üç tasarım, CP hediyelerinde kalpli çerçeve.
class GlobalGiftStrip extends StatefulWidget {
  final Map<String, dynamic> e;
  const GlobalGiftStrip({super.key, required this.e});

  @override
  State<GlobalGiftStrip> createState() => _GlobalGiftStripState();
}

class _GlobalGiftStripState extends State<GlobalGiftStrip> with SingleTickerProviderStateMixin {
  // Tek saat: parıltı, kalpler, ışınlar ve nabız bu değerden türetilir (0 → 1, 2,4 sn'de bir döner).
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Map<String, dynamic> get e => widget.e;

  List<String> get _names {
    final receivers = e['receivers'] is List ? (e['receivers'] as List) : const [];
    return receivers
        .map((r) => (r is Map && r['user'] is Map ? (r['user'] as Map)['displayName'] : (r is Map ? r['displayName'] : null)))
        .whereType<String>()
        .toList();
  }

  String get _to {
    final n = _names;
    if (n.isEmpty) return 'herkese';
    return n.length == 1 ? n.first : '${n.first} +${n.length - 1}';
  }

  @override
  Widget build(BuildContext context) {
    final cp = mapOf(e['gift'])?['category'] == 'cp';
    final tier = giftTierOf(e['totalCoins']);
    return IgnorePointer(
      child: Material(
        color: Colors.transparent,
        child: LayoutBuilder(builder: (context, box) {
          final sw = box.maxWidth.isFinite ? box.maxWidth : MediaQuery.sizeOf(context).width;
          if (cp) return _cpStrip(sw);
          switch (tier) {
            case GiftTier.legend:
              return _legendStrip(sw);
            case GiftTier.big:
              return _bigStrip(sw);
            case GiftTier.normal:
              return _normalStrip(sw);
          }
        }),
      ),
    );
  }

  // ---------------------------------------------------------------- ortak parçalar

  Widget _giftIcon(double size, {bool rays = false, Color glow = const Color(0xAAFFE082)}) {
    final icon = Api.absoluteUrl(mapOf(e['gift'])?['iconUrl'] as String?);
    final img = icon != null
        ? NetImg(icon, width: size * 0.86, height: size * 0.86, errorBuilder: (_, __, ___) => Icon(Icons.card_giftcard, color: Colors.white, size: size * 0.6))
        : Icon(Icons.card_giftcard, color: Colors.white, size: size * 0.6);
    return SizedBox(
      width: size,
      height: size,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, child) {
          final t = _c.value;
          final bob = math.sin(t * math.pi * 2) * size * 0.04;
          return Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
            if (rays)
              Positioned(
                left: -size * 0.175,
                top: -size * 0.175,
                width: size * 1.35,
                height: size * 1.35,
                child: Transform.rotate(angle: t * math.pi * 2 / 3, child: CustomPaint(painter: _RaysPainter(color: glow))),
              ),
            Container(
              width: size,
              height: size,
              decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [glow, glow.withValues(alpha: 0)])),
            ),
            Transform.translate(offset: Offset(0, bob), child: child),
          ]);
        },
        child: img,
      ),
    );
  }

  Widget _avatar(double r, List<Color> ring) => Container(
        padding: EdgeInsets.all(r * 0.1),
        decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: ring)),
        child: UserAvatar(user: mapOf(e['sender']), radius: r),
      );

  Widget _texts(double fs, {Color name = const Color(0xFFFFE082), Color to = Colors.white}) {
    final sender = mapOf(e['sender']);
    return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(
        '${sender?['displayName'] ?? 'Biri'}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: name, fontWeight: FontWeight.w900, fontSize: fs, height: 1.15, shadows: const [Shadow(color: Colors.black54, blurRadius: 3)]),
      ),
      Text.rich(
        TextSpan(children: [
          TextSpan(text: 'gönderdi → ', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600, fontSize: fs * 0.82)),
          TextSpan(text: _to, style: TextStyle(color: to, fontWeight: FontWeight.w800, fontSize: fs * 0.88)),
        ]),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(height: 1.15, shadows: [Shadow(color: Colors.black54, blurRadius: 3)]),
      ),
    ]);
  }

  Widget _qty(double fs, {Color color = const Color(0xFFFFD54F), Color glow = const Color(0xFFFF6D00)}) => Text(
        'x${e['quantity'] ?? 1}',
        style: TextStyle(color: color, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, fontSize: fs, shadows: [Shadow(color: glow, blurRadius: 8)]),
      );

  /// Üzerinden soldan sağa geçen parlak bant.
  Widget _shine(double w, double h, {double alpha = 0.45}) => AnimatedBuilder(
        animation: _c,
        builder: (_, __) => Positioned(
          left: (_c.value * 1.6 - 0.35) * w,
          top: 0,
          bottom: 0,
          width: h * 1.1,
          child: Transform(
            transform: Matrix4.skewX(-0.45),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [Colors.white.withValues(alpha: 0), Colors.white.withValues(alpha: alpha), Colors.white.withValues(alpha: 0)]),
              ),
            ),
          ),
        ),
      );

  // ---------------------------------------------------------------- 1) 400 bine kadar

  /// Var olan altın-kırmızı şerit; üzerinden parıltı geçer, hediye hafifçe süzülür.
  Widget _normalStrip(double sw) {
    final w = (sw * 0.72).clamp(0.0, 300.0).toDouble();
    final h = w / 3;
    final fs = (h * 0.16).clamp(9.0, 14.0).toDouble();
    return Center(
      child: SizedBox(
        width: w,
        height: h,
        child: Stack(clipBehavior: Clip.none, children: [
          Positioned.fill(child: Image.asset('assets/images/gift_ribbon_gold.webp', fit: BoxFit.fill)),
          // Parıltı yalnızca kırmızı bandın üstünde.
          Positioned(
            left: w * 0.06,
            right: w * 0.06,
            top: h * 0.34,
            height: h * 0.48,
            child: ClipRRect(borderRadius: BorderRadius.circular(h * 0.1), child: Stack(children: [_shine(w, h * 0.48, alpha: 0.3)])),
          ),
          Positioned(
            left: w * 0.08,
            right: w * 0.06,
            top: h * 0.34,
            height: h * 0.48,
            child: Row(children: [
              _avatar(h * 0.14, const [Color(0xFFFFF1A8), Color(0xFFFFB300)]),
              SizedBox(width: w * 0.02),
              Expanded(child: _texts(fs)),
              _giftIcon(h * 0.48),
              _qty(fs * 1.3),
            ]),
          ),
        ]),
      ),
    );
  }

  // ---------------------------------------------------------------- 2) 400 bin – 1 milyon

  /// Aynı altın-kırmızı şerit, daha büyük ve canlı: arkasında nabız gibi atan altın ışık, bant üzerinde parıltı ve
  /// yıldızlar, ışınlı büyük hediye, parlayan adet.
  Widget _bigStrip(double sw) => _ribbon(sw, legend: false);

  // ---------------------------------------------------------------- 3) 1 milyon ve üstü

  /// En gelişmiş: aynı şerit en büyük boyutta; arkasında dönen dev altın ışınlar ve alev rengi hale, bandın kenarında
  /// dolaşan altın ışık, atan amblem, yağan altın tozları, toplam Coin.
  Widget _legendStrip(double sw) => _ribbon(sw, legend: true);

  Widget _ribbon(double sw, {required bool legend}) {
    final w = legend ? (sw * 0.98).clamp(0.0, 410.0).toDouble() : (sw * 0.86).clamp(0.0, 350.0).toDouble();
    final h = w / 3;
    final fs = (h * (legend ? 0.15 : 0.155)).clamp(10.0, 17.0).toDouble();
    // Görseldeki kırmızı bant: genişliğin ~%3–%97'si, yüksekliğin ~%34–%84'ü.
    final bandL = w * 0.03, bandT = h * 0.34, bandW = w * 0.94, bandH = h * 0.5;
    return Center(
      child: SizedBox(
        width: w,
        height: h,
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            final t = _c.value;
            final pulse = 0.5 + 0.5 * math.sin(t * math.pi * 2);
            return Stack(clipBehavior: Clip.none, children: [
              // Arkada dönen dev ışınlar (yalnızca 1M+)
              if (legend)
                Positioned(
                  left: w / 2 - w * 0.42,
                  top: h * 0.2 - w * 0.42,
                  width: w * 0.84,
                  height: w * 0.84,
                  child: Opacity(
                    opacity: 0.55 + 0.25 * pulse,
                    child: Transform.rotate(angle: t * math.pi * 2 / 4, child: CustomPaint(painter: _RaysPainter(color: const Color(0xAAFFC93C)))),
                  ),
                ),
              // Bandın arkasında atan ışık
              Positioned(
                left: bandL,
                top: bandT,
                width: bandW,
                height: bandH,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(bandH / 2),
                    boxShadow: [
                      BoxShadow(color: const Color(0xFFFFC93C).withValues(alpha: 0.35 + 0.4 * pulse), blurRadius: legend ? 26 : 16, spreadRadius: legend ? 4 : 1),
                      if (legend) BoxShadow(color: const Color(0xFFFF5722).withValues(alpha: 0.35 + 0.3 * pulse), blurRadius: 40, spreadRadius: 6),
                    ],
                  ),
                ),
              ),
              Positioned.fill(child: Image.asset('assets/images/gift_ribbon_gold.webp', fit: BoxFit.fill)),
              // Bandın üzerinde parıltı ve yıldızlar
              Positioned(
                left: bandL + bandH * 0.3,
                top: bandT,
                width: bandW - bandH * 0.6,
                height: bandH,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(bandH / 2),
                  child: Stack(children: [
                    Positioned(
                      left: ((t * (legend ? 1.5 : 1.0)) % 1.0) * (bandW + bandH * 2) - bandH * 2,
                      top: 0,
                      bottom: 0,
                      width: bandH * 1.3,
                      child: Transform(
                        transform: Matrix4.skewX(-0.45),
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(colors: [
                              Colors.white.withValues(alpha: 0),
                              Colors.white.withValues(alpha: legend ? 0.45 : 0.32),
                              Colors.white.withValues(alpha: 0),
                            ]),
                          ),
                        ),
                      ),
                    ),
                    for (var i = 0; i < (legend ? 12 : 8); i++) _twinkle(i, t, bandW - bandH * 0.6, bandH, legend ? const Color(0xFFFFE57F) : Colors.white),
                  ]),
                ),
              ),
              // 1M+: bandın kenarında dolaşan iki altın ışık
              if (legend)
                for (final off in [0.0, 0.5])
                  () {
                    final p = _perimeter((t * 0.5 + off) % 1, bandW, bandH);
                    final d = bandH * 0.32;
                    return Positioned(
                      left: bandL + p.dx - d / 2,
                      top: bandT + p.dy - d / 2,
                      child: Container(
                        width: d,
                        height: d,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(colors: [Color(0xFFFFFFFF), Color(0xFFFFE57F), Color(0x00FFC93C)], stops: [0, 0.35, 1]),
                        ),
                      ),
                    );
                  }(),
              // 1M+: amblemin üstünde atan taç
              if (legend)
                Positioned(
                  left: w / 2 - h * 0.13,
                  top: -h * 0.2 - 2 * pulse,
                  child: Transform.scale(
                    scale: 0.92 + 0.12 * pulse,
                    child: Text('👑', style: TextStyle(fontSize: h * 0.24, height: 1, shadows: const [Shadow(color: Color(0xFFFFC93C), blurRadius: 12)])),
                  ),
                ),
              // 1M+: yağan altın tozları
              if (legend)
                for (var i = 0; i < 10; i++)
                  () {
                    final ph = (t + i / 10) % 1.0;
                    final x = ((i * 0.37 + 0.05) % 1.0) * w;
                    return Positioned(
                      left: x,
                      top: -h * 0.15 + ph * h * 1.3,
                      child: Opacity(
                        opacity: math.sin(ph * math.pi).clamp(0.0, 1.0),
                        child: Icon(i.isEven ? Icons.star_rounded : Icons.circle, size: (i.isEven ? 0.09 : 0.045) * h, color: const Color(0xFFFFD54F)),
                      ),
                    );
                  }(),
              // İçerik: gönderen, alıcı, hediye, adet (ve 1M+ toplam Coin)
              Positioned(
                left: bandL + bandH * 0.35,
                right: w - bandL - bandW + bandH * 0.3,
                top: bandT,
                height: bandH,
                child: Row(children: [
                  _avatar(bandH * 0.36, legend ? const [Color(0xFFFFF6C2), Color(0xFFFFC300), Color(0xFFB8860B)] : const [Color(0xFFFFF1A8), Color(0xFFFFB300)]),
                  SizedBox(width: w * 0.02),
                  Expanded(child: _texts(fs)),
                  // Hediye bandın dışına taşar (büyük görünsün).
                  SizedBox(
                    width: bandH * (legend ? 1.15 : 1.0),
                    height: bandH,
                    child: OverflowBox(
                      maxWidth: bandH * (legend ? 1.5 : 1.3),
                      maxHeight: bandH * (legend ? 1.5 : 1.3),
                      child: _giftIcon(bandH * (legend ? 1.5 : 1.3), rays: true, glow: legend ? const Color(0xCCFFD54F) : const Color(0xAAFFE082)),
                    ),
                  ),
                  SizedBox(width: w * 0.01),
                  Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Transform.scale(scale: 1 + 0.08 * pulse, child: _qty(fs * (legend ? 1.7 : 1.55), color: const Color(0xFFFFE57F), glow: const Color(0xFFFF6D00))),
                    if (legend)
                      Text('${fmtNumber(e['totalCoins'])} Coin',
                          style: TextStyle(color: const Color(0xFFFFF6C2), fontWeight: FontWeight.w800, fontSize: fs * 0.72, height: 1, shadows: const [Shadow(color: Colors.black, blurRadius: 3)])),
                  ]),
                ]),
              ),
            ]);
          },
        ),
      ),
    );
  }

  /// Bant üzerinde sırayla parıldayan küçük yıldız.
  Widget _twinkle(int i, double t, double w, double h, Color color) {
    final ph = (t * 1.3 + i * 0.29) % 1.0;
    final v = math.sin(ph * math.pi);
    final size = h * (0.16 + (i % 3) * 0.05);
    return Positioned(
      left: ((i * 0.618 + 0.07) % 1.0) * (w - size),
      top: (i.isEven ? 0.12 : 0.58) * h,
      child: Opacity(
        opacity: (v * v).clamp(0.0, 1.0),
        child: Transform.scale(scale: 0.5 + 0.7 * v, child: Icon(Icons.auto_awesome, size: size, color: color)),
      ),
    );
  }

  // ---------------------------------------------------------------- CP

  /// CP hediyeleri: var olan şerit, çerçevesinde kenar boyunca dolaşan küçük kalpler.
  Widget _cpStrip(double sw) {
    final w = (sw * 0.76).clamp(0.0, 320.0).toDouble();
    final h = w / 3;
    final fs = (h * 0.16).clamp(9.0, 14.0).toDouble();
    // Kalpler kırmızı bandın çevresinde (görselde ~%6–%94 genişlik, ~%30–%86 yükseklik).
    final bandL = w * 0.05, bandT = h * 0.3, bandW = w * 0.9, bandH = h * 0.56;
    const hearts = 18;
    return Center(
      child: SizedBox(
        width: w,
        height: h,
        child: Stack(clipBehavior: Clip.none, children: [
          // Pembe ışıltı
          Positioned(
            left: bandL,
            top: bandT,
            width: bandW,
            height: bandH,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(bandH / 2),
                boxShadow: const [BoxShadow(color: Color(0x99FF4F9A), blurRadius: 16)],
              ),
            ),
          ),
          Positioned.fill(
            child: ColorFiltered(
              // Altın-kırmızı şerit pembeye çekilir.
              colorFilter: const ColorFilter.matrix([
                1.0, 0.1, 0.25, 0, 10, //
                0.05, 0.55, 0.25, 0, 0,
                0.25, 0.1, 0.9, 0, 20,
                0, 0, 0, 1, 0,
              ]),
              child: Image.asset('assets/images/gift_ribbon_gold.webp', fit: BoxFit.fill),
            ),
          ),
          Positioned(
            left: w * 0.08,
            right: w * 0.06,
            top: h * 0.34,
            height: h * 0.48,
            child: Row(children: [
              _avatar(h * 0.14, const [Color(0xFFFFC1E3), Color(0xFFFF4F9A)]),
              SizedBox(width: w * 0.02),
              Expanded(child: _texts(fs, name: const Color(0xFFFFE4F1))),
              _giftIcon(h * 0.48, glow: const Color(0xAAFF80AB)),
              _qty(fs * 1.3, color: const Color(0xFFFFE4F1), glow: const Color(0xFFFF1744)),
            ]),
          ),
          // Kenar boyunca dolaşan kalpler
          for (var i = 0; i < hearts; i++)
            AnimatedBuilder(
              animation: _c,
              builder: (_, __) {
                final t = (_c.value * 0.5 + i / hearts) % 1;
                final p = _perimeter(t, bandW, bandH);
                final beat = 0.75 + 0.35 * math.sin((_c.value * 4 + i * 0.37) * math.pi * 2).abs();
                final s = h * 0.11;
                return Positioned(
                  left: bandL + p.dx - s / 2,
                  top: bandT + p.dy - s / 2,
                  child: Transform.scale(
                    scale: beat,
                    child: Icon(Icons.favorite, size: s, color: i.isEven ? const Color(0xFFFF4F9A) : const Color(0xFFFF8FC7), shadows: const [Shadow(color: Color(0xAAFFFFFF), blurRadius: 3)]),
                  ),
                );
              },
            ),
        ]),
      ),
    );
  }

  /// Yuvarlak uçlu bandın çevresinde t (0..1) konumu.
  static Offset _perimeter(double t, double w, double h) {
    final r = h / 2;
    final straight = w - 2 * r;
    final arc = math.pi * r;
    final total = 2 * straight + 2 * arc;
    var d = t * total;
    if (d < straight) return Offset(r + d, 0); // üst kenar →
    d -= straight;
    if (d < arc) {
      final a = -math.pi / 2 + d / r; // sağ yarım daire
      return Offset(w - r + r * math.cos(a), r + r * math.sin(a));
    }
    d -= arc;
    if (d < straight) return Offset(w - r - d, h); // alt kenar ←
    d -= straight;
    final a = math.pi / 2 + d / r; // sol yarım daire
    return Offset(r + r * math.cos(a), r + r * math.sin(a));
  }
}

class _RaysPainter extends CustomPainter {
  final Color color;
  _RaysPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    final paint = Paint()
      ..shader = RadialGradient(colors: [color, color.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: c, radius: r));
    const n = 12;
    for (var i = 0; i < n; i++) {
      final a = i * math.pi * 2 / n;
      final path = Path()
        ..moveTo(c.dx, c.dy)
        ..lineTo(c.dx + r * math.cos(a - 0.09), c.dy + r * math.sin(a - 0.09))
        ..lineTo(c.dx + r * math.cos(a + 0.09), c.dy + r * math.sin(a + 0.09))
        ..close();
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _RaysPainter old) => old.color != color;
}
