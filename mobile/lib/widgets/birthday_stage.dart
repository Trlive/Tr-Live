import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../l10n/l10n.dart';

/// Doğum günü mikrofon modunun süsleri (hepsi kodla çizilir, görsel dosyası gerekmez; dokunmaları geçirir).
// Palet: uygulamanın siyah-altın tarzı. Şampanya / rose-gold / altın, vurgu olarak gece moru, parlak siyah.
const _kPink = Color(0xFFE9C4A6); // şampanya rose-gold
const _kPinkDeep = Color(0xFFB0705A); // koyu rose-gold (bakır)
const _kGold = Color(0xFFFFD166);
const _kGoldDeep = Color(0xFFC8901A);
const _kLilac = Color(0xFF7C6AE0); // gece moru
const _kMint = Color(0xFFFFF1C2); // açık şampanya (kurdele, taş)
const _kOnyx = Color(0xFF16120C); // parlak siyah

/// Üstteki kutlama şeridi. [name] boşsa genel bir kutlama yazısı gösterilir.
class BirthdayBanner extends StatelessWidget {
  final String? name;
  final double width;
  const BirthdayBanner({super.key, required this.name, required this.width});

  @override
  Widget build(BuildContext context) {
    final n = (name ?? '').trim();
    final text = n.isEmpty ? tx('Doğum Günün Kutlu Olsun!') : tx('İyi ki doğdun {name}!', {'name': n});
    final h = width * 0.2;
    return IgnorePointer(
      child: SizedBox(
        width: width,
        height: h,
        child: Stack(alignment: Alignment.center, children: [
          CustomPaint(size: Size(width, h), painter: _RibbonPainter()),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: width * 0.2),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                text,
                maxLines: 1,
                style: const TextStyle(color: Color(0xFFFFE08A), fontWeight: FontWeight.w900, fontSize: 17, letterSpacing: 0.3, shadows: [Shadow(color: Color(0xAAFFB800), blurRadius: 6)]),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

class _RibbonPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final body = Rect.fromLTWH(w * 0.1, h * 0.18, w * 0.8, h * 0.58);
    final tailPaint = Paint()..color = _kPinkDeep;
    // Kuyruklar
    final left = Path()
      ..moveTo(0, h * 0.28)
      ..lineTo(w * 0.14, h * 0.28)
      ..lineTo(w * 0.14, h * 0.78)
      ..lineTo(0, h * 0.78)
      ..lineTo(w * 0.05, h * 0.53)
      ..close();
    final right = Path()
      ..moveTo(w, h * 0.28)
      ..lineTo(w * 0.86, h * 0.28)
      ..lineTo(w * 0.86, h * 0.78)
      ..lineTo(w, h * 0.78)
      ..lineTo(w * 0.95, h * 0.53)
      ..close();
    canvas.drawPath(left, tailPaint);
    canvas.drawPath(right, tailPaint);
    final rr = RRect.fromRectAndRadius(body, Radius.circular(h * 0.12));
    canvas.drawRRect(
      rr,
      Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF3A2F1E), _kOnyx, Color(0xFF0A0805)]).createShader(body),
    );
    canvas.drawRRect(rr.deflate(3), Paint()..style = PaintingStyle.stroke..strokeWidth = 0.8..color = _kGold.withValues(alpha: 0.45));
    canvas.drawRRect(rr, Paint()..style = PaintingStyle.stroke..strokeWidth = 2..shader = const LinearGradient(colors: [_kGoldDeep, Color(0xFFFFF1C2), _kGold, _kGoldDeep]).createShader(body));
    // Yıldızlar
    for (final x in [0.16, 0.84]) {
      _star(canvas, Offset(w * x, h * 0.47), h * 0.13, _kGold);
    }
    _star(canvas, Offset(w * 0.07, h * 0.2), h * 0.07, _kGoldDeep);
    _star(canvas, Offset(w * 0.93, h * 0.2), h * 0.07, _kGoldDeep);
  }

  void _star(Canvas c, Offset o, double r, Color col) {
    final p = Path();
    for (var i = 0; i < 10; i++) {
      final rad = i.isEven ? r : r * 0.45;
      final a = -math.pi / 2 + i * math.pi / 5;
      final pt = o + Offset(math.cos(a), math.sin(a)) * rad;
      i == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
    }
    p.close();
    c.drawPath(p, Paint()..color = col);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

/// Ortadaki üç katlı pasta (uygulamanın siyah-altın temasına uygun): altın ayaklı servis tabağı, ışık gölgeli fondan katlar,
/// tepede altın damla, ortada kapitone desen, altta inci bordür, kenardan dökülen şeker güller, parlayan ve titreyen mumlar,
/// çevrede yükselen altın parıltılar.
class BirthdayCake extends StatefulWidget {
  final double width;
  final double height;
  const BirthdayCake({super.key, required this.width, required this.height});

  @override
  State<BirthdayCake> createState() => _BirthdayCakeState();
}

class _BirthdayCakeState extends State<BirthdayCake> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: RepaintBoundary(child: CustomPaint(size: Size(widget.width, widget.height), painter: _CakePainter(_c))),
      );
}

class _CakePainter extends CustomPainter {
  final Animation<double> t;
  _CakePainter(this.t) : super(repaint: t);

  // Fondan katları için silindir gölgesi: kenarlar koyu, ortası açık.
  static Shader _cyl(Rect r, Color base) => LinearGradient(
        colors: [Color.lerp(base, Colors.black, 0.32)!, base, Color.lerp(base, Colors.white, 0.35)!, base, Color.lerp(base, Colors.black, 0.4)!],
        stops: const [0, 0.22, 0.42, 0.7, 1],
      ).createShader(r);

  void _tier(Canvas c, Rect body, Color base, {bool quilt = false, bool pearls = false, bool drip = false}) {
    final ry = body.width * 0.09; // üst elipsin yarı yüksekliği (perspektif)
    // Gövde: alt kenarı elips, üstü düz (üst elips ayrıca çizilir)
    final path = Path()
      ..moveTo(body.left, body.top)
      ..lineTo(body.left, body.bottom)
      ..arcTo(Rect.fromLTRB(body.left, body.bottom - ry, body.right, body.bottom + ry), math.pi, -math.pi, false)
      ..lineTo(body.right, body.top)
      ..close();
    c.drawPath(path, Paint()..shader = _cyl(body, base));
    if (quilt) {
      // Kapitone (elmas) desen + kesişimlerde küçük inciler
      c.save();
      c.clipPath(path);
      final line = Paint()
        ..color = Colors.white.withValues(alpha: 0.28)
        ..strokeWidth = 1.1;
      final step = body.height * 0.5;
      for (double x = body.left - body.height; x < body.right + body.height; x += step) {
        c.drawLine(Offset(x, body.top), Offset(x + body.height, body.bottom + ry), line);
        c.drawLine(Offset(x + body.height, body.top), Offset(x, body.bottom + ry), line);
      }
      c.restore();
    }
    if (pearls) {
      final n = (body.width / 9).floor();
      for (var i = 0; i <= n; i++) {
        final x = body.left + body.width * i / n;
        final e = (x - body.center.dx) / (body.width / 2);
        final y = body.bottom + ry * math.sqrt(math.max(0, 1 - e * e)) - 1;
        final p = Offset(x, y);
        c.drawCircle(p, 3.2, Paint()..shader = RadialGradient(colors: const [Color(0xFFFFF6D6), _kGold, _kGoldDeep]).createShader(Rect.fromCircle(center: p, radius: 3.2)));
      }
    }
    // Üst yüzey
    final top = Rect.fromLTRB(body.left, body.top - ry, body.right, body.top + ry);
    c.drawOval(top, Paint()..color = Color.lerp(base, Colors.white, 0.25)!);
    if (drip) {
      // Altın ganaj damlası: üst kenardan aşağı farklı boylarda iner
      final g = Paint()
        ..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFFFE9A3), _kGold, _kGoldDeep]).createShader(body);
      final dp = Path()..moveTo(body.left, body.top);
      const n = 9;
      for (var i = 0; i < n; i++) {
        final x0 = body.left + body.width * i / n;
        final x1 = body.left + body.width * (i + 1) / n;
        final len = body.height * (0.22 + 0.32 * ((i * 7) % 5) / 4);
        final mid = (x0 + x1) / 2;
        dp
          ..lineTo(x0 + (x1 - x0) * 0.15, body.top + ry * 0.4)
          ..lineTo(x0 + (x1 - x0) * 0.25, body.top + len - 4)
          ..quadraticBezierTo(mid, body.top + len + 5, x1 - (x1 - x0) * 0.25, body.top + len - 4)
          ..lineTo(x1 - (x1 - x0) * 0.15, body.top + ry * 0.4);
      }
      dp
        ..lineTo(body.right, body.top)
        ..close();
      c.drawPath(dp, g);
      c.drawOval(top, Paint()..shader = const RadialGradient(colors: [Color(0xFFFFF1C2), _kGold, _kGoldDeep]).createShader(top));
    }
    // Üst kenarda ince parlak çizgi
    c.drawArc(top.deflate(1), math.pi * 1.05, math.pi * 0.9, false, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = Colors.white.withValues(alpha: 0.55));
  }

  void _rose(Canvas c, Offset o, double r, Color col) {
    c.drawCircle(o, r, Paint()..color = Color.lerp(col, Colors.black, 0.25)!);
    for (var k = 0; k < 3; k++) {
      final rr = r * (0.85 - k * 0.22);
      c.drawArc(Rect.fromCircle(center: o + Offset(0, -k * 0.6), radius: rr), k * 1.3, math.pi * 1.5, false, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.28
        ..color = Color.lerp(col, Colors.white, 0.12 + k * 0.14)!);
    }
    c.drawCircle(o, r * 0.18, Paint()..color = Color.lerp(col, Colors.white, 0.5)!);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final cx = w / 2;
    final v = t.value;
    // Arkadaki sıcak hale
    canvas.drawCircle(Offset(cx, h * 0.5), w * 0.48, Paint()
      ..shader = RadialGradient(colors: [_kGold.withValues(alpha: 0.22), _kGold.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: Offset(cx, h * 0.5), radius: w * 0.48)));
    // Yükselen altın parıltılar
    for (var i = 0; i < 16; i++) {
      final life = (v * 1.3 + i / 16) % 1.0;
      final x = w * (0.06 + 0.88 * ((i * 0.618) % 1.0)) + math.sin(life * 6 + i) * 5;
      final y = h * (0.92 - 0.88 * life);
      final a = math.sin(math.pi * life);
      final r = 1.6 + (i % 3) * 0.9;
      canvas.drawCircle(Offset(x, y), r * 2.4, Paint()..color = _kGold.withValues(alpha: 0.18 * a));
      canvas.drawCircle(Offset(x, y), r, Paint()..color = (i.isEven ? _kGold : Colors.white).withValues(alpha: 0.9 * a));
    }
    // Servis tabağı: altın ayak + tabak
    final standTop = h * 0.86;
    final foot = Path()
      ..moveTo(cx - w * 0.06, standTop)
      ..lineTo(cx - w * 0.15, h * 0.985)
      ..lineTo(cx + w * 0.15, h * 0.985)
      ..lineTo(cx + w * 0.06, standTop)
      ..close();
    canvas.drawPath(foot, Paint()..shader = _cyl(Rect.fromLTRB(cx - w * 0.15, standTop, cx + w * 0.15, h), _kGold));
    final plate = Rect.fromCenter(center: Offset(cx, standTop), width: w * 0.92, height: h * 0.075);
    canvas.drawOval(plate.translate(0, 3), Paint()..color = Colors.black.withValues(alpha: 0.35));
    canvas.drawOval(plate, Paint()..shader = _cyl(plate, _kGold));
    canvas.drawOval(plate.deflate(4), Paint()..color = const Color(0xFFFFF1C2).withValues(alpha: 0.5));
    // Katlar (alttan üste)
    final b1 = Rect.fromCenter(center: Offset(cx, h * 0.73), width: w * 0.8, height: h * 0.2);
    final b2 = Rect.fromCenter(center: Offset(cx, h * 0.535), width: w * 0.62, height: h * 0.17);
    final b3 = Rect.fromCenter(center: Offset(cx, h * 0.375), width: w * 0.44, height: h * 0.14);
    _tier(canvas, b1, const Color(0xFFF7EEDD), pearls: true);
    _tier(canvas, b2, const Color(0xFFE8BFA9), quilt: true, pearls: true);
    _tier(canvas, b3, const Color(0xFFF9F3E7), drip: true);
    // Kenardan dökülen şeker güller (sağ üstten sol alta)
    const roses = [Color(0xFFC98B74), Color(0xFFE6B8A2), Color(0xFFA8614D)];
    final pts = [
      Offset(cx + w * 0.2, b3.bottom - 2), Offset(cx + w * 0.26, b2.top + h * 0.02), Offset(cx + w * 0.3, b2.center.dy),
      Offset(cx + w * 0.24, b2.bottom - 4), Offset(cx - w * 0.3, b1.top + h * 0.03), Offset(cx - w * 0.36, b1.center.dy),
    ];
    for (var i = 0; i < pts.length; i++) {
      // yaprak
      final lp = pts[i] + Offset(i.isEven ? 7 : -7, 5);
      canvas.drawOval(Rect.fromCenter(center: lp, width: 10, height: 5), Paint()..color = const Color(0xFF7FA77A));
      _rose(canvas, pts[i], w * (i % 2 == 0 ? 0.045 : 0.037), roses[i % roses.length]);
    }
    // Mumlar (çizgili, altın uçlu) + parlayan alev
    final candleBase = b3.top - b3.width * 0.04;
    for (var i = 0; i < 5; i++) {
      final x = cx + (i - 2) * w * 0.07;
      final ch = h * (0.11 + (i == 2 ? 0.02 : 0));
      final top = candleBase - ch;
      final body = Rect.fromLTWH(x - 3.2, top, 6.4, ch);
      canvas.drawRRect(RRect.fromRectAndRadius(body, const Radius.circular(2)), Paint()..shader = _cyl(body, i.isEven ? const Color(0xFFFFF4E0) : const Color(0xFFE8BFA9)));
      canvas.save();
      canvas.clipRect(body);
      for (double y = top - 6; y < candleBase; y += 6) {
        canvas.drawLine(Offset(x - 4, y + 6), Offset(x + 4, y), Paint()
          ..color = _kGold.withValues(alpha: 0.8)
          ..strokeWidth = 1.4);
      }
      canvas.restore();
      final flick = 1 + 0.16 * math.sin(v * math.pi * 14 + i * 1.9) + 0.06 * math.sin(v * math.pi * 31 + i);
      final sway = 1.2 * math.sin(v * math.pi * 9 + i * 2.3);
      final fTop = Offset(x + sway, top - 14 * flick);
      canvas.drawCircle(Offset(x, top - 7), 13, Paint()
        ..shader = RadialGradient(colors: [const Color(0xFFFFC857).withValues(alpha: 0.55), const Color(0xFFFFC857).withValues(alpha: 0)]).createShader(Rect.fromCircle(center: Offset(x, top - 7), radius: 13)));
      final flame = Path()
        ..moveTo(fTop.dx, fTop.dy)
        ..quadraticBezierTo(x + 5.5, top - 4, x, top - 1)
        ..quadraticBezierTo(x - 5.5, top - 4, fTop.dx, fTop.dy);
      canvas.drawPath(flame, Paint()..color = const Color(0xFFFF9E2C));
      final core = Path()
        ..moveTo(x + sway * 0.6, top - 9 * flick)
        ..quadraticBezierTo(x + 2.6, top - 3, x, top - 1.5)
        ..quadraticBezierTo(x - 2.6, top - 3, x + sway * 0.6, top - 9 * flick);
      canvas.drawPath(core, Paint()..color = const Color(0xFFFFF5C8));
      canvas.drawLine(Offset(x, top), Offset(x, top - 2), Paint()
        ..color = const Color(0xFF3A2A1A)
        ..strokeWidth = 1);
    }
  }

  @override
  bool shouldRepaint(covariant _CakePainter old) => false;
}

/// Koltuk çevresindeki halka. [host] = doğum günü koltuğu: altın halka + tepesinde taç (widget yüksekliği 1,22 × çap).
class BirthdaySeatRing extends StatelessWidget {
  final double diameter;
  final bool host;
  const BirthdaySeatRing({super.key, required this.diameter, this.host = false});

  @override
  Widget build(BuildContext context) =>
      IgnorePointer(child: CustomPaint(size: Size(diameter, diameter * (host ? 1.22 : 1)), painter: _RingPainter(host)));
}

class _RingPainter extends CustomPainter {
  final bool host;
  _RingPainter(this.host);

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.width / 2;
    final c = Offset(r, size.height - r);
    final stroke = r * (host ? 0.14 : 0.11);
    final rect = Rect.fromCircle(center: c, radius: r - stroke / 2);
    if (host) {
      canvas.drawCircle(c, r, Paint()
        ..color = _kGold.withValues(alpha: 0.35)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * 0.15));
    }
    canvas.drawCircle(
      c,
      r - stroke / 2,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..shader = SweepGradient(colors: host ? const [Color(0xFFFFF1C2), _kGold, _kGoldDeep, _kGold, Color(0xFFFFF1C2)] : const [_kPink, _kLilac, _kPinkDeep, _kPink]).createShader(rect),
    );
    final dot = Paint()..color = Colors.white.withValues(alpha: 0.85);
    final n = host ? 18 : 12;
    for (var i = 0; i < n; i++) {
      final a = i * 2 * math.pi / n;
      canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * (r - stroke / 2), stroke * (host ? 0.16 : 0.13), host ? (Paint()..color = const Color(0xFFFFF6D6)) : dot);
    }
    if (host) {
      // Taç
      final cw = r * 1.0, chh = r * 0.42;
      final base = Offset(r, c.dy - r + stroke * 0.2);
      final crown = Path()
        ..moveTo(base.dx - cw / 2, base.dy)
        ..lineTo(base.dx - cw / 2, base.dy - chh * 0.55)
        ..lineTo(base.dx - cw * 0.25, base.dy - chh * 0.25)
        ..lineTo(base.dx, base.dy - chh)
        ..lineTo(base.dx + cw * 0.25, base.dy - chh * 0.25)
        ..lineTo(base.dx + cw / 2, base.dy - chh * 0.55)
        ..lineTo(base.dx + cw / 2, base.dy)
        ..close();
      canvas.drawPath(crown, Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFFFF1C2), _kGold, _kGoldDeep]).createShader(crown.getBounds()));
      for (final (dx, col) in [(0.0, _kPinkDeep), (-0.25, _kMint), (0.25, _kMint)]) {
        canvas.drawCircle(Offset(base.dx + cw * dx, base.dy - chh * 0.22), r * 0.05, Paint()..color = col);
      }
      for (final dx in [-0.5, 0.0, 0.5]) {
        canvas.drawCircle(Offset(base.dx + cw * dx, base.dy - (dx == 0 ? chh : chh * 0.55)), r * 0.045, Paint()..color = const Color(0xFFFFF6D6));
      }
    } else {
      // Alttaki küçük kurdele
      final b = c + Offset(0, r - stroke * 0.3);
      final bow = Path()
        ..moveTo(b.dx, b.dy)
        ..lineTo(b.dx - r * 0.26, b.dy - r * 0.1)
        ..lineTo(b.dx - r * 0.26, b.dy + r * 0.1)
        ..close()
        ..moveTo(b.dx, b.dy)
        ..lineTo(b.dx + r * 0.26, b.dy - r * 0.1)
        ..lineTo(b.dx + r * 0.26, b.dy + r * 0.1)
        ..close();
      canvas.drawPath(bow, Paint()..color = _kMint);
      canvas.drawCircle(b, r * 0.065, Paint()..color = const Color(0xFF2FB89A));
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) => old.host != host;
}

/// Doğum günü modunda yukarıdan aşağıya süzülen balonlar: hafif sağa-sola salınır, kendi ekseninde biraz döner, ekranın
/// altından çıkınca yeniden üstten girer. Renkler: altın, şampanya, rose-gold, parlak siyah (altın kenarlı), gece moru.
/// Tek CustomPainter + tek animasyon (hafif; koltuk ve sohbet yeniden çizilmez).
class BirthdayBalloons extends StatefulWidget {
  const BirthdayBalloons({super.key});

  @override
  State<BirthdayBalloons> createState() => _BirthdayBalloonsState();
}

class _BirthdayBalloonsState extends State<BirthdayBalloons> with SingleTickerProviderStateMixin {
  // 60 sn'lik tur; her balon bu turda kendi hızıyla 2-4 kez düşer (tam sayı → döngü dikişsiz).
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 60))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: RepaintBoundary(child: CustomPaint(painter: _BalloonsPainter(_c), size: Size.infinite)),
      );
}

class _Balloon {
  final double x; // yatay konum (genişlik oranı)
  final int laps; // 60 sn'de kaç kez düşer
  final double phase; // başlangıç kayması (0-1)
  final double size; // genişliğin oranı
  final int kind; // renk türü
  const _Balloon(this.x, this.laps, this.phase, this.size, this.kind);
}

class _BalloonsPainter extends CustomPainter {
  final Animation<double> t;
  _BalloonsPainter(this.t) : super(repaint: t);

  static const _list = [
    _Balloon(0.06, 3, 0.00, 0.11, 0),
    _Balloon(0.93, 2, 0.35, 0.12, 3),
    _Balloon(0.20, 4, 0.62, 0.08, 2),
    _Balloon(0.78, 3, 0.15, 0.09, 1),
    _Balloon(0.40, 2, 0.80, 0.07, 4),
    _Balloon(0.62, 4, 0.45, 0.075, 0),
    _Balloon(0.12, 2, 0.28, 0.095, 3),
    _Balloon(0.87, 4, 0.90, 0.07, 2),
    _Balloon(0.52, 3, 0.55, 0.06, 1),
  ];

  // (açık, ana, koyu) tonlar
  static const _tones = [
    [Color(0xFFFFF1C2), _kGold, _kGoldDeep], // altın
    [Color(0xFFFFF8EA), Color(0xFFEFD9B4), Color(0xFFB89A6A)], // şampanya
    [Color(0xFFF6D7C6), _kPink, _kPinkDeep], // rose-gold
    [Color(0xFF5A4A33), Color(0xFF1E1810), Color(0xFF050403)], // parlak siyah
    [Color(0xFFB8AEFF), _kLilac, Color(0xFF3B2F8A)], // gece moru
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final v = t.value;
    for (var i = 0; i < _list.length; i++) {
      final b = _list[i];
      final bw = size.width * b.size;
      final bh = bw * 1.22;
      final life = (v * b.laps + b.phase) % 1.0; // 0 → üstte (ekran dışı), 1 → altta (ekran dışı)
      final y = -bh * 2 + (size.height + bh * 3.2) * life;
      final x = size.width * b.x + math.sin(life * math.pi * 4 + i) * bw * 0.35;
      final tilt = math.sin(life * math.pi * 3 + i * 1.3) * 0.16;
      // Uzaktakiler (küçük) biraz soluk: derinlik hissi
      final alpha = (0.55 + b.size * 3.5).clamp(0.55, 0.95);
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(tilt);
      _balloon(canvas, bw, bh, _tones[b.kind], alpha, b.kind == 3);
      canvas.restore();
    }
  }

  void _balloon(Canvas c, double bw, double bh, List<Color> tone, double alpha, bool onyx) {
    final body = Rect.fromCenter(center: Offset.zero, width: bw, height: bh);
    // İp (aşağı sarkan dalgalı çizgi)
    final string = Path()..moveTo(0, bh / 2 + bw * 0.08);
    for (var k = 1; k <= 4; k++) {
      string.quadraticBezierTo((k.isOdd ? 1 : -1) * bw * 0.12, bh / 2 + bw * 0.08 + k * bw * 0.28 - bw * 0.14, 0, bh / 2 + bw * 0.08 + k * bw * 0.28);
    }
    c.drawPath(string, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = const Color(0xFFFFF1C2).withValues(alpha: 0.45 * alpha));
    // Gövde: üstten sol tarafa vuran ışıkla metalik görünüm
    final shape = Path()
      ..moveTo(0, -bh / 2)
      ..cubicTo(bw * 0.62, -bh / 2, bw * 0.6, bh * 0.22, 0, bh / 2)
      ..cubicTo(-bw * 0.6, bh * 0.22, -bw * 0.62, -bh / 2, 0, -bh / 2)
      ..close();
    c.drawPath(
      shape,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.35, -0.45),
          radius: 0.95,
          colors: [tone[0].withValues(alpha: alpha), tone[1].withValues(alpha: alpha), tone[2].withValues(alpha: alpha)],
          stops: const [0, 0.45, 1],
        ).createShader(body),
    );
    if (onyx) {
      // Siyah balonda ince altın kenar
      c.drawPath(shape, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = _kGold.withValues(alpha: 0.7 * alpha));
    }
    // Parlama
    c.drawOval(Rect.fromCenter(center: Offset(-bw * 0.18, -bh * 0.22), width: bw * 0.18, height: bh * 0.26), Paint()..color = Colors.white.withValues(alpha: 0.45 * alpha));
    // Düğüm
    final knot = Path()
      ..moveTo(0, bh / 2 - 1)
      ..lineTo(bw * 0.07, bh / 2 + bw * 0.09)
      ..lineTo(-bw * 0.07, bh / 2 + bw * 0.09)
      ..close();
    c.drawPath(knot, Paint()..color = tone[2].withValues(alpha: alpha));
  }

  @override
  bool shouldRepaint(covariant _BalloonsPainter old) => false;
}
