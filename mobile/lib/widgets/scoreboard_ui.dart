import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/l10n.dart';
import '../services/api.dart';
import 'common.dart';

/// Sayı tahtası (Yoho gibi; uygulama renkleriyle): başlatma penceresi, süren sayım çubuğu, sonuç ve geçmiş.
const _bg = Color(0xFF0B0906);
const _card = Color(0xFF17130C);
const _gold = Color(0xFFF2B92A);
const _goldHi = Color(0xFFFFD54F);
const _line = Color(0xFF3A2F1A);

/// Seçilebilen süreler (dakika; 0 = elle kontrollü). Sunucudaki SCOREBOARD_DURATIONS ile aynı.
const kScoreboardMinutes = [0, 5, 10, 15, 30, 60];

String scoreboardModeText(int minutes) => minutes == 0 ? tx('Manuel Kontrollü') : tx('{n} dakika', {'n': minutes});

Widget _header(BuildContext context, String title, {List<Widget> leading = const []}) => Container(
      height: 58,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [Color(0xFF8A5A00), _gold, Color(0xFF8A5A00)]),
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      child: Row(children: [
        ...leading,
        Expanded(
          child: Text(title, textAlign: TextAlign.center, style: const TextStyle(color: _bg, fontSize: 18, fontWeight: FontWeight.w900)),
        ),
        IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close, color: _bg)),
      ]),
    );

/// Başlatma / durdurma penceresi. [session]: süren sayım (varsa "Durdur" gösterilir).
Future<void> showScoreboardSetup(BuildContext context, {required String roomId, Map<String, dynamic>? session}) {
  var minutes = 0;
  var seat = true;
  var room = false;
  var busy = false;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (c) => StatefulBuilder(
      builder: (c, setS) {
        Widget check(String label, bool on, VoidCallback tap) => InkWell(
              onTap: tap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: on ? _gold : Colors.transparent,
                      border: Border.all(color: on ? _gold : Colors.white38, width: 2),
                    ),
                    child: on ? const Icon(Icons.check, size: 16, color: _bg) : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text(label, style: TextStyle(fontSize: 15, color: on ? Colors.white : Colors.white60))),
                ]),
              ),
            );
        final active = session != null;
        return Container(
          decoration: const BoxDecoration(color: _bg, borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
          child: SafeArea(
            top: false,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _header(c, tx('Sayı tahtası'), leading: [
                IconButton(onPressed: () => _rules(c), icon: const Icon(Icons.help_outline, color: _bg)),
                IconButton(onPressed: () => showScoreboardHistory(c, roomId: roomId), icon: const Icon(Icons.history, color: _bg)),
              ]),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 8),
                child: active
                    ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(tx('Sayım sürüyor'), style: const TextStyle(color: _goldHi, fontSize: 16, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 6),
                        Text(tx('Durdurunca sıralama herkese gösterilir ve geçmişe kaydedilir.'), style: const TextStyle(color: Colors.white70, height: 1.35)),
                      ])
                    : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(tx('Süre'), style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          for (final m in kScoreboardMinutes)
                            ChoiceChip(
                              label: Text(scoreboardModeText(m)),
                              selected: minutes == m,
                              onSelected: (_) => setS(() => minutes = m),
                              selectedColor: _gold,
                              backgroundColor: _card,
                              side: BorderSide(color: minutes == m ? _gold : _line),
                              labelStyle: TextStyle(color: minutes == m ? _bg : Colors.white, fontWeight: FontWeight.w700),
                              showCheckmark: false,
                            ),
                        ]),
                        const SizedBox(height: 18),
                        Text(tx('Kuralları Sıfırla'), style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        check(tx('Kullanıcı Koltuktan Ayrıldığında'), seat, () => setS(() => seat = !seat)),
                        check(tx('Kullanıcı Odadan Ayrıldığında'), room, () => setS(() => room = !room)),
                      ]),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
                child: SizedBox(
                  height: 52,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(26),
                      gradient: LinearGradient(colors: active ? const [Color(0xFFB91C1C), Color(0xFFEF4444)] : const [_gold, _goldHi]),
                    ),
                    child: TextButton(
                      onPressed: busy
                          ? null
                          : () async {
                              if (active && !await confirmScoreboardStop(c)) return;
                              setS(() => busy = true);
                              final r = await guard(
                                c,
                                () => active
                                    ? Api.post('/api/rooms/$roomId/scoreboard/stop')
                                    : Api.post('/api/rooms/$roomId/scoreboard/start', {'minutes': minutes, 'resetOnSeatLeave': seat, 'resetOnRoomLeave': room}),
                              );
                              if (!c.mounted) return;
                              setS(() => busy = false);
                              if (r != null) Navigator.pop(c);
                            },
                      child: Text(
                        active ? tx('Durdur') : tx('Başlat'),
                        style: TextStyle(color: active ? Colors.white : _bg, fontSize: 18, fontWeight: FontWeight.w900),
                      ),
                    ),
                  ),
                ),
              ),
            ]),
          ),
        );
      },
    ),
  );
}

void _rules(BuildContext context) => showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: _card,
        title: Text(tx('Sayı tahtası'), style: const TextStyle(color: _goldHi)),
        content: Text(
          tx('Sayım başlayınca koltuktakilere gelen hediyeler puan olarak sayılır (puan = alınan Elmas). Süre seçilirse süre dolunca, '
              'elle kontrolde yönetici durdurunca biter; sıralama herkese gösterilir. Sıfırlama kuralı seçiliyse koltuktan inen / '
              'odadan çıkan kişinin puanı sıfırlanır.'),
          style: const TextStyle(color: Colors.white70, height: 1.4),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: Text(tx('Tamam'), style: const TextStyle(color: _gold)))],
      ),
    );

/// "Sayımı durdurmayı onaylıyor musunuz?"
Future<bool> confirmScoreboardStop(BuildContext context) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => Dialog(
      backgroundColor: _card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: const BorderSide(color: _line)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(tx('İpuçları'), style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Text(tx('Sayımı durdurmayı onaylıyor musunuz?'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 15)),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.white24), shape: const StadiumBorder(), minimumSize: const Size(0, 46)),
                onPressed: () => Navigator.pop(c, false),
                child: Text(tx('İptal'), style: const TextStyle(color: Colors.white70)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: _gold, shape: const StadiumBorder(), minimumSize: const Size(0, 46)),
                onPressed: () => Navigator.pop(c, true),
                child: Text(tx('Onayla'), style: const TextStyle(color: _bg, fontWeight: FontWeight.w900)),
              ),
            ),
          ]),
        ]),
      ),
    ),
  );
  return r == true;
}

/// Süren sayım çubuğu: elle kontrolde geçen süre, süreli sayımda kalan süre. Yöneticide ✕ ile durdurulur.
class ScoreboardPill extends StatefulWidget {
  final Map<String, dynamic> session;
  final bool canStop;
  final VoidCallback onStop;
  final VoidCallback? onTap;
  const ScoreboardPill({super.key, required this.session, required this.canStop, required this.onStop, this.onTap});

  @override
  State<ScoreboardPill> createState() => _ScoreboardPillState();
}

class _ScoreboardPillState extends State<ScoreboardPill> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  String _fmt(Duration d) {
    if (d.isNegative) d = Duration.zero;
    final h = d.inHours, m = d.inMinutes % 60, s = d.inSeconds % 60;
    String two(int v) => v.toString().padLeft(2, '0');
    return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
  }

  @override
  Widget build(BuildContext context) {
    final start = DateTime.tryParse('${widget.session['startedAt']}')?.toLocal() ?? DateTime.now();
    final end = DateTime.tryParse('${widget.session['endsAt'] ?? ''}')?.toLocal();
    final now = DateTime.now();
    final text = end == null ? tx('devam ediyor: {t}', {'t': _fmt(now.difference(start))}) : tx('kalan: {t}', {'t': _fmt(end.difference(now))});
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: const LinearGradient(colors: [Color(0xFF2A1F08), _bg]),
            border: Border.all(color: _gold, width: 1.5),
            boxShadow: [BoxShadow(color: _gold.withValues(alpha: 0.35), blurRadius: 10)],
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.leaderboard_rounded, size: 16, color: _goldHi),
            const SizedBox(width: 6),
            Text(text, style: const TextStyle(color: _goldHi, fontWeight: FontWeight.w800, fontSize: 14, fontFeatures: [FontFeature.tabularFigures()])),
            if (widget.canStop) ...[
              const SizedBox(width: 4),
              InkResponse(
                radius: 16,
                onTap: widget.onStop,
                child: const Padding(padding: EdgeInsets.all(4), child: Icon(Icons.close, size: 18, color: Colors.white)),
              ),
            ] else
              const SizedBox(width: 8),
          ]),
        ),
      ),
    );
  }
}

/// Sonuç: birincinin taçlı büyük fotoğrafı ve puanı, altında sıralama.
Future<void> showScoreboardResult(BuildContext context, Map<String, dynamic> session) {
  final results = listOf(session['results']);
  final first = results.isEmpty ? null : results.first;
  return showDialog<void>(
    context: context,
    builder: (c) => Dialog(
      backgroundColor: _bg,
      insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 60),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: const BorderSide(color: _gold, width: 1.2)),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.7),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 8, 18),
            decoration: const BoxDecoration(
              gradient: RadialGradient(center: Alignment.topCenter, radius: 1.3, colors: [Color(0xFF6B4A06), Color(0xFF2A1F08), _bg]),
            ),
            child: Column(children: [
              Align(alignment: Alignment.topRight, child: IconButton(onPressed: () => Navigator.pop(c), icon: const Icon(Icons.close, color: Colors.white))),
              if (first == null) ...[
                const Icon(Icons.emoji_events_outlined, size: 64, color: Colors.white38),
                const SizedBox(height: 8),
                Text(tx('Bu sayımda puan alan olmadı.'), style: const TextStyle(color: Colors.white70)),
              ] else ...[
                Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [_goldHi, _gold, Color(0xFF8A5A00)])),
                    child: UserAvatar(user: mapOf(first['user']), radius: 46),
                  ),
                  const Positioned(top: -26, child: Text('👑', style: TextStyle(fontSize: 34))),
                ]),
                const SizedBox(height: 8),
                UserName(user: mapOf(first['user']), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), gradient: const LinearGradient(colors: [_gold, _goldHi])),
                  child: Text(fmtNumber(first['score']), style: const TextStyle(color: _bg, fontWeight: FontWeight.w900, fontSize: 18)),
                ),
              ],
            ]),
          ),
          if (results.length > 1)
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 14),
                itemCount: results.length - 1,
                separatorBuilder: (_, __) => const Divider(height: 1, color: _line),
                itemBuilder: (_, i) {
                  final r = results[i + 1];
                  return ListTile(
                    dense: true,
                    leading: SizedBox(
                      width: 72,
                      child: Row(children: [
                        SizedBox(width: 22, child: Text('${r['rank']}', style: const TextStyle(color: _goldHi, fontWeight: FontWeight.w900))),
                        UserAvatar(user: mapOf(r['user']), radius: 18),
                      ]),
                    ),
                    title: UserName(user: mapOf(r['user']), style: const TextStyle(color: Colors.white)),
                    trailing: Text(fmtNumber(r['score']), style: const TextStyle(color: _gold, fontWeight: FontWeight.w800)),
                  );
                },
              ),
            ),
        ]),
      ),
    ),
  );
}

/// Geçmiş sayımlar: tarih, süre, birinci ve puanı; dokununca sonucu açılır.
Future<void> showScoreboardHistory(BuildContext context, {required String roomId}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (c) => Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.7),
      decoration: const BoxDecoration(color: _bg, borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _header(c, tx('Sayım geçmişi')),
        Flexible(
          child: FutureBuilder<Map<String, dynamic>>(
            future: Api.get('/api/rooms/$roomId/scoreboard/history'),
            builder: (_, snap) {
              if (snap.hasError) return Padding(padding: const EdgeInsets.all(24), child: Text(errorText(snap.error!), style: const TextStyle(color: Colors.white70)));
              if (!snap.hasData) return const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator(color: _gold)));
              final list = listOf(snap.data!['sessions']);
              if (list.isEmpty) return Padding(padding: const EdgeInsets.all(32), child: Text(tx('Henüz sayım yapılmadı.'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60)));
              return ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
                itemCount: list.length,
                separatorBuilder: (_, __) => const Divider(height: 1, color: _line),
                itemBuilder: (_, i) {
                  final s = list[i];
                  final res = listOf(s['results']);
                  final top = res.isEmpty ? null : res.first;
                  final at = DateTime.tryParse('${s['startedAt']}')?.toLocal();
                  return ListTile(
                    onTap: () => showScoreboardResult(c, s),
                    leading: top == null ? const CircleAvatar(backgroundColor: _card, child: Icon(Icons.emoji_events_outlined, color: Colors.white38)) : UserAvatar(user: mapOf(top['user']), radius: 20),
                    title: top == null
                        ? Text(tx('Puan alan yok'), style: const TextStyle(color: Colors.white60))
                        : UserName(user: mapOf(top['user']), style: const TextStyle(color: Colors.white)),
                    subtitle: Text(
                      at == null ? '' : '${at.day.toString().padLeft(2, '0')}.${at.month.toString().padLeft(2, '0')} ${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')} · ${tx('{n} kişi', {'n': res.length})}',
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                    trailing: top == null ? null : Text(fmtNumber(top['score']), style: const TextStyle(color: _gold, fontWeight: FontWeight.w800)),
                  );
                },
              );
            },
          ),
        ),
      ]),
    ),
  );
}
