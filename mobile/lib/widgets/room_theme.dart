import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import '../services/api.dart';
import '../services/effect_prefs.dart';
import 'app_theme.dart';
import 'net_image.dart';

/// Oda teması (sunucudaki room_themes kataloğundan). Görsel 1080x1920 (9:16); her ekranda "cover" yerleşir.
class RoomThemeDef {
  final String key;
  final String label;
  final List<Color> colors;
  final String? imageUrl;
  final String? thumbUrl;
  final String effect; // none, aurora, stars, bubbles, embers, snow, fireflies, petals, meteors
  final int priceCoins;
  final int durationDays;
  final DateTime? ownedUntil;
  const RoomThemeDef(this.key, this.label, this.colors,
      {this.imageUrl, this.thumbUrl, this.effect = 'none', this.priceCoins = 0, this.durationDays = 14, this.ownedUntil});

  bool get free => priceCoins == 0;
  bool get animated => effect != 'none';
  bool get owned => ownedUntil != null && ownedUntil!.isAfter(DateTime.now());
  bool get usable => free || owned;
  int get daysLeft => ownedUntil == null ? 0 : (ownedUntil!.difference(DateTime.now()).inHours / 24).ceil();

  static Color _hex(String s) => Color(int.tryParse('FF${s.replaceFirst('#', '')}', radix: 16) ?? 0xFF0B0906);

  factory RoomThemeDef.fromJson(Map<String, dynamic> j) => RoomThemeDef(
        j['key'].toString(),
        (j['label'] ?? j['key']).toString(),
        [for (final c in (j['colors'] as List? ?? const [])) _hex(c.toString())],
        imageUrl: j['imageUrl']?.toString(),
        thumbUrl: j['thumbUrl']?.toString(),
        effect: (j['effect'] ?? 'none').toString(),
        priceCoins: int.tryParse('${j['priceCoins'] ?? 0}') ?? 0,
        durationDays: (j['durationDays'] as num?)?.toInt() ?? 14,
        ownedUntil: DateTime.tryParse('${j['ownedUntil'] ?? ''}')?.toLocal(),
      );
}

/// Kullanıcıya özel tema (yönetim ödülü): granted → (görsel yüklenir) pending → approved / rejected → expired.
class CustomTheme {
  final String id;
  final int days;
  final String status;
  final String? imageUrl;
  final String? reviewNote;
  final DateTime? expiresAt;
  const CustomTheme(this.id, this.days, this.status, this.imageUrl, this.reviewNote, this.expiresAt);
  factory CustomTheme.fromJson(Map<String, dynamic> j) => CustomTheme(
        j['id'].toString(),
        (j['days'] as num?)?.toInt() ?? 0,
        (j['status'] ?? '').toString(),
        j['imageUrl']?.toString(),
        j['reviewNote']?.toString(),
        DateTime.tryParse('${j['expiresAt'] ?? ''}')?.toLocal(),
      );
  bool get active => status == 'approved' && expiresAt != null && expiresAt!.isAfter(DateTime.now());
  int get daysLeft => expiresAt == null ? 0 : (expiresAt!.difference(DateTime.now()).inHours / 24).ceil();
}

const kCustomThemeKey = 'custom';

/// Katalog önbelleği. Sunucuya ulaşılamazsa eski gradyan temalarla çalışır.
class RoomThemes {
  RoomThemes._();
  static const _fallback = <RoomThemeDef>[
    RoomThemeDef('default', 'Varsayılan', [Color(0xFF0E0B07), Color(0xFF1A140A)]),
    RoomThemeDef('neon', 'Neon', [Color(0xFF12002B), Color(0xFF00334E), Color(0xFF3A0050)]),
    RoomThemeDef('galaxy', 'Galaksi', [Color(0xFF05051A), Color(0xFF1B1347), Color(0xFF3B1E6E)]),
    RoomThemeDef('sunset', 'Gün Batımı', [Color(0xFF2B0E1F), Color(0xFF7A2B3A), Color(0xFFB5542E)]),
    RoomThemeDef('forest', 'Orman', [Color(0xFF06170F), Color(0xFF0F3B25), Color(0xFF1C5A3A)]),
    RoomThemeDef('royal', 'Kraliyet', [Color(0xFF1A1033), Color(0xFF3B2470), Color(0xFF8A6A1F)]),
    RoomThemeDef('ocean', 'Okyanus', [Color(0xFF021A2B), Color(0xFF05445E), Color(0xFF0B6E8A)]),
    RoomThemeDef('rose', 'Gül', [Color(0xFF2B0A1C), Color(0xFF6B1F45), Color(0xFFB04A78)]),
  ];
  static List<RoomThemeDef> all = _fallback;
  static List<CustomTheme> custom = const [];
  static bool self = true; // haklar istek sahibine mi ait (false: yardımcı sahip, oda sahibinin hakları)
  static final ValueNotifier<int> version = ValueNotifier<int>(0);
  static DateTime? _loadedAt;
  static String? _loadedFor;
  static Future<void>? _inflight;

  static RoomThemeDef byKey(String? key) => all.firstWhere((t) => t.key == key, orElse: () => all.firstWhere((t) => t.key == 'default', orElse: () => _fallback.first));
  static CustomTheme? get activeCustom {
    for (final c in custom) {
      if (c.active) return c;
    }
    return null;
  }

  /// [roomId] verilirse haklar oda sahibine göre gelir. 5 dakika önbellek; [force] ile yenilenir.
  static Future<void> load({String? roomId, bool force = false}) {
    final fresh = _loadedAt != null && DateTime.now().difference(_loadedAt!) < const Duration(minutes: 5) && _loadedFor == roomId;
    if (fresh && !force) return Future.value();
    return _inflight ??= () async {
      try {
        final r = await Api.get('/api/room-themes${roomId == null ? '' : '?roomId=$roomId'}');
        final list = [for (final t in (r['themes'] as List? ?? const [])) if (t is Map) RoomThemeDef.fromJson(Map<String, dynamic>.from(t))];
        if (list.isNotEmpty) all = list;
        custom = [for (final c in (r['custom'] as List? ?? const [])) if (c is Map) CustomTheme.fromJson(Map<String, dynamic>.from(c))];
        self = r['self'] != false;
        _loadedAt = DateTime.now();
        _loadedFor = roomId;
        version.value++;
      } catch (_) {
        // ağ hatası: eldeki liste kullanılır
      } finally {
        _inflight = null;
      }
    }();
  }
}

RoomThemeDef themeOf(String? key) => RoomThemes.byKey(key);

/// Oda arka planı: görsel (özel tema / WIP görseli / katalog görseli) + degrade + hafif hareket efekti.
class RoomThemeBackground extends StatefulWidget {
  final String? theme;
  final String? imageUrl; // odanın kendi görseli (özel tema ya da WIP özel arka plan)
  final Widget child;
  const RoomThemeBackground({super.key, required this.theme, this.imageUrl, required this.child});

  @override
  State<RoomThemeBackground> createState() => _RoomThemeBackgroundState();
}

class _RoomThemeBackgroundState extends State<RoomThemeBackground> {
  @override
  void initState() {
    super.initState();
    RoomThemes.load();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: RoomThemes.version,
      builder: (context, _, __) {
        final t = themeOf(widget.theme);
        return Stack(fit: StackFit.expand, children: [
          ThemeArt(theme: t, imageUrl: widget.imageUrl, dim: true),
          widget.child,
        ]);
      },
    );
  }
}

/// Bir temanın tam ekran çizimi (oda arka planı ve önizleme ortak). [dim]: oda içinde yazılar okunsun diye hafif karartma.
class ThemeArt extends StatelessWidget {
  final RoomThemeDef theme;
  final String? imageUrl;
  final bool dim;
  final bool effects;
  const ThemeArt({super.key, required this.theme, this.imageUrl, this.dim = false, this.effects = true});

  @override
  Widget build(BuildContext context) {
    final t = theme;
    final img = Api.absoluteUrl(imageUrl ?? t.imageUrl);
    final size = MediaQuery.sizeOf(context);
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final colors = t.colors.isEmpty ? const [Color(0xFF0E0B07), Color(0xFF1A140A)] : (t.colors.length == 1 ? [t.colors.first, t.colors.first] : t.colors);
    // Arka plan ayrı katmanda (RepaintBoundary): odada bir şey hareket ettikçe tam ekran görsel yeniden çizilmez.
    // Görsel ekran boyutunda çözülür (bellek), telefonda saklanır.
    return Stack(fit: StackFit.expand, children: [
      RepaintBoundary(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: colors),
            image: img == null
                ? null
                : DecorationImage(
                    image: NetImage(img, targetW: NetImage.px(size.width, dpr), targetH: NetImage.px(size.height, dpr)),
                    fit: BoxFit.cover,
                    colorFilter: dim ? const ColorFilter.mode(Color(0x40000000), BlendMode.darken) : null,
                  ),
          ),
        ),
      ),
      if (effects && t.animated)
        ValueListenableBuilder<bool>(
          valueListenable: EffectPrefs.powerSave,
          builder: (_, save, __) => save ? const SizedBox.shrink() : IgnorePointer(child: RepaintBoundary(child: ThemeEffectLayer(effect: t.effect))),
        ),
    ]);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Hafif hareket efektleri: tek CustomPainter, en fazla ~36 parçacık, saniyede ~30 kare, bulanıklık (blur) yok.
// Uygulama arka plandayken / oda küçültülmüşken Ticker durur (TickerMode). Şarj tasarrufunda hiç çizilmez.
// ---------------------------------------------------------------------------------------------------------------
class ThemeEffectLayer extends StatefulWidget {
  final String effect;
  const ThemeEffectLayer({super.key, required this.effect});

  @override
  State<ThemeEffectLayer> createState() => _ThemeEffectLayerState();
}

class _P {
  double x, y, vx, vy, r, a, ph, rot;
  _P(this.x, this.y, this.vx, this.vy, this.r, this.a, this.ph, this.rot);
}

class _ThemeEffectLayerState extends State<ThemeEffectLayer> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  final _time = ValueNotifier<double>(0);
  final _rnd = math.Random(7);
  final List<_P> _ps = [];
  Duration _last = Duration.zero;

  int get _count => switch (widget.effect) {
        'aurora' => 0,
        'stars' => 36,
        'meteors' => 3,
        'snow' => 36,
        'petals' => 18,
        'fireflies' => 20,
        'bubbles' => 18,
        'embers' => 26,
        _ => 0,
      };

  @override
  void initState() {
    super.initState();
    _seed();
    _ticker = createTicker((d) {
      if ((d - _last).inMilliseconds < 33) return; // ~30 kare/sn yeter, işlemciyi yormaz
      final dt = ((d - _last).inMilliseconds / 1000).clamp(0.0, 0.1).toDouble();
      _last = d;
      _step(dt);
      _time.value = d.inMilliseconds / 1000;
    })
      ..start();
  }

  @override
  void didUpdateWidget(covariant ThemeEffectLayer old) {
    super.didUpdateWidget(old);
    if (old.effect != widget.effect) _seed();
  }

  // Konumlar 0..1 aralığında (ekrandan bağımsız).
  void _seed() {
    _ps.clear();
    for (var i = 0; i < _count; i++) {
      _ps.add(_spawn(initial: true));
    }
  }

  _P _spawn({bool initial = false}) {
    final r = _rnd;
    double y0(double top) => initial ? r.nextDouble() : top;
    return switch (widget.effect) {
      'snow' => _P(r.nextDouble(), y0(-0.02), 0, 0.03 + r.nextDouble() * 0.05, 1.2 + r.nextDouble() * 2.6, 0.5 + r.nextDouble() * 0.5, r.nextDouble() * 6, 0),
      'petals' => _P(r.nextDouble(), y0(-0.03), 0.01 + r.nextDouble() * 0.02, 0.035 + r.nextDouble() * 0.03, 4 + r.nextDouble() * 4, 0.7 + r.nextDouble() * 0.3, r.nextDouble() * 6, r.nextDouble() * 6),
      'bubbles' => _P(r.nextDouble(), initial ? r.nextDouble() : 1.03, 0, -(0.03 + r.nextDouble() * 0.05), 2 + r.nextDouble() * 6, 0.25 + r.nextDouble() * 0.35, r.nextDouble() * 6, 0),
      'embers' => _P(r.nextDouble(), initial ? 0.4 + r.nextDouble() * 0.6 : 1.02, (r.nextDouble() - 0.5) * 0.02, -(0.04 + r.nextDouble() * 0.06), 1 + r.nextDouble() * 2.2, 0.6 + r.nextDouble() * 0.4, r.nextDouble() * 6, 0),
      'fireflies' => _P(r.nextDouble(), 0.45 + r.nextDouble() * 0.5, (r.nextDouble() - 0.5) * 0.03, (r.nextDouble() - 0.5) * 0.02, 1.6 + r.nextDouble() * 1.6, 1, r.nextDouble() * 6, 0),
      'stars' => _P(r.nextDouble(), r.nextDouble() * 0.85, 0, 0, 0.8 + r.nextDouble() * 1.6, 1, r.nextDouble() * 6, 0.6 + r.nextDouble() * 1.6),
      'meteors' => _P(0.3 + r.nextDouble() * 0.8, r.nextDouble() * 0.4, -(0.5 + r.nextDouble() * 0.3), 0.32 + r.nextDouble() * 0.2, 0, 0, initial ? -r.nextDouble() * 6 : -(2 + r.nextDouble() * 5), 0),
      _ => _P(0, 0, 0, 0, 0, 0, 0, 0),
    };
  }

  void _step(double dt) {
    for (var i = 0; i < _ps.length; i++) {
      final p = _ps[i];
      p.ph += dt;
      switch (widget.effect) {
        case 'meteors':
          if (p.ph >= 0) { // ph < 0: sırasını bekliyor
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.ph > 1.4) _ps[i] = _spawn();
          }
        case 'fireflies':
          p.vx += (_rnd.nextDouble() - 0.5) * 0.02 * dt * 10;
          p.vy += (_rnd.nextDouble() - 0.5) * 0.02 * dt * 10;
          p.vx = p.vx.clamp(-0.03, 0.03).toDouble();
          p.vy = p.vy.clamp(-0.02, 0.02).toDouble();
          p.x = (p.x + p.vx * dt) % 1;
          p.y = (p.y + p.vy * dt).clamp(0.35, 0.98).toDouble();
        case 'stars':
          break;
        default:
          p.x += p.vx * dt + (widget.effect == 'snow' || widget.effect == 'petals' ? math.sin(p.ph * 1.3) * 0.0008 : 0);
          p.y += p.vy * dt;
          p.rot += dt * 1.2;
          if (p.y > 1.05 || p.y < -0.06 || p.x < -0.05 || p.x > 1.05) _ps[i] = _spawn();
      }
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    _time.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.infinite, painter: _EffectPainter(widget.effect, _ps, _time));
}

class _EffectPainter extends CustomPainter {
  final String effect;
  final List<_P> ps;
  final ValueNotifier<double> time;
  _EffectPainter(this.effect, this.ps, this.time) : super(repaint: time);

  static final _fill = Paint()..isAntiAlias = true;
  static final _stroke = Paint()
    ..style = PaintingStyle.stroke
    ..isAntiAlias = true;

  @override
  void paint(Canvas canvas, Size s) {
    final t = time.value;
    switch (effect) {
      case 'aurora':
        // Üst bölgede yavaşça nefes alan iki renk perdesi (degrade, çok düşük maliyet).
        for (var k = 0; k < 2; k++) {
          final a = 0.10 + 0.08 * math.sin(t * 0.5 + k * 2.1);
          final dx = math.sin(t * 0.15 + k) * s.width * 0.12;
          final rect = Rect.fromLTWH(-s.width * 0.2 + dx, s.height * (0.05 + k * 0.06), s.width * 1.4, s.height * 0.42);
          _fill.shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.transparent, (k == 0 ? const Color(0xFF5CF2C0) : const Color(0xFFB14DFF)).withValues(alpha: a), Colors.transparent],
          ).createShader(rect);
          canvas.drawOval(rect, _fill);
        }
        _fill.shader = null;
      case 'stars':
        for (final p in ps) {
          final a = (0.35 + 0.65 * (0.5 + 0.5 * math.sin(t * p.rot + p.ph))).clamp(0.0, 1.0).toDouble();
          final c = Offset(p.x * s.width, p.y * s.height);
          _fill.color = Colors.white.withValues(alpha: a * 0.18);
          canvas.drawCircle(c, p.r * 3.2, _fill);
          _fill.color = Colors.white.withValues(alpha: a);
          canvas.drawCircle(c, p.r, _fill);
        }
      case 'meteors':
        for (final p in ps.where((p) => p.ph >= 0)) {
          final life = (1 - p.ph / 1.4).clamp(0.0, 1.0).toDouble();
          final head = Offset(p.x * s.width, p.y * s.height);
          final tail = head - Offset(p.vx * s.width, p.vy * s.height) * 0.35;
          _stroke
            ..strokeWidth = 2.2
            ..shader = LinearGradient(colors: [Colors.white.withValues(alpha: 0), Colors.white.withValues(alpha: 0.9 * life)]).createShader(Rect.fromPoints(tail, head));
          canvas.drawLine(tail, head, _stroke);
          _stroke.shader = null;
          _fill.color = Colors.white.withValues(alpha: life);
          canvas.drawCircle(head, 2.2, _fill);
        }
      case 'snow':
        for (final p in ps) {
          _fill.color = Colors.white.withValues(alpha: p.a * 0.85);
          canvas.drawCircle(Offset(p.x * s.width, p.y * s.height), p.r, _fill);
        }
      case 'petals':
        for (final p in ps) {
          canvas.save();
          canvas.translate(p.x * s.width, p.y * s.height);
          canvas.rotate(p.rot);
          canvas.scale(1, 0.55 + 0.45 * math.sin(p.ph * 2).abs()); // dönerek düşme hissi
          _fill.color = const Color(0xFFFFB7D5).withValues(alpha: p.a);
          canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: p.r * 2, height: p.r * 1.3), _fill);
          canvas.restore();
        }
      case 'bubbles':
        for (final p in ps) {
          final c = Offset(p.x * s.width + math.sin(p.ph * 1.5) * 6, p.y * s.height);
          _stroke
            ..strokeWidth = 1.2
            ..color = const Color(0xFFBDF0FF).withValues(alpha: p.a);
          canvas.drawCircle(c, p.r, _stroke);
          _fill.color = Colors.white.withValues(alpha: p.a * 0.8);
          canvas.drawCircle(c + Offset(-p.r * 0.35, -p.r * 0.35), p.r * 0.22, _fill);
        }
      case 'embers':
        for (final p in ps) {
          final flick = 0.6 + 0.4 * math.sin(p.ph * 9);
          final life = p.y.clamp(0.0, 1.0).toDouble();
          final c = Offset(p.x * s.width + math.sin(p.ph * 2) * 5, p.y * s.height);
          _fill.color = const Color(0xFFFF7A1A).withValues(alpha: 0.18 * flick * life);
          canvas.drawCircle(c, p.r * 3, _fill);
          _fill.color = const Color(0xFFFFC46B).withValues(alpha: p.a * flick * life);
          canvas.drawCircle(c, p.r, _fill);
        }
      case 'fireflies':
        for (final p in ps) {
          final pulse = 0.5 + 0.5 * math.sin(p.ph * 2.2);
          final c = Offset(p.x * s.width, p.y * s.height);
          _fill.color = const Color(0xFFE8FF7A).withValues(alpha: 0.16 * pulse);
          canvas.drawCircle(c, p.r * 5, _fill);
          _fill.color = const Color(0xFFF4FFB0).withValues(alpha: 0.35 + 0.65 * pulse);
          canvas.drawCircle(c, p.r, _fill);
        }
    }
  }

  @override
  bool shouldRepaint(covariant _EffectPainter old) => old.effect != effect;
}

/// Tema seçici (oda açma ekranı): kullanılabilen temaların küçük resimleri.
class ThemePicker extends StatefulWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const ThemePicker({super.key, required this.value, required this.onChanged});

  @override
  State<ThemePicker> createState() => _ThemePickerState();
}

class _ThemePickerState extends State<ThemePicker> {
  @override
  void initState() {
    super.initState();
    unawaited(RoomThemes.load());
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: RoomThemes.version,
      builder: (context, _, __) {
        final custom = RoomThemes.activeCustom;
        final items = <(String, String, String?, List<Color>)>[
          if (custom != null) (kCustomThemeKey, 'Özel tema', custom.imageUrl, const [Color(0xFF17130C), Color(0xFF221B10)]),
          for (final t in RoomThemes.all.where((t) => t.usable)) (t.key, t.label, t.thumbUrl, t.colors),
        ];
        final dpr = MediaQuery.devicePixelRatioOf(context);
        return Wrap(spacing: 8, runSpacing: 10, children: [
          for (final (key, label, thumb, colors) in items)
            GestureDetector(
              onTap: () => widget.onChanged(key),
              child: SizedBox(
                width: 62,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 54,
                    height: 76,
                    clipBehavior: Clip.antiAlias,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      gradient: LinearGradient(colors: colors.length < 2 ? const [Colors.white24, Colors.white24] : colors, begin: Alignment.topCenter, end: Alignment.bottomCenter),
                      border: Border.all(color: widget.value == key ? Pal.cyan : Colors.white24, width: widget.value == key ? 3 : 1),
                    ),
                    child: thumb == null ? null : Image(image: NetImage(Api.absoluteUrl(thumb)!, targetW: NetImage.px(54, dpr), targetH: NetImage.px(76, dpr)), fit: BoxFit.cover),
                  ),
                  const SizedBox(height: 2),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11)),
                ]),
              ),
            ),
        ]);
      },
    );
  }
}
