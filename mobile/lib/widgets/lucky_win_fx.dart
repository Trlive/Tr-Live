import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../l10n/l10n.dart';
import 'app_theme.dart';
import 'common.dart';

/// Şanslı hediye kazancının odadaki herkese görünen efekti (Yoho / Bigo):
/// küçük kazançta gönderenin koltuğunun üstünde yükselen "x5 +500" rozeti,
/// büyük kazançta (x[bigFrom] ve üstü) sahnenin ortasında altın patlama.
class LuckyWinFxData {
  final int id;
  final Offset at; // sahne koordinatında gönderenin koltuğu (koltukta değilse alt orta)
  final int best;
  final String win;
  final String name;
  final String emoji;
  const LuckyWinFxData(this.id, this.at, this.best, this.win, this.name, this.emoji);
  bool get big => best >= LuckyWinFx.bigFrom;
}

class LuckyWinFx extends StatefulWidget {
  static const bigFrom = 100;
  final LuckyWinFxData data;
  final VoidCallback onDone;
  const LuckyWinFx({super.key, required this.data, required this.onDone});

  @override
  State<LuckyWinFx> createState() => _LuckyWinFxState();
}

class _LuckyWinFxState extends State<LuckyWinFx> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: widget.data.big ? 3400 : 2200),
  )..forward().whenComplete(widget.onDone);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  static List<Color> _colors(int best) {
    if (best >= 500) return const [Color(0xFFFF3D8B), Pal.amber, Pal.orange];
    if (best >= 100) return const [Pal.orange, Pal.amber, Pal.gold];
    if (best >= 10) return const [Pal.purple, Pal.amber];
    return const [Color(0xFF3A2A0C), Pal.purple];
  }

  @override
  Widget build(BuildContext context) => widget.data.big ? _bigBurst() : _badge();

  /// Küçük kazanç: koltuğun üstünde belirip yükselerek söner.
  Widget _badge() {
    final d = widget.data;
    return Positioned(
      left: d.at.dx - 80,
      top: d.at.dy - 54,
      width: 160,
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, child) {
            final v = _c.value;
            final pop = Curves.elasticOut.transform((v / 0.3).clamp(0.0, 1.0));
            final fade = v < 0.75 ? 1.0 : (1 - (v - 0.75) / 0.25);
            return Opacity(
              opacity: fade.clamp(0.0, 1.0),
              child: Transform.translate(
                offset: Offset(0, -34 * Curves.easeOut.transform(v)),
                child: Transform.scale(scale: 0.4 + 0.6 * pop, child: child),
              ),
            );
          },
          child: Center(
            child: Container(
              padding: const EdgeInsets.fromLTRB(6, 3, 10, 3),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: _colors(d.best)),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Pal.gold.withValues(alpha: 0.8), width: 1.2),
                boxShadow: [BoxShadow(color: Pal.amber.withValues(alpha: 0.45), blurRadius: 10)],
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(d.emoji, style: const TextStyle(fontSize: 15)),
                const SizedBox(width: 3),
                Text('x${d.best}', style: _multStyle(18)),
                const SizedBox(width: 5),
                Flexible(
                  child: Text('+${fmtNumber(d.win)}',
                      maxLines: 1,
                      overflow: TextOverflow.fade,
                      softWrap: false,
                      style: const TextStyle(color: Pal.text, fontWeight: FontWeight.w900, fontSize: 12.5)),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  static TextStyle _multStyle(double size) => TextStyle(
        fontSize: size,
        height: 1.0,
        fontWeight: FontWeight.w900,
        fontStyle: FontStyle.italic,
        color: const Color(0xFFFFF3C4),
        shadows: const [Shadow(color: Color(0xFF7A3B00), blurRadius: 2, offset: Offset(1, 1)), Shadow(color: Colors.black54, blurRadius: 6)],
      );

  /// Büyük kazanç: ortada parlayan halka + ışınlar, dev çarpan, kazanan adı ve kazanç.
  Widget _bigBurst() {
    final d = widget.data;
    return Positioned.fill(
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, __) {
            final v = _c.value;
            final pop = Curves.elasticOut.transform((v / 0.25).clamp(0.0, 1.0));
            final fade = v < 0.82 ? 1.0 : (1 - (v - 0.82) / 0.18);
            return Opacity(
              opacity: fade.clamp(0.0, 1.0),
              child: Center(
                child: SizedBox(
                  width: 300,
                  height: 260,
                  child: Stack(alignment: Alignment.center, children: [
                    // Dönen altın ışınlar.
                    Transform.rotate(
                      angle: v * math.pi,
                      child: CustomPaint(size: const Size(260, 260), painter: _RaysPainter(Pal.amber.withValues(alpha: 0.35 * fade))),
                    ),
                    Transform.scale(
                      scale: 0.3 + 0.7 * pop,
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Image.asset('assets/images/lucky_coin.png', width: 72, height: 72),
                        const SizedBox(height: 2),
                        ShaderMask(
                          shaderCallback: (r) => LinearGradient(colors: _colors(d.best)).createShader(r),
                          child: Text('x${d.best}', style: _multStyle(54).copyWith(color: Colors.white)),
                        ),
                        const SizedBox(height: 6),
                        Container(
                          constraints: const BoxConstraints(maxWidth: 280),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: Pal.bg.withValues(alpha: 0.82),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Pal.amber, width: 1.2),
                          ),
                          child: Text(
                            tx('{name} şanslı hediyeden +{v1} Coin kazandı!', {'name': d.name, 'v1': fmtNumber(d.win)}),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Pal.gold, fontWeight: FontWeight.w900, fontSize: 13.5),
                          ),
                        ),
                      ]),
                    ),
                  ]),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _RaysPainter extends CustomPainter {
  final Color color;
  _RaysPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2;
    final p = Paint()..color = color;
    const n = 12;
    for (var i = 0; i < n; i++) {
      final a = i * 2 * math.pi / n;
      final path = Path()
        ..moveTo(c.dx, c.dy)
        ..lineTo(c.dx + r * math.cos(a - 0.11), c.dy + r * math.sin(a - 0.11))
        ..lineTo(c.dx + r * math.cos(a + 0.11), c.dy + r * math.sin(a + 0.11))
        ..close();
      canvas.drawPath(path, p);
    }
    canvas.drawCircle(c, r * 0.42, Paint()..shader = RadialGradient(colors: [color.withValues(alpha: math.min(1.0, color.a * 2)), color.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: c, radius: r * 0.42)));
  }

  @override
  bool shouldRepaint(_RaysPainter old) => old.color != color;
}

/// Şanslı hediyenin emojisi (görseli yoksa / efekt rozetinde): yonca 🍀, çan 🔔.
String luckyEmojiOf(String? name) {
  final n = (name ?? '').toLowerCase();
  if (n.contains('yonca') || n.contains('clover')) return '🍀';
  if (n.contains('çan') || n.contains('bell')) return '🔔';
  return '🎁';
}
