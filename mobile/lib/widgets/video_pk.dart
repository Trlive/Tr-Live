import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart' as lk;

import '../services/api.dart';
import 'common.dart';
import 'room_pk.dart';

/// Görüntülü PK (Bigo tarzı): iki tekli yayın yan yana. Solda bizim yayıncı, sağda rakip yayıncı (rakip odaya görünmez,
/// yalnızca izleme bağlantısıyla). Altında sayarak artan skorlar, kayan skor çizgisi, geri sayım, iki tarafın en çok
/// destekleyenleri; bitince yarıların üstüne KAZANDI / KAYBETTİ / BERABERE damgası.
class VideoPkStage extends StatefulWidget {
  final Map<String, dynamic> pk;
  final String roomId;
  /// Bizim yayıncının görüntüsü (oda ekranındaki LiveKit bağlantısından).
  final Widget? hostVideo;
  final bool canManage;
  /// Oda sesi kapalı / telefon araması: rakibin sesi de kapanır. paused: oda küçültüldü / arka planda.
  final bool muted;
  final bool paused;
  const VideoPkStage({super.key, required this.pk, required this.roomId, this.hostVideo, this.canManage = false, this.muted = false, this.paused = false});

  @override
  State<VideoPkStage> createState() => _VideoPkStageState();
}

class _VideoPkStageState extends State<VideoPkStage> with SingleTickerProviderStateMixin {
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
      setState(() => _left = math.max(0, base - DateTime.now().difference(_stamp).inSeconds));
    });
  }

  void _sync() {
    _left = (widget.pk['remainingSeconds'] as num?)?.toInt() ?? 0;
    _stamp = DateTime.now();
  }

  @override
  void didUpdateWidget(covariant VideoPkStage old) {
    super.didUpdateWidget(old);
    if (old.pk['remainingSeconds'] != widget.pk['remainingSeconds'] || old.pk['status'] != widget.pk['status']) _sync();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _fx.dispose();
    super.dispose();
  }

  Future<void> _end() async {
    final ok = await confirm(context, 'PK şimdi bitirilsin mi? O anki skorla kazanan belirlenir.', action: 'Bitir', destructive: true);
    if (!ok || !mounted) return;
    await guard(context, () => Api.post('/api/pk/${widget.pk['id']}/cancel'));
  }

  String _clock(int s) => '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';

  /// Micolive gibi en çok destekleyen 3 kişinin "koltuğu": doluysa fotoğraf, boşsa koltuk simgesi; köşede sıra numarası
  /// (1. altın). Solda 3-2-1 (1. ortaya yakın), sağda 1-2-3.
  Widget _seats(List<dynamic> list, Color color, {required bool left}) {
    final users = [for (final x in list.take(3)) mapOf(mapOf(x)?['user'])];
    Widget seat(int rank) {
      final user = rank <= users.length ? users[rank - 1] : null;
      const d = 28.0;
      final ring = rank == 1 ? const [Color(0xFFFFE082), Color(0xFFFF8F00)] : [color, Color.lerp(color, Colors.black, 0.35)!];
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: SizedBox(
          width: d + 4,
          height: d + 4,
          child: Stack(clipBehavior: Clip.none, children: [
            Container(
              width: d + 4,
              height: d + 4,
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: ring)),
              child: user != null
                  ? UserAvatar(user: user, radius: d / 2)
                  : DecoratedBox(
                      decoration: BoxDecoration(shape: BoxShape.circle, color: Color.lerp(color, Colors.black, 0.3)),
                      child: const Icon(Icons.event_seat, size: 15, color: Colors.white70),
                    ),
            ),
            Positioned(
              right: -3,
              bottom: -3,
              child: Container(
                width: 15,
                height: 15,
                alignment: Alignment.center,
                decoration: BoxDecoration(shape: BoxShape.circle, color: rank == 1 ? const Color(0xFFFFB300) : color, border: Border.all(color: Colors.white, width: 1)),
                child: Text('$rank', style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: Colors.white, height: 1)),
              ),
            ),
          ]),
        ),
      );
    }

    final order = left ? const [3, 2, 1] : const [1, 2, 3];
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: left ? Alignment.centerRight : Alignment.centerLeft,
      child: Row(mainAxisSize: MainAxisSize.min, children: [for (final r in order) seat(r)]),
    );
  }

  /// Takım puanı: renkli yıldız rozeti + sayarak artan puan (Micolive gibi).
  Widget _scoreTag(BigInt value, Color color, {required bool left}) {
    final star = Container(
      width: 18,
      height: 18,
      decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color.lerp(color, Colors.white, 0.25)!, color]), border: Border.all(color: Colors.white70, width: 1)),
      child: const Icon(Icons.star_rounded, size: 13, color: Colors.white),
    );
    final text = PkScoreText(value: value, color: color, alignLeft: left);
    return Row(mainAxisSize: MainAxisSize.min, children: left ? [star, const SizedBox(width: 4), text] : [text, const SizedBox(width: 4), star]);
  }

  @override
  Widget build(BuildContext context) {
    final pk = widget.pk;
    final a = mapOf(pk['a']) ?? {};
    final b = mapOf(pk['b']) ?? {};
    final mineIsA = a['roomId'] == widget.roomId;
    final me = mineIsA ? a : b;
    final them = mineIsA ? b : a;
    final sMe = BigInt.tryParse('${me['score']}') ?? BigInt.zero;
    final sThem = BigInt.tryParse('${them['score']}') ?? BigInt.zero;
    final total = sMe + sThem;
    final ratio = total == BigInt.zero ? 0.5 : (sMe.toDouble() / total.toDouble()).clamp(0.06, 0.94);
    final status = pk['status']?.toString();
    final finished = status == 'finished';
    final result = pk['result']?.toString(); // a | b | draw
    final myResult = !finished ? null : (result == 'draw' ? 'draw' : ((result == 'a') == mineIsA ? 'win' : 'lose'));
    final theirHost = mapOf(them['host']);
    final myHost = mapOf(me['host']);
    final urgent = status == 'active' && _left <= 10;

    return LayoutBuilder(builder: (context, box) {
      final w = box.maxWidth;
      final h = w * 0.66; // iki dikey yarım (3:4'e yakın)
      Widget half({required Widget child, required bool left, required Map<String, dynamic>? host, required BigInt score, String? stamp}) => Expanded(
            child: Container(
              height: h,
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: left ? kPkRed : kPkBlue, width: 2),
                  bottom: BorderSide(color: left ? kPkRed : kPkBlue, width: 2),
                ),
              ),
              child: Stack(fit: StackFit.expand, children: [
                ColoredBox(color: Colors.black, child: child),
                // Micolive gibi: tarafın puanı (yıldız rozetiyle) ve altında yayıncının adı.
                Positioned(
                  left: 6,
                  right: 6,
                  bottom: 6,
                  child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: left ? CrossAxisAlignment.start : CrossAxisAlignment.end, children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: Colors.black38, borderRadius: BorderRadius.circular(12)),
                      child: FittedBox(fit: BoxFit.scaleDown, child: _scoreTag(score, left ? kPkRed : kPkBlue, left: left)),
                    ),
                    const SizedBox(height: 4),
                    Row(mainAxisAlignment: left ? MainAxisAlignment.start : MainAxisAlignment.end, children: [
                      Flexible(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(color: (left ? kPkRed : kPkBlue).withValues(alpha: 0.8), borderRadius: BorderRadius.circular(10)),
                          child: Text((host?['displayName'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
                        ),
                      ),
                    ]),
                  ]),
                ),
                if (stamp != null) Center(child: _ResultStamp(kind: stamp)),
              ]),
            ),
          );
      return Column(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(
          height: h,
          child: Stack(children: [
            Row(children: [
              half(
                left: true,
                host: myHost,
                score: sMe,
                stamp: myResult,
                child: widget.hostVideo ?? Center(child: UserAvatar(user: myHost, radius: 34)),
              ),
              const SizedBox(width: 2),
              half(
                left: false,
                host: theirHost,
                score: sThem,
                stamp: myResult == null ? null : (myResult == 'draw' ? 'draw' : (myResult == 'win' ? 'lose' : 'win')),
                // Yalnızca PK sürerken bağlanılır; bittiğinde (sonuç ekranı) yalnızca profil fotoğrafı.
                child: status == 'active'
                    ? PkPeerVideo(
                        key: ValueKey('peer-${pk['id']}'),
                        pkId: pk['id'].toString(),
                        roomId: widget.roomId,
                        hostId: theirHost?['id']?.toString(),
                        fallback: theirHost,
                        muted: widget.muted,
                        paused: widget.paused,
                      )
                    : Center(child: UserAvatar(user: theirHost, radius: 34)),
              ),
            ]),
            // Üstte ortada Micolive gibi "PK 02:13" hapı (hareketli PK logosu + geri sayım; son 10 sn yanıp söner).
            Align(
              alignment: Alignment.topCenter,
              child: AnimatedBuilder(
                animation: _fx,
                builder: (_, __) {
                  final beat = urgent ? (0.5 + 0.5 * math.sin(_fx.value * 4 * math.pi)).abs() : 0.0;
                  return Transform.scale(
                    scale: 1 + 0.12 * beat,
                    child: Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.fromLTRB(6, 2, 12, 2),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        gradient: LinearGradient(colors: [Color.lerp(const Color(0xFF3A0D4F), Colors.red, beat)!, Color.lerp(const Color(0xFF0D1E5C), Colors.red, beat)!]),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.55), width: 1),
                        boxShadow: const [BoxShadow(color: Color(0x66FF2D95), blurRadius: 10, offset: Offset(-3, 0)), BoxShadow(color: Color(0x662F80FF), blurRadius: 10, offset: Offset(3, 0))],
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const PkLogo(size: 30, animated: true),
                        const SizedBox(width: 4),
                        Text(finished ? 'BİTTİ' : _clock(_left), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 0.5)),
                      ]),
                    ),
                  );
                },
              ),
            ),
            if (widget.canManage && status == 'active')
              Positioned(
                right: 4,
                top: 4,
                child: InkResponse(
                  onTap: _end,
                  radius: 18,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(color: Colors.black45, shape: BoxShape.circle),
                    child: const Icon(Icons.close, size: 16, color: Colors.white),
                  ),
                ),
              ),
          ]),
        ),
        // Micolive gibi: ince pembe | mavi oran çizgisi (birleşimde parlayan kıvılcım), altında iki tarafın puanı ve
        // en çok destekleyen 3 kişinin koltukları.
        RepaintBoundary(
          child: SizedBox(
            height: 8,
            child: LayoutBuilder(
              builder: (context, bx) => TweenAnimationBuilder<double>(
                tween: Tween(end: ratio),
                duration: const Duration(milliseconds: 700),
                curve: Curves.easeOutCubic,
                builder: (_, r, __) => AnimatedBuilder(
                  animation: _fx,
                  builder: (_, __) => CustomPaint(size: Size(bx.maxWidth, 8), painter: PkBarPainter(ratio: r, t: _fx.value)),
                ),
              ),
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
          decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xE63A0A2E), Color(0xE614102A), Color(0xE60A1E5A)])),
          child: Row(children: [
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: w * 0.24),
              child: FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: _scoreTag(sMe, kPkRed, left: true)),
            ),
            Expanded(child: _seats(listOf(me['top']), kPkRed, left: true)),
            const SizedBox(width: 14),
            Expanded(child: _seats(listOf(them['top']), kPkBlue, left: false)),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: w * 0.24),
              child: FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerRight, child: _scoreTag(sThem, kPkBlue, left: false)),
            ),
          ]),
        ),
      ]);
    });
  }
}

/// KAZANDI / KAYBETTİ / BERABERE damgası: büyüyerek iner, hafif eğik.
class _ResultStamp extends StatelessWidget {
  final String kind; // win | lose | draw
  const _ResultStamp({required this.kind});

  @override
  Widget build(BuildContext context) {
    final (text, color) = switch (kind) {
      'win' => ('KAZANDI', const Color(0xFFFFD54F)),
      'lose' => ('KAYBETTİ', Colors.white70),
      _ => ('BERABERE', const Color(0xFF80D8FF)),
    };
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 2.4, end: 1),
      duration: const Duration(milliseconds: 650),
      curve: Curves.easeOutBack,
      builder: (_, s, child) => Transform.rotate(angle: -0.18, child: Transform.scale(scale: s, child: Opacity(opacity: (2.4 - s).clamp(0.0, 1.0), child: child))),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          border: Border.all(color: color, width: 3),
          borderRadius: BorderRadius.circular(10),
          color: Colors.black45,
          boxShadow: kind == 'win' ? [BoxShadow(color: color.withValues(alpha: 0.6), blurRadius: 16)] : null,
        ),
        child: Text(text, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color, letterSpacing: 1.5)),
      ),
    );
  }
}

/// Rakip yayıncının görüntüsü (ve sesi): rakip odaya görünmez, yalnızca izleyen ikinci bir bağlantı.
/// Yalnızca rakip yayıncının izlerine abone olur (rakip odadaki konukların görüntüsü inmez). [muted]: oda sesi kapalı /
/// telefon araması → rakibin sesi de kapanır. [paused]: oda küçültüldü / arka planda → görüntü indirilmez.
/// Bağlantı koparsa PK sürdükçe kendiliğinden yeniden bağlanır; olmazsa rakibin profil fotoğrafı görünür.
class PkPeerVideo extends StatefulWidget {
  final String pkId;
  final String roomId; // bizim oda (sunucu karşı odayı buna göre seçer)
  final String? hostId;
  final Map<String, dynamic>? fallback;
  final bool muted;
  final bool paused;
  const PkPeerVideo({super.key, required this.pkId, required this.roomId, this.hostId, this.fallback, this.muted = false, this.paused = false});

  @override
  State<PkPeerVideo> createState() => _PkPeerVideoState();
}

class _PkPeerVideoState extends State<PkPeerVideo> {
  lk.Room? _room;
  String? _hostId;
  bool _disposed = false;
  int _tries = 0;
  int _gen = 0; // her bağlantı denemesinin kimliği: eski deneme bitince yenisinin üstüne yazmaz
  Timer? _throttle;

  @override
  void initState() {
    super.initState();
    _connect();
  }

  @override
  void didUpdateWidget(covariant PkPeerVideo old) {
    super.didUpdateWidget(old);
    if (old.muted != widget.muted || old.paused != widget.paused) _apply();
  }

  Future<void> _connect() async {
    final gen = ++_gen;
    lk.Room? room;
    bool stale() => _disposed || gen != _gen;
    try {
      final t = await Api.post('/api/pk/${widget.pkId}/peer-token', {'roomId': widget.roomId});
      final url = t['url'] as String?;
      final token = t['token'] as String?;
      if (url == null || token == null || stale()) return;
      _hostId = t['hostId']?.toString() ?? widget.hostId;
      room = lk.Room(roomOptions: const lk.RoomOptions(adaptiveStream: true, dynacast: false));
      room.addListener(_changed);
      await room.connect(url, token, connectOptions: const lk.ConnectOptions(autoSubscribe: false));
      if (stale()) {
        room.removeListener(_changed);
        await room.disconnect();
        await room.dispose();
        return;
      }
      _tries = 0;
      setState(() => _room = room);
      _apply();
    } catch (_) {
      if (room != null) {
        room.removeListener(_changed);
        room.disconnect().whenComplete(() => room!.dispose()).catchError((_) {});
      }
      _retry(gen);
    }
  }

  void _retry(int gen) {
    if (_disposed || gen != _gen || _tries >= 4) return;
    _tries++;
    Future.delayed(Duration(seconds: 2 << _tries), () {
      if (!_disposed && gen == _gen && _room == null) _connect();
    });
  }

  /// Abonelik ve ses: yalnızca rakip yayıncı; duraklatılmışsa görüntü bırakılır, sessizse ses kapatılır.
  void _apply() {
    final room = _room;
    if (room == null) return;
    for (final p in room.remoteParticipants.values) {
      final host = _hostId == null || p.identity == _hostId;
      for (final pub in p.videoTrackPublications) {
        final want = host && !widget.paused;
        if (want && !pub.subscribed) pub.subscribe().catchError((_) {});
        if (!want && pub.subscribed) pub.unsubscribe().catchError((_) {});
      }
      for (final pub in p.audioTrackPublications) {
        if (host && !pub.subscribed) pub.subscribe().catchError((_) {});
        if (!host && pub.subscribed) pub.unsubscribe().catchError((_) {});
        try {
          pub.track?.mediaStreamTrack.enabled = !widget.muted;
        } catch (_) {/* iz henüz hazır değil */}
      }
    }
  }

  void _changed() {
    final room = _room;
    // Bağlantı kalıcı olarak koptu (ağ değişimi, sunucu yeniden başladı): kapatıp yeniden bağlan.
    if (room != null && room.connectionState == lk.ConnectionState.disconnected && !_disposed) {
      _close();
      _tries = 0;
      _connect();
      return;
    }
    _apply();
    // Sık gelen bildirimler (konuşma, bağlantı kalitesi) yüzünden ekran 200 ms'de bir yeterince tazelenir.
    if (_throttle?.isActive ?? false) return;
    _throttle = Timer(const Duration(milliseconds: 200), () {
      if (mounted) setState(() {});
    });
  }

  void _close() {
    final r = _room;
    _room = null;
    if (r != null) {
      r.removeListener(_changed);
      r.disconnect().whenComplete(() => r.dispose()).catchError((_) {});
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _gen++;
    _throttle?.cancel();
    _close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final room = _room;
    if (room != null && !widget.paused) {
      for (final p in room.remoteParticipants.values) {
        if (_hostId != null && p.identity != _hostId) continue;
        for (final pub in p.videoTrackPublications) {
          final track = pub.track;
          if (track != null && !pub.muted) return lk.VideoTrackRenderer(track as lk.VideoTrack, fit: lk.VideoViewFit.cover);
        }
      }
    }
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        UserAvatar(user: widget.fallback, radius: 34),
        const SizedBox(height: 8),
        Text(room == null ? 'Bağlanıyor...' : 'Kamera kapalı', style: const TextStyle(fontSize: 11, color: Colors.white60)),
      ]),
    );
  }
}
