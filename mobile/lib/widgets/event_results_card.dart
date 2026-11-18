import 'package:flutter/material.dart';
import '../l10n/l10n.dart';

import '../screens/event_screen.dart';
import '../screens/user_screens.dart';
import '../services/api.dart';
import 'app_theme.dart';
import 'common.dart';
import 'net_image.dart';

/// "Etkinlik Promosyonu" kanalındaki haftalık sonuç duyurusu: hangi etkinlikse onun görseli (Çift / Kral & Kraliçe /
/// Yıldızlar), etkinliğin renkleri, her bölüm için kürsü (2. · 1. · 3.; çiftte iki fotoğraf, yıldızda hediye simgesi).
/// Fotoğrafa dokununca profil, karta / düğmeye dokununca etkinlik sayfası açılır.
class EventResultsCard extends StatelessWidget {
  final Map<String, dynamic> meta;
  const EventResultsCard({super.key, required this.meta});

  EventGroup get _group => switch (meta['group']) {
        'couple' => EventGroup.couple,
        'star' => EventGroup.star,
        _ => EventGroup.royal,
      };

  static const _medal = {1: Color(0xFFFFD54F), 2: Color(0xFFD9DEE8), 3: Color(0xFFE59A5C)};

  String _weekLabel() {
    final s = DateTime.tryParse('${meta['weekStart'] ?? ''}')?.toLocal();
    if (s == null) return '';
    final e = s.add(const Duration(days: 6));
    String d(DateTime x) => '${x.day.toString().padLeft(2, '0')}.${x.month.toString().padLeft(2, '0')}';
    return '${d(s)} – ${d(e)}.${e.year}';
  }

  void _openEvent(BuildContext context, [String? kind]) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => EventScreen(group: _group, initialKind: kind)));
  }

  void _openUser(BuildContext context, Map<String, dynamic>? u) {
    final id = u?['id']?.toString();
    if (id == null || u?['isHidden'] == true) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: id)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = EventTheme.of(_group);
    final sections = [for (final s in (meta['sections'] is List ? meta['sections'] as List : const [])) if (s is Map) Map<String, dynamic>.from(s)];
    final week = _weekLabel();
    return GestureDetector(
      onTap: () => _openEvent(context, sections.isNotEmpty ? sections.first['kind']?.toString() : null),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(colors: kGoldLight),
          boxShadow: [BoxShadow(color: theme.accent.withValues(alpha: 0.35), blurRadius: 18, offset: const Offset(0, 4))],
        ),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [theme.colors[0], theme.background]),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _header(theme, week),
            for (final s in sections) _section(context, theme, s),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Container(
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(22),
                  gradient: LinearGradient(colors: [theme.colors[1], theme.colors[2]]),
                  boxShadow: [BoxShadow(color: theme.colors[2].withValues(alpha: 0.4), blurRadius: 10)],
                ),
                child: Text('${theme.emoji}  Bu haftanın sıralamasına git',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15, shadows: [Shadow(color: Colors.black45, blurRadius: 3)])),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  /// Etkinliğin kendi görseli (750×250), üstünde "SONUÇLAR" etiketi, başlık ve hafta.
  Widget _header(EventTheme theme, String week) {
    return Stack(children: [
      AspectRatio(aspectRatio: 3, child: Image.asset(theme.asset, fit: BoxFit.cover)),
      Positioned.fill(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, theme.colors[0].withValues(alpha: 0.15), theme.colors[0]],
              stops: const [0, 0.45, 1],
            ),
          ),
        ),
      ),
      Positioned(
        left: 12,
        top: 10,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFFFFE9A3), Color(0xFFE6B13A)]),
            borderRadius: BorderRadius.circular(12),
            boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 6)],
          ),
          child: const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.emoji_events_rounded, size: 15, color: Pal.onBright),
            SizedBox(width: 3),
            Text('SONUÇLAR', style: TextStyle(color: Pal.onBright, fontWeight: FontWeight.w900, fontSize: 12, letterSpacing: 1)),
          ]),
        ),
      ),
      Positioned(
        left: 14,
        right: 14,
        bottom: 8,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(theme.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 19, shadows: [Shadow(color: Colors.black87, blurRadius: 6)])),
          if (week.isNotEmpty)
            Text('Geçen hafta · $week', style: TextStyle(color: theme.accent, fontWeight: FontWeight.w700, fontSize: 12, shadows: const [Shadow(color: Colors.black87, blurRadius: 4)])),
        ]),
      ),
    ]);
  }

  /// Bir etkinlik bölümü: başlık şeridi (hediye simgesi / emoji + ad + "İLK 3") ve kürsü.
  Widget _section(BuildContext context, EventTheme theme, Map<String, dynamic> s) {
    final entries = [for (final e in (s['entries'] is List ? s['entries'] as List : const [])) if (e is Map) Map<String, dynamic>.from(e)];
    Map<String, dynamic>? at(int rank) {
      for (final e in entries) {
        if ((e['rank'] as num?)?.toInt() == rank) return e;
      }
      return null;
    }

    final icon = Api.absoluteUrl(s['giftIcon'] as String?);
    final kind = s['kind']?.toString();
    final emoji = kind == 'king' ? '🤴' : kind == 'queen' ? '👸' : kind == 'couple' ? '💞' : '⭐';
    return GestureDetector(
      onTap: () => _openEvent(context, kind),
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 10, 12, 4),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black.withValues(alpha: 0.18), Colors.black.withValues(alpha: 0.45)]),
          border: Border.all(color: theme.accent.withValues(alpha: 0.45)),
        ),
        child: Column(children: [
          // Başlık şeridi.
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [theme.accent.withValues(alpha: 0.0), theme.accent.withValues(alpha: 0.22), theme.accent.withValues(alpha: 0.0)]),
              border: Border(bottom: BorderSide(color: theme.accent.withValues(alpha: 0.25))),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (icon != null)
                Padding(padding: const EdgeInsets.only(right: 6), child: NetImg(icon, width: 22, height: 22, fit: BoxFit.contain))
              else
                Padding(padding: const EdgeInsets.only(right: 6), child: Text(emoji, style: const TextStyle(fontSize: 15))),
              Flexible(
                child: Text('${s['title'] ?? ''}',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: theme.accent, fontWeight: FontWeight.w900, fontSize: 15)),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(6), border: Border.all(color: theme.accent.withValues(alpha: 0.6))),
                child: Text(tx('İLK 3'), style: TextStyle(color: theme.accent, fontSize: 9.5, fontWeight: FontWeight.w900, letterSpacing: 0.8)),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 10, 6, 0),
            // Üç sütun alttan hizalı: basamakların tabanı aynı çizgide, adlar tek satır (uzun / süslü adlar kürsüyü bozmaz).
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(child: _podium(context, at(2), 2)),
              Expanded(child: _podium(context, at(1), 1)),
              Expanded(child: _podium(context, at(3), 3)),
            ]),
          ),
        ]),
      ),
    );
  }

  /// Kürsü: madalya halkalı fotoğraf (1. büyük ve taçlı), tek satır ad, metalik basamak (1. en yüksek).
  Widget _podium(BuildContext context, Map<String, dynamic>? e, int rank) {
    final medal = _medal[rank]!;
    final first = rank == 1;
    final r = first ? 30.0 : 24.0;
    final user = e == null ? null : mapOf(e['user']);
    final partner = e == null ? null : mapOf(e['partner']);
    Widget ring(Map<String, dynamic>? u, double radius) => GestureDetector(
          onTap: () => _openUser(context, u),
          child: Container(
            padding: const EdgeInsets.all(2.4),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white, medal, Color.lerp(medal, Colors.black, 0.4)!]),
              boxShadow: [BoxShadow(color: medal.withValues(alpha: first ? 0.75 : 0.45), blurRadius: first ? 16 : 9)],
            ),
            child: UserAvatar(user: u, radius: radius),
          ),
        );
    final Widget photo;
    if (user == null) {
      // Boş basamak: soluk halka ve soru işareti.
      photo = Container(
        width: r * 2 + 4.8,
        height: r * 2 + 4.8,
        decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.05), border: Border.all(color: medal.withValues(alpha: 0.35), width: 1.5)),
        child: Icon(Icons.question_mark_rounded, color: medal.withValues(alpha: 0.45), size: r * 0.9),
      );
    } else if (partner == null) {
      photo = ring(user, r);
    } else {
      final rr = r * 0.86;
      photo = SizedBox(
        width: rr * 3.3,
        height: rr * 2 + 4.8,
        child: Stack(alignment: Alignment.center, children: [
          Positioned(left: 0, child: ring(user, rr)),
          Positioned(right: 0, child: ring(partner, rr)),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF0B0906)),
            child: Text('💞', style: TextStyle(fontSize: rr * 0.55)),
          ),
        ]),
      );
    }
    final name = user == null
        ? tx('Boş')
        : partner == null
            ? '${user['displayName'] ?? ''}'
            : '${user['displayName'] ?? ''} & ${partner['displayName'] ?? ''}';
    final barH = first ? 46.0 : (rank == 2 ? 34.0 : 26.0);
    return Column(mainAxisSize: MainAxisSize.min, children: [
      SizedBox(height: 24, child: first ? const Text('👑', style: TextStyle(fontSize: 21)) : null),
      photo,
      const SizedBox(height: 6),
      SizedBox(
        height: 18,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Text(
            name,
            maxLines: 1,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: user == null ? Colors.white38 : Colors.white,
              fontWeight: first ? FontWeight.w900 : FontWeight.w700,
              fontSize: first ? 13.5 : 12.5,
              shadows: const [Shadow(color: Colors.black87, blurRadius: 3)],
            ),
          ),
        ),
      ),
      const SizedBox(height: 6),
      // Metalik basamak: üst kenarda parlak çizgi, ortada büyük sıra numarası.
      Container(
        height: barH,
        margin: const EdgeInsets.symmetric(horizontal: 3),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(10)),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color.lerp(medal, Colors.white, 0.35)!, medal, Color.lerp(medal, Colors.black, 0.5)!],
            stops: const [0, 0.35, 1],
          ),
          border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.7), width: 1.2)),
        ),
        child: Text('$rank',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
              fontSize: first ? 22 : 18,
              shadows: [Shadow(color: Color.lerp(medal, Colors.black, 0.6)!, blurRadius: 4, offset: const Offset(0, 1))],
            )),
      ),
    ]);
  }
}
