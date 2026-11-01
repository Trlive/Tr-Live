import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../services/api.dart';
import 'common.dart';

/// Sesli oda içi PK (Yoho tarzı): Kırmızı / Mavi takım. Kurulum penceresi, 9'lu koltuk PK sahnesi (kırmızı / mavi zemin,
/// MVP tahtları, alt kontrol çubuğu), 3-2-1 geri sayım, başlangıç ("VS") ve bitiş (kazanan + MVP) animasyonları,
/// koltuk takım halkası, kaybedenlerin mikrofonunda ağlayan emoji.

const kPkRed = Color(0xFFFF2D55);
const kPkRedDeep = Color(0xFF8E0E2C);
const kPkBlue = Color(0xFF2F80FF);
const kPkBlueDeep = Color(0xFF0B2C7A);

/// Koltuğun takımı ('red' | 'blue' | null). Sunucudaki kuralla aynı: oda sahibi hangi koltukta olursa olsun tarafsızda
/// takımsız (hakem), taraflıda seçtiği takım; koltuk 0 (sahip koltuğu) ve diğerleri: 1..redSplit kırmızı, sonrası mavi.
/// [userId]: koltukta oturan (boş koltukta null).
String? pkTeamOfSeat(Map<String, dynamic>? pk, int index, {String? userId}) {
  if (pk == null || !const ['preparing', 'active', 'finished'].contains(pk['status'])) return null;
  final seats = (pk['seatCount'] as num?)?.toInt() ?? 0;
  final owner = pk['ownerId']?.toString();
  final isOwner = userId != null ? userId == owner : index == 0;
  if (isOwner) return pk['mode'] == 'partisan' ? pk['ownerTeam']?.toString() : null;
  if (index < 1 || index >= seats) return null;
  final split = (pk['redSplit'] as num?)?.toInt() ?? ((seats - 1) / 2).ceil();
  return index <= split ? 'red' : 'blue';
}

Color pkTeamColor(String team) => team == 'red' ? kPkRed : kPkBlue;

/// PK modu yalnızca 9'lu koltukta açılır.
const kRoomPkSeats = 9;

/// 9'lu PK sahnesinde konum → koltuk: üstte oda sahibi; altta solda Kırmızı 2×2 (koltuk 1-4), sağda Mavi 2×2 (5-8).
/// Normal 9'lu yerleşimin 2. ve 3. satırları (4'er konum) bu sırayla doldurulur.
const kPkSeatOrder = [0, 1, 2, 5, 6, 3, 4, 7, 8];

/// Takım içindeki numara (No.1–No.4).
int pkSeatNo(int index) => index > 4 ? index - 4 : index;

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
            const Text('Takım Savaşı', textAlign: TextAlign.center, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white)),
            const SizedBox(height: 4),
            Text('Soldaki 4 koltuk Kırmızı, sağdaki 4 koltuk Mavi takım (koltuk 2-${split + 1} / ${split + 2}-$last). PK modu açılınca '
                '"Başla"ya basınca tur başlar; takım koltuklarına gelen hediyeler puan olur, her tur sonunda yeni tur hazırlanır.',
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
                    : const Text('PK MODUNU AÇ', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white, letterSpacing: 1.5)),
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
          Expanded(child: PkScoreText(value: sr, color: kPkRed, alignLeft: true)),
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
          Expanded(child: PkScoreText(value: sb, color: kPkBlue, alignLeft: false)),
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
                builder: (_, __) => CustomPaint(size: Size(box.maxWidth, 12), painter: PkBarPainter(ratio: r, t: _fx.value)),
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
class PkScoreText extends StatelessWidget {
  final BigInt value;
  final Color color;
  final bool alignLeft;
  const PkScoreText({super.key, required this.value, required this.color, required this.alignLeft});

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

class PkBarPainter extends CustomPainter {
  final double ratio;
  final double t;
  PkBarPainter({required this.ratio, required this.t});

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
  bool shouldRepaint(PkBarPainter old) => old.ratio != ratio || old.t != t;
}

// ------------------------------------------------------------------ Başlangıç / bitiş animasyonları

/// "PK BAŞLADI": kırmızı ve mavi yarılar iki yandan çarpışır, ortada VS patlar (~1,8 sn).
/// [left] / [right]: iki yanın adı (sesli oda: KIRMIZI / MAVİ, görüntülü PK: BİZ / RAKİP).
Future<void> showRoomPkStart(BuildContext context, {String left = 'KIRMIZI', String right = 'MAVİ'}) async {
  final overlay = Overlay.maybeOf(context);
  if (overlay == null) return;
  _insertStart(overlay, left, right);
}

void _insertStart(OverlayState overlay, String left, String right) {
  late OverlayEntry entry;
  entry = OverlayEntry(builder: (_) => _PkStartFx(left: left, right: right, onDone: () => entry
    ..remove()
    ..dispose()));
  overlay.insert(entry);
}

class _PkStartFx extends StatefulWidget {
  final VoidCallback onDone;
  final String left;
  final String right;
  const _PkStartFx({required this.onDone, required this.left, required this.right});

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
                    child: Text(widget.left, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white)),
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
                    child: Text(widget.right, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white)),
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

// ------------------------------------------------------------------ 9'lu PK sahnesi (Figma)

/// Koltuk alanının arkası: solda kırmızı, sağda mavi yarı; ortada nabız atan ışık huzmesi, yukarı süzülen kıvılcımlar.
class PkStageBackdrop extends StatefulWidget {
  const PkStageBackdrop({super.key});

  @override
  State<PkStageBackdrop> createState() => _PkStageBackdropState();
}

class _PkStageBackdropState extends State<PkStageBackdrop> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(child: RepaintBoundary(child: CustomPaint(painter: _BackdropPainter(_c), size: Size.infinite)));
  }
}

class _BackdropPainter extends CustomPainter {
  final Animation<double> anim;
  _BackdropPainter(this.anim) : super(repaint: anim);

  @override
  void paint(Canvas canvas, Size size) {
    final t = anim.value;
    final w = size.width, h = size.height, mid = w / 2;
    final left = Rect.fromLTWH(0, 0, mid, h);
    final right = Rect.fromLTWH(mid, 0, mid, h);
    canvas.drawRect(
      left,
      Paint()
        ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [
          kPkRed.withValues(alpha: 0.42),
          kPkRedDeep.withValues(alpha: 0.30),
          kPkRedDeep.withValues(alpha: 0.0),
        ], stops: const [0, 0.65, 1]).createShader(left),
    );
    canvas.drawRect(
      right,
      Paint()
        ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [
          kPkBlue.withValues(alpha: 0.42),
          kPkBlueDeep.withValues(alpha: 0.30),
          kPkBlueDeep.withValues(alpha: 0.0),
        ], stops: const [0, 0.65, 1]).createShader(right),
    );
    // Ortadaki ışık huzmesi (nabız atar).
    final pulse = 0.65 + 0.35 * math.sin(t * 2 * math.pi);
    final beamW = w * (0.10 + 0.03 * pulse);
    final beam = Rect.fromLTWH(mid - beamW / 2, 0, beamW, h);
    canvas.drawRect(
      beam,
      Paint()
        ..shader = LinearGradient(colors: [
          Colors.white.withValues(alpha: 0),
          Colors.white.withValues(alpha: 0.22 * pulse),
          Colors.white.withValues(alpha: 0),
        ]).createShader(beam)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    canvas.drawLine(Offset(mid, 0), Offset(mid, h * 0.92),
        Paint()
          ..strokeWidth = 1.4
          ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [
            Colors.white.withValues(alpha: 0.85 * pulse),
            Colors.white.withValues(alpha: 0),
          ]).createShader(beam));
    // Yukarı süzülen kıvılcımlar (her iki yanda takım renginde).
    final spark = Paint();
    for (var i = 0; i < 14; i++) {
      final seed = (i * 0.137 + 0.05) % 1.0;
      final p = (t + seed) % 1.0;
      final onLeft = i.isEven;
      final x = onLeft ? mid * (0.08 + 0.84 * ((i * 0.293) % 1.0)) : mid + mid * (0.08 + 0.84 * ((i * 0.411) % 1.0));
      final y = h * (1.0 - p);
      final a = math.sin(p * math.pi);
      spark.color = (onLeft ? const Color(0xFFFF8FA6) : const Color(0xFF8FC1FF)).withValues(alpha: 0.55 * a);
      canvas.drawCircle(Offset(x + math.sin((p + seed) * 6) * 6, y), 1.2 + 1.4 * a, spark);
    }
  }

  @override
  bool shouldRepaint(_BackdropPainter old) => old.anim != anim;
}

/// MVP tahtı: takımın en çok destekleyeni (o an) altın tahtta oturur; boşken soluk taht. Tahtın arkası takım renginde.
class PkThrone extends StatefulWidget {
  final String team;
  final Map<String, dynamic>? user;
  final double width;
  final VoidCallback? onTap;
  const PkThrone({super.key, required this.team, required this.user, required this.width, this.onTap});

  @override
  State<PkThrone> createState() => _PkThroneState();
}

class _PkThroneState extends State<PkThrone> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.width;
    final h = w * 1.18;
    final user = widget.user;
    final color = pkTeamColor(widget.team);
    final avatarR = w * 0.25;
    return GestureDetector(
      onTap: user == null ? null : widget.onTap,
      child: SizedBox(
        width: w,
        height: h,
        child: Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
          Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: _ThronePainter(color: color, anim: _c, filled: user != null)))),
          // Oturan (avatar) ya da boş yer.
          Positioned(
            top: h * 0.25,
            child: user != null
                ? Container(
                    padding: const EdgeInsets.all(1.5),
                    decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color(0xFFFFF3C4), Color(0xFFE0A526)])),
                    child: UserAvatar(user: user, radius: avatarR - 1.5),
                  )
                : Container(
                    width: avatarR * 2,
                    height: avatarR * 2,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withValues(alpha: 0.28), border: Border.all(color: Colors.white24)),
                    child: Icon(Icons.person, size: avatarR * 1.3, color: Colors.white38),
                  ),
          ),
          // Taç
          Positioned(
            top: -h * 0.06,
            child: AnimatedBuilder(
              animation: _c,
              builder: (_, child) => Transform.translate(offset: Offset(0, -2 * math.sin(_c.value * 2 * math.pi)), child: child),
              child: Text('👑', style: TextStyle(fontSize: w * 0.22, height: 1)),
            ),
          ),
          // "MVP" şeridi
          Positioned(
            bottom: h * 0.02,
            child: Container(
              padding: EdgeInsets.symmetric(horizontal: w * 0.09, vertical: 1),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                gradient: const LinearGradient(colors: [Color(0xFFFFE082), Color(0xFFFFB300), Color(0xFFFF8F00)]),
                border: Border.all(color: Colors.white.withValues(alpha: 0.8), width: 0.8),
                boxShadow: [BoxShadow(color: color.withValues(alpha: 0.6), blurRadius: 6)],
              ),
              child: Text('MVP', style: TextStyle(fontSize: w * 0.13, height: 1.1, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: const Color(0xFF4A2A00))),
            ),
          ),
        ]),
      ),
    );
  }
}

class _ThronePainter extends CustomPainter {
  final Color color;
  final Animation<double> anim;
  final bool filled;
  _ThronePainter({required this.color, required this.anim, required this.filled}) : super(repaint: anim);

  static const _gold = [Color(0xFFFFF1B8), Color(0xFFF2C14E), Color(0xFFB7791F)];

  @override
  void paint(Canvas canvas, Size size) {
    final t = anim.value;
    final w = size.width, h = size.height;
    final alpha = filled ? 1.0 : 0.55;
    // Arkadaki takım rengi parıltı.
    final glow = 0.55 + 0.45 * math.sin(t * 2 * math.pi);
    canvas.drawCircle(Offset(w / 2, h * 0.45), w * 0.48,
        Paint()
          ..color = color.withValues(alpha: (filled ? 0.55 : 0.25) * glow)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12));
    final gold = Paint()
      ..shader = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [for (final c in _gold) c.withValues(alpha: alpha)])
          .createShader(Offset.zero & size);
    // Sırtlık: kemerli üst.
    final back = Path()
      ..moveTo(w * 0.16, h * 0.80)
      ..lineTo(w * 0.16, h * 0.30)
      ..quadraticBezierTo(w * 0.16, h * 0.08, w * 0.50, h * 0.06)
      ..quadraticBezierTo(w * 0.84, h * 0.08, w * 0.84, h * 0.30)
      ..lineTo(w * 0.84, h * 0.80)
      ..close();
    canvas.drawPath(back, gold);
    final inner = Path()
      ..moveTo(w * 0.24, h * 0.76)
      ..lineTo(w * 0.24, h * 0.32)
      ..quadraticBezierTo(w * 0.24, h * 0.15, w * 0.50, h * 0.135)
      ..quadraticBezierTo(w * 0.76, h * 0.15, w * 0.76, h * 0.32)
      ..lineTo(w * 0.76, h * 0.76)
      ..close();
    canvas.drawPath(
      inner,
      Paint()
        ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [
          Color.lerp(color, Colors.white, 0.15)!.withValues(alpha: alpha),
          Color.lerp(color, Colors.black, 0.45)!.withValues(alpha: alpha),
        ]).createShader(Offset.zero & size),
    );
    // Kol dayamaları ve yan sütunların topuzları.
    for (final x in [w * 0.04, w * 0.80]) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, h * 0.50, w * 0.16, h * 0.30), Radius.circular(w * 0.05)), gold);
    }
    for (final x in [w * 0.12, w * 0.88]) {
      canvas.drawCircle(Offset(x, h * 0.48), w * 0.06, gold);
    }
    // Oturak.
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(w * 0.10, h * 0.76, w * 0.80, h * 0.11), Radius.circular(w * 0.05)), gold);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(w * 0.18, h * 0.765, w * 0.64, h * 0.05), Radius.circular(w * 0.03)),
      Paint()..color = Color.lerp(color, Colors.black, 0.2)!.withValues(alpha: alpha),
    );
    // Altın üzerinde kayan parıltı.
    final sx = -w + t * w * 3;
    canvas.save();
    canvas.clipPath(back);
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = LinearGradient(colors: [Colors.white.withValues(alpha: 0), Colors.white.withValues(alpha: 0.45 * alpha), Colors.white.withValues(alpha: 0)])
            .createShader(Rect.fromLTWH(sx, 0, w * 0.5, h)),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ThronePainter old) => old.color != color || old.anim != anim || old.filled != filled;
}

/// 9'lu PK sahnesinin alt çubuğu (Figma): kırmızı | mavi skor çubuğu, ortada "Başla" (yönetici, hazırlanırken) ya da
/// geri sayım; altında takımların en çok destekleyenleri, "Takım Savaşı" ve yöneticiye kapatma (X).
class RoomPkPanel extends StatefulWidget {
  final Map<String, dynamic> pk;
  final bool canManage;
  final VoidCallback? onStale;
  /// "Başla" yanıtındaki güncel PK (bağlantı bildirimi gecikse de yöneticinin çubuğu hemen güncellensin).
  final ValueChanged<Map<String, dynamic>>? onUpdate;
  const RoomPkPanel({super.key, required this.pk, this.canManage = false, this.onStale, this.onUpdate});

  static const double height = 64;

  @override
  State<RoomPkPanel> createState() => _RoomPkPanelState();
}

class _RoomPkPanelState extends State<RoomPkPanel> with SingleTickerProviderStateMixin {
  late final AnimationController _fx = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..repeat();
  Timer? _timer;
  int _left = 0;
  int _intro = 0;
  DateTime _stamp = DateTime.now();
  bool _busy = false;
  bool _staleSent = false;

  @override
  void initState() {
    super.initState();
    _sync();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _sync() {
    _left = (widget.pk['remainingSeconds'] as num?)?.toInt() ?? 0;
    _intro = (widget.pk['introSeconds'] as num?)?.toInt() ?? 0;
    _stamp = DateTime.now();
    _staleSent = false;
  }

  void _tick() {
    if (!mounted || widget.pk['status'] != 'active') return;
    final base = (widget.pk['remainingSeconds'] as num?)?.toInt() ?? 0;
    // Giriş (3-2-1 + VS) sürerken süre işlemez; giriş payı son eşitlemedeki değerdir.
    final passed = math.max(0, DateTime.now().difference(_stamp).inSeconds - _intro);
    setState(() => _left = math.max(0, base - passed));
    if (base - passed <= -8 && !_staleSent) {
      _staleSent = true; // süre 8 sn önce bitti, sonuç gelmedi: durumu yeniden oku
      widget.onStale?.call();
    }
  }

  @override
  void didUpdateWidget(covariant RoomPkPanel old) {
    super.didUpdateWidget(old);
    if (old.pk['remainingSeconds'] != widget.pk['remainingSeconds'] ||
        old.pk['introSeconds'] != widget.pk['introSeconds'] ||
        old.pk['status'] != widget.pk['status'] ||
        old.pk['id'] != widget.pk['id']) {
      _sync();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _fx.dispose();
    super.dispose();
  }

  Future<void> _begin() async {
    if (_busy) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.post('/api/room-pk/${widget.pk['id']}/start'));
    if (!mounted) return;
    setState(() => _busy = false);
    final pk = mapOf(mapOf(r)?['pk']);
    if (pk != null) widget.onUpdate?.call(pk);
  }

  Future<void> _manage() async {
    final active = widget.pk['status'] == 'active';
    final a = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF1C1C1F),
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (active)
            ListTile(
              leading: const Icon(Icons.flag, color: Colors.amber),
              title: const Text('Turu şimdi bitir'),
              subtitle: const Text('O anki skorla kazanan ve MVP belirlenir, yeni tur hazırlanır'),
              onTap: () => Navigator.pop(c, 'end'),
            ),
          ListTile(
            leading: const Icon(Icons.power_settings_new, color: Colors.redAccent),
            title: const Text('PK modunu kapat'),
            subtitle: Text(active ? 'Süren tur sonuçsuz kapanır, koltuklar normale döner' : 'Koltuklar normale döner'),
            onTap: () => Navigator.pop(c, 'cancel'),
          ),
        ]),
      ),
    );
    if (a == null || !mounted) return;
    await guard(context, () => Api.post('/api/room-pk/${widget.pk['id']}/end', {'cancel': a == 'cancel'}));
  }

  Widget _supporters(List<dynamic> list, Color color, bool left) {
    final items = [for (final x in list.take(3)) mapOf(mapOf(x)?['user'])];
    final children = [
      for (var i = 0; i < 3; i++)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 1.5),
          child: Container(
            padding: const EdgeInsets.all(1.2),
            decoration: BoxDecoration(shape: BoxShape.circle, color: i == 0 ? const Color(0xFFFFD54F) : color.withValues(alpha: 0.75)),
            child: i < items.length && items[i] != null
                ? UserAvatar(user: items[i], radius: 9)
                : CircleAvatar(radius: 9, backgroundColor: Colors.black38, child: Text('${i + 1}', style: const TextStyle(fontSize: 9, color: Colors.white54))),
          ),
        ),
    ];
    return Row(mainAxisSize: MainAxisSize.min, children: left ? children : children.reversed.toList());
  }

  Widget _center(String status, bool urgent) {
    if (status == 'preparing') {
      if (!widget.canManage) {
        return _pill(const Text('Hazırlanıyor', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)), const [Color(0xFF3A2F5C), Color(0xFF231B3D)]);
      }
      return GestureDetector(
        onTap: _begin,
        child: AnimatedBuilder(
          animation: _fx,
          builder: (_, child) => Transform.scale(scale: 1 + 0.06 * math.sin(_fx.value * 2 * math.pi), child: child),
          child: Container(
            height: 30,
            padding: const EdgeInsets.symmetric(horizontal: 22),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFFFE9A6), Color(0xFFF5B83D), Color(0xFFE08A12)]),
              border: Border.all(color: Colors.white, width: 1.2),
              boxShadow: const [BoxShadow(color: Color(0x99FFB300), blurRadius: 12)],
            ),
            child: _busy
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF5A3300)))
                : const Text('Başla', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF5A3300))),
          ),
        ),
      );
    }
    if (status == 'finished') {
      final w = widget.pk['winner']?.toString() ?? 'draw';
      return _pill(
        Text(w == 'draw' ? 'BERABERE' : (w == 'red' ? 'KIRMIZI KAZANDI' : 'MAVİ KAZANDI'), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.white)),
        w == 'draw' ? const [Color(0xFFFFB300), Color(0xFFE08A12)] : [pkTeamColor(w), Color.lerp(pkTeamColor(w), Colors.black, 0.4)!],
      );
    }
    return AnimatedBuilder(
      animation: _fx,
      builder: (_, __) {
        final beat = urgent ? (0.5 + 0.5 * math.sin(_fx.value * 2 * math.pi * 2)).abs() : 0.0;
        return Transform.scale(
          scale: 1 + 0.15 * beat,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(
              color: Color.lerp(const Color(0xE6140F26), Colors.red, beat),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withValues(alpha: 0.7), width: 1),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Text('VS ', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white)),
              Text(_clock(_left), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white)),
            ]),
          ),
        );
      },
    );
  }

  Widget _pill(Widget child, List<Color> colors) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), gradient: LinearGradient(colors: colors), border: Border.all(color: Colors.white54)),
        child: child,
      );

  @override
  Widget build(BuildContext context) {
    final pk = widget.pk;
    final status = pk['status']?.toString() ?? '';
    final red = mapOf(pk['red']) ?? {};
    final blue = mapOf(pk['blue']) ?? {};
    final sr = BigInt.tryParse('${red['score']}') ?? BigInt.zero;
    final sb = BigInt.tryParse('${blue['score']}') ?? BigInt.zero;
    final total = sr + sb;
    final ratio = total == BigInt.zero ? 0.5 : (sr.toDouble() / total.toDouble()).clamp(0.08, 0.92);
    final preparing = status == 'preparing';
    const labelStyle = TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Colors.white, shadows: [Shadow(color: Colors.black54, blurRadius: 3)]);
    return SizedBox(
      height: RoomPkPanel.height,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Column(children: [
          SizedBox(
            height: 32,
            child: Stack(alignment: Alignment.center, children: [
              // Skor çizgisi; skorlar (ya da "Hazırlanıyor") çizginin içinde.
              Positioned(
                left: 0,
                right: 0,
                height: 18,
                child: RepaintBoundary(
                  child: LayoutBuilder(
                    builder: (context, box) => TweenAnimationBuilder<double>(
                      tween: Tween(end: ratio),
                      duration: const Duration(milliseconds: 700),
                      curve: Curves.easeOutCubic,
                      builder: (_, r, __) => AnimatedBuilder(
                        animation: _fx,
                        builder: (_, __) => CustomPaint(size: Size(box.maxWidth, 18), painter: PkBarPainter(ratio: r, t: _fx.value)),
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 8,
                child: preparing ? const Text('Hazırlanıyor', style: labelStyle) : Text(fmtNumber(sr.toString()), style: labelStyle),
              ),
              Positioned(
                right: 8,
                child: preparing ? const Text('Hazırlanıyor', style: labelStyle) : Text(fmtNumber(sb.toString()), style: labelStyle),
              ),
              _center(status, _left <= 10 && status == 'active'),
            ]),
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 24,
            child: Row(children: [
              _supporters(listOf(red['supporters']), kPkRed, true),
              Expanded(
                child: Center(
                child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: const LinearGradient(colors: [Color(0xCC8E0E2C), Color(0xCC0B2C7A)]),
                  border: Border.all(color: Colors.white38),
                ),
                child: Text(
                  pk['mode'] == 'partisan' ? (pk['ownerTeam'] == 'blue' ? 'Takım Savaşı · sahip Mavi' : 'Takım Savaşı · sahip Kırmızı') : 'Takım Savaşı',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Colors.white),
                ),
                ),
                ),
              ),
              _supporters(listOf(blue['supporters']), kPkBlue, false),
              if (widget.canManage)
                InkResponse(
                  onTap: _manage,
                  radius: 16,
                  child: Container(
                    margin: const EdgeInsets.only(left: 6),
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black45, border: Border.all(color: Colors.white38)),
                    child: const Icon(Icons.close, size: 14, color: Colors.white),
                  ),
                ),
            ]),
          ),
        ]),
      ),
    );
  }
}

// ------------------------------------------------------------------ 3-2-1 geri sayım

/// "Başla"ya basılınca: büyük 3 → 2 → 1 (her biri çarparak gelir, halka dolar), ardından VS çarpışma animasyonu.
/// [stillVisible]: geri sayım bitince oda hâlâ ekrandaysa VS oynar (çıkıldıysa / küçültüldüyse oynamaz).
Future<void> showRoomPkCountdown(BuildContext context, {String left = 'KIRMIZI', String right = 'MAVİ', bool Function()? stillVisible}) async {
  final overlay = Overlay.maybeOf(context);
  if (overlay == null) return;
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _PkCountdownFx(onDone: () {
      entry
        ..remove()
        ..dispose();
      if (overlay.mounted && (stillVisible?.call() ?? true)) _insertStart(overlay, left, right);
    }),
  );
  overlay.insert(entry);
}

class _PkCountdownFx extends StatefulWidget {
  final VoidCallback onDone;
  const _PkCountdownFx({required this.onDone});

  @override
  State<_PkCountdownFx> createState() => _PkCountdownFxState();
}

class _PkCountdownFxState extends State<_PkCountdownFx> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 3000))
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
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) {
          final t = _c.value * 3;
          final n = math.max(1, 3 - t.floor());
          final p = t - t.floor();
          final scale = 1.9 - 0.9 * Curves.easeOutBack.transform((p / 0.35).clamp(0.0, 1.0));
          final fade = p < 0.75 ? 1.0 : 1 - (p - 0.75) / 0.25;
          final color = n == 3 ? kPkRed : (n == 2 ? const Color(0xFFB0127A) : kPkBlue);
          final bg = _c.value < 0.9 ? 0.35 : 0.35 * (1 - (_c.value - 0.9) / 0.1);
          return ColoredBox(
            color: Colors.black.withValues(alpha: bg.clamp(0.0, 1.0)),
            child: Center(
              child: SizedBox(
                width: 170,
                height: 170,
                child: Stack(alignment: Alignment.center, children: [
                  CustomPaint(size: const Size(170, 170), painter: _CountRingPainter(progress: p, color: color)),
                  Opacity(
                    opacity: fade.clamp(0.0, 1.0),
                    child: Transform.scale(
                      scale: scale,
                      child: Text('$n',
                          style: TextStyle(fontSize: 96, height: 1, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: Colors.white, shadows: [
                            Shadow(color: color, blurRadius: 24),
                            const Shadow(color: Color(0xFFFFD54F), blurRadius: 8),
                          ])),
                    ),
                  ),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CountRingPainter extends CustomPainter {
  final double progress;
  final Color color;
  _CountRingPainter({required this.progress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2 - 8;
    canvas.drawCircle(c, r, Paint()..style = PaintingStyle.stroke..strokeWidth = 5..color = Colors.white.withValues(alpha: 0.15));
    canvas.drawArc(
      Rect.fromCircle(center: c, radius: r),
      -math.pi / 2,
      2 * math.pi * progress,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6
        ..strokeCap = StrokeCap.round
        ..color = color
        ..maskFilter = const MaskFilter.blur(BlurStyle.solid, 3),
    );
  }

  @override
  bool shouldRepaint(_CountRingPainter old) => old.progress != progress || old.color != color;
}

// ------------------------------------------------------------------ Kaybeden takımın ağlayan emojisi

/// Mikrofonda oynayan ağlayan yüz (kodla çizilir; gülen emoji ile aynı tarz): sallanır, gözlerinden yaş akar.
class PkCryEmoji extends StatefulWidget {
  const PkCryEmoji({super.key});

  @override
  State<PkCryEmoji> createState() => _PkCryEmojiState();
}

class _PkCryEmojiState extends State<PkCryEmoji> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(child: RepaintBoundary(child: CustomPaint(painter: _CryPainter(_c), size: Size.infinite)));
  }
}

class _CryPainter extends CustomPainter {
  final Animation<double> anim;
  _CryPainter(this.anim) : super(repaint: anim);

  @override
  void paint(Canvas canvas, Size size) {
    final t = anim.value;
    final s = math.min(size.width, size.height);
    final c = size.center(Offset.zero);
    final r = s * 0.40;
    canvas.save();
    canvas.translate(c.dx, c.dy + s * 0.015 * math.sin(t * 4 * math.pi));
    canvas.rotate(0.07 * math.sin(t * 2 * math.pi));
    // Yüz
    final face = Rect.fromCircle(center: Offset.zero, radius: r);
    canvas.drawCircle(
      Offset.zero,
      r,
      Paint()
        ..shader = const RadialGradient(center: Alignment(-0.35, -0.45), radius: 1.0, colors: [Color(0xFFFFF4A8), Color(0xFFFFD43B), Color(0xFFF2A007)], stops: [0, 0.55, 1])
            .createShader(face),
    );
    // Yanaklar
    final blush = Paint()
      ..color = const Color(0xFFFF7A59).withValues(alpha: 0.45)
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * 0.08);
    canvas.drawOval(Rect.fromCenter(center: Offset(-r * 0.55, r * 0.18), width: r * 0.42, height: r * 0.24), blush);
    canvas.drawOval(Rect.fromCenter(center: Offset(r * 0.55, r * 0.18), width: r * 0.42, height: r * 0.24), blush);
    // Kapalı, aşağı bakan gözler ve üzgün kaşlar.
    final line = Paint()
      ..color = const Color(0xFF5A3A12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.09
      ..strokeCap = StrokeCap.round;
    for (final side in [-1.0, 1.0]) {
      final ex = side * r * 0.38;
      canvas.drawArc(Rect.fromCenter(center: Offset(ex, -r * 0.12), width: r * 0.42, height: r * 0.30), math.pi * 1.1, math.pi * 0.8, false, line);
      canvas.drawLine(Offset(ex - side * r * 0.20, -r * 0.42), Offset(ex + side * r * 0.12, -r * 0.52), line);
    }
    // Ağlayan açık ağız.
    final open = 0.85 + 0.15 * math.sin(t * 6 * math.pi);
    final mouth = Rect.fromCenter(center: Offset(0, r * 0.42), width: r * 0.62, height: r * 0.42 * open);
    canvas.drawOval(mouth, Paint()..color = const Color(0xFF7A1E1E));
    canvas.save();
    canvas.clipPath(Path()..addOval(mouth));
    canvas.drawOval(Rect.fromCenter(center: Offset(0, mouth.bottom), width: r * 0.42, height: r * 0.30), Paint()..color = const Color(0xFFFF6F7D));
    canvas.restore();
    // Gözyaşı dereleri ve damlalar.
    final tear = Paint()
      ..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xEE7FD3FF), Color(0xCC2D9CFF)])
          .createShader(Rect.fromLTWH(-r, -r * 0.1, r * 2, r * 1.3));
    for (final side in [-1.0, 1.0]) {
      final x = side * r * 0.42;
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x - r * 0.07, -r * 0.05, r * 0.14, r * 0.95), Radius.circular(r * 0.07)), tear);
      for (var k = 0; k < 2; k++) {
        final p = (t + k * 0.5 + (side > 0 ? 0.25 : 0)) % 1.0;
        final y = r * 0.85 + p * r * 0.55;
        canvas.drawCircle(Offset(x + side * p * r * 0.12, y), r * 0.075 * (1 - p * 0.4), Paint()..color = const Color(0xFF52B6FF).withValues(alpha: 1 - p));
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_CryPainter old) => old.anim != anim;
}
