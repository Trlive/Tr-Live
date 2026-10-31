import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../services/api.dart';
import 'common.dart';

/// Sesli oda içi PK (Yoho tarzı): Kırmızı / Mavi takım. Kurulum penceresi, oda üstündeki canlı skor çubuğu,
/// başlangıç ("VS") ve bitiş (kazanan + MVP) animasyonları, koltuk takım halkası.

const kPkRed = Color(0xFFFF2D55);
const kPkRedDeep = Color(0xFF8E0E2C);
const kPkBlue = Color(0xFF2F80FF);
const kPkBlueDeep = Color(0xFF0B2C7A);

/// Koltuğun takımı ('red' | 'blue' | null). Sunucudaki kuralla aynı: oda sahibi hangi koltukta olursa olsun tarafsızda
/// takımsız (hakem), taraflıda seçtiği takım; koltuk 0 (sahip koltuğu) ve diğerleri: 1..redSplit kırmızı, sonrası mavi.
/// [userId]: koltukta oturan (boş koltukta null).
String? pkTeamOfSeat(Map<String, dynamic>? pk, int index, {String? userId}) {
  if (pk == null || pk['status'] != 'active') return null;
  final seats = (pk['seatCount'] as num?)?.toInt() ?? 0;
  final owner = pk['ownerId']?.toString();
  final isOwner = userId != null ? userId == owner : index == 0;
  if (isOwner) return pk['mode'] == 'partisan' ? pk['ownerTeam']?.toString() : null;
  if (index < 1 || index >= seats) return null;
  final split = (pk['redSplit'] as num?)?.toInt() ?? ((seats - 1) / 2).ceil();
  return index <= split ? 'red' : 'blue';
}

Color pkTeamColor(String team) => team == 'red' ? kPkRed : kPkBlue;

String _clock(int s) => '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';

// ------------------------------------------------------------------ Kurulum

/// Oda sahibi / yardımcı sahip: süre (15 / 30 / 60 dk) ve mod (tarafsız / taraflı + takım) seçip PK'yı başlatır.
Future<void> showRoomPkSetup(BuildContext context, {required String roomId, required int seatCount}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _RoomPkSetup(roomId: roomId, seatCount: seatCount),
  );
}

class _RoomPkSetup extends StatefulWidget {
  final String roomId;
  final int seatCount;
  const _RoomPkSetup({required this.roomId, required this.seatCount});

  @override
  State<_RoomPkSetup> createState() => _RoomPkSetupState();
}

class _RoomPkSetupState extends State<_RoomPkSetup> {
  int _minutes = 15;
  bool _partisan = false;
  String _team = 'red';
  bool _busy = false;

  Future<void> _start() async {
    if (_busy) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/room-pk', {
          'durationSeconds': _minutes * 60,
          'mode': _partisan ? 'partisan' : 'neutral',
          if (_partisan) 'ownerTeam': _team,
        }));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) Navigator.pop(context);
  }

  Widget _chip(String label, bool on, VoidCallback onTap, {Color? color}) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            margin: const EdgeInsets.symmetric(horizontal: 4),
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              gradient: on ? LinearGradient(colors: color == null ? const [kPkRed, kPkBlue] : [color, Color.lerp(color, Colors.black, 0.35)!]) : null,
              color: on ? null : Colors.white.withValues(alpha: 0.07),
              border: Border.all(color: on ? Colors.white.withValues(alpha: 0.7) : Colors.white24, width: on ? 1.4 : 1),
              boxShadow: on ? [BoxShadow(color: (color ?? kPkRed).withValues(alpha: 0.45), blurRadius: 14)] : null,
            ),
            child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: on ? Colors.white : Colors.white70)),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final split = ((widget.seatCount - 1) / 2).ceil();
    final last = widget.seatCount;
    return Container(
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF2A0B18), Color(0xFF120A1E), Color(0xFF0A1530)]),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 14),
            const _VsEmblem(size: 74),
            const SizedBox(height: 6),
            const Text('Oda İçi PK', textAlign: TextAlign.center, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white)),
            const SizedBox(height: 4),
            Text('Koltuk 2-${split + 1} Kırmızı · Koltuk ${split + 2}-$last Mavi takım. Takım koltuklarına gelen hediyeler puan olur.',
                textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Colors.white60)),
            const SizedBox(height: 18),
            const Text('Süre', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
            const SizedBox(height: 8),
            Row(children: [for (final m in const [15, 30, 60]) _chip('$m dk', _minutes == m, () => setState(() => _minutes = m))]),
            const SizedBox(height: 16),
            const Text('Oda sahibi', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
            const SizedBox(height: 8),
            Row(children: [
              _chip('Tarafsız (hakem)', !_partisan, () => setState(() => _partisan = false), color: const Color(0xFF7A5CFF)),
              _chip('Taraflı', _partisan, () => setState(() => _partisan = true), color: const Color(0xFFFF9500)),
            ]),
            AnimatedSize(
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOut,
              child: _partisan
                  ? Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Row(children: [
                        _chip('Kırmızı takım', _team == 'red', () => setState(() => _team = 'red'), color: kPkRed),
                        _chip('Mavi takım', _team == 'blue', () => setState(() => _team = 'blue'), color: kPkBlue),
                      ]),
                    )
                  : const SizedBox(width: double.infinity),
            ),
            const SizedBox(height: 6),
            Text(_partisan ? 'Oda sahibine gelen hediyeler seçtiği takıma puan olur.' : 'Oda sahibi hakemdir; ona gelen hediyeler puana sayılmaz.',
                textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Colors.white54)),
            const SizedBox(height: 18),
            GestureDetector(
              onTap: _start,
              child: Container(
                height: 54,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(27),
                  gradient: const LinearGradient(colors: [kPkRed, Color(0xFFB0127A), kPkBlue]),
                  boxShadow: const [BoxShadow(color: Color(0x88FF2D55), blurRadius: 18, offset: Offset(-4, 4)), BoxShadow(color: Color(0x882F80FF), blurRadius: 18, offset: Offset(4, 4))],
                ),
                child: _busy
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : const Text('PK BAŞLAT', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white, letterSpacing: 1.5)),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Kırmızı-mavi "VS" amblemi (yavaşça nabız atar).
class _VsEmblem extends StatefulWidget {
  final double size;
  const _VsEmblem({required this.size});

  @override
  State<_VsEmblem> createState() => _VsEmblemState();
}

class _VsEmblemState extends State<_VsEmblem> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return Center(
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) => Transform.scale(
          scale: 1 + 0.08 * Curves.easeInOut.transform(_c.value),
          child: Text(
            'VS',
            style: TextStyle(
              fontSize: s * 0.62,
              fontWeight: FontWeight.w900,
              fontStyle: FontStyle.italic,
              color: Colors.white,
              height: 1,
              shadows: [
                Shadow(color: kPkRed, blurRadius: 10 + 8 * _c.value, offset: const Offset(-3, 0)),
                Shadow(color: kPkBlue, blurRadius: 10 + 8 * (1 - _c.value), offset: const Offset(3, 0)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ Canlı skor çubuğu

/// Odanın üstündeki PK çubuğu: iki takımın skoru (sayarak artar), ortada nabız atan VS ve geri sayım (son 10 sn kırmızı
/// yanıp söner), kayan ışıltılı skor çizgisi, en çok destekleyenler. Yönetici bitirebilir / iptal edebilir.
class RoomPkBar extends StatefulWidget {
  final Map<String, dynamic> pk;
  final bool canManage;
  /// Süre bittiği hâlde birkaç saniye sonuç gelmezse (bağlantı koptuysa) çağrılır: oda durumu yeniden okusun.
  final VoidCallback? onStale;
  const RoomPkBar({super.key, required this.pk, this.canManage = false, this.onStale});

  @override
  State<RoomPkBar> createState() => _RoomPkBarState();
}

class _RoomPkBarState extends State<RoomPkBar> with SingleTickerProviderStateMixin {
  late final AnimationController _fx = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..repeat();
  Timer? _timer;
  int _left = 0;
  DateTime _stamp = DateTime.now();

  @override
  void initState() {
    super.initState();
    _sync();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final base = (widget.pk['remainingSeconds'] as num?)?.toInt() ?? 0;
      final passed = DateTime.now().difference(_stamp).inSeconds;
      setState(() => _left = math.max(0, base - passed));
      if (base - passed == -8) widget.onStale?.call(); // süre 8 sn önce bitti, sonuç gelmedi
    });
  }

  void _sync() {
    _left = (widget.pk['remainingSeconds'] as num?)?.toInt() ?? 0;
    _stamp = DateTime.now();
  }

  @override
  void didUpdateWidget(covariant RoomPkBar old) {
    super.didUpdateWidget(old);
    if (old.pk['remainingSeconds'] != widget.pk['remainingSeconds'] || old.pk['status'] != widget.pk['status']) _sync();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _fx.dispose();
    super.dispose();
  }

  Future<void> _manage() async {
    final a = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF1C1C1F),
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.flag, color: Colors.amber), title: const Text('PK\'yı şimdi bitir'), subtitle: const Text('O anki skorla kazanan ve MVP belirlenir'), onTap: () => Navigator.pop(c, 'end')),
          ListTile(leading: const Icon(Icons.cancel_outlined, color: Colors.redAccent), title: const Text('PK\'yı iptal et'), subtitle: const Text('Sonuçsuz kapanır'), onTap: () => Navigator.pop(c, 'cancel')),
        ]),
      ),
    );
    if (a == null || !mounted) return;
    await guard(context, () => Api.post('/api/room-pk/${widget.pk['id']}/end', {'cancel': a == 'cancel'}));
  }

  Widget _supporters(List<dynamic> list, bool left, Color color) {
    final items = [for (final x in list.take(3)) mapOf(mapOf(x)?['user'])];
    return SizedBox(
      height: 26,
      child: Row(
        mainAxisAlignment: left ? MainAxisAlignment.start : MainAxisAlignment.end,
        children: [
          for (var i = 0; i < 3; i++)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Container(
                padding: const EdgeInsets.all(1.5),
                decoration: BoxDecoration(shape: BoxShape.circle, color: i == 0 ? const Color(0xFFFFD54F) : color.withValues(alpha: 0.7)),
                child: i < items.length && items[i] != null
                    ? UserAvatar(user: items[i], radius: 10.5)
                    : CircleAvatar(radius: 10.5, backgroundColor: Colors.black38, child: Text('${i + 1}', style: const TextStyle(fontSize: 10, color: Colors.white54))),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pk = widget.pk;
    final red = mapOf(pk['red']) ?? {};
    final blue = mapOf(pk['blue']) ?? {};
    final sr = BigInt.tryParse('${red['score']}') ?? BigInt.zero;
    final sb = BigInt.tryParse('${blue['score']}') ?? BigInt.zero;
    final total = sr + sb;
    final ratio = total == BigInt.zero ? 0.5 : (sr.toDouble() / total.toDouble()).clamp(0.06, 0.94);
    final urgent = _left <= 10;
    return Container(
      margin: const EdgeInsets.fromLTRB(8, 2, 8, 4),
      padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(colors: [Color(0xCC5A0A1E), Color(0xCC14102A), Color(0xCC0A2160)]),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Expanded(child: _ScoreText(value: sr, color: kPkRed, alignLeft: true)),
          // Ortada VS + süre; son 10 saniye kırmızı yanıp söner.
          AnimatedBuilder(
            animation: _fx,
            builder: (_, __) {
              final beat = urgent ? (0.5 + 0.5 * math.sin(_fx.value * 2 * math.pi * 2)).abs() : 0.0;
              return Column(mainAxisSize: MainAxisSize.min, children: [
                Text('VS',
                    style: TextStyle(fontSize: 16, height: 1, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white, shadows: const [
                      Shadow(color: kPkRed, blurRadius: 8, offset: Offset(-2, 0)),
                      Shadow(color: kPkBlue, blurRadius: 8, offset: Offset(2, 0)),
                    ])),
                const SizedBox(height: 2),
                Transform.scale(
                  scale: 1 + 0.18 * beat,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                    decoration: BoxDecoration(color: Color.lerp(Colors.black45, Colors.red, beat), borderRadius: BorderRadius.circular(8)),
                    child: Text(_clock(_left), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ),
              ]);
            },
          ),
          Expanded(child: _ScoreText(value: sb, color: kPkBlue, alignLeft: false)),
          if (widget.canManage)
            InkResponse(onTap: _manage, radius: 16, child: const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.more_vert, size: 18, color: Colors.white70))),
        ]),
        const SizedBox(height: 5),
        // Skor çizgisi: oran yumuşakça kayar; birleşim noktasında parlayan kıvılcım, üstünde kayan ışıltı.
        RepaintBoundary(
          child: SizedBox(
          height: 12,
          child: LayoutBuilder(builder: (context, box) {
            return TweenAnimationBuilder<double>(
              tween: Tween(end: ratio),
              duration: const Duration(milliseconds: 700),
              curve: Curves.easeOutCubic,
              builder: (_, r, __) => AnimatedBuilder(
                animation: _fx,
                builder: (_, __) => CustomPaint(size: Size(box.maxWidth, 12), painter: _BarPainter(ratio: r, t: _fx.value)),
              ),
            );
          }),
          ),
        ),
        const SizedBox(height: 5),
        Row(children: [
          Expanded(child: _supporters(listOf(red['supporters']), true, kPkRed)),
          Text(pk['mode'] == 'partisan' ? (pk['ownerTeam'] == 'blue' ? 'Taraflı · sahip Mavi' : 'Taraflı · sahip Kırmızı') : 'Tarafsız',
              style: const TextStyle(fontSize: 10, color: Colors.white54)),
          Expanded(child: _supporters(listOf(blue['supporters']), false, kPkBlue)),
        ]),
      ]),
    );
  }
}

/// Skor: yeni değere sayarak ilerler.
class _ScoreText extends StatelessWidget {
  final BigInt value;
  final Color color;
  final bool alignLeft;
  const _ScoreText({required this.value, required this.color, required this.alignLeft});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: value.toDouble()),
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeOut,
      builder: (_, v, __) => Text(
        fmtNumber(v.round()),
        textAlign: alignLeft ? TextAlign.left : TextAlign.right,
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white, shadows: [Shadow(color: color, blurRadius: 10)]),
      ),
    );
  }
}

class _BarPainter extends CustomPainter {
  final double ratio;
  final double t;
  _BarPainter({required this.ratio, required this.t});

  @override
  void paint(Canvas canvas, Size size) {
    final r = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(size.height / 2));
    canvas.save();
    canvas.clipRRect(r);
    final x = size.width * ratio;
    canvas.drawRect(Rect.fromLTWH(0, 0, x, size.height), Paint()..shader = const LinearGradient(colors: [kPkRedDeep, kPkRed]).createShader(Rect.fromLTWH(0, 0, x, size.height)));
    canvas.drawRect(Rect.fromLTWH(x, 0, size.width - x, size.height),
        Paint()..shader = const LinearGradient(colors: [kPkBlue, kPkBlueDeep]).createShader(Rect.fromLTWH(x, 0, size.width - x, size.height)));
    // Kayan ışıltı.
    final sx = -size.width * 0.3 + t * size.width * 1.6;
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = LinearGradient(colors: [Colors.white.withValues(alpha: 0), Colors.white.withValues(alpha: 0.35), Colors.white.withValues(alpha: 0)])
            .createShader(Rect.fromLTWH(sx, 0, size.width * 0.3, size.height)),
    );
    canvas.restore();
    // Birleşim kıvılcımı.
    final glow = 0.6 + 0.4 * math.sin(t * 2 * math.pi * 2);
    canvas.drawCircle(Offset(x, size.height / 2), size.height * (0.85 + 0.25 * glow),
        Paint()..color = const Color(0xFFFFE082).withValues(alpha: 0.5 * glow)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5));
    canvas.drawCircle(Offset(x, size.height / 2), size.height * 0.36, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(_BarPainter old) => old.ratio != ratio || old.t != t;
}

// ------------------------------------------------------------------ Başlangıç / bitiş animasyonları

/// "PK BAŞLADI": kırmızı ve mavi yarılar iki yandan çarpışır, ortada VS patlar (~1,8 sn).
Future<void> showRoomPkStart(BuildContext context) async {
  final overlay = Overlay.maybeOf(context);
  if (overlay == null) return;
  late OverlayEntry entry;
  entry = OverlayEntry(builder: (_) => _PkStartFx(onDone: () => entry
    ..remove()
    ..dispose()));
  overlay.insert(entry);
}

class _PkStartFx extends StatefulWidget {
  final VoidCallback onDone;
  const _PkStartFx({required this.onDone});

  @override
  State<_PkStartFx> createState() => _PkStartFxState();
}

class _PkStartFxState extends State<_PkStartFx> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1900))
    ..forward().whenComplete(() {
      if (mounted) widget.onDone();
    });

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) {
          final t = _c.value;
          final slide = Curves.easeOutBack.transform((t / 0.35).clamp(0.0, 1.0));
          final fade = t < 0.8 ? 1.0 : (1 - (t - 0.8) / 0.2);
          final vs = Curves.elasticOut.transform(((t - 0.25) / 0.5).clamp(0.0, 1.0));
          final h = 120.0;
          final top = size.height * 0.36;
          return Opacity(
            opacity: fade.clamp(0.0, 1.0),
            child: Stack(children: [
              Positioned(
                top: top,
                left: -size.width + size.width * 0.5 * slide + size.width * 0.5,
                width: size.width * 0.5 + 24,
                height: h,
                child: Transform(
                  transform: Matrix4.skewX(-0.25),
                  child: Container(
                    decoration: const BoxDecoration(gradient: LinearGradient(colors: [kPkRedDeep, kPkRed])),
                    alignment: Alignment.center,
                    child: const Text('KIRMIZI', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white)),
                  ),
                ),
              ),
              Positioned(
                top: top,
                left: size.width - size.width * 0.5 * slide - 24,
                width: size.width * 0.5 + 24,
                height: h,
                child: Transform(
                  transform: Matrix4.skewX(-0.25),
                  child: Container(
                    decoration: const BoxDecoration(gradient: LinearGradient(colors: [kPkBlue, kPkBlueDeep])),
                    alignment: Alignment.center,
                    child: const Text('MAVİ', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white)),
                  ),
                ),
              ),
              Positioned(
                top: top - 10,
                left: 0,
                right: 0,
                height: h + 20,
                child: Center(
                  child: Transform.scale(
                    scale: 0.2 + 1.0 * vs,
                    child: const Text('VS',
                        style: TextStyle(fontSize: 86, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white, height: 1, shadows: [
                          Shadow(color: Color(0xFFFFD54F), blurRadius: 24),
                          Shadow(color: kPkRed, blurRadius: 12, offset: Offset(-5, 0)),
                          Shadow(color: kPkBlue, blurRadius: 12, offset: Offset(5, 0)),
                        ])),
                  ),
                ),
              ),
              Positioned(
                top: top + h + 18,
                left: 0,
                right: 0,
                child: Opacity(
                  opacity: ((t - 0.4) / 0.2).clamp(0.0, 1.0),
                  child: const Text('PK BAŞLADI!', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 2, shadows: [Shadow(color: Colors.black, blurRadius: 8)])),
                ),
              ),
            ]),
          );
        },
      ),
    );
  }
}

/// Bitiş: kazanan takım, skorlar ve MVP; arkada uçuşan konfeti. Dokununca ya da 7 sn sonra kapanır.
Future<void> showRoomPkResult(BuildContext context, Map<String, dynamic> pk) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'PK sonucu',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 420),
    pageBuilder: (c, _, __) => _PkResult(pk: pk),
    transitionBuilder: (c, a, _, child) => Transform.scale(scale: Curves.easeOutBack.transform(a.value).clamp(0.0, 1.2), child: Opacity(opacity: a.value, child: child)),
  );
}

class _PkResult extends StatefulWidget {
  final Map<String, dynamic> pk;
  const _PkResult({required this.pk});

  @override
  State<_PkResult> createState() => _PkResultState();
}

class _PkResultState extends State<_PkResult> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();
  Timer? _auto;
  final _rnd = math.Random();
  late final List<List<double>> _bits = List.generate(36, (_) => [_rnd.nextDouble(), _rnd.nextDouble(), 4 + _rnd.nextDouble() * 6, _rnd.nextDouble()]);

  @override
  void initState() {
    super.initState();
    _auto = Timer(const Duration(seconds: 7), () {
      // Yalnızca bu pencere en üstteyse kapanır (üstüne açılmış başka bir pencereyi kapatmasın).
      final route = mounted ? ModalRoute.of(context) : null;
      if (route != null && route.isCurrent) Navigator.of(context).pop();
    });
  }

  @override
  void dispose() {
    _auto?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pk = widget.pk;
    final w = pk['winner']?.toString() ?? 'draw';
    final draw = w == 'draw';
    final color = draw ? const Color(0xFFFFD54F) : pkTeamColor(w);
    final title = draw ? 'BERABERE' : (w == 'red' ? 'KIRMIZI TAKIM KAZANDI' : 'MAVİ TAKIM KAZANDI');
    final mvp = mapOf(pk['mvp']);
    final red = mapOf(pk['red']) ?? {};
    final blue = mapOf(pk['blue']) ?? {};
    return Center(
      child: GestureDetector(
        onTap: () {
          final route = ModalRoute.of(context);
          if (route != null && route.isCurrent) Navigator.of(context).pop();
        },
        child: Material(
          color: Colors.transparent,
          child: SizedBox(
            width: 300,
            height: 360,
            child: Stack(clipBehavior: Clip.none, children: [
              // Konfeti
              Positioned.fill(
                child: AnimatedBuilder(
                  animation: _c,
                  builder: (_, __) => CustomPaint(painter: _ConfettiPainter(bits: _bits, t: _c.value, color: color)),
                ),
              ),
              Positioned.fill(
                top: 40,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [color.withValues(alpha: 0.95), const Color(0xFF14102A)]),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 1.5),
                    boxShadow: [BoxShadow(color: color.withValues(alpha: 0.6), blurRadius: 30)],
                  ),
                  padding: const EdgeInsets.fromLTRB(16, 46, 16, 16),
                  child: Column(children: [
                    Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white)),
                    const SizedBox(height: 12),
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Text(fmtNumber(red['score']), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white, shadows: [Shadow(color: kPkRed, blurRadius: 10)])),
                      const Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text(':', style: TextStyle(fontSize: 22, color: Colors.white70))),
                      Text(fmtNumber(blue['score']), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white, shadows: [Shadow(color: kPkBlue, blurRadius: 10)])),
                    ]),
                    const Spacer(),
                    if (mvp != null) ...[
                      Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
                        Container(
                          padding: const EdgeInsets.all(3),
                          decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color(0xFFFFE082), Color(0xFFFF8F00)])),
                          child: UserAvatar(user: mvp, radius: 30),
                        ),
                        const Positioned(top: -18, child: Text('👑', style: TextStyle(fontSize: 22))),
                      ]),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                        decoration: BoxDecoration(color: const Color(0xFFFFB300), borderRadius: BorderRadius.circular(10)),
                        child: const Text('MVP', style: TextStyle(fontWeight: FontWeight.w900, color: Colors.black, fontSize: 12)),
                      ),
                      const SizedBox(height: 4),
                      Text((mvp['displayName'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
                    ] else
                      const Text('Bu PK\'da hediye gönderilmedi.', style: TextStyle(color: Colors.white70)),
                  ]),
                ),
              ),
              // Üstte taç / kupa rozeti
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Center(
                  child: AnimatedBuilder(
                    animation: _c,
                    builder: (_, child) => Transform.rotate(angle: 0.08 * math.sin(_c.value * 2 * math.pi), child: child),
                    child: Container(
                      width: 80,
                      height: 80,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0xFF14102A), border: Border.all(color: color, width: 3), boxShadow: [BoxShadow(color: color, blurRadius: 18)]),
                      child: Text(draw ? '🤝' : '🏆', style: const TextStyle(fontSize: 40)),
                    ),
                  ),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  final List<List<double>> bits;
  final double t;
  final Color color;
  _ConfettiPainter({required this.bits, required this.t, required this.color});

  static const _palette = [kPkRed, kPkBlue, Color(0xFFFFD54F), Color(0xFF69F0AE), Colors.white];

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < bits.length; i++) {
      final b = bits[i];
      final y = ((b[1] + t) % 1.0) * (size.height + 40) - 40;
      final x = b[0] * size.width + math.sin((t + b[3]) * 2 * math.pi) * 14;
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate((t + b[3]) * 2 * math.pi);
      canvas.drawRect(Rect.fromCenter(center: Offset.zero, width: b[2], height: b[2] * 0.5), Paint()..color = (i % 6 == 0 ? color : _palette[i % _palette.length]).withValues(alpha: 0.9));
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => old.t != t;
}

// ------------------------------------------------------------------ Koltuk takım halkası

/// Koltuk avatarının çevresinde takım renginde dönen halka ve küçük "K" / "M" rozeti.
class PkSeatRing extends StatefulWidget {
  final String team;
  final double size;
  const PkSeatRing({super.key, required this.team, required this.size});

  @override
  State<PkSeatRing> createState() => _PkSeatRingState();
}

class _PkSeatRingState extends State<PkSeatRing> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = pkTeamColor(widget.team);
    return IgnorePointer(
      child: SizedBox(
        width: widget.size,
        height: widget.size,
        child: Stack(clipBehavior: Clip.none, children: [
          Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: _RingPainter(color: color, anim: _c)))),
          Positioned(
            left: 0,
            top: 0,
            child: Container(
              width: widget.size * 0.3,
              height: widget.size * 0.3,
              alignment: Alignment.center,
              decoration: BoxDecoration(shape: BoxShape.circle, color: color, border: Border.all(color: Colors.white, width: 1)),
              child: Text(widget.team == 'red' ? 'K' : 'M', style: TextStyle(fontSize: widget.size * 0.17, fontWeight: FontWeight.w900, color: Colors.white, height: 1)),
            ),
          ),
        ]),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final Color color;
  final Animation<double> anim;
  // repaint: yalnızca bu katman yeniden çizilir, koltuk ağacı yeniden kurulmaz.
  _RingPainter({required this.color, required this.anim}) : super(repaint: anim);

  @override
  void paint(Canvas canvas, Size size) {
    final t = anim.value;
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2 - 2;
    final rect = Rect.fromCircle(center: c, radius: r);
    canvas.drawCircle(c, r, Paint()..style = PaintingStyle.stroke..strokeWidth = 2.6..color = color.withValues(alpha: 0.85));
    canvas.drawArc(
      rect,
      t * 2 * math.pi,
      math.pi * 0.7,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.2
        ..strokeCap = StrokeCap.round
        ..shader = SweepGradient(colors: [color.withValues(alpha: 0), Colors.white], transform: GradientRotation(t * 2 * math.pi)).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.color != color || old.anim != anim;
}
