import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../services/api.dart';
import 'common.dart';

/// WIP 8+ araçları araçlı hediyelerdir: adı, küçük resmi (png) ve videosu sunucudan bir kez alınır.
class WipVehicleArt {
  static final ValueNotifier<Map<int, Map<String, dynamic>>> data = ValueNotifier(const {});
  static bool _loading = false;
  static DateTime? _at;

  static Future<void> ensure() async {
    if (_loading || (_at != null && DateTime.now().difference(_at!) < const Duration(minutes: 10))) return;
    _loading = true;
    try {
      final r = await Api.get('/api/wip/tiers');
      final v = mapOf(r['vehicleGifts']) ?? const {};
      data.value = {
        for (final e in v.entries)
          if (int.tryParse(e.key) != null && mapOf(e.value) != null) int.parse(e.key): mapOf(e.value)!,
      };
    } catch (_) {/* eski sunucu: kodla çizilen araç */} finally {
      _at = DateTime.now(); // başarısızsa da 10 dk yeniden denenmez (her çizimde istek gitmesin)
      _loading = false;
    }
  }

  static String? iconOf(int level) => Api.absoluteUrl(data.value[level >= 11 ? 11 : level]?['iconUrl'] as String?);
  static String? nameOf(int level) => data.value[level >= 11 ? 11 : level]?['name'] as String?;
}

/// WIP öğelerinin kodla çizilen önizlemesi (Görünüm sayfası ve yönetim): çerçeve, rozet, sohbet balonu,
/// giriş efekti ve araç.
Widget wipItemArt(String type, int level, double size) {
  final s = WipStyle.of(level);
  switch (type) {
    case 'frame':
      final r = size * 0.28;
      return SizedBox(
        width: size * 0.8,
        height: size * 0.8,
        child: Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
          CircleAvatar(radius: r, backgroundColor: Colors.white12, child: Icon(Icons.person, size: r, color: Colors.white54)),
          WipFrame.around(level, r),
        ]),
      );
    case 'badge':
      return WipChip(level: level, height: 20);
    case 'chat_bubble':
      return WipBubble(level: level, fallback: const Color(0x8C13285A), child: const Text('Merhaba', style: TextStyle(fontSize: 12)));
    case 'vehicle':
      WipVehicleArt.ensure();
      return ValueListenableBuilder<Map<int, Map<String, dynamic>>>(
        valueListenable: WipVehicleArt.data,
        builder: (_, __, ___) {
          final icon = WipVehicleArt.iconOf(level);
          if (icon == null) return _vehicleEmoji(s, size);
          // WIP 8+: araçlı hediyenin kendi resmi.
          return Column(mainAxisSize: MainAxisSize.min, children: [
            SizedBox(
              width: size * 0.8,
              height: size * 0.62,
              child: NetImg(icon, fit: BoxFit.contain, errorBuilder: (_, __, ___) => _vehicleEmoji(s, size)),
            ),
            Text(WipVehicleArt.nameOf(level) ?? s?.vehicleName ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10, color: Colors.white70)),
          ]);
        },
      );
    default:
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(gradient: LinearGradient(colors: s?.gradient ?? const [Colors.purple, Colors.pink]), borderRadius: BorderRadius.circular(10)),
        child: Text(wipLabel(level), style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.white)),
      );
  }
}

Widget _vehicleEmoji(WipStyle? s, double size) => Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: size * 0.62,
        height: size * 0.62,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [(s?.color ?? Colors.purple).withValues(alpha: 0.55), Colors.transparent]),
        ),
        child: Text(s?.vehicle ?? '🚗', style: TextStyle(fontSize: size * 0.34)),
      ),
      Text(s?.vehicleName ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10, color: Colors.white70)),
    ]);

/// WIP aracı odaya giriş: kademenin aracı (emoji) parlayan iz bırakarak sağdan gelir, ortada kısa durur
/// (hafifçe sallanır), soldan çıkar. Altında kademe rozeti ve araç adı.
class WipVehicleDrive extends StatefulWidget {
  final int level;
  final int durationMs;
  const WipVehicleDrive({super.key, required this.level, this.durationMs = 4600});

  @override
  State<WipVehicleDrive> createState() => _WipVehicleDriveState();
}

class _WipVehicleDriveState extends State<WipVehicleDrive> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: Duration(milliseconds: widget.durationMs))..forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = WipStyle.of(widget.level);
    if (s == null) return const SizedBox.shrink();
    final w = MediaQuery.sizeOf(context).width;
    final size = w * 0.34;
    final colors = s.gradient;
    final swip = s.isSwip;
    final drive = RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          final t = _c.value;
          const inEnd = 0.22, outStart = 0.78;
          double dx;
          var moving = true;
          if (t < inEnd) {
            dx = (1 - Curves.easeOutCubic.transform(t / inEnd)) * w;
          } else if (t > outStart) {
            dx = -Curves.easeInCubic.transform((t - outStart) / (1 - outStart)) * w;
          } else {
            dx = 0;
            moving = false;
          }
          final bob = (t * widget.durationMs / 140) % 2 < 1 ? 2.0 : -2.0;
          return Transform.translate(
            offset: Offset(dx, bob),
            child: Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
              // Hareket ederken arkasında renkli iz.
              Positioned(
                left: size * 0.55,
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 200),
                  opacity: moving ? 1 : 0.35,
                  child: Container(
                    width: w * 0.5,
                    height: size * 0.28,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(40),
                      gradient: LinearGradient(colors: [for (final c in colors) c.withValues(alpha: 0.75), Colors.transparent]),
                    ),
                  ),
                ),
              ),
              child!,
            ]),
          );
        },
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: size,
            height: size,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [s.color.withValues(alpha: 0.6), s.color.withValues(alpha: 0.0)]),
            ),
            child: Text(s.vehicle, style: TextStyle(fontSize: size * 0.62, shadows: [Shadow(color: s.color, blurRadius: 18)])),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(gradient: LinearGradient(colors: colors), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white54, width: 0.8)),
            child: Text('${s.label} · ${s.vehicleName}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white, shadows: [Shadow(color: Colors.black54, blurRadius: 2)])),
          ),
        ]),
      ),
    );
    if (!swip) return drive;
    // SWIP: araçla birlikte tam ekran kırmızı/yeşil ışık çizgileri, halka dalgaları ve parıltı.
    return Stack(alignment: Alignment.center, children: [
      Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: _SwipBurstPainter(_c)))),
      drive,
    ]);
  }
}

/// SWIP giriş ışıması: iki yana yayılan kırmızı/yeşil şeritler, merkezden çıkan halka dalgaları ve yıldız parıltıları.
class _SwipBurstPainter extends CustomPainter {
  final Animation<double> a;
  _SwipBurstPainter(this.a) : super(repaint: a);
  static const _red = Color(0xFFFF1744), _green = Color(0xFF00E676);

  @override
  void paint(Canvas canvas, Size size) {
    final t = a.value;
    final fade = t < 0.1 ? t / 0.1 : (t > 0.85 ? (1 - t) / 0.15 : 1.0);
    final c = size.center(Offset.zero);
    // Yatay ışık şeritleri (kırmızı üstte, yeşil altta) merkezden dışa açılır.
    final reach = Curves.easeOut.transform((t / 0.35).clamp(0.0, 1.0)) * size.width;
    for (final e in [(-1.0, _red), (1.0, _green)]) {
      final y = c.dy + e.$1 * size.width * 0.06;
      final r = Rect.fromCenter(center: Offset(c.dx, y), width: reach, height: 6);
      canvas.drawRRect(
        RRect.fromRectAndRadius(r, const Radius.circular(3)),
        Paint()
          ..shader = LinearGradient(colors: [Colors.transparent, e.$2.withValues(alpha: 0.9 * fade), Colors.white.withValues(alpha: 0.9 * fade), e.$2.withValues(alpha: 0.9 * fade), Colors.transparent]).createShader(r)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
      );
    }
    // Halka dalgaları: kırmızı ve yeşil dönüşümlü.
    for (var i = 0; i < 3; i++) {
      final p = ((t * 1.6) - i * 0.28) % 1.0;
      if (t * 1.6 - i * 0.28 < 0) continue;
      canvas.drawCircle(
        c,
        size.width * (0.1 + 0.5 * p),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..color = (i.isEven ? _red : _green).withValues(alpha: (1 - p) * 0.8 * fade),
      );
    }
    // Yıldız parıltıları.
    for (var i = 0; i < 14; i++) {
      final ang = i * 2 * math.pi / 14 + t * 1.5;
      final dist = size.width * (0.18 + 0.32 * ((t * 1.2 + i * 0.13) % 1.0));
      final p = c + Offset(math.cos(ang), math.sin(ang)) * dist;
      final tw = (math.sin((t * 5 + i) * math.pi) + 1) / 2;
      canvas.drawCircle(p, 1.5 + 2.5 * tw, Paint()..color = (i.isEven ? _red : _green).withValues(alpha: (0.4 + 0.5 * tw) * fade));
    }
  }

  @override
  bool shouldRepaint(_SwipBurstPainter old) => false;
}
