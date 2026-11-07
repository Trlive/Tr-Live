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

  /// Mor-pembe parlak bant, ince altın çerçeve, nabız gibi atan ışık, parıldayan yıldızlar, arkasında dönen ışınlı hediye.
  Widget _bigStrip(double sw) {
    final k = (sw / 400).clamp(0.82, 1.15).toDouble();
    final w = (sw * 0.94).clamp(0.0, 380.0).toDouble();
    final h = 60 * k;
    final fs = 13.5 * k;
    return Center(
      child: SizedBox(
        width: w,
        height: h + 16 * k,
        child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
          AnimatedBuilder(
            animation: _c,
            builder: (_, child) {
              final pulse = 0.5 + 0.5 * math.sin(_c.value * math.pi * 2);
              return Container(
                height: h,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(h / 2),
                  border: Border.all(color: const Color(0xFFFFD54F), width: 1.4),
                  gradient: const LinearGradient(colors: [Color(0xFF3A0CA3), Color(0xFF7209B7), Color(0xFFD0218F), Color(0xFF7209B7)], stops: [0, 0.35, 0.7, 1]),
                  boxShadow: [
                    BoxShadow(color: const Color(0xFFE040FB).withValues(alpha: 0.35 + 0.35 * pulse), blurRadius: 10 + 10 * pulse),
                    BoxShadow(color: const Color(0xFFFFD54F).withValues(alpha: 0.25 * pulse), blurRadius: 4),
                  ],
                ),
                child: child,
              );
            },
            child: ClipRRect(
              borderRadius: BorderRadius.circular(h / 2),
              child: Stack(children: [
                _shine(w, h),
                ..._sparkles(w, h, 7, const Color(0xFFFFF59D)),
                Padding(
                  padding: EdgeInsets.fromLTRB(5 * k, 5 * k, 14 * k, 5 * k),
                  child: Row(children: [
                    _avatar((h - 14 * k) / 2, const [Color(0xFFFFF1A8), Color(0xFFFFB300), Color(0xFFFF8F00)]),
                    SizedBox(width: 8 * k),
                    Expanded(child: _texts(fs)),
                    _qty(24 * k, color: const Color(0xFFFFF59D), glow: const Color(0xFFE040FB)),
                    SizedBox(width: h * 1.15 - 8 * k),
                  ]),
                ),
              ]),
            ),
          ),
          // Üstte "SÜPER HEDİYE" rozeti
          Positioned(top: -2 * k, child: _badge('SÜPER HEDİYE', k, const [Color(0xFFFF4F9A), Color(0xFF9D4EDD)])),
          // Hediye: şeridin üstüne taşan, arkasında dönen ışınlar
          Positioned(right: 0, child: _giftIcon(h * 1.15, rays: true, glow: const Color(0xAAFFC6FF))),
        ]),
      ),
    );
  }

  // ---------------------------------------------------------------- 3) 1 milyon ve üstü

  /// En gelişmiş: etrafında dönen altın çerçeve, koyu kırmızı-siyah zemin, üstte taç ve "EFSANE HEDİYE", ışınlı büyük
  /// hediye, yıldızlar ve parıltı.
  Widget _legendStrip(double sw) {
    final k = (sw / 400).clamp(0.82, 1.15).toDouble();
    final w = (sw * 0.96).clamp(0.0, 390.0).toDouble();
    final h = 70 * k;
    final fs = 15 * k;
    const border = 3.0;
    return Center(
      child: SizedBox(
        width: w,
        height: h + 26 * k,
        child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
          // Dönen altın çerçeve (sweep gradyanı döndürülür)
          AnimatedBuilder(
            animation: _c,
            builder: (_, child) => Container(
              height: h,
              padding: const EdgeInsets.all(border),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(h / 2),
                gradient: SweepGradient(
                  transform: GradientRotation(_c.value * math.pi * 2),
                  colors: const [Color(0xFFFFF6C2), Color(0xFFFFC300), Color(0xFFB8860B), Color(0xFFFFE57F), Color(0xFFFF8F00), Color(0xFFFFF6C2)],
                ),
                boxShadow: [
                  BoxShadow(color: const Color(0xFFFFC300).withValues(alpha: 0.55 + 0.25 * math.sin(_c.value * math.pi * 2)), blurRadius: 18),
                  const BoxShadow(color: Color(0x88FF3D00), blurRadius: 30, spreadRadius: -6),
                ],
              ),
              child: child,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(h / 2 - border),
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFF1A0000), Color(0xFF7A0010), Color(0xFFB71C1C), Color(0xFF7A0010), Color(0xFF1A0000)]),
                ),
                child: Stack(children: [
                  _shine(w, h, alpha: 0.5),
                  ..._sparkles(w, h, 10, const Color(0xFFFFE57F)),
                  Padding(
                    padding: EdgeInsets.fromLTRB(5 * k, 4 * k, 14 * k, 4 * k),
                    child: Row(children: [
                      _avatar((h - 2 * border - 12 * k) / 2, const [Color(0xFFFFF6C2), Color(0xFFFFC300), Color(0xFFB8860B)]),
                      SizedBox(width: 8 * k),
                      Expanded(child: _texts(fs, name: const Color(0xFFFFE57F), to: const Color(0xFFFFF6C2))),
                      Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        _qty(26 * k, color: const Color(0xFFFFE57F), glow: const Color(0xFFFF3D00)),
                        Text('${fmtNumber(e['totalCoins'])} Coin',
                            style: TextStyle(color: const Color(0xFFFFF6C2), fontWeight: FontWeight.w800, fontSize: 10.5 * k, height: 1)),
                      ]),
                      SizedBox(width: h * 1.25 - 10 * k),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
          // Taç ve rozet
          Positioned(
            top: -6 * k,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              AnimatedBuilder(
                animation: _c,
                builder: (_, child) => Transform.scale(scale: 1 + 0.08 * math.sin(_c.value * math.pi * 4), child: child),
                child: Text('👑', style: TextStyle(fontSize: 18 * k, height: 1, shadows: const [Shadow(color: Color(0xFFFFC300), blurRadius: 10)])),
              ),
              _badge('EFSANE HEDİYE', k, const [Color(0xFFFFC300), Color(0xFFFF6F00)], dark: true),
            ]),
          ),
          Positioned(right: 0, child: _giftIcon(h * 1.25, rays: true, glow: const Color(0xCCFFD54F))),
        ]),
      ),
    );
  }

  Widget _badge(String text, double k, List<Color> colors, {bool dark = false}) => Container(
        padding: EdgeInsets.symmetric(horizontal: 9 * k, vertical: 1.5 * k),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: colors),
          borderRadius: BorderRadius.circular(9 * k),
          border: Border.all(color: const Color(0xFFFFF6C2), width: 0.8),
          boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)],
        ),
        child: Text(text,
            style: TextStyle(
              color: dark ? const Color(0xFF3A1A00) : Colors.white,
              fontWeight: FontWeight.w900,
              fontSize: 9.5 * k,
              letterSpacing: 0.8,
              height: 1.1,
            )),
      );

  /// Şeridin içinde yanıp sönen küçük yıldızlar (konumlar sabit, sırayla parıldar).
  List<Widget> _sparkles(double w, double h, int n, Color color) {
    final rnd = math.Random(7);
    return [
      for (var i = 0; i < n; i++)
        () {
          final x = (0.12 + rnd.nextDouble() * 0.76) * w;
          final y = (0.12 + rnd.nextDouble() * 0.7) * h;
          final phase = i / n;
          final size = h * (0.12 + rnd.nextDouble() * 0.1);
          return Positioned(
            left: x,
            top: y,
            child: AnimatedBuilder(
              animation: _c,
              builder: (_, __) {
                final v = math.sin(((_c.value + phase) % 1) * math.pi);
                return Opacity(
                  opacity: (v * v).clamp(0.0, 1.0),
                  child: Transform.scale(scale: 0.5 + 0.7 * v, child: Icon(Icons.auto_awesome, size: size, color: color)),
                );
              },
            ),
          );
        }(),
    ];
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
