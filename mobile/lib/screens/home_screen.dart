import 'dart:async';
import '../hybrid/sdui/resolver/sdui_action.dart';
import '../hybrid/sdui/renderer/sdui_sections.dart';
import '../hybrid/sdui/engine/sdui_engine.dart';
import '../l10n/l10n.dart';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/app_visibility.dart';
import '../services/background_service.dart';
import '../services/music_service.dart';
import '../widgets/app_theme.dart';
import '../widgets/banner_carousel.dart';
import '../widgets/crown_icon.dart';
import '../widgets/room_card.dart';
import '../services/api.dart';
import '../widgets/drag_bubble.dart';
import '../services/inbox_service.dart';
import '../services/push_service.dart';
import '../services/room_dock.dart';
import '../services/session.dart';
import '../services/socket_service.dart';
import '../widgets/common.dart';
import '../widgets/cp_widgets.dart';
import '../widgets/gift_ribbon.dart';
import 'feed_screen.dart';
import 'go_live_screen.dart';
import 'leaderboard_screen.dart';
import 'legal_screens.dart';
import 'profile_setup_screen.dart';
import '../widgets/daily_checkin.dart';
import 'messages_screen.dart';
import 'profile_screen.dart';
import 'room_screen.dart';
import 'user_screens.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _index = 0;
  final _audioKey = GlobalKey<RoomsTabState>();
  final _videoKey = GlobalKey<RoomsTabState>();

  StreamSubscription? _cpSub;

  /// Kullanıcı Sözleşmesi / Gizlilik Politikası onaylanmamışsa (ya da güncellendiyse) onay penceresi.
  void _checkTerms() {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) TermsGate.check(context);
    });
  }

  bool _setupOpen = false;
  bool _checkinTried = false;

  /// Sözleşme onayından sonra: yeni hesapsa kayıt ekranı (bir kez), ardından günlük giriş penceresi (bugün alınmadıysa).
  void _onboard() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final me = Session.me.value;
      if (me == null || TermsGate.needed(me)) return;
      if (me['setupDone'] == false) {
        if (_setupOpen) return;
        _setupOpen = true;
        await Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const ProfileSetupScreen()));
        _setupOpen = false;
        return; // kayıt bitince profil yenilenir → bu fonksiyon yeniden çalışır ve günlük giriş gelir
      }
      if (_checkinTried || _setupOpen) return;
      _checkinTried = true;
      await Future<void>.delayed(const Duration(milliseconds: 700));
      if (mounted) await maybeShowCheckin(context);
    });
  }

  @override
  void initState() {
    // Düzen açılışta tazelenir. Bayrak kapalıysa motor hiçbir şey döndürmez ve yerleşik düzen çizilir.
    SduiEngine.refresh('home');
    super.initState();
    Session.me.addListener(_checkTerms);
    _checkTerms();
    Session.me.addListener(_onboard);
    _onboard();
    Inbox.start();
    // Uygulama açılışı: önceki oturumdan (uygulama kapanmış / çökmüştü) eski odada asılı kalan üyelik temizlenir;
    // sahibi olduğun oda, içeride yönetici yoksa kapanır. Başka bir cihazda gerçekten odadaysan dokunulmaz.
    if (!RoomDock.isOpen) Api.post('/api/rooms/leave-stale').catchError((_) => <String, dynamic>{});
    // Micolive gibi: bildirim izni girişten sonra ana sayfada bir kez (sözleşme onayı bittikten sonra) sorulur.
    // Mikrofon / kamera yalnızca koltuğa çıkınca / yayın açınca, fotoğraf ve müzik yalnızca seçerken istenir.
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted && !TermsGate.needed(Session.me.value)) {
        BackgroundService.instance.ensurePermissions((msg, action) => confirm(context, msg, action: action));
      }
    });
    // CP sistemi: biri seni Arkadaş / CP olarak seçince kısa bildirim (yanıt: Mesajlar → Arkadaşlık isteği ya da profil kartı).
    // Telefon bildirimine dokununca: arkadaş oda açtı → odaya gir; istek / takip → kişinin profili.
    PushService.onOpen = (kind, data) {
      if (!mounted) return;
      final roomId = data['roomId']?.toString();
      final userId = data['userId']?.toString();
      if (kind == 'room_open' && roomId != null) {
        openRoom(context, RoomRequest(roomId: roomId, name: (data['roomName'] ?? tx('Oda')).toString()));
      } else if (userId != null) {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: userId)));
      }
    };
    _cpSub = SocketService.instance.events.listen((e) {
      if (!mounted) return;
      if (e['type'] == 'agency_invite') {
        final a = (mapOf(e['agency'])?['name'] ?? tx('Bir ajans')).toString();
        toast(context, tx('{a} seni yayıncı olarak davet etti (Mesajlar → Ajans daveti)', {'a': a}));
        return;
      }
      if (e['type'] == 'agency_assistant_invite') {
        final a = (mapOf(e['agency'])?['name'] ?? tx('Bir ajans')).toString();
        toast(context, tx('{a} seni ajans asistanı olarak davet etti (Mesajlar → Ajans daveti)', {'a': a}));
        return;
      }
      if (e['type'] == 'event_reward') {
        toast(context, '🏆 ${tx('{t} oldun!', {'t': e['title'] ?? tx('Etkinlik')})}${e['rewarded'] == true ? ' ${tx('Ödüllerin hesabına eklendi.')}' : ''}');
        return;
      }
      if (e['type'] == 'agency_created') {
        final a = (mapOf(e['agency'])?['name'] ?? tx('Ajans')).toString();
        toast(context, tx('"{a}" ajansının sahibi oldun 🎉 (Profil → Ajans Merkezi)', {'a': a}));
        return;
      }
      if (e['type'] != 'cp_request') return;
      final name = (mapOf(e['from'])?['displayName'] ?? tx('Biri')).toString();
      toast(context, tx('{name} seni {rel} olarak seçti ❤ (Mesajlar → Arkadaşlık isteği, 24 saat içinde yanıtla)', {'name': name, 'rel': cpRelationLabel(e['kind']?.toString())}));
    });
  }

  Future<void> _joinByCode() async {
    final code = await askText(context, tx('Gizli oda davet kodu'), hint: tx('6 karakter'));
    if (code == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/rooms/by-code', {'code': code}));
    if (r == null || !mounted) return;
    await openRoom(context, RoomRequest(roomId: r['roomId'].toString(), name: (r['name'] ?? tx('Oda')).toString(), code: code.trim().toUpperCase()));
  }

  @override
  void dispose() {
    Session.me.removeListener(_checkTerms);
    Session.me.removeListener(_onboard);
    _cpSub?.cancel();
    Inbox.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      // Oda tam ekran açıkken ana sayfa arkada çizilmez ve animasyonları durur (oda kapanınca/küçülünce aynen geri gelir).
      Positioned.fill(
        child: ValueListenableBuilder<RoomRequest?>(
          valueListenable: RoomDock.request,
          builder: (context, req, child) => ValueListenableBuilder<bool>(
            valueListenable: RoomDock.minimized,
            builder: (context, min, child) {
              final covered = req != null && !min;
              return Offstage(offstage: covered, child: TickerMode(enabled: !covered, child: child!));
            },
            child: child,
          ),
          child: _scaffold(context),
        ),
      ),
      // Açık oda: küçültülünce Offstage ile arka planda yaşamaya devam eder (ses kesilmez).
      ValueListenableBuilder<RoomRequest?>(
        valueListenable: RoomDock.request,
        builder: (context, req, _) {
          if (req == null) return const SizedBox.shrink();
          return ValueListenableBuilder<bool>(
            valueListenable: RoomDock.minimized,
            builder: (context, min, _) => Stack(children: [
              Positioned.fill(
                child: Offstage(
                  offstage: min,
                  child: TickerMode(
                    enabled: !min,
                    child: RoomScreen(key: ValueKey(RoomDock.serial), roomId: req.roomId, initialName: req.name, locked: req.locked, code: req.code),
                  ),
                ),
              ),
              if (min) _miniBar(req),
            ]),
          );
        },
      ),
    ]);
  }

  static final ValueNotifier<Offset?> _roomBubblePos = ValueNotifier<Offset?>(null);

  /// Küçültülmüş oda: sürüklenebilir yuvarlak balon. Dokununca büyür, sağ üstteki X odadan çıkarır.
  Widget _miniBar(RoomRequest req) {
    final initial = req.name.trim().isEmpty ? '?' : trUpper(req.name.trim().characters.first);
    return DragBubble(
      pos: _roomBubblePos,
      size: 64,
      initial: const Offset(-1, -170),
      onTap: RoomDock.expand,
      child: Stack(clipBehavior: Clip.none, children: [
        // Oda fotoğrafı yuvarlak içinde döner (plak gibi); fotoğraf yoksa odanın baş harfi.
        ValueListenableBuilder<String?>(
          valueListenable: RoomDock.cover,
          builder: (context, cover, _) => _SpinningRoomCover(cover: cover, initial: initial),
        ),
        // Müzik yalnızca odanın içinde: dışarıda ayrı müzik balonu yok, çalıyorsa oda balonunda küçük nota görünür.
        Positioned(
          left: -2,
          bottom: -2,
          child: ValueListenableBuilder<Map<String, dynamic>?>(
            valueListenable: MusicService.instance.state,
            builder: (_, st, __) => st?['status'] == 'playing'
                ? const CircleAvatar(radius: 10, backgroundColor: Colors.black87, child: Icon(Icons.music_note, size: 13, color: Colors.pinkAccent))
                : const SizedBox.shrink(),
          ),
        ),
        Positioned(
          right: 0,
          top: 0,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => RoomDock.exitHandler?.call(),
            child: const Padding(padding: EdgeInsets.all(6), child: CircleAvatar(radius: 10, backgroundColor: Colors.black87, child: Icon(Icons.close, size: 13, color: Colors.white))),
          ),
        ),
      ]),
    );
  }

  void _select(int i) {
    setState(() => _index = i);
    if (i == 0) _audioKey.currentState?.refresh();
    if (i == 2) _videoKey.currentState?.refresh();
  }

  /// Alt satır (Yoho: yalnızca simge): Sesli | Akış | Görüntülü | Mesajlar | Profil. Seçili simge dolu ve renkli.
  /// Uygulamanın **yerleşik** sekme düzeni. SDUI kapalıyken, sunucuya ulaşılamadığında ve
  /// sunucudan gelen düzen geçersizse bu kullanılır. Bu kademe koddadır ve her zaman çalışır:
  /// sunucu tamamen erişilemez olsa bile uygulama açılır ve gezilebilir.
  static const _builtInTabs = [
    (target: 'voice', icon: Icons.mic_none, active: Icons.mic, label: 'Sesli'),
    (target: 'feed', icon: Icons.dynamic_feed_outlined, active: Icons.dynamic_feed, label: 'Akış'),
    (target: 'video', icon: Icons.videocam_outlined, active: Icons.videocam, label: 'Görüntülü'),
    (target: 'messages', icon: Icons.chat_bubble_outline, active: Icons.chat_bubble, label: 'Mesajlar'),
    (target: 'profile', icon: Icons.person_outline, active: Icons.person, label: 'Profil'),
  ];

  /// Sekmenin IndexedStack'teki sabit sırası. SDUI sekmeleri yeniden sıralasa da içerik
  /// bu dizine göre çizilir — sunucu sekmeyi taşır, içeriği değiştiremez.
  static int _slotOf(String target) => switch (target) {
        'voice' => 0,
        'feed' => 1,
        'video' => 2,
        'messages' => 3,
        'profile' => 4,
        _ => 0,
      };

  /// Çizilecek sekme listesi: SDUI düzeni varsa ondan, yoksa yerleşikten.
  ///
  /// SDUI düzeninde görünür sekme kalmazsa **yerleşiğe düşülür**: gezilemeyen bir uygulama,
  /// sunucudan gelebilecek en zararlı durumdur. Sunucu bunu kaydettirmiyor, şema da eliyor;
  /// burası üçüncü ve son savunma.
  List<({String target, IconData icon, IconData active, String label})> _visibleTabs() {
    final layout = SduiEngine.layout('home');
    if (layout == null || layout.tabs.isEmpty) return _builtInTabs;
    final out = <({String target, IconData icon, IconData active, String label})>[];
    for (final t in layout.tabs) {
      if (t.hidden) continue;
      final base = _builtInTabs.firstWhere((b) => b.target == t.target, orElse: () => _builtInTabs.first);
      out.add((
        target: t.target,
        // Simge sunucudan gelebilir; gelmezse ya da tanınmazsa yerleşik simge kullanılır.
        icon: t.icon == null ? base.icon : SduiActionResolver.icon(t.icon, fallback: base.icon),
        active: t.icon == null ? base.active : SduiActionResolver.icon(t.icon, fallback: base.active),
        label: t.label.isEmpty ? base.label : t.label,
      ));
    }
    return out.isEmpty ? _builtInTabs : out;
  }

  Widget _tabRow() {
    Widget item(int i, IconData icon, IconData activeIcon, String label, {Widget? badge}) {
      final sel = _index == i;
      final color = sel ? Pal.cyan : Pal.textDim;
      return Expanded(
        child: Semantics(
          button: true,
          selected: sel,
          label: label,
          child: Tooltip(
            message: label,
            child: InkWell(
              onTap: () => _select(i),
              child: SizedBox(height: 56, child: Center(child: badge ?? Icon(sel ? activeIcon : icon, color: color, size: 28))),
            ),
          ),
        ),
      );
    }

    final tabs = _visibleTabs();
    Widget forTab(({String target, IconData icon, IconData active, String label}) t) {
      final slot = _slotOf(t.target);
      final label = tx(t.label);
      // Rozetli iki sekme (mesajlar, profil) kendi rozet bileşenlerini korur.
      if (t.target == 'messages') {
        return item(slot, t.icon, t.active, label,
            badge: ValueListenableBuilder<int>(
              valueListenable: Inbox.unread,
              builder: (_, n, __) => Badge(label: Text('$n'), isLabelVisible: n > 0,
                  child: Icon(_index == slot ? t.active : t.icon, color: _index == slot ? Pal.cyan : Pal.textDim, size: 28)),
            ));
      }
      if (t.target == 'profile') {
        return item(slot, t.icon, t.active, label,
            badge: ValueListenableBuilder<Map<String, int>>(
              valueListenable: Inbox.badges,
              builder: (_, b, __) => Badge(smallSize: 9, isLabelVisible: (b['total'] ?? 0) > 0,
                  child: Icon(_index == slot ? t.active : t.icon, color: _index == slot ? Pal.cyan : Pal.textDim, size: 28)),
            ));
      }
      return item(slot, t.icon, t.active, label);
    }

    return Container(
      decoration: const BoxDecoration(color: Pal.surface, border: Border(top: BorderSide(color: Pal.outline, width: 0.8))),
      child: SafeArea(top: false, child: Row(children: [for (final t in tabs) forTab(t)])),
    );
  }

  Widget _scaffold(BuildContext context) {
    return Scaffold(
      body: Column(children: [
          // Sunucudan gelen bölümler (duyuru, afiş, kart şeridi). Düzen yoksa hiçbir şey çizilmez
          // ve ekran bugünkü gibi görünür.
          ValueListenableBuilder<int>(
            valueListenable: SduiEngine.revision,
            builder: (_, __, ___) {
              final layout = SduiEngine.layout('home');
              if (layout == null || layout.sections.isEmpty) return const SizedBox.shrink();
              return SafeArea(
                bottom: false,
                child: SduiSections(sections: layout.sections, onTab: (t) => _select(_slotOf(t))),
              );
            },
          ),
          // Yoho'da ayrı üst çubuk yok: her sekme kendi başlığını çizer (Sesli/Görüntülü: sekmeler + taç + oda aç).
          Expanded(
            child: SafeArea(
              bottom: false,
              child: GiftRibbonOverlay(
              // Görünmeyen sekmelerin animasyonları durur (TickerMode); yalnızca açık sekme çalışır.
              child: IndexedStack(index: _index, children: [
                TickerMode(enabled: _index == 0, child: RoomsTab(key: _audioKey, type: 'audio', onJoinCode: _joinByCode)),
                TickerMode(enabled: _index == 1, child: const FeedScreen()),
                TickerMode(enabled: _index == 2, child: RoomsTab(key: _videoKey, type: 'video', onJoinCode: _joinByCode)),
                TickerMode(enabled: _index == 3, child: const MessagesScreen()),
                TickerMode(enabled: _index == 4, child: const ProfileScreen()),
              ]),
            ),
            ),
          ),
        ]),
      bottomNavigationBar: ValueListenableBuilder<int>(
        valueListenable: SduiEngine.revision,
        builder: (_, __, ___) => _tabRow(),
      ),
    );
  }
}

/// Odayı dock'ta açar. Bir kişi aynı anda tek odada bulunur (Yoho): başka odaya geçince önceki odadan çıkar.
/// Oda sahibi kendi odasından ayrılacağı için önce sorulur ([confirmed]: soru zaten soruldu).
Future<void> openRoom(BuildContext context, RoomRequest req, {bool confirmed = false}) async {
  if (!confirmed && !await confirmLeaveCurrentRoom(context, req.roomId)) return;
  RoomDock.open(req);
}

/// Açık odadan çıkılacaksa (başka odaya geçiş / kendi odanı açma) ve kişi o odanın sahibiyse onay ister.
Future<bool> confirmLeaveCurrentRoom(BuildContext context, String? nextRoomId) async {
  if (!RoomDock.isOpen || RoomDock.request.value?.roomId == nextRoomId) return true;
  if (RoomDock.myRole != 'owner' && !RoomDock.closesOnLeave) return true;
  return confirm(
    context,
    RoomDock.myRole == 'owner'
        ? tx('Başka odaya geçerseniz kendi odanızdan çıkarsınız; içeride yardımcı sahip yoksa odanız kapanır. Devam edilsin mi?')
        : tx('Bulunduğunuz odada sahip ya da başka yardımcı sahip yok; başka odaya geçerseniz oda herkes için kapanır. Devam edilsin mi?'),
    action: tx('Geç'),
  );
}

/// Ana sayfa bölgeleri: (kod, bayrak, etiket). Türkiye ve Orta Asya ülkeleri Uzbekistan sekmesindedir.
const kRegions = [('uz', '🇺🇿', 'Uzbekistan'), ('ar', '🇸🇦', 'Arap'), ('in', '🇮🇳', 'Hindistan'), ('eu', '🇪🇺', 'Avrupa')];

class RoomsTab extends StatefulWidget {
  final String type; // audio | video
  final VoidCallback? onJoinCode;
  const RoomsTab({super.key, required this.type, this.onJoinCode});

  @override
  State<RoomsTab> createState() => RoomsTabState();
}

class RoomsTabState extends State<RoomsTab> {
  List<Map<String, dynamic>> _rooms = [];
  bool _loading = true;
  String? _error;
  String _q = '';
  Timer? _debounce;
  Timer? _auto; // sıralama canlı: hediye atılan oda yukarı çıkar (Yoho / Mico)
  String _mode = 'popular'; // popular (Popüler) | friends (Takip: takip ettiğin yayıncılar)
  /// Bölge sekmesi (Popüler modunda): uz (Uzbekistan; Türkiye de burada) | ar | in | eu. İlk açılışta kullanıcının kendi bölgesi.
  String _region = 'uz';
  static const _regionKey = 'home_region';
  bool _regionPicked = false; // kullanıcı kendisi seçtiyse profil bölgesi değişince üzerine yazılmaz
  bool _searching = false;

  void toggleSearch() => setState(() {
        _searching = !_searching;
        if (!_searching && _q.isNotEmpty) {
          _q = '';
          refresh();
        }
      });

  void _dockChanged() {
    if (mounted && (!RoomDock.isOpen || RoomDock.minimized.value)) refresh();
  }

  @override
  void initState() {
    super.initState();
    RoomDock.request.addListener(_dockChanged);
    RoomDock.minimized.addListener(_dockChanged);
    final mine = '${Session.me.value?['region'] ?? ''}';
    if (kRegions.any((r) => r.$1 == mine)) _region = mine;
    Session.me.addListener(_meChanged);
    _loadRegion();
    refresh();
    // Liste 20 saniyede bir sessizce yenilenir (yalnızca bu sekme görünürken, uygulama öndeyken ve oda tam ekran değilken).
    _auto = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!mounted || _searching) return;
      if (!TickerMode.getNotifier(context).value) return;
      if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) return;
      if (RoomDock.isOpen && !RoomDock.minimized.value) return;
      refresh();
    });
  }

  @override
  void dispose() {
    RoomDock.request.removeListener(_dockChanged);
    RoomDock.minimized.removeListener(_dockChanged);
    Session.me.removeListener(_meChanged);
    _debounce?.cancel();
    _auto?.cancel();
    super.dispose();
  }

  int _seq = 0; // geç gelen eski yanıt yeni listeyi ezmesin

  Future<void> _loadRegion() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getString(_regionKey);
      if (!mounted || saved == null || !kRegions.any((r) => r.$1 == saved)) return;
      _regionPicked = true;
      if (saved == _region) return;
      setState(() => _region = saved);
      refresh();
    } catch (_) {/* kayıt okunamazsa kendi bölgesi */}
  }

  /// Kayıt ekranında ülke seçilince (bölge sunucuda belirlenir) kullanıcı henüz sekme seçmediyse kendi bölgesine geçilir.
  void _meChanged() {
    final mine = '${Session.me.value?['region'] ?? ''}';
    if (!mounted || _regionPicked || mine == _region || !kRegions.any((r) => r.$1 == mine)) return;
    setState(() => _region = mine);
    refresh();
  }

  void _pickRegion(String id) {
    _regionPicked = true;
    if (id == _region) return;
    setState(() {
      _region = id;
      _loading = _rooms.isEmpty;
    });
    refresh();
    SharedPreferences.getInstance().then((p) => p.setString(_regionKey, id)).catchError((_) => false);
  }

  /// Bölge sekmeleri: Uzbekistan · Arap · Hindistan · Avrupa (uygulama renkleri: altın seçili, koyu yüzey).
  Widget _regionBar(double m) => SizedBox(
        height: 34,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: EdgeInsets.symmetric(horizontal: m),
          children: [
            for (final (id, flag, label) in kRegions)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: GestureDetector(
                  onTap: () => _pickRegion(id),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(17),
                      gradient: id == _region ? const LinearGradient(colors: [Pal.amber, Pal.cyan]) : null,
                      color: id == _region ? null : Pal.surface,
                      border: Border.all(color: id == _region ? Pal.cyan : Pal.outline),
                    ),
                    child: Text(
                      '$flag ${tx(label)}',
                      style: TextStyle(fontSize: 13, fontWeight: id == _region ? FontWeight.w900 : FontWeight.w600, color: id == _region ? Pal.onBright : Pal.text),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );

  Future<void> refresh() async {
    final my = ++_seq;
    try {
      final r = await Api.get('/api/rooms', query: {
        'type': widget.type,
        if (_q.isNotEmpty) 'q': _q,
        if (_mode == 'friends') 'region': 'friends',
        // Arama tüm bölgelerde yapılır; liste seçili bölgenin odalarını gösterir.
        if (_mode == 'popular' && _q.isEmpty) 'region': _region,
      });
      if (!mounted || my != _seq) return;
      setState(() {
        _rooms = listOf(r['rooms']);
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || my != _seq) return;
      setState(() {
        _error = errorText(e);
        _loading = false;
      });
    }
  }

  Future<void> _open(String id, String name, {bool locked = false, bool confirmed = false}) => openRoom(context, RoomRequest(roomId: id, name: name, locked: locked), confirmed: confirmed);

  /// Oda aç. Sesli oda bir kez kurulur: kayıtlıysa doğrudan odana girersin. Görüntülü yayın açık değilse her seferinde
  /// "Yayın başlat" ekranı gelir (kamera önizlemesi, başlık, tür, Canlı/Çoklu seçimi); açıksa doğrudan girersin.
  Future<void> createRoom({String? type}) async {
    final roomType = type ?? widget.type;
    final mine = await guard(context, () => Api.get('/api/rooms/mine'));
    if (mine == null || !mounted) return;
    final rooms = mapOf(mine['rooms']) ?? <String, dynamic>{};
    final profile = mapOf(rooms[roomType]);
    final activeId = profile?['activeRoomId']?.toString();
    // Zaten kendi açık odandaysan (küçültülmüş) yalnızca büyütülür.
    if (activeId != null && RoomDock.request.value?.roomId == activeId) {
      RoomDock.expand();
      return;
    }
    // Tek oda kuralı: kendi odanı açınca bulunduğun odadan çıkarsın; o oda senin odansa önce sorulur
    // (soru odayı açmadan önce: vazgeçersen boşuna oda açılmaz).
    if (!await confirmLeaveCurrentRoom(context, activeId)) return;
    if (!mounted) return;
    if (profile != null && (roomType == 'audio' || activeId != null)) {
      final r = await guard(context, () => Api.post('/api/rooms', {'roomType': roomType}));
      final room = mapOf(r?['room']);
      if (room != null && mounted) await _open(room['id'] as String, (room['name'] ?? '').toString(), confirmed: true);
      return;
    }
    final room = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => GoLiveScreen(initialType: roomType, profiles: rooms)),
    );
    if (room != null && mounted) await _open(room['id'] as String, (room['name'] ?? '').toString(), confirmed: true);
  }

  /// Yoho sekmesi: seçili olan büyük ve kalın, altında kısa çizgi; diğerleri küçük ve soluk.
  Widget _topTab(String id, String label) {
    final sel = _mode == id;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        if (_mode == id) return;
        setState(() => _mode = id);
        refresh();
      },
      // Yoho ölçüsü: yazı merkezi durum çubuğunun 21 dp altında, çizgi 39 dp'de; seçili 23 sp kalın, diğerleri 18 sp.
      child: Padding(
        padding: const EdgeInsets.only(right: 16),
        child: SizedBox(
          height: 44,
          child: Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
            const SizedBox(height: 8),
            SizedBox(
              height: 26,
              // Görünmez kalın kopya genişliği sabitler: sekme değişince şerit boyu/ölçeği oynamaz.
              child: Stack(alignment: Alignment.center, children: [
                Opacity(opacity: 0, child: Text(label, style: const TextStyle(fontSize: 23, height: 1.0, fontWeight: FontWeight.w900))),
                Text(label, style: TextStyle(fontSize: sel ? 23 : 18, height: 1.0, fontWeight: sel ? FontWeight.w900 : FontWeight.w600, color: sel ? Pal.text : Pal.textDim)),
              ]),
            ),
            const SizedBox(height: 4),
            Container(width: 10, height: 3.5, decoration: BoxDecoration(color: sel ? Pal.text : Colors.transparent, borderRadius: BorderRadius.circular(2))),
          ]),
        ),
      ),
    );
  }

  /// Üst satır (Yoho): İlgili · Sıcak · Yakında sekmeleri; sağda sıralama (taç), arama, oda aç ve diğer.
  Widget _topBar(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final m = homeMargin(w);
    final video = widget.type == 'video';
    Widget icon(IconData i, String tip, VoidCallback onTap, {Color? color}) => IconButton(
          tooltip: tip,
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 38, minHeight: 38),
          icon: Icon(i, color: color ?? Pal.text, size: 25),
          onPressed: onTap,
        );
    // Sekme bloğu 44 dp + 11 dp: banner durum çubuğunun 55 dp altında başlar (Yoho).
    return Padding(
      padding: EdgeInsets.fromLTRB(m, 0, m, 11),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.topLeft,
            child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              _topTab('popular', tx('Popüler')),
              _topTab('friends', tx('Takip')),
            ]),
          ),
        ),
        // Sağdaki simgeler sekme yazısıyla aynı hizada (merkez 21 dp).
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Semantics(
              button: true,
              label: tx('Sıralamalar'),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LeaderboardScreen())),
                child: const Padding(padding: EdgeInsets.all(6), child: CrownIcon(size: 24)),
              ),
            ),
            icon(_searching ? Icons.close : Icons.search, tx('Oda ara'), toggleSearch),
            Tooltip(
              message: video ? tx('Görüntülü yayın aç') : tx('Sesli oda aç'),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: createRoom,
                child: Ink(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: video ? const [Pal.purple, Pal.cyan] : const [Pal.orange, Pal.pink]),
                  ),
                  child: Icon(video ? Icons.videocam : Icons.mic, color: Colors.white, size: 18),
                ),
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final cols = Resp.roomColumns(w);
    final m = homeMargin(w);
    final gap = homeGap(w);
    // Yoho ızgarası: kare görsel + altında ad alanı; satırlar arasında bir satırlık boşluk.
    final cw = (w - 2 * m - gap * (cols - 1)) / cols;
    final ratio = cw / (cw + RoomCard.titleAreaFor(w));
    final empty = _mode == 'friends'
        ? tx('Takip ettiğin kişilerin açık odası yok.')
        : (_q.isEmpty ? tx('Şu an açık oda yok. İlk odayı sen aç!') : tx('Aramanıza uyan oda yok.'));
    final head = <Widget>[
      const BannerCarousel(),
      if (_mode == 'popular' && _q.isEmpty) ...[
        const SizedBox(height: 12),
        MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling), child: _regionBar(m)),
        SizedBox(height: gap + 6),
      ] else
        // Banner ile odalar arasında bir satırlık ek boşluk.
        SizedBox(height: gap + 16),
    ];
    final Widget body;
    if (_loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_error != null && _rooms.isEmpty) {
      body = LoadError(message: _error!, onRetry: refresh);
    } else {
      body = RefreshIndicator(
        onRefresh: refresh,
        child: _rooms.isEmpty
            ? ListView(children: [...head, const SizedBox(height: 48), Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(empty, textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim))))])
            : CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(child: Column(mainAxisSize: MainAxisSize.min, children: head)),
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(m, 0, m, 96),
                    sliver: SliverGrid(
                      // Alt alta gelen odalar arasında bir satırlık boşluk.
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: cols, mainAxisSpacing: 14, crossAxisSpacing: gap, childAspectRatio: ratio),
                      delegate: SliverChildBuilderDelegate(
                        (_, i) {
                          final r = _rooms[i];
                          return RoomCard(room: r, onTap: () => _open(r['id'] as String, (r['name'] ?? '').toString(), locked: r['locked'] == true));
                        },
                        childCount: _rooms.length,
                      ),
                    ),
                  ),
                ],
              ),
      );
    }
    return Column(children: [
      // Sekmelerin ölçüsü telefonun yazı boyutundan etkilenmez (Yoho gibi sabit).
      MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling), child: _topBar(context)),
      if (_searching)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
          child: TextField(
            autofocus: true,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: tx('Oda, yayıncı veya etiket ara'),
              isDense: true,
              // Kullanıcı arama ve gizli odaya kodla giriş (eski ⋮ menüsündeydi) arama kutusunun sağında.
              suffixIcon: Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(
                  tooltip: tx('Gizli odaya kodla gir'),
                  icon: const Icon(Icons.vpn_key_outlined),
                  onPressed: widget.onJoinCode,
                ),
                IconButton(
                  tooltip: tx('Kullanıcı ara'),
                  icon: const Icon(Icons.person_search),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const UserSearchScreen())),
                ),
              ]),
            ),
            onChanged: (v) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 400), () {
                _q = v.trim();
                refresh();
              });
            },
          ),
        ),
      Expanded(child: body),
    ]);
  }
}


/// Küçültülmüş oda balonu: oda fotoğrafı yavaşça döner.
/// Pil: dönüş saniyede 15 kareyle çizilir (sürekli 60-120 kare gerekmez; 10 sn'de bir tur gözle aynı görünür).
/// Üstüne başka sayfa açıldıysa ya da uygulama arka plandaysa hiç çizilmez.
class _SpinningRoomCover extends StatefulWidget {
  final String? cover;
  final String initial;
  const _SpinningRoomCover({required this.cover, required this.initial});

  @override
  State<_SpinningRoomCover> createState() => _SpinningRoomCoverState();
}

class _SpinningRoomCoverState extends State<_SpinningRoomCover> {
  static const _fps = 15;
  static const _periodMs = 10000;
  Timer? _t;
  double _turns = 0;
  bool _visible = true;

  @override
  void initState() {
    super.initState();
    AppVisibility.foreground.addListener(_sync);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _visible = TickerMode.of(context); // üstte başka sayfa varken false
    _sync();
  }

  void _sync() {
    final run = _visible && AppVisibility.isForeground;
    if (run && _t == null) {
      const step = 1000 ~/ _fps;
      _t = Timer.periodic(const Duration(milliseconds: step), (_) {
        if (mounted) setState(() => _turns = (_turns + step / _periodMs) % 1.0);
      });
    } else if (!run) {
      _t?.cancel();
      _t = null;
    }
  }

  @override
  void dispose() {
    AppVisibility.foreground.removeListener(_sync);
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      alignment: Alignment.center,
      decoration: const BoxDecoration(gradient: LinearGradient(colors: kGoldDeep, begin: Alignment.topLeft, end: Alignment.bottomRight)),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.graphic_eq, color: Colors.white, size: 22),
        Text(widget.initial, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15)),
      ]),
    );
    return Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 8)],
      ),
      child: ClipOval(
        child: RepaintBoundary(
          child: Transform.rotate(
            angle: _turns * 2 * math.pi,
            child: widget.cover == null
                ? fallback
                : NetImg(widget.cover!, box: const Size.square(64), fit: BoxFit.cover, errorBuilder: (_, __, ___) => fallback),
          ),
        ),
      ),
    );
  }
}
