import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Seviye görünümleri (1–300): **taç = gönderme (atış) seviyesi**, **kalp = alma (alış) seviyesi**.
/// Küçük etiket: renkli hap + sağda simge, solda seviye sayısı. Büyük rozet: seviye sayfasında.
///
/// 151–300 "prestij" kademeleri (en üst rozetin üstüne kodla çizilen efektler, ek dosya gerekmez):
///   151–200 Kraliyet: altın parıltı süzülür.
///   201–250 Elmas: buz-mavi ton, parıltı ve dış ışıma.
///   251–300 Efsane: renk değiştiren gökkuşağı çerçeve, parıltı ve ışıma.
/// Animasyonlar tek ortak saatle (≈30 kare/sn) döner; "animasyonları azalt" açıksa durağan çizilir.

const kMaxLevel = 300;

// Gönderme (Coin) seviyesi kademeleri: 7 etiket / 7 rozet (yeşil yıldız → kırmızı yakut taç).
const _sendSteps = [1, 11, 21, 41, 61, 81, 101];

int sendTier(int level) {
  var t = 1;
  for (var i = 0; i < _sendSteps.length; i++) {
    if (level >= _sendSteps[i]) t = i + 1;
  }
  return t;
}

/// Alma (Elmas) seviyesi kademeleri: 12 etiket, her 10 seviyede bir (1–10, 11–20 … 111+).
int recvTier(int level) => ((level - 1) ~/ 10 + 1).clamp(1, 12);

/// Alma rozetleri: 10 kademe (16 seviyede bir).
int recvBadgeTier(int level) => ((level - 1) ~/ 16 + 1).clamp(1, 10);

/// Prestij kademesi: 0 = yok (1–150), 1 = Kraliyet (151–200), 2 = Elmas (201–250), 3 = Efsane (251–300).
int prestigeTier(int level) => level > 250 ? 3 : level > 200 ? 2 : level > 150 ? 1 : 0;

const prestigeNames = ['', 'Kraliyet', 'Elmas', 'Efsane'];

int _lv(dynamic v) => (v is num ? v.toInt() : int.tryParse('$v') ?? 1).clamp(1, kMaxLevel);

/// Prestij efektleri için tek ortak saat: görünen efekt varken ≈30 kare/sn döner, kimse kalmayınca durur.
/// Zamanlayıcı (Ticker değil): ekran yalnızca değer değiştiğinde çizilir, her ekran yenilemesinde değil (pil dostu).
class PrestigeClock {
  PrestigeClock._();
  static final ValueNotifier<double> t = ValueNotifier<double>(0); // 0..1, 3 sn'de bir tur
  static Timer? _timer;
  static final Stopwatch _watch = Stopwatch();
  static int _users = 0;

  static void attach() {
    if (_users++ > 0) return;
    _watch.start();
    _timer = Timer.periodic(const Duration(milliseconds: 33), (_) => t.value = (_watch.elapsedMilliseconds % 3000) / 3000.0);
  }

  static void detach() {
    if (--_users > 0) return;
    _users = 0;
    _timer?.cancel();
    _timer = null;
    _watch.stop();
  }
}

/// Renk tonunu döndüren matris (derece). Beyaz / gri tonlar korunur.
List<double> _hueMatrix(double degrees) {
  final r = degrees * math.pi / 180;
  final c = math.cos(r);
  final s = math.sin(r);
  const lr = 0.213, lg = 0.715, lb = 0.072;
  return [
    lr + c * (1 - lr) + s * -lr, lg + c * -lg + s * -lg, lb + c * -lb + s * (1 - lb), 0, 0, //
    lr + c * -lr + s * 0.143, lg + c * (1 - lg) + s * 0.140, lb + c * -lb + s * -0.283, 0, 0,
    lr + c * -lr + s * -(1 - lr), lg + c * -lg + s * lg, lb + c * (1 - lb) + s * lb, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/// En üst kademe görselinin üstüne prestij efektleri. [circle]: rozet (daire ışıma), değilse hap (yuvarlak köşeli).
class _Prestige extends StatefulWidget {
  final int tier;
  final Widget child;
  final bool circle;
  const _Prestige({required this.tier, required this.child, this.circle = false});

  @override
  State<_Prestige> createState() => _PrestigeState();
}

class _PrestigeState extends State<_Prestige> {
  bool _animated = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Üstüne başka sayfa açılınca (TickerMode kapalı) ya da "animasyonları azalt" açıksa durur.
    final want = TickerMode.of(context) && !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    if (want != _animated) {
      _animated = want;
      if (want) {
        PrestigeClock.attach();
      } else {
        PrestigeClock.detach();
      }
    }
  }

  @override
  void dispose() {
    if (_animated) PrestigeClock.detach();
    super.dispose();
  }

  Widget _frame(double t) {
    final p = widget.tier;
    Widget c = widget.child;
    // Ton: Elmas buz-mavi; Efsane yavaşça tüm renklerde döner.
    if (p == 2) c = ColorFiltered(colorFilter: ColorFilter.matrix(_hueMatrix(200)), child: c);
    if (p == 3) c = ColorFiltered(colorFilter: ColorFilter.matrix(_hueMatrix(t * 360)), child: c);
    // Parıltı: soldan sağa süzülen ışık şeridi (yalnızca görselin dolu yerlerinde).
    final x = -1.6 + t * 3.2;
    c = ShaderMask(
      blendMode: BlendMode.srcATop,
      shaderCallback: (r) => LinearGradient(
        begin: Alignment(x - 0.5, -1),
        end: Alignment(x + 0.5, 1),
        colors: [
          Colors.transparent,
          (p == 1 ? const Color(0xFFFFF1B8) : Colors.white).withValues(alpha: p == 1 ? 0.55 : 0.6),
          Colors.transparent,
        ],
        stops: const [0.35, 0.5, 0.65],
      ).createShader(r),
      child: c,
    );
    return CustomPaint(foregroundPainter: _GlowPainter(tier: p, t: t, circle: widget.circle), child: c);
  }

  @override
  Widget build(BuildContext context) {
    if (!_animated) return _frame(0.3);
    return RepaintBoundary(child: ValueListenableBuilder<double>(valueListenable: PrestigeClock.t, builder: (_, t, __) => _frame(t)));
  }
}

/// Çerçeve ışıması: Kraliyet ince altın çizgi, Elmas buz-mavi ışıma, Efsane dönen gökkuşağı çerçeve.
class _GlowPainter extends CustomPainter {
  final int tier;
  final double t;
  final bool circle;
  _GlowPainter({required this.tier, required this.t, required this.circle});

  @override
  void paint(Canvas canvas, Size size) {
    final RRect shape;
    if (circle) {
      // Rozet görselinde daire ortada, genişliğin ~%66'sı.
      final r = size.width * 0.33;
      shape = RRect.fromRectAndRadius(Rect.fromCircle(center: Offset(size.width / 2, size.height * 0.5), radius: r), Radius.circular(r));
    } else {
      shape = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(size.height / 2)).deflate(size.height * 0.04);
    }
    final w = (circle ? size.width * 0.035 : size.height * 0.09).clamp(1.0, 4.0);
    final pulse = 0.55 + 0.45 * math.sin(t * 2 * math.pi);
    if (tier >= 2) {
      final glow = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = w * 2
        ..color = (tier == 2 ? const Color(0xFF7FE7FF) : const Color(0xFFFFD36E)).withValues(alpha: 0.35 * pulse)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, w * 1.6);
      canvas.drawRRect(shape, glow);
    }
    final Paint line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w;
    if (tier == 3) {
      line.shader = SweepGradient(
        colors: const [Color(0xFFFF5252), Color(0xFFFFD740), Color(0xFF69F0AE), Color(0xFF40C4FF), Color(0xFFE040FB), Color(0xFFFF5252)],
        transform: GradientRotation(t * 2 * math.pi),
      ).createShader(shape.outerRect);
    } else {
      line.color = (tier == 2 ? const Color(0xFFBFF4FF) : const Color(0xFFFFD86B)).withValues(alpha: 0.75 + 0.25 * pulse);
    }
    canvas.drawRRect(shape, line);
  }

  @override
  bool shouldRepaint(_GlowPainter old) => old.t != t || old.tier != tier || old.circle != circle;
}

/// Seviye etiketi. [send] true: taçlı gönderme seviyesi, false: kalpli alma seviyesi. [height]: dp.
class LevelPill extends StatelessWidget {
  final dynamic level;
  final bool send;
  final double height;
  const LevelPill({super.key, required this.level, required this.send, this.height = 16});

  @override
  Widget build(BuildContext context) {
    final lv = _lv(level);
    final asset = send ? 'assets/images/lv_send_${sendTier(lv)}.png' : 'assets/images/lv_recv_${recvTier(lv)}.png';
    final w = height * 96 / 42;
    final p = prestigeTier(lv);
    Widget art = Image.asset(asset, fit: BoxFit.fill, filterQuality: FilterQuality.medium, errorBuilder: (_, __, ___) => const SizedBox.shrink());
    if (p > 0) art = _Prestige(tier: p, child: art);
    return SizedBox(
      width: w,
      height: height,
      child: Stack(fit: StackFit.expand, children: [
        art,
        Positioned(
          left: height * 0.32,
          top: 0,
          bottom: 0,
          width: w * 0.5,
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                '$lv',
                maxLines: 1,
                style: TextStyle(
                  color: p == 1 ? const Color(0xFFFFF4C7) : Colors.white,
                  fontSize: height * 0.62,
                  height: 1.0,
                  fontWeight: FontWeight.w900,
                  fontStyle: FontStyle.italic,
                  shadows: [
                    const Shadow(color: Color(0x99000000), blurRadius: 2, offset: Offset(0, 0.5)),
                    if (p >= 2) Shadow(color: (p == 2 ? const Color(0xFF7FE7FF) : const Color(0xFFFFD36E)).withValues(alpha: 0.8), blurRadius: 4),
                  ],
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Büyük seviye rozeti (konfetili daire). [size]: genişlik dp. 151+ seviyede prestij efektleriyle.
class LevelBadgeImage extends StatelessWidget {
  final dynamic level;
  final bool send;
  final double size;
  const LevelBadgeImage({super.key, required this.level, required this.send, this.size = 96});

  @override
  Widget build(BuildContext context) {
    final lv = _lv(level);
    final asset = send ? 'assets/images/badge_send_${sendTier(lv)}.webp' : 'assets/images/badge_recv_${recvBadgeTier(lv)}.webp';
    final h = size * 495 / 555;
    final img = Image.asset(asset, width: size, height: h, fit: BoxFit.contain, errorBuilder: (_, __, ___) => SizedBox(width: size, height: h));
    final p = prestigeTier(lv);
    if (p == 0) return img;
    return SizedBox(width: size, height: h, child: _Prestige(tier: p, circle: true, child: img));
  }
}

/// CP seviye etiketi (LV3–LV5 tasarımı; 1–2 için aynı pembe tonda kodla çizilir).
class CpLevelPill extends StatelessWidget {
  final int level;
  final double height;
  const CpLevelPill({super.key, required this.level, this.height = 18});

  @override
  Widget build(BuildContext context) {
    final w = height * 114 / 42;
    if (level >= 3) {
      return Image.asset('assets/images/cp_lv${level.clamp(3, 5)}.png', width: w, height: height, fit: BoxFit.fill);
    }
    return Container(
      width: w,
      height: height,
      alignment: Alignment.center,
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(height / 2), gradient: const LinearGradient(colors: [Color(0xFFFF7EB3), Color(0xFFFF4F9A)])),
      child: Text('LV$level', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: height * 0.62, height: 1.0)),
    );
  }
}
