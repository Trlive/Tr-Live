import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/inbox_service.dart';
import '../services/room_dock.dart';
import '../widgets/anim_asset.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import 'messages_screen.dart';
import '../widgets/level_badge.dart';
import 'home_screen.dart' show openRoom;
import 'user_screens.dart';

/// Arkadaşlarım ve bana gelen arkadaşlık istekleri. Yalnızca arkadaşlar mesajlaşabilir.
class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  int _version = 0;

  void _reload() {
    if (mounted) setState(() => _version++);
    Inbox.refreshBadges();
  }

  Future<void> _respond(String userId, bool accept) async {
    final r = await guard(context, () => Api.post('/api/friends/${accept ? 'accept' : 'decline'}/$userId'));
    if (r != null) {
      if (mounted && accept) toast(context, 'Artık arkadaşsınız.');
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: const Text('Arkadaşlar'), bottom: const TabBar(tabs: [Tab(text: 'Arkadaşlarım'), Tab(text: 'İstekler')])),
        body: TabBarView(children: [
          AsyncBody<List<Map<String, dynamic>>>(
            key: ValueKey('f$_version'),
            load: () async => listOf((await Api.get('/api/friends'))['users']),
            builder: (context, users, reload) => users.isEmpty
                ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Henüz arkadaşın yok. Bir profile girip "Arkadaş ekle" diyebilirsin.', textAlign: TextAlign.center)))
                : RefreshIndicator(
                    onRefresh: reload,
                    child: ListView(children: [
                      for (final u in users)
                        ListTile(
                          leading: UserAvatar(user: u),
                          title: UserName(user: u),
                          subtitle: Text('@${u['username']}'),
                          trailing: IconButton(
                            tooltip: 'Mesaj',
                            icon: const Icon(Icons.chat_bubble_outline, color: Pal.cyan),
                            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(peer: u))),
                          ),
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: u['id'] as String))),
                        ),
                    ]),
                  ),
          ),
          AsyncBody<List<Map<String, dynamic>>>(
            key: ValueKey('r$_version'),
            load: () async => listOf((await Api.get('/api/friends/requests'))['requests']),
            builder: (context, reqs, reload) => reqs.isEmpty
                ? const Center(child: Text('Bekleyen istek yok.'))
                : RefreshIndicator(
                    onRefresh: reload,
                    child: ListView(children: [
                      for (final r in reqs)
                        ListTile(
                          leading: UserAvatar(user: mapOf(r['user'])),
                          title: UserName(user: mapOf(r['user'])),
                          subtitle: const Text('Arkadaşlık isteği gönderdi'),
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: mapOf(r['user'])?['id'] as String))),
                          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                            IconButton(icon: const Icon(Icons.check_circle, color: Colors.greenAccent), onPressed: () => _respond(mapOf(r['user'])?['id'] as String, true)),
                            IconButton(icon: const Icon(Icons.cancel, color: Colors.redAccent), onPressed: () => _respond(mapOf(r['user'])?['id'] as String, false)),
                          ]),
                        ),
                    ]),
                  ),
          ),
        ]),
      ),
    );
  }
}

/// Seviye Merkezi: Yayıncı / Kullanıcı seviyesi, exp çubuğu ve ayrıcalıklar tablosu (Figma).
class LevelsScreen extends StatefulWidget {
  const LevelsScreen({super.key});

  @override
  State<LevelsScreen> createState() => _LevelsScreenState();
}

class _LevelsScreenState extends State<LevelsScreen> {
  bool _broadcaster = false; // Figma'da önce Yayıncı, ama kullanıcı seviyesi öntanımlı

  static const _ranges = [
    [1, 19], [20, 29], [30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 89], [90, 99], [100, 119], [120, 139], [140, 150],
    // Prestij kademeleri (efektli): Kraliyet, Elmas, Efsane.
    [151, 200], [201, 250], [251, 300],
  ];

  String? _frame(Map<String, dynamic> p) {
    final items = p['equipped'];
    if (items is! List) return null;
    for (final i in items) {
      if (i is Map && i['itemType'] == 'frame') return Api.absoluteUrl(i['assetUrl'] as String?);
    }
    return null;
  }

  String _fmt(String v) => fmtNumber(v);

  @override
  Widget build(BuildContext context) {
    final rowColor = _broadcaster ? const Color(0xFF05052E) : const Color(0xFF2E0505);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, title: const Text('Seviye Merkezi')),
      body: AsyncBody<Map<String, dynamic>>(
        load: () async {
          final me = mapOf((await Api.get('/api/me'))['user']) ?? {};
          final lv = await Api.get('/api/me/levels');
          return {'me': me, 'lv': lv};
        },
        builder: (context, d, reload) {
          final me = mapOf(d['me']) ?? {};
          final lv = mapOf(d['lv']) ?? {};
          final info = mapOf(_broadcaster ? lv['broadcaster'] : lv['user']) ?? {};
          final level = (info['level'] as num?)?.toInt() ?? 1;
          final exp = BigInt.tryParse('${info['exp']}') ?? BigInt.zero;
          final start = BigInt.tryParse('${info['levelStartExp']}') ?? BigInt.zero;
          final next = BigInt.tryParse('${info['nextLevelExp']}') ?? BigInt.zero;
          final maxed = info['maxed'] == true;
          final span = next - start;
          final progress = maxed || span <= BigInt.zero ? 1.0 : ((exp - start).toDouble() / span.toDouble()).clamp(0.0, 1.0);
          final remaining = maxed ? BigInt.zero : next - exp;
          final frame = _frame(me);
          Widget seg(String label, bool on, VoidCallback onTap) => Expanded(
                child: InkWell(
                  onTap: onTap,
                  child: Container(
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: on ? const Color(0xFFFFEB3B) : const Color(0xFFE0E0E0), borderRadius: BorderRadius.circular(6)),
                    child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: FittedBox(fit: BoxFit.scaleDown, child: Text(label, maxLines: 1, style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w800, fontSize: 13)))),
                  ),
                ),
              );
          return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(color: const Color(0xFFE0E0E0), borderRadius: BorderRadius.circular(8)),
                child: Row(children: [seg('Yayıncı Seviyesi', _broadcaster, () => setState(() => _broadcaster = true)), seg('Kullanıcı Seviyesi', !_broadcaster, () => setState(() => _broadcaster = false))]),
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
              decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF1A1A1A), Colors.black])),
              child: Column(children: [
                SizedBox(
                  height: 190,
                  child: Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
                    UserAvatar(user: me, radius: 56),
                    if (frame != null) FrameBox(url: frame, avatarRadius: 56),
                    // Seviye rozeti: sağ altta (taç = atış, kalp = alış).
                    Positioned(right: 0, bottom: 0, child: LevelBadgeImage(level: level, send: !_broadcaster, size: 78)),
                  ]),
                ),
                const SizedBox(height: 4),
                LevelPill(level: level, send: !_broadcaster, height: 24),
                const SizedBox(height: 8),
                Row(children: [
                  Text('Lv.$level', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                  const SizedBox(width: 8),
                  Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: progress, minHeight: 6, backgroundColor: Colors.white24, color: Colors.white))),
                  const SizedBox(width: 8),
                  Text('Lv.${maxed ? level : level + 1}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                ]),
                const SizedBox(height: 8),
                Text('Mevcut Exp: ${_fmt(exp.toString())}  -  Gerekli Exp: ${_fmt(remaining.toString())}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(_broadcaster ? 'Aldığın her elmas yayıncı exp\'i kazandırır.' : 'Gönderdiğin her coin kullanıcı exp\'i kazandırır.', style: const TextStyle(fontSize: 11, color: Pal.textDim)),
                ),
              ]),
            ),
            const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Center(child: Text('Ayrıcalıklar', style: TextStyle(color: Color(0xFFFFEB3B), fontSize: 17, fontWeight: FontWeight.w700)))),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Table(
                border: TableBorder.all(color: Colors.white24, width: 0.8),
                columnWidths: const {0: FlexColumnWidth(1), 1: FlexColumnWidth(1), 2: FlexColumnWidth(2.2)},
                defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                children: [
                  const TableRow(decoration: BoxDecoration(color: Color(0xFF1C1C1C)), children: [
                    Padding(padding: EdgeInsets.all(12), child: Center(child: Text('Seviye', style: TextStyle(fontWeight: FontWeight.w800)))),
                    Padding(padding: EdgeInsets.all(12), child: Center(child: Text('Etiket', style: TextStyle(fontWeight: FontWeight.w800)))),
                    Padding(padding: EdgeInsets.all(12), child: Center(child: Text('Ödül', style: TextStyle(fontWeight: FontWeight.w800)))),
                  ]),
                  for (var i = 0; i < _ranges.length; i++)
                    TableRow(
                      decoration: BoxDecoration(color: level >= _ranges[i][0] && level <= _ranges[i][1] ? rowColor.withValues(alpha: 1) : rowColor.withValues(alpha: 0.75)),
                      children: [
                        SizedBox(
                          height: 64,
                          child: Center(
                            child: Column(mainAxisSize: MainAxisSize.min, children: [
                              Text(_ranges[i][0] == _ranges[i][1] ? '${_ranges[i][0]}' : '${_ranges[i][0]}-${_ranges[i][1]}',
                                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: level >= _ranges[i][0] && level <= _ranges[i][1] ? const Color(0xFFFFEB3B) : Colors.white)),
                              if (prestigeTier(_ranges[i][0]) > 0)
                                Text(prestigeNames[prestigeTier(_ranges[i][0])], style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFFFFD36E))),
                            ]),
                          ),
                        ),
                        // Etiket: yayıncı (alış) kalpli, kullanıcı (atış) taçlı.
                        Center(child: LevelPill(level: _ranges[i][0], send: !_broadcaster, height: 20)),
                        Center(child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: LevelBadgeImage(level: _ranges[i][0], send: !_broadcaster, size: 58))),
                      ],
                    ),
                ],
              ),
            ),
          ]);
        },
      ),
    );
  }
}

/// Profildeki gradyanlı "Lv. xx" çubuğu (Figma). [send] verilirse simge yerine seviye rozeti (taç = atış, kalp = alış).
Widget levelBar(String title, dynamic level, IconData icon, List<Color> colors, {bool? send}) {
  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Padding(padding: const EdgeInsets.only(left: 2, bottom: 6), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700))),
    Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), gradient: LinearGradient(colors: colors)),
      child: Row(children: [
        if (send == null) Icon(icon, color: Colors.white, size: 28) else LevelBadgeImage(level: level ?? 1, send: send, size: 50),
        const Spacer(),
        Text('Lv. ${level ?? 0}', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic)),
      ]),
    ),
  ]);
}

// ======================================================================= Takip / Fan / Ziyaretçi / Arkadaş
/// Kendi profilimdeki dört liste tek sayfada: yana kaydırarak Takip Edilen ↔ Fanlar ↔ Ziyaretçiler ↔ Arkadaşlar.
/// Satırda isim ve seviyeler; kişi bir odadaysa sağda oda simgesi (kendi sesli odası: mikrofon, görüntülü: kamera,
/// başka bir odada: "yayında" çubukları). Simgeye dokununca o odaya girilir.
class SocialListsScreen extends StatefulWidget {
  final String userId;
  final int initialTab;
  const SocialListsScreen({super.key, required this.userId, this.initialTab = 0});

  @override
  State<SocialListsScreen> createState() => _SocialListsScreenState();
}

class _SocialListsScreenState extends State<SocialListsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this, initialIndex: widget.initialTab.clamp(0, 3));

  @override
  void initState() {
    super.initState();
    _seen(_tabs.index);
    _tabs.addListener(() {
      if (!_tabs.indexIsChanging) _seen(_tabs.index);
    });
  }

  /// Fan / ziyaretçi rozeti sekme açılınca sıfırlanır.
  void _seen(int i) {
    if (i == 1) Inbox.markSeen('followers');
    if (i == 2) Inbox.markSeen('visitors');
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.userId;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bağlantılarım'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.center,
          labelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          tabs: const [Tab(text: 'Takip Edilen'), Tab(text: 'Fanlar'), Tab(text: 'Ziyaretçiler'), Tab(text: 'Arkadaşlar')],
        ),
      ),
      body: TabBarView(controller: _tabs, children: [
        _SocialList(load: () async => listOf((await Api.get('/api/users/$id/following'))['users']).map((u) => {'user': u}).toList(), empty: 'Henüz kimseyi takip etmiyorsun.'),
        _SocialList(load: () async => listOf((await Api.get('/api/users/$id/followers'))['users']).map((u) => {'user': u}).toList(), empty: 'Henüz fanın yok.'),
        _SocialList(
          load: () async {
            final list = listOf((await Api.get('/api/me/visitors'))['visitors']);
            DateTime at(Map<String, dynamic> v) => DateTime.tryParse('${v['lastVisitedAt']}') ?? DateTime.fromMillisecondsSinceEpoch(0);
            list.sort((a, b) => at(b).compareTo(at(a)));
            return list;
          },
          empty: 'Son 7 günde ziyaretçi yok.',
          subtitle: (v) {
            final t = DateTime.tryParse('${v['lastVisitedAt']}')?.toLocal();
            return t == null ? null : 'Son ziyaret: ${t.day.toString().padLeft(2, '0')}.${t.month.toString().padLeft(2, '0')} ${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')} · ${v['visitCount'] ?? 1} kez';
          },
        ),
        _SocialList(
          load: () async => listOf((await Api.get('/api/friends'))['users']).map((u) => {'user': u}).toList(),
          empty: 'Henüz arkadaşın yok. Bir profile girip "Arkadaş ekle" diyebilirsin.',
          header: (context) => ListTile(
            leading: const Icon(Icons.person_add_alt_1_rounded, color: Pal.amber),
            title: const Text('Arkadaşlık istekleri', style: TextStyle(fontWeight: FontWeight.w700)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FriendsScreen())),
          ),
        ),
      ]),
    );
  }
}

/// Bir sekmedeki liste. Her öğe {'user': ..., (ziyaretçide) 'lastVisitedAt', 'visitCount'}.
class _SocialList extends StatefulWidget {
  final Future<List<Map<String, dynamic>>> Function() load;
  final String empty;
  final String? Function(Map<String, dynamic> item)? subtitle;
  final Widget Function(BuildContext context)? header;
  const _SocialList({required this.load, required this.empty, this.subtitle, this.header});

  @override
  State<_SocialList> createState() => _SocialListState();
}

class _SocialListState extends State<_SocialList> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true; // sekmeler arasında kayarken liste yeniden yüklenmesin

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return AsyncBody<List<Map<String, dynamic>>>(
      load: widget.load,
      builder: (context, items, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 24), children: [
          if (widget.header != null) widget.header!(context),
          if (items.isEmpty)
            Padding(padding: const EdgeInsets.fromLTRB(24, 60, 24, 0), child: Text(widget.empty, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60)))
          else
            for (final it in items) SocialUserTile(user: mapOf(it['user']), subtitle: widget.subtitle?.call(it)),
        ]),
      ),
    );
  }
}

/// Liste satırı (kart): fotoğraf, isim, seviyeler, alt yazı ve kişi bir odadaysa oda simgesi.
class SocialUserTile extends StatelessWidget {
  final Map<String, dynamic>? user;
  final String? subtitle;
  const SocialUserTile({super.key, required this.user, this.subtitle});

  @override
  Widget build(BuildContext context) {
    final u = user;
    if (u == null) return const SizedBox.shrink();
    final room = mapOf(u['currentRoom']);
    final hidden = u['isHidden'] == true;
    final sub = subtitle ?? (hidden ? null : 'ID: ${u['publicId'] ?? u['username'] ?? ''}');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Pal.outline)),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: hidden || u['id'] == null ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: '${u['id']}'))),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
          child: Row(children: [
            UserAvatar(user: u, radius: 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                UserName(user: u),
                const SizedBox(height: 4),
                Wrap(spacing: 4, runSpacing: 3, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  if (u['coinLevel'] != null) LevelPill(level: u['coinLevel'], send: true, height: 16),
                  if (u['giftLevel'] != null) LevelPill(level: u['giftLevel'], send: false, height: 16),
                ]),
                if (sub != null && sub.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white54, fontSize: 12.5)),
                ],
              ]),
            ),
            if (room != null && room['id'] != null) ...[
              const SizedBox(width: 8),
              RoomStatusIcon(kind: '${room['kind']}', onTap: () => openRoom(context, RoomRequest(roomId: '${room['id']}', name: '${u['displayName'] ?? 'Oda'}', locked: room['locked'] == true))),
            ],
          ]),
        ),
      ),
    );
  }
}

/// Kişinin bulunduğu oda: 'audio' mikrofon, 'video' kamera, 'live' (başka odada) yatay "yayında" çubukları.
class RoomStatusIcon extends StatefulWidget {
  final String kind;
  final VoidCallback onTap;
  const RoomStatusIcon({super.key, required this.kind, required this.onTap});

  @override
  State<RoomStatusIcon> createState() => _RoomStatusIconState();
}

class _RoomStatusIconState extends State<RoomStatusIcon> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.kind;
    final colors = k == 'video'
        ? const [Color(0xFFFF9F0A), Color(0xFFFF5E3A)]
        : k == 'audio'
            ? const [Color(0xFF16C25B), Color(0xFF0E9F6E)]
            : const [Color(0xFFFF4F9A), Color(0xFFB0127A)];
    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        height: 30,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: colors),
          borderRadius: BorderRadius.circular(15),
          boxShadow: [BoxShadow(color: colors.first.withValues(alpha: 0.45), blurRadius: 8)],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (k == 'audio' || k == 'video')
            Icon(k == 'video' ? Icons.videocam_rounded : Icons.mic_rounded, color: Colors.white, size: 18)
          else
            // Yatay "yayında" çubukları
            AnimatedBuilder(
              animation: _c,
              builder: (_, __) => Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [
                for (var i = 0; i < 4; i++)
                  Container(
                    width: 3,
                    height: 5 + 9 * (0.5 + 0.5 * math.sin((_c.value + i * 0.23) * math.pi * 2)).abs(),
                    margin: const EdgeInsets.symmetric(horizontal: 1),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(2)),
                  ),
              ]),
            ),
          const SizedBox(width: 5),
          Text(k == 'live' ? 'Odada' : 'Oda', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
        ]),
      ),
    );
  }
}
