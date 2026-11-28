import 'dart:async';
import '../features/live_rooms/domain/rules/seat_rules.dart';
import '../features/live_rooms/domain/rules/room_format.dart';
import '../features/live_rooms/presentation/widgets/gift_flight.dart';
import '../features/live_rooms/presentation/widgets/room_chrome.dart';
import '../features/live_rooms/presentation/widgets/seat_fx.dart';
import '../hybrid/webview/navigation_policy.dart';
import '../l10n/l10n.dart';
import '../services/screen_guard.dart';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../widgets/anim_asset.dart';
import '../widgets/app_webview_modal.dart';
import '../widgets/room_tek_dock.dart';
import '../widgets/room_theme_sheet.dart';
import '../widgets/beauty_sheet.dart';
import 'family_screen.dart';
import '../widgets/cosmetics.dart';
import '../widgets/entrance_strip.dart';
import '../widgets/fly_text.dart';
import '../widgets/lucky_bag.dart';
import '../widgets/marquee.dart';
import '../widgets/mic_emoji.dart';
import '../widgets/room_sheets.dart';
import 'package:flutter/services.dart';
import 'package:livekit_client/livekit_client.dart' as lk;
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api.dart';
import '../services/background_service.dart';
import '../services/beauty.dart';
import '../services/call_guard.dart';
import '../services/room_audio.dart';
import '../hybrid/feature_flags/feature_flags.dart';
import '../hybrid/asset_manager/asset_prefetch.dart';
import '../services/effect_prefs.dart';
import '../services/error_log.dart';
import '../services/inbox_service.dart';
import '../services/music_service.dart';
import '../services/room_playlist.dart';
import '../services/headset_audio.dart';
import '../services/audio_processing.dart';
import '../services/denoiser.dart';
import '../services/room_dock.dart';
import '../services/session.dart';
import '../services/socket_service.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/scoreboard_ui.dart';
import '../widgets/drag_bubble.dart';
import '../widgets/birthday_stage.dart';
import '../widgets/mic_skin_sheet.dart';
import '../widgets/id_badge.dart';
import '../widgets/cp_widgets.dart';
import '../widgets/crown_icon.dart';
import '../widgets/gift_ribbon.dart';
import '../widgets/safety_actions.dart';
import '../widgets/pk_banner.dart';
import '../widgets/room_theme.dart';
import '../widgets/seat_picker.dart';
import '../widgets/chat_merge.dart';
import '../widgets/lucky_win_fx.dart';
import '../services/fx_load.dart';
import '../widgets/video_grid.dart';
import 'gift_sheet.dart';
import 'pk_sheet.dart';
import '../widgets/reconnect_pill.dart';
import '../widgets/room_moderation_sheet.dart';
import '../widgets/room_pk.dart';
import '../widgets/video_pk.dart';
import 'music_screens.dart';
import 'inbox_screens.dart';
import '../widgets/level_badge.dart';
import 'user_screens.dart';

// Oda ekranı konu konu part dosyalarına bölündü (rapor O-01); her biri _RoomScreenState üzerinde bir extension.
part 'room/room_events.dart';
part 'room/room_livekit.dart';
part 'room/room_mic.dart';
part 'room/room_admin.dart';
part 'room/room_chat.dart';
part 'room/room_members.dart';
part 'room/room_stage.dart';
part 'room/room_bars.dart';

Map<String, String> get _roleLabels => {'owner': tx('Oda sahibi'), 'cohost': tx('Yardımcı sahip'), 'moderator': tx('Moderatör'), 'user': tx('Üye')};
const _roleLevel = {'user': 1, 'moderator': 2, 'cohost': 3, 'owner': 4};

class RoomScreen extends StatefulWidget {
  final String roomId;
  final String initialName;
  final bool locked;
  final String? code; // gizli oda davet kodu
  const RoomScreen({super.key, required this.roomId, this.initialName = 'Oda', this.locked = false, this.code});

  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> with WidgetsBindingObserver {
  /// part dosyalarındaki extension'lar için setState köprüsü (setState korumalı üyedir; extension'dan doğrudan çağrılamaz).
  void _set(VoidCallback fn) => setState(fn);

  Map<String, dynamic>? _room;
  final Map<String, GlobalKey> _seatKeys = {}; // koltuk avatarı konumları (hediye uçuşu için)
  final GlobalKey _stageKey = GlobalKey();
  final GlobalKey _viewersKey = GlobalKey();
  final List<GiftFlightData> _flights = [];
  // Şanslı hediye kazanç efektleri (odadaki herkes görür).
  final List<LuckyWinFxData> _luckyFx = [];
  int _flightSeq = 0;
  // Mikte oynayan hediyeler (yumurta, domates): alıcının koltuk dairesinin içinde oynar.
  final List<SeatFx> _seatFx = [];
  // Efekt katmanı (uçan ikonlar, koltuk efektleri, şanslı kazanç) kendi başına yeniden çizilir: hediye yağmurunda her
  // olay bütün oda ekranını (koltuklar, sohbet, üst bilgi) yeniden kurmasın.
  final ValueNotifier<int> _fxTick = ValueNotifier(0);
  void _fxChanged() => _fxTick.value++;
  // Oda toplamı ve skor tablosu gibi sık değişen bilgiler en çok ~3 kez/sn ekrana yansır (her hediyede değil).
  Timer? _softTimer;
  void _softRefresh() {
    if (_softTimer != null) return;
    _softTimer = Timer(const Duration(milliseconds: 350), () {
      _softTimer = null;
      if (mounted) setState(() {});
    });
  }

  /// Bellek azaldı: ekrandaki süslemeler kaldırılır (ses, sohbet ve koltuklar etkilenmez).
  void _onMemoryPressure() {
    if (!mounted) return;
    _flights.clear();
    _seatFx.clear();
    _luckyFx.clear();
    _fxChanged();
  }
  Map<String, dynamic> _me = {};
  List<Map<String, dynamic>> _members = [];
  bool _loading = true;
  bool _joined = false;
  bool _closing = false;
  bool _rejoining = false;
  Timer? _beat;
  /// Sistem duyurusu ve oda duyurusu: odaya ilk girişte birkaç saniye görünür, sonra kalkar (aynı oturumda aynı odaya
  /// yeniden girince hiç gösterilmez).
  static final Set<String> _noticeSeen = {};
  bool _showHeads = true;
  Timer? _headsTimer;

  lk.Room? _lk;
  bool _lkConnecting = false;
  int _lkRetries = 0; // ses bağlantısı koparsa artan bekleme ile yeniden bağlanılır
  Timer? _lkRetryTimer; // ses bağlantısını yeniden deneme zamanlayıcısı (tek; üst üste binmez)
  Timer? _beatRetry; // ağ hatasında "oda açık" sinyalinin erken tekrarı
  // Soket yeniden bağlanınca durum, oda aboneliği onaylandıktan SONRA yeniden alınır; olay boşluğunda da (en çok 5 sn'de bir).
  bool _resyncAfterSubscribe = false;
  Timer? _resyncFallback;
  Timer? _gapTimer;
  DateTime _gapAt = DateTime.fromMillisecondsSinceEpoch(0);
  int? _snapSeq; // üye listesi abonelikten önce alındıysa o anki oda olay numarası (ilk giriş yarışı)
  int _lkGen = 0; // ses bağlantısı kuşağı: eski bağlantının geç gelen olayı yenisini etkilemesin
  lk.ConnectionState? _lkPrevState; // SDK'nın kendi yeniden bağlanmasını fark etmek için
  bool? _lkCanPublish; // son görülen yayın izni (izin sonradan gelirse mikrofon o an açılır)
  DateTime? _lkPermFixAt; // yayın izni uyuşmazlığında bağlantı en son ne zaman yenilendi
  bool _syncing = false; // yayın eşitlemesi sürüyor
  bool _syncAgain = false; // eşitleme sürerken yeni istek geldi
  Timer? _lkTick; // LiveKit değişikliklerinde tüm odayı saniyede onlarca kez yeniden çizmemek için
  String? _lkSig; // son çizilen LiveKit durumu (bkz. _lkSignature)
  String? _password; // kilitli odada yeniden katılırken gerekir
  String? _lkError;
  bool _micOn = true;
  bool _camOn = true;

  StreamSubscription? _sub;

  final List<Map<String, dynamic>> _messages = [];
  // Sohbet temizleme: o andan önce yazılan mesajlar (geç gelen olay ya da temizlemeden önce başlamış bir yükleme ile)
  // geri gelmesin. Her temizlemede sayaç artar; süren yükleme dönünce sayaç değiştiyse sonucu atılır.
  DateTime? _chatClearedAt;
  int _chatEpoch = 0;
  final _chatCtl = TextEditingController();
  final _chatScroll = ScrollController();
  int _unseen = 0; // yukarıdaki eski mesajlar okunurken gelen yeni mesaj sayısı
  bool _sending = false;
  bool _chatMuted = false;
  bool _inputOpen = false;
  bool _roomMuted = false;
  /// Yalnızca bu telefonda sesi kapatılan kişiler (YoHo'daki "sesini kapat": karşı taraf bilmez, odadan çıkınca sıfırlanır).
  final Set<String> _localMuted = {};
  DateTime? _weakNetAt; // "internetiniz zayıf" uyarısı en çok dakikada bir

  // Oda içi sayı tahtası (kullanıcı → alınan toplam Coin) ve PK durumu
  final Map<String, String> _scores = {};
  Map<String, dynamic>? _pk;
  Map<String, dynamic>? _roomPk; // sesli oda içi PK (Kırmızı / Mavi takım)
  DateTime? _pkResultUntil; // biten turun sonucu bu ana kadar sahnede kalır
  bool _inviteOpen = false;

  bool get _isManager => _myRole == 'owner' || _myRole == 'cohost' || _myRole == 'moderator';
  bool get _chatOpen => _room?['chatEnabled'] != false || _isManager;

  bool get _isVideo => _room?['roomType'] == 'video';
  /// Canlı yayın: yayıncı tam ekran, konuklar sağda küçük pencerelerde. Değilse görüntülü oda çoklu (ızgara) yayındır.
  bool get _isLive => _isVideo && _room?['layout'] == 'live';
  bool get _isGrid => _isVideo && !_isLive;
  /// Tekli görüntülü yayında süren / yeni biten PK: ekran ikiye bölünür (solda biz, sağda rakip).
  /// Sesli odada PK modu açık (9'lu koltuk): koltuklar Figma PK sahnesine dizilir.
  bool get _pkStage => !_isVideo && _roomPk != null && _seatCount == kRoomPkSeats;
  bool get _pkLive => _isLive && _pk != null && (_pk!['status'] == 'active' || _pk!['status'] == 'finished');
  lk.CameraPosition _camPos = lk.CameraPosition.front;
  final EntranceQueue _entrance = EntranceQueue();
  // Uçan yazı (ücretli mesaj ve "Hoş geldin" selamı) ve uygulama uyarı duyurusu.
  final FlyTextQueue _fly = FlyTextQueue();
  bool _flyMode = false;
  int _flyCost = 99;
  bool _activitiesOn = true; // yönetimdeki genel "Oda Etkinlikleri" anahtarı
  bool _cardGameOn = true; // yönetimdeki genel "TEK kart oyunu" anahtarı
  final _tekDockKey = GlobalKey<RoomTekDockState>(); // odadaki TEK oyunu balonu / penceresi
  String _appNotice = '';
  Timer? _followTimer;
  final Set<String> _welcomed = {};
  final List<Map<String, dynamic>> _bags = []; // bu odadaki açık şanslı çantalar
  /// Henüz açmadığım çantalar: açtığım çanta bana görünmez; çanta tamamen bitince herkesten kalkar.
  List<Map<String, dynamic>> get _openBags => _bags.where((b) => b['mine'] == null).toList();
  int get _seatCount => (_room?['seatCount'] as num?)?.toInt() ?? 8;
  String? get _micSkin => _room?['micSkin']?.toString();
  bool get _birthday => _micSkin == kBirthdaySkin && _seatCount == kBirthdaySeats;
  String get _myRole => (_me['role'] ?? 'user').toString();
  bool get _onSeat => _me['microphone'] == true;

  /// Bu ekranın dock'taki açılış sırası: eski odanın geç gelen olayı yeni odayı kapatmasın (RoomDock.closeIf).
  final int _dockSerial = RoomDock.serial;

  @override
  void initState() {
    super.initState();
    _sub = SocketService.instance.events.listen(_onEvent);
    _chatScroll.addListener(_onChatScroll);
    RoomDock.exitHandler = _onBack;
    // Telefon araması gelince oda sesi ve mikrofon kapanır, bitince açılır.
    CallGuard.instance.inCall.addListener(_onPhoneCall);
    RoomAudio.systemSilent.addListener(_applyRoomSound);
    CallGuard.instance.start();
    WidgetsBinding.instance.addObserver(this);
    FxLoad.pressure.addListener(_onMemoryPressure);
    AssetPrefetch.run(); // varlık listesi (bayrak kapalıysa eski warmGifts yolu)
    _enter();
  }

  /// Her 60 sn'de sunucuya "oda açık" sinyali gider: üyeyi canlı tutar, WebSocket aboneliğini tazeler,
  /// oda sunucuda kapanmışsa kullanıcı sonsuza dek ölü odada kalmaz. (Sunucu üyeyi 3 dk sinyalsiz kalınca çıkarır;
  /// soket bağlıyken hiç çıkarmaz. 25 sn yerine 60 sn: telefon daha seyrek uyanır, daha az internet.)
  void _startHeartbeat() {
    _beat?.cancel();
    _beat = Timer.periodic(const Duration(seconds: 60), (_) => _beatOnce());
  }

  /// Tek sinyal. Ağ hatasında 10 sn sonra bir kez daha denenir (eskiden bir sonraki sinyal 60 sn beklerdi; art arda
  /// iki kayıp, üyeliğin düşmesine yaklaştırıyordu). Her sinyalde ses bağlantısı da denetlenir: kopuk kaldıysa yeniden kurulur.
  Future<void> _beatOnce({bool retry = true}) async {
    if (!mounted || !_joined || _closing) return;
    SocketService.instance.subscribeRoom(widget.roomId);
    _ensureAudio();
    try {
      await Api.post('/api/rooms/${widget.roomId}/heartbeat');
    } on ApiException catch (e) {
      if (!mounted || _closing) return;
      if (e.statusCode == 404) {
        _exit(tx('Oda kapandı.'));
      } else if (e.statusCode == 409) {
        _exit(e.message); // başka odaya geçilmiş: geri katılınmaz
      } else if (e.statusCode == 403) {
        _rejoin();
      } else if (e.statusCode == null && retry) {
        // Ağ kesintisi / zaman aşımı: kısa süre sonra bir kez daha.
        _beatRetry?.cancel();
        _beatRetry = Timer(const Duration(seconds: 10), () => _beatOnce(retry: false));
      }
    } catch (_) {/* beklenmeyen hata: bir sonraki sinyalde tekrar denenir */}
  }

  /// Arka plandan dönünce oda bilgisi yenilenir (bağlantı arada kopmuş olabilir).
  /// Arka plana geçince görüntülü odada görüntü indirilmez / kamera kapanır (ses sürer); dönünce geri açılır.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _pauseVideo();
      return;
    }
    // Bölünmüş ekranda uygulama görünür ama "inactive" kalabilir: görüntü yine açılsın.
    if (state == AppLifecycleState.inactive) {
      if (_joined && !_closing && mounted) _resumeVideo();
      return;
    }
    if (state != AppLifecycleState.resumed || !_joined || _closing || !mounted) return;
    _resumeVideo();
    _resync();
  }

  // ---------- Arka planda görüntü tasarrufu (görüntülü odalar) ----------
  bool _videoPaused = false;
  final Set<Object> _unsubbed = Set<Object>.identity();

  /// Olay boşluğu sonrası toparlama: ardışık boşluklar tek yeniden almaya birleşir (en çok 5 sn'de bir).
  void _resyncAfterGap() {
    final since = DateTime.now().difference(_gapAt);
    if (since >= const Duration(seconds: 5)) {
      _gapAt = DateTime.now();
      _resync();
    } else {
      _gapTimer ??= Timer(const Duration(seconds: 5) - since, () {
        _gapTimer = null;
        _gapAt = DateTime.now();
        _resync();
      });
    }
  }

  /// Bağlantı koptuktan / uygulama arka plandan döndükten sonra kaçırılan olayları telafi eder:
  /// koltuklar, üyeler, sohbet, puanlar, PK, çantalar ve müzik sunucudan yeniden alınır.
  Future<void> _resync() async {
    if (!_joined || _closing || !mounted) return;
    SocketService.instance.subscribeRoom(widget.roomId);
    try {
      await _loadMembers();
    } on ApiException catch (e) {
      // Oda bu arada kapanmış / üyelik düşmüş: 60 sn'lik sinyali beklemeden hemen sonuçlandır. (Eskiden bu hata
      // sessizce yutuluyor, kullanıcı bir dakikaya kadar kapanmış odada bekliyordu.)
      if (!mounted || _closing) return;
      if (e.statusCode == 404) {
        _exit(tx('Oda kapandı.'));
        return;
      }
      if (e.statusCode == 403) {
        _rejoin();
        return;
      }
    } catch (_) {/* ağ yoksa bir sonraki sinyalde */}
    if (!mounted || _closing) return;
    _loadMessages();
    _loadExtras();
    MusicService.instance.refresh();
    _ensureAudio();
  }

  @override
  void dispose() {
    _queueTick.dispose();
    FxLoad.pressure.removeListener(_onMemoryPressure);
    _softTimer?.cancel();
    _fxTick.dispose();
    _headsTimer?.cancel();
    CallGuard.instance.inCall.removeListener(_onPhoneCall);
    RoomAudio.systemSilent.removeListener(_applyRoomSound);
    CallGuard.instance.stop();
    HeadsetAudio.instance.stop();
    RoomAudio.leave();
    if (_denoiseStarted) unawaited(Denoiser.roomStopped());
    EffectPrefs.roomMuted.value = false;
    _beat?.cancel();
    _beatRetry?.cancel();
    _resyncFallback?.cancel();
    _gapTimer?.cancel();
    _lkRetryTimer?.cancel();
    _lkGen++; // süren bağlanma denemesi / geç gelen kopma olayı bu ekranı artık etkilemesin
    _lkTick?.cancel();
    for (final t in _micEmojiTimers.values) {
      t.cancel();
    }
    _entrance.dispose();
    _fly.dispose();
    _followTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    if (RoomDock.exitHandler == _onBack) RoomDock.exitHandler = null;
    _sub?.cancel();
    _chatCtl.dispose();
    _chatScroll.dispose();
    RoomPlaylist.instance.bind(null); // önce: liste odadan çıkılırken sıradakini çalmasın
    MusicService.instance.unbind();
    SocketService.instance.unsubscribeRoom();
    if (_joined) {
      _joined = false;
      Api.post('/api/rooms/${widget.roomId}/leave').catchError((_) => <String, dynamic>{});
    }
    final room = _lk;
    _lk = null;
    if (room != null) {
      room.removeListener(_onLkChanged);
      _disposeLkListener();
      // Bağlantı kopması bir-iki saniye sürebilir; bu sırada eski odanın konuşmaları yeni odanın sesinin üstüne
      // binmesin diye uzak sesler hemen kapatılır.
      for (final p in room.remoteParticipants.values) {
        for (final pub in p.audioTrackPublications) {
          if (!pub.subscribed) continue;
          try {
            pub.track?.mediaStreamTrack.enabled = false;
          } catch (_) {/* iz zaten kapanmış */}
        }
      }
      room.disconnect().whenComplete(() => room.dispose()).catchError((_) {});
    }
    super.dispose();
  }

  // ---------- Giriş / çıkış ----------
  Future<void> _enter() async {
    try {
      String? password;
      if (widget.locked) {
        await WidgetsBinding.instance.endOfFrame; // initState içinde hemen diyalog açılmasın (ilk kare çizilsin)
        if (!mounted) return;
        password = await askText(context, tx('Oda şifresi'), obscure: true);
        if (password == null) {
          if (mounted) RoomDock.closeIf(_dockSerial);
          return;
        }
      }
      _password = password;
      final r = await Api.post('/api/rooms/${widget.roomId}/join', {if (password != null) 'password': password, if (widget.code != null) 'code': widget.code});
      if (!mounted) {
        Api.post('/api/rooms/${widget.roomId}/leave').catchError((_) => <String, dynamic>{});
        return;
      }
      _joined = true;
      _room = mapOf(r['room']);
      _me = mapOf(r['me']) ?? {};
      SocketService.instance.subscribeRoom(widget.roomId);
      // Ses bağlantısı (en yavaş adım: token + WebRTC el sıkışması) üye listesini BEKLEMEDEN başlar; sohbet geçmişi de
      // aynı anda gelir. Koltuktaysam yayın, üye listesi gelince (_loadMembers → _syncPublish) açılır.
      _connectLivekit();
      _loadMessages(initial: true);
      await _loadMembers();
      if (!mounted) return;
      setState(() => _loading = false);
      // Kendi giriş şeridim (WIP seviyeme göre) de odaya girerken görünür.
      final meRow = _members.where((m) => m['userId']?.toString() == Session.id);
      final meUser = meRow.isEmpty ? null : mapOf(meRow.first['user']);
      if (meUser != null && EffectPrefs.entranceFx) _entrance.add(meUser);
      // Kendi "odaya girdi" satırım (sunucu duyurusu abone olmadan önce gittiği için yerelden eklenir).
      if (meUser != null && !(_me['hidden'] == true)) {
        _messages.add({'id': 'join-me-${DateTime.now().microsecondsSinceEpoch}', 'join': true, 'user': meUser});
      }
      // Kendi giriş aracım / efektim: sunucunun odaya duyurusu bize abone olmadan önce gittiği için yanıttan oynatılır.
      final myEntrance = mapOf(r['entrance']);
      final myEffect = mapOf(myEntrance?['effect']);
      if (myEffect != null) {
        Future.delayed(const Duration(milliseconds: 500), () {
          if (mounted) SocketService.instance.emitLocal({'type': 'local_entrance', 'roomId': widget.roomId, 'user': myEntrance?['user'], 'entranceEffect': myEffect});
        });
      }
      _loadExtras();
      MusicService.instance.bind(widget.roomId);
      RoomPlaylist.instance.bind(widget.roomId);
      _startHeartbeat();
      if (_noticeSeen.contains(widget.roomId)) {
        if (mounted) setState(() => _showHeads = false);
      } else {
        _noticeSeen.add(widget.roomId);
        _headsTimer = Timer(const Duration(seconds: 12), () {
          if (mounted) setState(() => _showHeads = false);
        });
      }
      BackgroundService.instance
          .ensurePermissions((msg, action) => confirm(context, msg, action: action))
          .catchError((_) {})
          .whenComplete(() => CallGuard.instance.requestPhonePermission());
    } catch (e) {
      // Sunucu girişi yapmış ama yanıt gelmemiş olabilir (zaman aşımı / bağlantı kesildi): üyelik asılı kalmasın.
      final code = e is ApiException ? e.statusCode : null;
      if (code == null || code >= 500 || code == 408) {
        Api.post('/api/rooms/${widget.roomId}/leave').catchError((_) => <String, dynamic>{});
      }
      if (!mounted) return;
      toast(context, errorText(e), error: true);
      RoomDock.closeIf(_dockSerial);
    }
  }

  /// Oda içi PK durumunu yeniden okur (süre bitti ama sonuç bildirimi kaçtıysa çubuk takılı kalmasın).
  Future<void> _reloadRoomPk() async {
    try {
      final r = await Api.get('/api/rooms/${widget.roomId}/room-pk');
      if (mounted) setState(() => _roomPk = mapOf(r['pk']));
    } catch (_) {/* sonraki denemede */}
  }

  Future<void> _loadExtras() async {
    // 7 bağımsız istek AYNI ANDA (eskiden sırayla: odaya girişten sonra 1–2 sn ek bekleme). Biri hata verirse
    // diğerleri etkilenmez.
    Future<Map<String, dynamic>?> get(String path) => Api.get(path).then<Map<String, dynamic>?>((r) => r).catchError((_) => null);
    final ownerId = _room?['ownerId']?.toString();
    final res = await Future.wait<Map<String, dynamic>?>([
      get('/api/rooms/${widget.roomId}/scoreboard'),
      get('/api/rooms/${widget.roomId}/pk'),
      _isVideo ? Future.value(null) : get('/api/rooms/${widget.roomId}/room-pk'),
      get('/api/rooms/${widget.roomId}/lucky-bags'),
      get('/api/rooms/${widget.roomId}/mic/queue'),
      ownerId != null && ownerId != Session.id ? get('/api/rooms/hosts/$ownerId/favorite') : Future.value(null),
      get('/api/app/config'),
      get('/api/activities/access'),
    ]);
    if (!mounted) return;
    final s = res[0], pk = res[1], roomPk = res[2], lb = res[3], q = res[4], f = res[5], c = res[6], act = res[7];
    setState(() {
      if (s != null) {
        _sbKnown = s.containsKey('session');
        _sbSession = mapOf(s['session']);
        _scores
          ..clear()
          ..addEntries(listOf(s['scoreboard']).map((x) => MapEntry(x['userId'].toString(), x['coins'].toString())));
      }
      if (pk != null) _pk = mapOf(pk['pk']);
      if (roomPk != null || _isVideo) _roomPk = mapOf(roomPk?['pk']);
      if (lb != null) _bags..clear()..addAll(listOf(lb['bags']));
      if (q != null) _queue = ((q['queue'] as List?) ?? const []).map((x) => x.toString()).toList();
      if (f != null) _fav = f['favorite'] == true;
      if (c != null) {
        _appNotice = (c['roomNotice'] ?? '').toString().trim();
        _flyCost = (c['flyTextCoins'] as num?)?.toInt() ?? _flyCost;
        _activitiesOn = c['roomActivitiesEnabled'] != false;
        _cardGameOn = c['cardGameEnabled'] != false;
        // Oda sesinin görüşme yolundan çalınması (kulaklık ve yankı düzeltmesi). Panelden kapatılabilir.
        RoomAudio.enabled = c['voiceAudioPath'] != false;
        Flags.applyConfig(c); // oda açılışında bayraklar da tazelenir
        WebViewPolicy.applyConfig(c);
      }
      // İzin sunucuda: izinli değilse (ya da sorgu yanıtsızsa) Etkinlikler menüsü hiç görünmez.
      if (act?['allowed'] != true) _activitiesOn = false;
    });
    if (q != null) {
      _queueLoaded = true;
      _queueTick.value++;
    }
    // Yayıncıyı takip etmeyenlere bir dakika sonra sohbette "takip edin" kartı.
    if (ownerId != null && ownerId != Session.id && f != null && !_fav) {
      _followTimer?.cancel();
      _followTimer = Timer(const Duration(seconds: 60), () {
        if (!mounted || _fav || _messages.any((m) => m['follow'] == true)) return;
        setState(() => _messages.add({'id': 'follow-card', 'follow': true}));
        _scrollChatToEnd();
      });
    }
  }

  // ---------- Sıra, favori, oda değiştirme ----------
  List<String> _queue = [];
  bool _queueLoaded = false; // ilk sıra yüklendi (öncesinde gelen değişiklik için bildirim gösterilmez)
  final ValueNotifier<int> _queueTick = ValueNotifier(0); // açık "Konuk istekleri" penceresi yenilensin
  final Map<String, DateTime> _guestToastAt = {};
  bool _fav = false;
  bool _switching = false;

  bool get _inQueue => _queue.contains(Session.id);
  bool get _noFreeSeat => noFreeSeat(members: _members, seatCount: _seatCount, lockedSeats: _lockedSeats);

  Future<void> _toggleQueue() async {
    final r = await guard(context, () => _inQueue ? Api.delete('/api/rooms/${widget.roomId}/mic/queue') : Api.post('/api/rooms/${widget.roomId}/mic/queue'));
    if (r == null || !mounted) return;
    setState(() => _queue = ((r['queue'] as List?) ?? const []).map((x) => x.toString()).toList());
    if (_inQueue) {
      toast(
        context,
        _isLive
            ? tx('Konuk isteğin yayıncıya gönderildi. Kabul ederse kameran açılarak yayına bağlanacaksın.')
            : (_micRequest ? tx('Mikrofon isteğin gönderildi. Yetkili onaylayınca mikrofona çıkabilirsin.') : tx('Sıraya girdiniz. Sıra size gelince haber verilir.')),
      );
    }
  }

  Future<void> _toggleFavorite() async {
    final ownerId = _room?['ownerId']?.toString();
    if (ownerId == null) return;
    final r = await guard(context, () => _fav ? Api.delete('/api/rooms/hosts/$ownerId/favorite') : Api.post('/api/rooms/hosts/$ownerId/favorite'));
    if (r == null || !mounted) return;
    setState(() => _fav = r['favorite'] == true);
    toast(context, _fav ? tx('Yayıncı favorilere eklendi.') : tx('Favorilerden çıkarıldı.'));
  }

  /// Yukarı kaydır → sonraki oda, aşağı kaydır → önceki oda (sahip kendi odasından ayrılamaz).
  Future<void> _switchRoom(int dir) async {
    if (_switching || _myRole == 'owner') return;
    _switching = true;
    try {
      final r = await Api.get('/api/rooms', query: {'type': (_room?['roomType'] ?? 'audio').toString()});
      final list = listOf(r['rooms']).where((x) => x['locked'] != true && x['ownerId']?.toString() != Session.id).toList();
      if (!mounted) return;
      final cur = list.indexWhere((x) => x['id'] == widget.roomId);
      final others = list.where((x) => x['id'] != widget.roomId).toList();
      if (others.isEmpty) return toast(context, tx('Geçilecek başka oda yok.'));
      final all = list;
      final i = cur < 0 ? (dir > 0 ? 0 : all.length - 1) : (cur + dir + all.length) % all.length;
      final t = all[i];
      if (t['id'] == widget.roomId) return;
      RoomDock.open(RoomRequest(roomId: t['id'].toString(), name: (t['name'] ?? tx('Oda')).toString()));
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      _switching = false;
    }
  }

  Future<void> _loadMembers() async {
    final subscribedBefore = SocketService.instance.isSubscribedTo(widget.roomId);
    final r = await Api.get('/api/rooms/${widget.roomId}/members');
    if (!mounted) return;
    // Anlık görüntü abonelik onayından ÖNCE alındıysa, onaydaki numarayla karşılaştırılacak (aradaki olaylar kaçmış olabilir).
    final snap = (r['seq'] as num?)?.toInt();
    _snapSeq = !subscribedBefore && snap != null ? snap : null;
    final list = listOf(r['members']);
    setState(() => _members = list);
    if (!_joined || _closing) return;
    // Kendi durumumu da sunucuyla eşitle (bağlantı kopukken mikrofondan indirilmiş / rolüm değişmiş olabilir).
    final mine = list.where((m) => m['userId']?.toString() == Session.id).firstOrNull;
    if (mine == null) {
      _rejoin(); // sunucu bizi odadan çıkarmış (ör. uzun bağlantı kopukluğu): yeniden katıl
      return;
    }
    final wasOnSeat = _onSeat;
    setState(() => _me = {..._me, 'role': mine['role'], 'seatIndex': mine['seatIndex'], 'microphone': mine['microphone']});
    if (wasOnSeat != _onSeat) {
      BackgroundService.instance.micChanged(_onSeat);
      _syncPublish();
    }
  }

  void _onChatScroll() {
    if (_unseen != 0 && _chatScroll.hasClients && _chatScroll.position.pixels <= 30) setState(() => _unseen = 0);
  }

  Future<void> _rejoin() async {
    if (_rejoining || _closing) return;
    _rejoining = true;
    try {
      // rejoin: kişi bu arada başka odaya geçtiyse sunucu onu bu odaya geri çekmez (409 → ekran kapanır).
      final r = await Api.post('/api/rooms/${widget.roomId}/join', {
        'rejoin': true,
        if (_password != null) 'password': _password,
        if (widget.code != null) 'code': widget.code,
      });
      if (!mounted || _closing) {
        Api.post('/api/rooms/${widget.roomId}/leave').catchError((_) => <String, dynamic>{});
        return;
      }
      _joined = true;
      final me = mapOf(r['me']);
      if (me != null) _me = me;
      // Yeniden katılınca oda sahibinin ailesi ve kimliği de tazelenir (sahip bu arada değiştirmiş olabilir).
      final fresh = mapOf(r['room']);
      if (fresh != null) _room = {...?_room, 'ownerFamily': fresh['ownerFamily'], if (fresh['owner'] != null) 'owner': fresh['owner']};
      SocketService.instance.subscribeRoom(widget.roomId);
      // Tanı kaydı (yönetim paneli > Hata kayıtları): üyeliğin neden / ne sıklıkta düştüğü görülebilsin.
      if (r['joined'] == true) ErrorLog.add('Bağlantı · oda', 'üyelik düşmüştü; yeniden katılındı');
      await _loadMembers();
      if (!mounted) return;
      _ensureAudio();
    } catch (e) {
      // Yalnızca sunucu açıkça reddederse (oda kapandı, engellendi...) odadan çıkarılır.
      // Ağ kesintisi gibi geçici hatalarda oda açık kalır ve biraz sonra yeniden denenir.
      final code = e is ApiException ? e.statusCode : null;
      if (code != null && code >= 400 && code < 500 && code != 429 && code != 408) {
        _exit(errorText(e));
      } else {
        Future.delayed(const Duration(seconds: 5), () {
          if (mounted && !_closing && !_rejoining) _rejoin();
        });
      }
    } finally {
      _rejoining = false;
    }
  }

  void _exit(String message) {
    if (_closing || !mounted) return;
    _closing = true;
    _joined = false; // sunucu tarafında zaten çıkarıldık
    // Yeni bir oda açıldıysa (bu ekran kapanmak üzere) ona dokunulmaz, eski odanın mesajı da gösterilmez.
    if (_dockSerial != RoomDock.serial) return;
    toast(context, message);
    // Oda açıkken üstünde duran pencereler (alt pencereler, diyaloglar) kapanmış odanın üstünde kalmasın.
    if (!RoomDock.minimized.value) Navigator.of(context).popUntil((r) => r.isFirst);
    RoomDock.closeIf(_dockSerial);
  }

  /// Ben çıkarsam oda kapanır mı: odayı açık tutan (sahip / yardımcı sahip) son kişi benim.
  bool get _closesOnLeave => closesOnLeave(myRole: _myRole, myUserId: Session.id, members: _members);

  Future<void> _onBack() async {
    if (_closing) return;
    if (_myRole == 'owner' || _closesOnLeave) {
      final ok = await confirm(
        context,
        _myRole == 'owner'
            ? tx('Odadan ayrılırsanız ve içeride yardımcı sahip yoksa oda kapanır. Yardımcı sahip varsa oda açık kalır; '
                'döndüğünüzde yine oda sahibi olarak girersiniz. Odayı tamamen kapatmak için menüden "Odayı kapat"ı kullanın.')
            : tx('Odada sahip ya da başka yardımcı sahip yok; ayrılırsanız oda herkes için kapanır. Devam edilsin mi?'),
        action: tx('Ayrıl'),
      );
      if (!ok || !mounted) return;
    }
    // Ağ yavaşsa çıkış düğmesi 20 sn donmasın: oda hemen kapanır, "leave" isteğini dispose() gönderir.
    _closing = true;
    RoomDock.closeIf(_dockSerial);
  }

  bool _micInviteOpen = false;
  bool _chatHidden = false;
  // Sayı tahtası oturumu (Yoho): süren sayım; _sbKnown: sunucu oturumları destekliyor (eski sunucuda eski davranış).
  Map<String, dynamic>? _sbSession;
  bool _sbKnown = false;
 // görüntülü odada sohbeti gizle: yalnızca görüntü izlenir

  // Küme, liste değil: her kullanım `contains` ve sıra anlamsız. Koltuk kuralları (seat_rules.dart)
  // de küme bekliyor — liste döndürmek tip hatasıydı.
  Set<int> get _lockedSeats => ((_room?['lockedSeats'] as List?) ?? const []).map((x) => (x as num).toInt()).toSet();
  bool get _canSeatManage => ['owner', 'cohost', 'moderator'].contains(_myRole);
  /// Yetkilinin susturduğu koltuklar: oturan kişi koltukta kalır ama mikrofonu açılmaz; koltukta kırmızı işaret görünür.
  Set<int> get _mutedSeats => ((_room?['mutedSeats'] as List?) ?? const []).map((x) => (x as num).toInt()).toSet();
  bool get _seatMuted => seatMuted(members: _members, userId: Session.id, mutedSeats: _mutedSeats);

  /// Koltuktaki "susturuldu" işareti (pembe daire, üstü çizili mikrofon).

  // ---------- LiveKit ----------
  void _onLkChanged() {
    if (_roomMuted || CallGuard.instance.inCall.value || RoomAudio.systemSilent.value || _localMuted.isNotEmpty) _applyRoomSound();
    final r = _lk;
    // Arka plandayken yeni açılan kameralar da indirilmez.
    if (_videoPaused && r != null) _unsubscribeRemoteVideo(r);
    // Ses sunucusu bağlantısı koptuysa (ağ değişimi, sunucudan çıkarılma sonrası yeniden katılma) yeniden kur.
    if (r != null && r.connectionState == lk.ConnectionState.disconnected && !_lkConnecting && !_closing && mounted) {
      _lk = null;
      _lkPrevState = null;
      _lkCanPublish = null;
      r.removeListener(_onLkChanged);
      _disposeLkListener();
      r.disconnect().whenComplete(() => r.dispose()).catchError((_) {});
      final wait = Duration(seconds: 2 << _lkRetries.clamp(0, 3)); // 2, 4, 8, 16 sn
      _lkRetries++;
      _scheduleLkRetry(wait);
    } else if (r != null && !_closing && mounted) {
      final st = r.connectionState;
      // SDK kendi içinde yeniden bağlandı (ağ değişimi): yayın durumu yeniden eşitlenir. Koltuktaki kişinin mikrofonu
      // yeniden bağlanmadan sonra kapalı kalabiliyordu ("mikrofondayım ama sesim gitmiyor").
      final resumed = st == lk.ConnectionState.connected && _lkPrevState == lk.ConnectionState.reconnecting;
      _lkPrevState = st;
      // Yayın izni sonradan geldi (sunucunun izni birkaç saniye gecikti): mikrofon o an açılır.
      final can = r.localParticipant?.permissions.canPublish;
      final granted = can == true && _lkCanPublish == false;
      if (can != null) _lkCanPublish = can;
      if ((resumed || granted) && _onSeat) _syncPublish();
    }
    // Konuşma göstergeleri ve görüntüler için yeniden çizim: en fazla 200 ms'de bir ve yalnızca ekranda görünen bir şey
    // (kim konuşuyor, kimin görüntüsü var, bağlantı) değiştiyse. Ses sunucusu bağlantı kalitesi gibi olayları saniyede
    // birkaç kez bildirir; her birinde tüm odayı yeniden çizmek telefonu yoruyordu.
    if (_lkTick?.isActive ?? false) return;
    _lkTick = Timer(const Duration(milliseconds: 200), () {
      _lkTick = null;
      if (!mounted) return;
      final sig = _lkSignature();
      if (sig == _lkSig) return;
      _lkSig = sig;
      setState(() {});
    });
  }

  /// Telefon araması başladı / bitti: odadakilerin sesi ve kendi mikrofonum kapanır, arama bitince eski hâline döner.
  void _onPhoneCall() {
    final call = CallGuard.instance.inCall.value;
    _applyRoomSound();
    final room = _lk;
    if (room != null) {
      if (call) {
        final lp = room.localParticipant;
        if (lp != null) _quiet(lp.setMicrophoneEnabled(false));
      } else {
        _syncPublish();
      }
    }
    if (mounted) {
      setState(() {}); // görüntülü PK'da rakibin sesi de aramaya göre kapanır / açılır
      toast(context, call ? tx('📞 Arama: oda sesi kapatıldı') : tx('Arama bitti, oda sesi açıldı'));
    }
  }

  // ---------- Eylemler ----------
  bool get _micRequest => _room?['micRequest'] == true;

  bool _takingMic = false;

  int? get _mySeatIndex => seatIndexOf(_members, Session.id);

  final Set<String> _accepting = {};

  /// Boş (kilitli olmayan) konuk yeri sayısı.
  int get _freeGuestSeats => freeGuestSeats(members: _members, seatCount: _seatCount, lockedSeats: _lockedSeats);

  // ---------- Oda araçları (kayar pencere) ----------
  bool get _isOwnerOrCohost => _myRole == 'owner' || _myRole == 'cohost';

  // ---------- Gürültü engelleme ----------
  /// Açıkken mikrofon sesinde çevre gürültüsü bastırılır (gürültü engelleme + düşük frekans süzgeci + yankı giderme).
  static bool noiseCancel = true;
  bool _denoiseStarted = false; // bu oda için yapay zekâ gürültü azaltma bağlandı mı
  lk.EventsListener<lk.RoomEvent>? _lkListener;

  static bool _noiseLoaded = false;

  // Gürültü engelleme açıkken (varsayılan) kalabalığa karşı en güçlü ücretsiz düzen:
  //  telefonun çoklu mikrofon işlemesi (AudioProcessing) + WebRTC gürültü bastırma + düşük frekans süzgeci +
  //  yapay zekâ gürültü azaltma (Denoiser) + otomatik ses düzeyi KAPALI. Otomatik ses düzeyi konuşma aralarında
  //  mikrofonu ~9 dB'e kadar yükselttiği için arkadaki insan seslerini de büyütüyordu; ağıza yakın konuşan kişinin sesi
  //  zaten yeterince yüksek gelir. Gürültü engelleme kapatılınca otomatik ses düzeyi geri açılır (uzaktan konuşma için).
  static lk.AudioCaptureOptions get _audioOptions => lk.AudioCaptureOptions(
        noiseSuppression: noiseCancel,
        echoCancellation: true,
        // Otomatik ses düzeyi her zaman açık (YoHo / Agora'nın varsayılanı): kısık ve yüksek konuşan mikrofonlar aynı
        // düzeye getirilir. Eskiden gürültü engelleme açıkken (varsayılan) kapalıydı; konuşmacıların sesleri arasında
        // büyük fark oluyor, kısık konuşan hediye/müzik sesinin altında kalıyordu.
        autoGainControl: true,
        highPassFilter: noiseCancel,
        // Konuşma odaklı işleme (Yoho gibi): klavye/tık sesi bastırma ve iPhone ses izolasyonu gürültü engellemeyle birlikte açılır.
        typingNoiseDetection: noiseCancel,
        voiceIsolation: noiseCancel,
              );

  /// Odadaki müzik: alt çubuk (açık) ya da küçültülünce sürüklenebilir dönen plak.
  static final ValueNotifier<bool> _musicBarOpen = ValueNotifier<bool>(true);
  static final ValueNotifier<Offset?> _discPos = ValueNotifier<Offset?>(null);

  /// Sohbetteki rozet sırası: WIP, gönderme (taç) ve alma (kalp) seviyesi, CP ve doğrulanmış hesap.

  /// Profil kartındaki küçük etiket: seviye / WIP kutucuklarıyla aynı yükseklik (20).

  // ---------- Arayüz ----------
  // Koltuk ölçüleri sahne alanına göre _seatGrid içinde hesaplanır (kaydırma yok; her koltuk modu ekrana sığar).
  double _bodyH = 0; // oda gövdesinin yüksekliği (Scaffold klavyeyle küçülmez); koltuk ölçeği yalnızca buna bağlı
  bool _kbSeen = false; // klavye geri tuşuyla kapanınca yazı alanı da kapansın
  bool get _seatCompact => _seatCount >= 12; // 12+ modda koltuklar küçük (Yoho: genişliğin ~%10'u)
  double get _seatNameH => _seatCompact ? 14 : 16;
  double get _seatScoreH => 16;
  /// Sayı tahtası açık mı (oturum sürüyor; eski sunucuda koltuk sayacı ayarı).
  bool get _sbActive => _sbKnown ? _sbSession != null : _room?['scoreboardEnabled'] != false;
  // Puan artık her modda avatarın altına BİNEN rozetle gösterilir (Yoho); ayrı satır yok → koltuk ölçüsü hiç değişmez,
  // 12 / 15 / 20 / 25 / 30'lu sık modlarda da sayar (eskiden satır sığmayınca puan hiç görünmüyordu).
  bool get _scoreOn => false;

  // ---------- Görüntülü odalar: Çoklu (ızgara) ve Canlı (tam ekran) ----------
  Map<int, Map<String, dynamic>> get _bySeat => {
        for (final m in _members)
          if (m['seatIndex'] != null) (m['seatIndex'] as num).toInt(): m,
      };

  // ---------- Üst başlık (Yoho ölçüleri) ----------
  // İki satır, sabit yükseklik (yalnızca ekran genişliğine bağlı): izleyici gelmesi, aile rozeti, favori düğmesi vb.
  // başlığın boyunu değiştirmez; bu yüzden koltuklar da hiç kaymaz.
  //  1. satır: oda kutusu (kapak + ad + ID) · ilk 3 izleyici · kişi sayısı · ••• · ⏻
  //  2. satır: toplam elmas · favori                                   aile · taç (katkı listesi)

  // ---------- Mikrofon emojileri ----------
  final Map<String, int> _micEmoji = {}; // kullanıcı → oynayan emoji (1–kMicEmojiCount; kCryEmoji: PK kaybeden)
  final Map<String, int> _micEmojiSeq = {};
  final Map<String, Timer> _micEmojiTimers = {};
  static const kCryEmoji = -1;

  @override
  Widget build(BuildContext context) => ScreenTag(screen: 'room', roomId: widget.roomId, child: _guardedBuild(context));

  Widget _guardedBuild(BuildContext context) {
    RoomDock.myRole = _myRole;
    RoomDock.closesOnLeave = _closesOnLeave;
    return ValueListenableBuilder<bool>(
      valueListenable: RoomDock.minimized,
      builder: (context, minimized, _) => PopScope(
      canPop: minimized, // küçültülmüşken geri tuşu ana ekrana aittir; açıkken odayı küçültür
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) RoomDock.minimize();
      },
      child: Scaffold(
        // Klavye açılınca koltuk alanı yerinden oynamasın; boşluğu aşağıdaki sohbet bölgesi yönetir.
        resizeToAvoidBottomInset: false,
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RoomThemeBackground(
                theme: _room?['theme']?.toString(),
                imageUrl: _room?['themeImageUrl']?.toString(),
                child: GiftRibbonOverlay(
                roomId: widget.roomId,
                // Oda gövdesinin ölçüsü klavyeden etkilenmez (resizeToAvoidBottomInset: false); koltuk ölçeği buna bağlı.
                child: LayoutBuilder(builder: (context, box) {
                // Klavye açılınca alt sistem çubuğu payı (appFrame SafeArea) düşer; çıkarılınca değer sabit kalır.
                _bodyH = box.maxHeight - MediaQuery.viewPaddingOf(context).bottom;
                final w = box.maxWidth;
                final g = RoomGeom(w);
                return Stack(key: _stageKey, fit: StackFit.expand, children: [
                if (_isLive) Positioned.fill(child: _liveBackdrop()),
                // Doğum günü modu: arka planda yukarıdan aşağı süzülen balonlar (koltukların ve sohbetin arkasında).
                if (_birthday && !_isLive && !RoomDock.minimized.value) const Positioned.fill(child: BirthdayBalloons()),
                Padding(
                padding: EdgeInsets.only(bottom: _inputOpen ? MediaQuery.viewInsetsOf(context).bottom : 0),
                child: Column(children: [
                  Stack(children: [
                    _fixedText(_roomHeader(w)),
                    if (_inputOpen) Positioned.fill(child: GestureDetector(onTap: _closeInput, child: const ColoredBox(color: Color(0xB8000000)))),
                  ]),
                  if (_roomPk != null && _roomPk!['status'] != 'finished' && !_pkStage) RoomPkBar(pk: _roomPk!, canManage: _isOwnerOrCohost, onStale: _reloadRoomPk),
                  if (_pk != null && _pkLive)
                    VideoPkStage(
                      key: ValueKey('vpk-${_pk!['id']}'),
                      pk: _pk!,
                      roomId: widget.roomId,
                      hostVideo: _pkHostVideo(),
                      canManage: _myRole == 'owner',
                      muted: _roomMuted || CallGuard.instance.inCall.value || RoomAudio.systemSilent.value,
                      paused: _videoPaused || RoomDock.minimized.value,
                    )
                  else if (_pk != null)
                    PkBanner(
                      pk: _pk!,
                      roomId: widget.roomId,
                      onCancel: _myRole == 'owner' ? () => guard(context, () => Api.post('/api/pk/${_pk!['id']}/cancel')) : null,
                    ),
                  Expanded(child: _stageBody()),
                  if (_inputOpen) _inputBar() else _fixedText(_bottomBar()),
                ]),
              ),
                // Ses bağlantısı hatası düzeni itmesin: başlığın altında yüzen şerit.
                if (_lkError != null)
                  Positioned(
                    left: 8,
                    right: 8,
                    top: MediaQuery.paddingOf(context).top + g.headerH + 2,
                    child: Material(
                      color: Colors.red.shade900,
                      borderRadius: BorderRadius.circular(12),
                      child: ListTile(
                        dense: true,
                        leading: const Icon(Icons.error_outline),
                        title: Text(tx('Ses/görüntü bağlanamadı: {lkError}', {'lkError': _lkError}), style: const TextStyle(fontSize: 12)),
                        trailing: TextButton(onPressed: _retryAudioNow, child: Text(tx('Tekrar'))),
                      ),
                    ),
                  ),
                // Canlı bağlantı birkaç saniyedir kopuksa küçük bilgi (kısa kopmalarda görünmez).
                Positioned(
                  left: 0,
                  right: 0,
                  top: MediaQuery.paddingOf(context).top + g.headerH + (_lkError != null ? 64 : 6),
                  child: const ReconnectPill(),
                ),
                Positioned(left: 0, right: 0, top: MediaQuery.sizeOf(context).height * 0.36, child: EntranceStrip(queue: _entrance)),
                // Müzik (Yoho): yalnızca müziği çalan kişi plağı ve DJ panelini görür; odadakiler yalnızca müziği duyar.
                Positioned.fill(
                  child: ValueListenableBuilder<Map<String, dynamic>?>(
                    valueListenable: MusicService.instance.state,
                    builder: (context, _, __) {
                      if (!showDjControls()) return const SizedBox.shrink();
                      return ValueListenableBuilder<bool>(
                        valueListenable: _musicBarOpen,
                        builder: (context, open, _) => Stack(children: [
                          // Küçültülmüş plak: müziği açan kişi istediği yere sürükleyip bırakır; konum oda boyunca korunur.
                          DragBubble(
                            pos: _discPos,
                            snap: false,
                            size: 50,
                            initial: Offset(14, MediaQuery.paddingOf(context).top + g.headerH + 44),
                            safe: EdgeInsets.fromLTRB(4, MediaQuery.paddingOf(context).top + 4, 4, g.barH + MediaQuery.paddingOf(context).bottom + 4),
                            // Dokunuşu balon alır (plağın kendi dokunma algılayıcısı yok): plak eskiden boş bir onTap ile
                            // dokunuşu yutuyordu, küçültülmüş müzik kutusu açılmıyordu.
                            onTap: () => _musicBarOpen.value = !_musicBarOpen.value,
                            child: const DjDisc(),
                          ),
                          if (open && !_inputOpen)
                            Positioned(
                              left: 12,
                              right: 12,
                              bottom: g.barH + MediaQuery.paddingOf(context).bottom + 8,
                              child: DjPanel(roomId: widget.roomId, onMinimize: () => _musicBarOpen.value = false),
                            ),
                        ]),
                      );
                    },
                  ),
                ),
                // Efekt katmanı: yalnızca kendisi yeniden çizilir (oda ekranının geri kalanı değil).
                Positioned.fill(
                  child: IgnorePointer(
                    child: ValueListenableBuilder<int>(
                      valueListenable: _fxTick,
                      builder: (context, _, __) => Stack(clipBehavior: Clip.none, children: [
                        for (final fx in _seatFx)
                          Positioned(
                            key: ValueKey('seatfx-${fx.id}'),
                            left: fx.center.dx - fx.diameter / 2,
                            top: fx.center.dy - fx.diameter / 2,
                            width: fx.diameter,
                            height: fx.diameter,
                            child: ClipOval(
                              child: AnimAsset(
                                url: fx.url,
                                format: fx.format,
                                fit: BoxFit.cover,
                                sound: fx.sound,
                                lowPriority: true,
                                onDone: () {
                                  if (!mounted) return;
                                  _seatFx.removeWhere((x) => x.id == fx.id);
                                  _fxChanged();
                                },
                              ),
                            ),
                          ),
                        for (final f in _flights)
                          GiftFlight(key: ValueKey(f.id), data: f, onDone: () {
                            if (!mounted) return;
                            _flights.removeWhere((x) => x.id == f.id);
                            _fxChanged();
                          }),
                        for (final fx in _luckyFx)
                          LuckyWinFx(key: ValueKey('lucky-${fx.id}'), data: fx, onDone: () {
                            if (!mounted) return;
                            _luckyFx.removeWhere((x) => x.id == fx.id);
                            _fxChanged();
                          }),
                      ]),
                    ),
                  ),
                ),
                // Şanslı çanta: en üstte, oda elmasının hemen altında. Açtığım çanta bana görünmez;
                // birden çok çanta varsa sayısı yazar ve sıradaki açılır.
                if (_openBags.isNotEmpty && !_inputOpen)
                  Positioned(
                    left: 8,
                    // PK şeridi ya da bağlantı hatası şeridi varsa onların altına iner.
                    top: MediaQuery.paddingOf(context).top + g.headerH + 2 + (_pk != null || _lkError != null ? 64 : 0),
                    child: BagEnvelope(
                      size: 40,
                      count: _openBags.length,
                      isSuper: _openBags.any((b) => b['kind'] == 'super'),
                      onTap: () async {
                        final bag = _openBags.first;
                        await showBagClaim(context, widget.roomId, bag);
                        // Açıldıysa (ya da zaten açılmışsa) listeden yenile: bana kalan çantalar görünsün.
                        if (!mounted) return;
                        try {
                          final lb = await Api.get('/api/rooms/${widget.roomId}/lucky-bags');
                          if (mounted) setState(() => _bags..clear()..addAll(listOf(lb['bags'])));
                        } catch (_) {}
                      },
                    ),
                  ),
                // Oda oyunları (Ludo, TEK): açık oyun varken sağda balon; dokununca üstte oyun penceresi. En üstte durur.
                Positioned.fill(child: RoomTekDock(key: _tekDockKey, roomId: widget.roomId, seatStrip: _gameSeatStrip)),
                ]);
                }))),
      ),
      ),
    );
  }
}

/// Sunucudan sayı ya da yazı olarak gelebilen adet.
int? _asInt(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}');

/// Mikte oynayan hediye (alıcının koltuk dairesinde).
