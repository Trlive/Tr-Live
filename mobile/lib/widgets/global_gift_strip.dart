import 'dart:math' as math;
import 'dart:ui' as ui;

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

  Widget _texts(double fs, {Color name = const Color(0xFFFFE082), Color to = Colors.white, bool strong = false}) {
    final sender = mapOf(e['sender']);
    // Altın zeminde okunsun diye daha koyu gölge.
    final sh = strong
        ? const [Shadow(color: Color(0xFF3A1A00), blurRadius: 3, offset: Offset(0, 1)), Shadow(color: Color(0xAA000000), blurRadius: 6)]
        : const [Shadow(color: Colors.black54, blurRadius: 3)];
    return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(
        '${sender?['displayName'] ?? 'Biri'}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: name, fontWeight: FontWeight.w900, fontSize: fs, height: 1.15, shadows: sh),
      ),
      Text.rich(
        TextSpan(children: [
          TextSpan(text: 'gönderdi → ', style: TextStyle(color: strong ? Colors.white : Colors.white70, fontWeight: FontWeight.w600, fontSize: fs * 0.82)),
          TextSpan(text: _to, style: TextStyle(color: to, fontWeight: FontWeight.w800, fontSize: fs * 0.88)),
        ]),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(height: 1.15, shadows: sh),
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

  /// 400K+ ve 1M+ şerit: var olan altın-kırmızı şerit korunur, üzerine ışık ve parıltı eklenir.
  /// 400K+: şeridin biçimini izleyen sıcak ışık halesi, şerit (süsler dahil) üzerinden kayan parlak ışık, süslerin
  /// üstünde patlayan yıldız parıltıları, banttan yükselen ışık taneleri, amblemde parlama.
  /// 1M+: kırmızı bant altın sarısına döner; altın hale daha güçlü, altın parıltı iki kez geçer, amblemin arkasında dönen
  /// altın ışınlar, bandın kenarında dolaşan altın ışık, yağan altın tozları, toplam Coin.
  Widget _ribbon(double sw, {required bool legend}) {
    final w = legend ? (sw * 0.9).clamp(0.0, 370.0).toDouble() : (sw * 0.8).clamp(0.0, 330.0).toDouble();
    final h = w / 3;
    final fs = (h * 0.155).clamp(10.0, 16.0).toDouble();
    // Görseldeki bant: genişliğin ~%2–%98'i, yüksekliğin ~%35,5–%83'ü.
    final bandL = w * 0.02, bandT = h * 0.355, bandW = w * 0.96, bandH = h * 0.475;
    final band = RRect.fromRectAndRadius(Rect.fromLTWH(bandL, bandT, bandW, bandH), Radius.circular(bandH / 2));
    final glow = legend ? const Color(0xFFFFD54F) : const Color(0xFFFFA94D);
    final star = legend ? const Color(0xFFFFE57F) : const Color(0xFFFFF3E0);
    Widget ribbon() => Image.asset('assets/images/gift_ribbon_gold.webp', width: w, height: h, fit: BoxFit.fill);
    // 1M+: yalnızca kırmızı bant altın sarısı (süsler olduğu gibi kalır).
    Widget visual() => legend
        ? Stack(children: [
            ribbon(),
            ClipRRect(
              clipper: _RRectClip(band),
              child: ColorFiltered(colorFilter: const ColorFilter.matrix(_kGoldBand), child: ribbon()),
            ),
          ])
        : ribbon();
    // Süslerin üzerindeki parıltı noktaları (genişlik/yükseklik oranı).
    const glints = [
      Offset(0.5, 0.12), Offset(0.36, 0.24), Offset(0.64, 0.24), Offset(0.2, 0.3), Offset(0.8, 0.3),
      Offset(0.5, 0.9), Offset(0.06, 0.58), Offset(0.94, 0.58), Offset(0.3, 0.86), Offset(0.7, 0.86),
    ];
    return Center(
      child: SizedBox(
        width: w,
        height: h,
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            final t = _c.value;
            final pulse = 0.5 + 0.5 * math.sin(t * math.pi * 2);
            // Parlak ışık: 400K döngüde bir, 1M iki kez geçer (geçiş arasında kısa bekleme).
            final sweepT = ((t * (legend ? 2 : 1)) % 1.0) / 0.7;
            final sx = -2.2 + 4.4 * sweepT.clamp(0.0, 1.0);
            return Stack(clipBehavior: Clip.none, children: [
              // 1M+: amblemin arkasında dönen altın ışınlar
              if (legend)
                Positioned(
                  left: w / 2 - w * 0.4,
                  top: h * 0.14 - w * 0.4,
                  width: w * 0.8,
                  height: w * 0.8,
                  child: IgnorePointer(
                    child: Opacity(
                      opacity: 0.45 + 0.35 * pulse,
                      child: Transform.rotate(angle: t * math.pi * 2 / 3, child: CustomPaint(painter: _RaysPainter(color: const Color(0xCCFFC93C)))),
                    ),
                  ),
                ),
              // Şeridin biçimini izleyen ışık halesi (atar)
              Positioned.fill(
                child: Opacity(
                  opacity: (legend ? 0.55 : 0.45) + (legend ? 0.4 : 0.35) * pulse,
                  child: Transform.scale(
                    scale: 1.03 + 0.02 * pulse,
                    child: ImageFiltered(
                      imageFilter: ui.ImageFilter.blur(sigmaX: legend ? 14 : 9, sigmaY: legend ? 14 : 9),
                      child: ColorFiltered(colorFilter: ColorFilter.mode(glow, BlendMode.srcIn), child: ribbon()),
                    ),
                  ),
                ),
              ),
              // Şerit + üzerinden kayan parlak ışık (yalnızca şeridin dolu yerlerinde görünür)
              Positioned.fill(
                child: ShaderMask(
                  blendMode: BlendMode.srcATop,
                  shaderCallback: (r) => LinearGradient(
                    begin: Alignment(sx - 0.6, -1),
                    end: Alignment(sx + 0.6, 1),
                    colors: [
                      Colors.white.withValues(alpha: 0),
                      (legend ? const Color(0xFFFFF3C4) : Colors.white).withValues(alpha: 0.55),
                      Colors.white.withValues(alpha: legend ? 0.95 : 0.85),
                      (legend ? const Color(0xFFFFF3C4) : Colors.white).withValues(alpha: 0.55),
                      Colors.white.withValues(alpha: 0),
                    ],
                    stops: const [0.38, 0.46, 0.5, 0.54, 0.62],
                  ).createShader(r),
                  child: visual(),
                ),
              ),
              // Amblemde parlama
              Positioned(
                left: w / 2 - h * 0.35,
                top: h * 0.12 - h * 0.35,
                width: h * 0.7,
                height: h * 0.7,
                child: IgnorePointer(
                  child: Opacity(
                    opacity: (math.sin(t * math.pi * 2 * (legend ? 2 : 1)) * 0.5 + 0.5) * (legend ? 0.95 : 0.75),
                    child: const DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(colors: [Color(0xFFFFFFFF), Color(0x99FFE082), Color(0x00FFC107)], stops: [0, 0.25, 1]),
                      ),
                    ),
                  ),
                ),
              ),
              // Süslerin üzerinde patlayan yıldız parıltıları
              for (var i = 0; i < glints.length; i++)
                () {
                  final ph = (t * (legend ? 1.6 : 1.2) + i * 0.37) % 1.0;
                  final v = ph < 0.5 ? math.sin(ph / 0.5 * math.pi) : 0.0; // yarı sürede parlar, yarısında söner
                  final size = h * (legend ? 0.3 : 0.26) * (0.7 + 0.3 * ((i * 7) % 3) / 2);
                  return Positioned(
                    left: glints[i].dx * w - size / 2,
                    top: glints[i].dy * h - size / 2,
                    width: size,
                    height: size,
                    child: IgnorePointer(
                      child: Opacity(
                        opacity: v.clamp(0.0, 1.0),
                        child: Transform.rotate(
                          angle: ph * math.pi,
                          child: Transform.scale(scale: 0.4 + 0.8 * v, child: CustomPaint(painter: _GlintPainter(star))),
                        ),
                      ),
                    ),
                  );
                }(),
              // Banttan yükselen ışık taneleri
              for (var i = 0; i < (legend ? 14 : 9); i++)
                () {
                  final ph = (t + i / (legend ? 14 : 9)) % 1.0;
                  final x = bandL + ((i * 0.618 + 0.11) % 1.0) * bandW;
                  final d = h * (0.035 + 0.02 * (i % 3));
                  return Positioned(
                    left: x,
                    top: bandT + bandH * 0.9 - ph * h * 0.75,
                    child: IgnorePointer(
                      child: Opacity(
                        opacity: math.sin(ph * math.pi).clamp(0.0, 1.0),
                        child: Container(
                          width: d,
                          height: d,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: star, boxShadow: [BoxShadow(color: glow, blurRadius: d * 1.6, spreadRadius: d * 0.2)]),
                        ),
                      ),
                    ),
                  );
                }(),
              // 1M+: bandın kenarında dolaşan altın ışık (kuyruklu)
              if (legend)
                for (final off in [0.0, 0.5])
                  for (var k = 0; k < 4; k++)
                    () {
                      final p = _perimeter((t * 0.6 + off - k * 0.012 + 1) % 1, bandW, bandH);
                      final d = bandH * (0.34 - k * 0.07);
                      return Positioned(
                        left: bandL + p.dx - d / 2,
                        top: bandT + p.dy - d / 2,
                        child: IgnorePointer(
                          child: Opacity(
                            opacity: 1 - k * 0.22,
                            child: Container(
                              width: d,
                              height: d,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: RadialGradient(colors: [Color(0xFFFFFFFF), Color(0xFFFFE57F), Color(0x00FFC93C)], stops: [0, 0.35, 1]),
                              ),
                            ),
                          ),
                        ),
                      );
                    }(),
              // 1M+: yağan altın tozları
              if (legend)
                for (var i = 0; i < 12; i++)
                  () {
                    final ph = (t * 1.2 + i / 12) % 1.0;
                    final x = ((i * 0.37 + 0.04) % 1.0) * w;
                    return Positioned(
                      left: x,
                      top: -h * 0.1 + ph * h * 1.25,
                      child: IgnorePointer(
                        child: Opacity(
                          opacity: math.sin(ph * math.pi).clamp(0.0, 1.0),
                          child: Transform.rotate(
                            angle: ph * math.pi * 2,
                            child: SizedBox(width: h * 0.12, height: h * 0.12, child: CustomPaint(painter: _GlintPainter(const Color(0xFFFFD54F)))),
                          ),
                        ),
                      ),
                    );
                  }(),
              // İçerik: gönderen, alıcı, hediye, adet (1M+: toplam Coin)
              Positioned(
                left: bandL + bandH * 0.32,
                right: w - bandL - bandW + bandH * 0.28,
                top: bandT,
                height: bandH,
                child: Row(children: [
                  _avatar(bandH * 0.37, legend ? const [Color(0xFFFFFFFF), Color(0xFFFFD54F), Color(0xFFB8860B)] : const [Color(0xFFFFF1A8), Color(0xFFFFB300)]),
                  SizedBox(width: w * 0.02),
                  Expanded(child: legend ? _texts(fs, name: Colors.white, to: const Color(0xFFFFF8E1), strong: true) : _texts(fs)),
                  SizedBox(
                    width: bandH * 1.05,
                    height: bandH,
                    child: OverflowBox(
                      maxWidth: bandH * 1.35,
                      maxHeight: bandH * 1.35,
                      child: _giftIcon(bandH * 1.35, rays: true, glow: legend ? const Color(0xCCFFF59D) : const Color(0xAAFFE082)),
                    ),
                  ),
                  SizedBox(width: w * 0.008),
                  Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Transform.scale(
                      scale: 1 + 0.1 * pulse,
                      child: legend
                          ? _qty(fs * 1.6, color: Colors.white, glow: const Color(0xFFB8860B))
                          : _qty(fs * 1.5, color: const Color(0xFFFFE57F), glow: const Color(0xFFFF6D00)),
                    ),
                    if (legend)
                      Text('${fmtNumber(e['totalCoins'])} Coin',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: fs * 0.7,
                            height: 1,
                            shadows: const [Shadow(color: Color(0xFF3A1A00), blurRadius: 3, offset: Offset(0, 1))],
                          )),
                  ]),
                ]),
              ),
            ]);
          },
        ),
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

/// Kırmızı bandı koyu altın sarısına çevirir (değerler 0–255 ölçeğinde).
const List<double> _kGoldBand = [
  0.9, 0.35, 0, 0, 25.5, //
  0.62, 0.45, 0, 0, 10.2,
  0.05, 0.15, 0.2, 0, 0,
  0, 0, 0, 1, 0,
];

/// Yalnızca bandı (yuvarlak köşeli dikdörtgen) bırakan kırpma.
class _RRectClip extends CustomClipper<RRect> {
  final RRect r;
  _RRectClip(this.r);
  @override
  RRect getClip(Size size) => r;
  @override
  bool shouldReclip(covariant _RRectClip old) => old.r != r;
}

/// Dört köşeli yıldız parıltısı (ortası beyaz, çevresi renkli ışık).
class _GlintPainter extends CustomPainter {
  final Color color;
  _GlintPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    canvas.drawCircle(c, r * 0.55, Paint()..shader = RadialGradient(colors: [color.withValues(alpha: 0.7), color.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: c, radius: r * 0.55)));
    final p = Path()
      ..moveTo(c.dx, c.dy - r)
      ..quadraticBezierTo(c.dx + r * 0.1, c.dy - r * 0.1, c.dx + r, c.dy)
      ..quadraticBezierTo(c.dx + r * 0.1, c.dy + r * 0.1, c.dx, c.dy + r)
      ..quadraticBezierTo(c.dx - r * 0.1, c.dy + r * 0.1, c.dx - r, c.dy)
      ..quadraticBezierTo(c.dx - r * 0.1, c.dy - r * 0.1, c.dx, c.dy - r)
      ..close();
    canvas.drawPath(p, Paint()..shader = RadialGradient(colors: [Colors.white, color]).createShader(Rect.fromCircle(center: c, radius: r)));
    canvas.drawCircle(c, r * 0.14, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(covariant _GlintPainter old) => old.color != color;
}
