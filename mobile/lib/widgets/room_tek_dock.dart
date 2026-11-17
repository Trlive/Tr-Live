import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import '../services/room_dock.dart';
import '../services/session.dart';
import '../services/socket_service.dart';
import '../version.dart';
import 'app_theme.dart';

/// Oyun işaretleri (menü kutusu ve odadaki oyun balonu). Görseller özgündür: assets/images/game_*.webp.
class TekLogo extends StatelessWidget {
  final double size;
  const TekLogo({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) => Image.asset('assets/images/game_tek.webp', width: size, height: size, fit: BoxFit.contain);
}

class LudoLogo extends StatelessWidget {
  final double size;
  const LudoLogo({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) => Image.asset('assets/images/game_ludo.webp', width: size, height: size, fit: BoxFit.contain);
}

/// Odadaki oyunlar (TEK kart oyunu ve Ludo): açık oyun varken sağda küçük bir balon durur; dokununca odanın üst
/// kısmında oyun penceresi (kendi sunucumuzdaki sabit H5 sayfası, WebView) açılır. Sohbet ve alt çubuk açık kalır;
/// ses bağlantısı etkilenmez. Odada aynı anda tek oyun açık olabilir; pencere hangi oyun açıksa onu gösterir.
///
/// Güvenlik kuralları [AppWebViewModal] ile aynıdır: yalnızca [Api.baseUrl] ile aynı kaynak yüklenir, oturum bileti
/// adrese yazılmaz (ilk istekte başlıkla gider; sayfa isteyince yalnızca aynı kaynaktaki sayfaya verilir).
///
/// Sayfanın gönderebileceği kanal mesajları: getToken, minimize, haptic, ready.
/// Uygulama, odadaki canlı oyun durumunu (`room_tek_state` / `room_game_state`; el içermez) sayfaya
/// `window.TRGame.push(...)` ile iletir.
class RoomTekDock extends StatefulWidget {
  final String roomId;
  /// Oyun penceresinin üstünde durur: odadaki mikrofon koltukları (oturanlar, konuşanlar) ve mikrofon sırası.
  final WidgetBuilder? seatStrip;
  const RoomTekDock({super.key, required this.roomId, this.seatStrip});

  @override
  State<RoomTekDock> createState() => RoomTekDockState();
}

class RoomTekDockState extends State<RoomTekDock> with SingleTickerProviderStateMixin {
  Map<String, dynamic>? _game; // odadaki açık oyun (bekliyor / oynanıyor); yoksa null
  bool _open = false; // oyun penceresi açık mı
  String _pageType = 'tek'; // açık penceredeki oyun sayfası: 'tek' | 'ludo'
  WebViewController? _wv;
  bool _trusted = false; // gösterilen sayfa bizim sunucumuzdan mı
  bool _failed = false;
  double _chipDy = 0; // balonun kullanıcı tarafından kaydırılan dikey konumu
  StreamSubscription? _sub;
  Timer? _poll;
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
  late final Uri _base = Uri.parse(Api.baseUrl);

  bool _sameOrigin(String url) {
    final u = Uri.tryParse(url);
    if (u == null) return false;
    return u.scheme == _base.scheme && u.host == _base.host && u.port == _base.port;
  }

  @override
  void initState() {
    super.initState();
    _sub = SocketService.instance.events.listen(_onEvent);
    // Kaçan bir yayın olursa balon bayat kalmasın: seyrek aralıklı yoklama (pencere açıkken sayfa kendi yeniler).
    _poll = Timer.periodic(const Duration(seconds: 25), (_) {
      if (mounted && !RoomDock.minimized.value) _load();
    });
    RoomDock.minimized.addListener(_onRoomDock);
    _load();
  }

  @override
  void dispose() {
    RoomDock.minimized.removeListener(_onRoomDock);
    _sub?.cancel();
    _poll?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  void _onRoomDock() {
    if (!mounted) return;
    // Oda küçültülünce oyun penceresi de kapanır (arkada sayfa çalışmaya devam etmesin).
    if (RoomDock.minimized.value && _open) {
      _collapse();
    } else {
      setState(() {});
      _syncPulse();
    }
  }

  void _onEvent(Map<String, dynamic> e) {
    final type = e['type'];
    if (type == 'connected') {
      _load(); // bağlantı yeniden kuruldu: kaçan durum olabilir
      return;
    }
    // TEK ayrı olayla, Ludo eski olay adıyla yayınlanır.
    if (type != 'room_tek_state' && type != 'room_game_state') return;
    final g = mapOf(e['game']);
    if (g == null || g['roomId'] != widget.roomId) return;
    _pushToPage(g);
    _apply(g);
  }

  Future<void> _load() async {
    try {
      final r = await Api.get('/api/rooms/${widget.roomId}/game', query: {'type': 'any'});
      if (!mounted) return;
      final g = mapOf(r['game']);
      if (g != null) {
        _apply(g);
      } else if (_game != null) {
        setState(() => _game = null);
        _syncPulse();
      }
    } catch (_) {/* bir sonraki yayın ya da yoklama düzeltir */}
  }

  bool _isPlayer(Map<String, dynamic> g) {
    for (final p in listOf(g['players'])) {
      if (mapOf(p['user'])?['id'] == Session.id && p['out'] != true) return true;
    }
    return false;
  }

  bool get _myTurn => _game != null && _game!['status'] == 'playing' && _game!['turnUserId'] == Session.id;

  void _apply(Map<String, dynamic> g) {
    if (!mounted) return;
    final prev = _game;
    final status = g['status'];
    String? prevStatus; // aynı oyunun bendeki son durumu
    num prevSeq = 0;
    if (prev != null && prev['id'] == g['id']) {
      prevStatus = prev['status']?.toString();
      prevSeq = (prev['seq'] as num?) ?? 0;
    }
    // Bayat (sırası geçmiş) durum yenisinin üzerine yazılmasın.
    if (prevStatus == 'playing') {
      if (status == 'waiting') return;
      if (status == 'playing' && ((g['seq'] as num?) ?? 0) < prevSeq) return;
    }
    final active = status == 'waiting' || status == 'playing';
    final wasMyTurn = _myTurn;
    final started = status == 'playing' && prevStatus != 'playing';
    setState(() => _game = active ? g : null);
    // Oyun başladı ve oyuncuyum: pencere kendiliğinden açılır.
    if (started && !_open && !RoomDock.minimized.value && _isPlayer(g)) openPanel();
    if (_myTurn && !wasMyTurn && !_open) HapticFeedback.mediumImpact();
    _syncPulse();
  }

  // Balon, dikkat gerektiğinde (sıra bende / katılabileceğim oyun var) hafifçe atar; gerekmediğinde animasyon durur.
  void _syncPulse() {
    final g = _game;
    final attention = !_open && !RoomDock.minimized.value && g != null && (_myTurn || (g['status'] == 'waiting' && !_isPlayer(g)));
    if (attention) {
      if (!_pulse.isAnimating) _pulse.repeat(reverse: true);
    } else if (_pulse.isAnimating || _pulse.value != 0) {
      _pulse.stop();
      _pulse.value = 0;
    }
  }

  /// Oyun penceresini açar (oyun menüsünden ya da balondan). Açık oyun yoksa [type] oyununun "oyun aç" ekranı görünür;
  /// odada açık bir oyun varsa her zaman o oyunun sayfası açılır.
  void openPanel({String? type}) {
    if (_open || !mounted) return;
    final current = _game?['type']?.toString();
    _pageType = current == 'ludo' ? 'ludo' : (current == 'tek' ? 'tek' : (type == 'ludo' ? 'ludo' : 'tek'));
    final c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Pal.bg)
      ..addJavaScriptChannel('TRLive', onMessageReceived: _onMessage)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (r) => _sameOrigin(r.url) ? NavigationDecision.navigate : NavigationDecision.prevent,
        onPageStarted: (url) => _trusted = _sameOrigin(url),
        onUrlChange: (ch) => _trusted = ch.url != null && _sameOrigin(ch.url!),
        onWebResourceError: (e) {
          if (e.isForMainFrame != false && mounted && _open) setState(() => _failed = true);
        },
      ));
    _trusted = false;
    setState(() {
      _wv = c;
      _open = true;
      _failed = false;
    });
    _syncPulse();
    _loadPage(c);
  }

  Future<void> _loadPage(WebViewController c) async {
    final url = '${Api.baseUrl}/room-game/$_pageType?roomId=${Uri.encodeQueryComponent(widget.roomId)}&lang=${Uri.encodeQueryComponent(L10n.lang.value)}';
    if (!_sameOrigin(url)) {
      if (mounted) setState(() => _failed = true);
      return;
    }
    if (mounted) setState(() => _failed = false);
    try {
      await Api.ensureFreshToken();
    } catch (_) {/* ağ hatasında eldeki token ile denenir */}
    if (!mounted || _wv != c) return;
    try {
      await c.loadRequest(
        Uri.parse(url),
        headers: {
          'X-App-Version': kAppVersion,
          if (Api.token != null) 'Authorization': 'Bearer ${Api.token}',
        },
      );
    } catch (_) {
      if (mounted && _wv == c) setState(() => _failed = true);
    }
  }

  void _collapse() {
    if (!_open || !mounted) return;
    setState(() {
      _open = false;
      _wv = null;
      _trusted = false;
      _failed = false;
    });
    _syncPulse();
    _load();
  }

  Future<void> _onMessage(JavaScriptMessage m) async {
    if (!_trusted || !mounted) return;
    String type;
    try {
      final d = jsonDecode(m.message);
      type = d is Map ? (d['type'] ?? '').toString() : m.message;
    } catch (_) {
      type = m.message;
    }
    switch (type) {
      case 'getToken':
        await _sendToken();
      case 'minimize':
        _collapse();
      case 'haptic':
        HapticFeedback.mediumImpact();
    }
  }

  Future<void> _sendToken() async {
    try {
      await Api.ensureFreshToken();
    } catch (_) {}
    final t = Api.token;
    final c = _wv;
    if (t == null || c == null || !_trusted || !mounted) return;
    try {
      await c.runJavaScript('window.TRLiveAuth&&window.TRLiveAuth.set(${jsonEncode(t)});');
    } catch (_) {/* sayfa kapanmış olabilir */}
  }

  // Odadaki herkese giden canlı durum (el içermez) açık sayfaya iletilir; sayfa kendi elini sunucudan ayrıca alır.
  void _pushToPage(Map<String, dynamic> g) {
    final c = _wv;
    if (c == null || !_trusted || !_open || g['type'] != _pageType) return;
    c.runJavaScript('window.TRGame&&window.TRGame.push(${jsonEncode(g)});').catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    if (RoomDock.minimized.value) return const SizedBox.shrink();
    if (_open) return _panel(context);
    final g = _game;
    if (g == null) return const SizedBox.shrink();
    return _chip(context, g);
  }

  Widget _panel(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final top = MediaQuery.paddingOf(context).top;
    // Pencere ekranın üst kısmını kaplar; altta sohbet ve alt çubuk için en az 150 px kalır.
    final strip = widget.seatStrip;
    const stripH = 62.0;
    final h = math.max(300.0, math.min(math.max(size.height * 0.62, 470.0) + (strip != null ? stripH : 0), size.height - top - 150));
    final c = _wv;
    return Align(
      alignment: Alignment.topCenter,
      child: Container(
        width: double.infinity,
        height: top + h + 22,
        clipBehavior: Clip.antiAlias,
        decoration: const BoxDecoration(
          color: Pal.bg,
          borderRadius: BorderRadius.vertical(bottom: Radius.circular(18)),
          boxShadow: [BoxShadow(color: Colors.black87, blurRadius: 18, offset: Offset(0, 6))],
        ),
        child: Column(children: [
          SizedBox(height: top),
          if (strip != null) SizedBox(height: stripH, child: strip(context)),
          Expanded(
            child: _failed || c == null
                ? Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.wifi_off, size: 34, color: Pal.textDim),
                      const SizedBox(height: 8),
                      Text(tx('Sayfa yüklenemedi.'), style: const TextStyle(color: Pal.textDim)),
                      const SizedBox(height: 10),
                      FilledButton(
                        onPressed: () {
                          final w = _wv;
                          if (w != null) _loadPage(w);
                        },
                        child: Text(tx('Tekrar dene')),
                      ),
                    ]),
                  )
                : WebViewWidget(controller: c),
          ),
          // Sayfa açılmasa da pencere her zaman buradan küçültülebilir.
          Material(
            color: Pal.surface,
            child: InkWell(
              onTap: _collapse,
              child: const SizedBox(
                height: 22,
                width: double.infinity,
                child: Icon(Icons.keyboard_arrow_up, size: 20, color: Pal.textDim),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _chip(BuildContext context, Map<String, dynamic> g) {
    final size = MediaQuery.sizeOf(context);
    final waiting = g['status'] == 'waiting';
    final count = listOf(g['players']).length;
    final max = (g['maxPlayers'] as num?)?.toInt() ?? 9;
    final String label = _myTurn ? tx('Sıra sende') : (waiting ? (_isPlayer(g) ? '$count/$max' : tx('Katıl')) : '$count/$max');
    final hot = _myTurn || (waiting && !_isPlayer(g));
    final baseTop = size.height * 0.46;
    final lo = MediaQuery.paddingOf(context).top + 90;
    final hi = math.max(lo, size.height - 230);
    final top = math.min(math.max(baseTop + _chipDy, lo), hi);
    return Stack(children: [
      Positioned(
        right: 8,
        top: top,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => openPanel(),
          onVerticalDragUpdate: (d) => setState(() => _chipDy += d.delta.dy),
          child: ScaleTransition(
            scale: Tween<double>(begin: 1, end: 1.1).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut)),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 52,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF2A2010), Pal.bg]),
                  border: Border.all(color: hot ? Pal.gold : Pal.outline, width: 2),
                  boxShadow: [BoxShadow(color: hot ? const Color(0x99F2B92A) : Colors.black54, blurRadius: hot ? 12 : 6)],
                ),
                child: g['type'] == 'ludo' ? const LudoLogo(size: 46) : const TekLogo(size: 46),
              ),
              const SizedBox(height: 3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: hot ? Pal.cyan : const Color(0xCC0B0906),
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(color: Pal.outline),
                ),
                child: Text(
                  label,
                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: hot ? const Color(0xFF1C1405) : Pal.text),
                ),
              ),
            ]),
          ),
        ),
      ),
    ]);
  }
}
