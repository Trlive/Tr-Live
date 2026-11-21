import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../widgets/net_image.dart';

/// Hediye uçuş animasyonu.
///
/// room_screen.dart'tan ayrıldı. Bu widget ekranın durumuna hiç bakmaz; yalnızca
/// kendisine verilen [GiftFlightData] ile çalışır ve bitince [onDone] çağırır.
/// Bu yüzden bölmede ilk sırada: taşınması davranışı değiştirmez.

class GiftFlightData {
  final int id;
  final String icon;
  final Offset from;
  final Offset to;
  final int quantity;
  /// true: kalabalıkta sade çizim (parıltısız, en çok 3 kopya).
  final bool lite;
  GiftFlightData(this.id, this.icon, this.from, this.to, [this.quantity = 1, this.lite = false]);
}

/// Hediye ikonunun gönderenden alıcının mikrofonuna uçuşu (Yoho): çoklu gönderimde ikonlar art arda bir kuyruk
/// hâlinde uçar (her birinde "xN"), öndekinin çevresinde altın parıltılar; varınca alıcının koltuğunda büyüyüp söner.
class GiftFlight extends StatefulWidget {
  final GiftFlightData data;
  final VoidCallback onDone;
  const GiftFlight({super.key, required this.data, required this.onDone});

  @override
  State<GiftFlight> createState() => _GiftFlightState();
}

class _GiftFlightState extends State<GiftFlight> with SingleTickerProviderStateMixin {
  late final int _copies = widget.data.quantity <= 1 ? 1 : math.min(widget.data.quantity, widget.data.lite ? 3 : 7);
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: 1300 + (_copies - 1) * 120),
  )..forward().whenComplete(widget.onDone);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _label(double size) => Text(
        'x${widget.data.quantity}',
        style: TextStyle(
          fontSize: size * 0.34,
          fontWeight: FontWeight.w900,
          fontStyle: FontStyle.italic,
          color: const Color(0xFFFFE066),
          shadows: const [Shadow(color: Color(0xFF7A3B00), blurRadius: 2, offset: Offset(1, 1)), Shadow(color: Colors.black54, blurRadius: 4)],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final n = _copies;
    final fly = n <= 1 ? 1.0 : 0.72; // her ikonun uçuş payı (toplam sürenin oranı)
    final gap = n <= 1 ? 0.0 : (1 - fly) / (n - 1);
    return Positioned.fill(
      child: IgnorePointer(
        child: RepaintBoundary(
          child: AnimatedBuilder(
            animation: _c,
            builder: (_, __) {
              final v = _c.value;
              final items = <Widget>[];
              // Arkadakiler önce çizilir; öndeki (ilk çıkan) en üstte.
              for (var k = n - 1; k >= 0; k--) {
                final start = k * gap;
                if (v < start) continue;
                final local = ((v - start) / fly).clamp(0.0, 1.0);
                final last = k == n - 1;
                if (local >= 1 && !last) continue; // vardı; son ikon varışta biraz kalır
                final t = Curves.easeInOutCubic.transform(local);
                final arc = -70 * (1 - (2 * t - 1) * (2 * t - 1)); // ortada yukarı kavis
                final pos = Offset.lerp(d.from, d.to, t)! + Offset(0, arc);
                var size = 58.0 * (0.85 + 0.55 * (1 - (2 * t - 1).abs()));
                var opacity = 1.0;
                if (last && local >= 0.92) {
                  // Varış: alıcının koltuğunda büyüyüp söner.
                  final p = ((local - 0.92) / 0.08).clamp(0.0, 1.0);
                  size *= 1 + 0.5 * p;
                  opacity = 1 - p;
                }
                if (k == 0 && local < 1 && !d.lite) {
                  // Öndeki ikonun çevresinde altın parıltılar.
                  for (var j = 0; j < 6; j++) {
                    final ang = j * math.pi / 3 + v * 6;
                    final rad = size * (0.55 + 0.12 * math.sin(v * 20 + j));
                    final sp = pos + Offset(math.cos(ang) * rad, math.sin(ang) * rad);
                    final ss = 4.0 + 3 * (0.5 + 0.5 * math.sin(v * 30 + j * 2));
                    items.add(Positioned(
                      left: sp.dx - ss / 2,
                      top: sp.dy - ss / 2,
                      width: ss,
                      height: ss,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(shape: BoxShape.circle, color: Color(0xFFFFD54F), boxShadow: [BoxShadow(color: Color(0xAAFFC107), blurRadius: 6)]),
                      ),
                    ));
                  }
                }
                items.add(Positioned(
                  left: pos.dx - size / 2,
                  top: pos.dy - size / 2,
                  width: size,
                  height: size,
                  child: Opacity(
                    opacity: opacity,
                    child: Stack(clipBehavior: Clip.none, children: [
                      Positioned.fill(child: NetImg(d.icon, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox.shrink())),
                      if (d.quantity > 1) Positioned(right: -size * 0.28, bottom: -size * 0.08, child: _label(size)),
                    ]),
                  ),
                ));
              }
              return Stack(children: items);
            },
          ),
        ),
      ),
    );
  }
}
