import 'dart:async';
import '../services/screen_guard.dart';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../widgets/anim_asset.dart';
import '../widgets/app_webview_modal.dart';
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
import '../services/effect_prefs.dart';
import '../services/inbox_service.dart';
import '../services/media_cache.dart';
import '../services/music_service.dart';
import '../services/room_playlist.dart';
import '../services/headset_audio.dart';
import '../services/room_dock.dart';
import '../services/session.dart';
import '../services/socket_service.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
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
import '../widgets/video_grid.dart';
import 'gift_sheet.dart';
import 'ludo_screen.dart';
import 'pk_sheet.dart';
import '../widgets/room_pk.dart';
import '../widgets/video_pk.dart';
import 'music_screens.dart';
import 'inbox_screens.dart';
import '../widgets/level_badge.dart';
import 'user_screens.dart';

const _roleLabels = {'owner': 'Oda sahibi', 'cohost': 'Yardımcı sahip', 'moderator': 'Moderatör', 'user': 'Üye'};
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
  Map<String, dynamic>? _room;
  final Map<String, GlobalKey> _seatKeys = {}; // koltuk avatarı konumları (hediye uçuşu için)
  final GlobalKey _stageKey = GlobalKey();
  final GlobalKey _viewersKey = GlobalKey();
  final List<_GiftFlightData> _flights = [];
  int _flightSeq = 0;
  // Mikte oynayan hediyeler (yumurta, domates): alıcının koltuk dairesinin içinde oynar.
  final List<_SeatFx> _seatFx = [];
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
  Timer? _lkTick; // LiveKit değişikliklerinde tüm odayı saniyede onlarca kez yeniden çizmemek için
  String? _lkSig; // son çizilen LiveKit durumu (bkz. _lkSignature)
  String? _password; // kilitli odada yeniden katılırken gerekir
  String? _lkError;
  bool _micOn = true;
  bool _camOn = true;

  StreamSubscription? _sub;

  final List<Map<String, dynamic>> _messages = [];
  final _chatCtl = TextEditingController();
  final _chatScroll = ScrollController();
  int _unseen = 0; // yukarıdaki eski mesajlar okunurken gelen yeni mesaj sayısı
  bool _sending = false;
  bool _chatMuted = false;
  bool _inputOpen = false;
  bool _roomMuted = false;

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
    CallGuard.instance.start();
    WidgetsBinding.instance.addObserver(this);
    MediaCache.warmGifts();
    _enter();
  }

  /// Her 60 sn'de sunucuya "oda açık" sinyali gider: üyeyi canlı tutar, WebSocket aboneliğini tazeler,
  /// oda sunucuda kapanmışsa kullanıcı sonsuza dek ölü odada kalmaz. (Sunucu üyeyi 5 dk sinyalsiz kalınca çıkarır;
  /// soket bağlıyken hiç çıkarmaz. 25 sn yerine 60 sn: telefon daha seyrek uyanır, daha az internet.)
  void _startHeartbeat() {
    _beat?.cancel();
    _beat = Timer.periodic(const Duration(seconds: 60), (_) async {
      if (!mounted || !_joined || _closing) return;
      SocketService.instance.subscribeRoom(widget.roomId);
      try {
        await Api.post('/api/rooms/${widget.roomId}/heartbeat');
      } on ApiException catch (e) {
        if (!mounted || _closing) return;
        if (e.statusCode == 404) {
          _exit('Oda kapandı.');
        } else if (e.statusCode == 409) {
          _exit(e.message); // başka odaya geçilmiş: geri katılınmaz
        } else if (e.statusCode == 403) {
          _rejoin();
        }
      } catch (_) {/* ağ kesintisi: bir sonraki sinyalde tekrar denenir */}
    });
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

  void _pauseVideo() {
    final room = _lk;
    if (_videoPaused || !_isVideo) return;
    _videoPaused = true;
    if (room == null) return;
    _unsubscribeRemoteVideo(room);
    final lp = room.localParticipant;
    if (lp != null && lp.isCameraEnabled()) _quiet(lp.setCameraEnabled(false));
  }

  /// Başkalarının görüntüsü arka planda indirilmez (ekranda görünmüyor; internet ve pil boşa gitmesin).
  void _unsubscribeRemoteVideo(lk.Room room) {
    for (final p in room.remoteParticipants.values.toList()) {
      for (final pub in p.videoTrackPublications.toList()) {
        if (pub.subscribed && _unsubbed.add(pub)) _quiet(pub.unsubscribe());
      }
    }
  }

  void _resumeVideo() {
    if (!_videoPaused) return;
    _videoPaused = false;
    _unsubbed.clear();
    final room = _lk;
    if (room == null) return;
    for (final p in room.remoteParticipants.values.toList()) {
      for (final pub in p.videoTrackPublications.toList()) {
        if (!pub.subscribed) _quiet(pub.subscribe());
      }
    }
    _syncPublish();
  }

  /// Bağlantı koptuktan / uygulama arka plandan döndükten sonra kaçırılan olayları telafi eder:
  /// koltuklar, üyeler, sohbet, puanlar, PK, çantalar ve müzik sunucudan yeniden alınır.
  Future<void> _resync() async {
    if (!_joined || _closing || !mounted) return;
    SocketService.instance.subscribeRoom(widget.roomId);
    try {
      await _loadMembers();
    } catch (_) {/* ağ yoksa bir sonraki sinyalde */}
    if (!mounted || _closing) return;
    _loadMessages();
    _loadExtras();
    MusicService.instance.refresh();
    if (_lk == null && !_lkConnecting) _connectLivekit();
  }

  @override
  void dispose() {
    _queueTick.dispose();
    _headsTimer?.cancel();
    CallGuard.instance.inCall.removeListener(_onPhoneCall);
    CallGuard.instance.stop();
    HeadsetAudio.instance.stop();
    EffectPrefs.roomMuted.value = false;
    _beat?.cancel();
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
        password = await askText(context, 'Oda şifresi', obscure: true);
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
      _connectLivekit();
      _loadMessages();
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
    try {
      final s = await Api.get('/api/rooms/${widget.roomId}/scoreboard');
      final pk = await Api.get('/api/rooms/${widget.roomId}/pk');
      final roomPk = _isVideo ? null : await Api.get('/api/rooms/${widget.roomId}/room-pk');
      if (!mounted) return;
      setState(() {
        _roomPk = mapOf(roomPk?['pk']);
        _scores
          ..clear()
          ..addEntries(listOf(s['scoreboard']).map((x) => MapEntry(x['userId'].toString(), x['coins'].toString())));
        _pk = mapOf(pk['pk']);
      });
    } catch (_) {/* ek özellikler yüklenemese de oda çalışır */}
    try {
      final lb = await Api.get('/api/rooms/${widget.roomId}/lucky-bags');
      if (mounted) setState(() => _bags..clear()..addAll(listOf(lb['bags'])));
    } catch (_) {}
    try {
      final q = await Api.get('/api/rooms/${widget.roomId}/mic/queue');
      final ownerId = _room?['ownerId']?.toString();
      final f = ownerId != null && ownerId != Session.id ? await Api.get('/api/rooms/hosts/$ownerId/favorite') : null;
      if (!mounted) return;
      setState(() {
        _queue = ((q['queue'] as List?) ?? const []).map((x) => x.toString()).toList();
        _fav = f?['favorite'] == true;
      });
      _queueLoaded = true;
      _queueTick.value++;
      // Yayıncıyı takip etmeyenlere bir dakika sonra sohbette "takip edin" kartı.
      if (ownerId != null && ownerId != Session.id && !_fav) {
        _followTimer?.cancel();
        _followTimer = Timer(const Duration(seconds: 60), () {
          if (!mounted || _fav || _messages.any((m) => m['follow'] == true)) return;
          setState(() => _messages.add({'id': 'follow-card', 'follow': true}));
          _scrollChatToEnd();
        });
      }
    } catch (_) {}
    try {
      final c = await Api.get('/api/app/config');
      if (!mounted) return;
      setState(() {
        _appNotice = (c['roomNotice'] ?? '').toString().trim();
        _flyCost = (c['flyTextCoins'] as num?)?.toInt() ?? _flyCost;
        _activitiesOn = c['roomActivitiesEnabled'] != false;
      });
    } catch (_) {}
  }

  /// Yeni gelen kişiye "Hoş geldin" (sohbete yazılır ve odada uçan yazı olarak geçer).
  Future<void> _sendWelcome(Map<String, dynamic> u) async {
    final id = u['id']?.toString();
    if (id == null || _welcomed.contains(id)) return;
    if (!_chatOpen) {
      toast(context, 'Bu odada yazılı sohbet kapalı.', error: true);
      return;
    }
    setState(() => _welcomed.add(id));
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/messages', {'text': 'Hoş geldin ${u['displayName'] ?? ''}', 'welcome': id}));
    if (r == null && mounted) setState(() => _welcomed.remove(id));
  }

  // ---------- Sıra, favori, oda değiştirme ----------
  List<String> _queue = [];
  bool _queueLoaded = false; // ilk sıra yüklendi (öncesinde gelen değişiklik için bildirim gösterilmez)
  final ValueNotifier<int> _queueTick = ValueNotifier(0); // açık "Konuk istekleri" penceresi yenilensin
  final Map<String, DateTime> _guestToastAt = {};
  bool _fav = false;
  bool _switching = false;

  bool get _inQueue => _queue.contains(Session.id);
  bool get _noFreeSeat {
    final taken = <int>{for (final m in _members) if (m['seatIndex'] != null) (m['seatIndex'] as num).toInt()};
    for (var i = 1; i < _seatCount; i++) {
      if (!taken.contains(i) && !_lockedSeats.contains(i)) return false;
    }
    return true;
  }

  Future<void> _toggleQueue() async {
    final r = await guard(context, () => _inQueue ? Api.delete('/api/rooms/${widget.roomId}/mic/queue') : Api.post('/api/rooms/${widget.roomId}/mic/queue'));
    if (r == null || !mounted) return;
    setState(() => _queue = ((r['queue'] as List?) ?? const []).map((x) => x.toString()).toList());
    if (_inQueue) {
      toast(
        context,
        _isLive
            ? 'Konuk isteğin yayıncıya gönderildi. Kabul ederse kameran açılarak yayına bağlanacaksın.'
            : (_micRequest ? 'Mikrofon isteğin gönderildi. Yetkili onaylayınca mikrofona çıkabilirsin.' : 'Sıraya girdiniz. Sıra size gelince haber verilir.'),
      );
    }
  }

  Future<void> _toggleFavorite() async {
    final ownerId = _room?['ownerId']?.toString();
    if (ownerId == null) return;
    final r = await guard(context, () => _fav ? Api.delete('/api/rooms/hosts/$ownerId/favorite') : Api.post('/api/rooms/hosts/$ownerId/favorite'));
    if (r == null || !mounted) return;
    setState(() => _fav = r['favorite'] == true);
    toast(context, _fav ? 'Yayıncı favorilere eklendi.' : 'Favorilerden çıkarıldı.');
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
      if (others.isEmpty) return toast(context, 'Geçilecek başka oda yok.');
      final all = list;
      final i = cur < 0 ? (dir > 0 ? 0 : all.length - 1) : (cur + dir + all.length) % all.length;
      final t = all[i];
      if (t['id'] == widget.roomId) return;
      RoomDock.open(RoomRequest(roomId: t['id'].toString(), name: (t['name'] ?? 'Oda').toString()));
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    } finally {
      _switching = false;
    }
  }

  Future<void> _loadMembers() async {
    final r = await Api.get('/api/rooms/${widget.roomId}/members');
    if (!mounted) return;
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

  Future<void> _loadMessages() async {
    try {
      final r = await Api.get('/api/rooms/${widget.roomId}/messages');
      if (!mounted) return;
      setState(() {
        // Geçmiş yüklenirken gelen yerel satırlar (odaya girdi, takip kartı, sistem) silinmez.
        final local = _messages.where((m) => m['join'] == true || m['follow'] == true || m['system'] == true).toList();
        final ids = <String>{};
        final server = listOf(r['messages']).where((m) => ids.add('${m['id']}')).toList();
        _messages
          ..clear()
          ..addAll(server)
          ..addAll(local);
      });
      _scrollChatToEnd(force: true);
    } catch (_) {/* sohbet yüklenemese de oda çalışır */}
  }

  /// Sohbetin sonuna kaydırır. Kullanıcı yukarı kaydırıp eski mesajları okuyorsa ([force] yoksa) yerinden oynatmaz.
  /// Sohbet ters sıralı listedir (Yoho gibi): en yeni mesaj en altta, liste konumu 0 = en alt. Kullanıcı en alttayken yeni
  /// mesaj kendiliğinden görünür; yukarıda eski mesajları okuyorsa yerinden oynatılmaz, "yeni mesaj" düğmesi çıkar.
  void _scrollChatToEnd({bool force = false}) {
    final reading = _chatScroll.hasClients && _chatScroll.position.pixels > 60;
    if (reading && !force) {
      if (_unseen < 99) setState(() => _unseen++);
      // Ters listede yeni mesaj alta eklenince okunan kısım yukarı kayar; aynı yerde kalsın diye fark kadar kaydırılır.
      final before = _chatScroll.position.maxScrollExtent;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_chatScroll.hasClients) return;
        final d = _chatScroll.position.maxScrollExtent - before;
        if (d > 0) _chatScroll.jumpTo(_chatScroll.position.pixels + d);
      });
      return;
    }
    if (_unseen != 0) setState(() => _unseen = 0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScroll.hasClients && _chatScroll.position.pixels != 0) _chatScroll.jumpTo(0);
    });
  }

  void _onChatScroll() {
    if (_unseen != 0 && _chatScroll.hasClients && _chatScroll.position.pixels <= 30) setState(() => _unseen = 0);
  }

  /// Mesajın ilk harfi büyük (Türkçe: i → İ, ı → I).
  static String _capFirst(String t) {
    if (t.isEmpty) return t;
    final f = t[0];
    final up = f == 'i' ? 'İ' : f == 'ı' ? 'I' : f.toUpperCase();
    return up + t.substring(1);
  }

  Future<void> _sendChat() async {
    final text = _capFirst(_chatCtl.text.trim());
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    final fly = _flyMode;
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/messages', {'text': text, if (fly) 'fly': true}));
    if (!mounted) return;
    setState(() => _sending = false);
    if (r != null) {
      _chatCtl.clear();
      if (r['balance'] != null) Session.setCoins(r['balance'].toString());
    }
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
      await _loadMembers();
      if (!mounted) return;
      if (_lk == null && !_lkConnecting) _connectLivekit();
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
    // Oda açıkken üstünde duran pencereler (Ludo, alt pencereler, diyaloglar) kapanmış odanın üstünde kalmasın.
    if (!RoomDock.minimized.value) Navigator.of(context).popUntil((r) => r.isFirst);
    RoomDock.closeIf(_dockSerial);
  }

  /// Ben çıkarsam oda kapanır mı: odayı açık tutan (sahip / yardımcı sahip) son kişi benim.
  bool get _closesOnLeave {
    if (_myRole != 'owner' && _myRole != 'cohost') return false;
    return !_members.any((m) => m['userId']?.toString() != Session.id && (m['role'] == 'owner' || m['role'] == 'cohost'));
  }

  Future<void> _onBack() async {
    if (_closing) return;
    if (_myRole == 'owner' || _closesOnLeave) {
      final ok = await confirm(
        context,
        _myRole == 'owner'
            ? 'Odadan ayrılırsanız ve içeride yardımcı sahip yoksa oda kapanır. Yardımcı sahip varsa oda açık kalır; '
                'döndüğünüzde yine oda sahibi olarak girersiniz. Odayı tamamen kapatmak için menüden "Odayı kapat"ı kullanın.'
            : 'Odada sahip ya da başka yardımcı sahip yok; ayrılırsanız oda herkes için kapanır. Devam edilsin mi?',
        action: 'Ayrıl',
      );
      if (!ok || !mounted) return;
    }
    // Ağ yavaşsa çıkış düğmesi 20 sn donmasın: oda hemen kapanır, "leave" isteğini dispose() gönderir.
    _closing = true;
    RoomDock.closeIf(_dockSerial);
  }

  bool _micInviteOpen = false;
  List<int> get _lockedSeats => ((_room?['lockedSeats'] as List?) ?? const []).map((x) => (x as num).toInt()).toList();
  bool get _canSeatManage => ['owner', 'cohost', 'moderator'].contains(_myRole);
  /// Yetkilinin susturduğu koltuklar: oturan kişi koltukta kalır ama mikrofonu açılmaz; koltukta kırmızı işaret görünür.
  List<int> get _mutedSeats => ((_room?['mutedSeats'] as List?) ?? const []).map((x) => (x as num).toInt()).toList();
  bool get _seatMuted {
    final i = _mySeatIndex;
    return i != null && _mutedSeats.contains(i);
  }

  Future<void> _lockSeat(int index, bool locked) async {
    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/seats/$index/lock', {'locked': locked}));
  }

  Future<void> _muteSeat(int index, bool muted) async {
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/seats/$index/mute', {'muted': muted}));
    if (r != null && mounted) toast(context, muted ? 'Koltuk susturuldu.' : 'Koltuğun sesi açıldı.');
  }

  /// Koltuktaki "susturuldu" işareti (pembe daire, üstü çizili mikrofon).
  Widget _mutedBadge(double size) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 3)]),
        padding: EdgeInsets.all(size * 0.08),
        child: Container(
          decoration: const BoxDecoration(color: Color(0xFFF2457A), shape: BoxShape.circle),
          child: Icon(Icons.mic_off, color: Colors.white, size: size * 0.58),
        ),
      );

  // ---------- Gerçek zamanlı olaylar ----------
  void _onEvent(Map<String, dynamic> e) {
    final type = e['type'];
    if (type == 'connected') {
      _resync(); // soket yeniden bağlandı: arada kaçan olayları telafi et
      return;
    }
    if (type == 'error' && e['code'] == 'not_member' && e['roomId'] == widget.roomId) {
      _rejoin();
      return;
    }
    // Tek oda kuralı: başka odaya girdin / kendi odanı açtın (ör. başka cihazdan): bu oda ekranı kapanır, geri katılmaz.
    if (type == 'room_moved' && e['roomId'] == widget.roomId) {
      _exit('Başka bir odaya geçtiğin için bu odadan çıktın.');
      return;
    }
    if (type == 'mic_request_declined' && e['roomId'] == widget.roomId) {
      if (mounted) toast(context, _isLive ? 'Yayıncı konuk isteğini şimdilik kabul etmedi.' : 'Mikrofon isteğin kabul edilmedi.');
      return;
    }
    // Konuk isteği kabul edildi: sormadan yayına bağlanır (kamera ve mikrofon açılır).
    if (type == 'mic_invite' && e['roomId'] == widget.roomId && e['requested'] == true && _isLive && !_onSeat) {
      if (mounted && !_takingMic) {
        toast(context, 'Yayıncı konuk isteğini kabul etti, yayına bağlanıyorsun…');
        setState(() {
          _camOn = true;
          _micOn = true;
        });
        _takeMic((e['seatIndex'] as num?)?.toInt(), true);
      }
      return;
    }
    if (type == 'mic_invite' && e['roomId'] == widget.roomId) {
      if (mounted && !_micInviteOpen && _members.every((m) => m['userId'] != Session.id || m['seatIndex'] == null)) {
        _micInviteOpen = true;
        final seat = (e['seatIndex'] as num?)?.toInt();
        showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('Mikrofon daveti'),
            content: Text('${e['fromName'] ?? 'Oda yetkilisi'} sizi mikrofona davet ediyor${seat != null ? ' (${seat + 1}. koltuk)' : ''}.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Reddet')),
              FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Mikrofona çık')),
            ],
          ),
        ).then((ok) {
          _micInviteOpen = false;
          if (ok == true && mounted) _takeMic(seat, true);
        });
      }
      return;
    }
    if (type == 'pk_invite') {
      final pk = mapOf(e['pk']);
      if (pk != null && mounted && !_inviteOpen && mapOf(pk['b'])?['roomId'] == widget.roomId) {
        _inviteOpen = true;
        showPkInviteDialog(context, pk).whenComplete(() => _inviteOpen = false);
      }
      return;
    }
    if (type == 'room_game_state') return; // Ludo ekranı kendisi dinler
    // Sesli oda içi PK: durum (başladı / skor / bitti) ve 2 sn'de bir süre-skor güncellemesi.
    if (type == 'room_pk_state') {
      final pk = mapOf(e['pk']);
      if (pk == null || pk['roomId'] != widget.roomId) return;
      final prev = _roomPk;
      final st = pk['status'];
      // Oda küçültülmüşken (başka ekrandayken) animasyon / sonuç penceresi açılmaz.
      final visible = mounted && !RoomDock.minimized.value;
      if (st == 'preparing' || st == 'active') {
        // Biten turun sonucu sahnede birkaç saniye kalır: hemen ardından gelen yeni "Hazırlanıyor" turu, sonuç süresi
        // dolunca (aşağıdaki yeniden okuma ile) gelir. Tur başlatıldıysa beklemeden geçilir.
        final holding = prev != null && prev['status'] == 'finished' && prev['id'] != pk['id'] && _pkResultUntil != null && DateTime.now().isBefore(_pkResultUntil!);
        if (holding && e['started'] != true) return;
        setState(() => _roomPk = pk);
        // "Başla": herkeste 3-2-1 geri sayım, ardından VS çarpışması.
        if (e['started'] == true && visible) showRoomPkCountdown(context, stillVisible: () => mounted && !RoomDock.minimized.value);
      } else if (st == 'finished' && prev?['id'] == pk['id']) {
        // Sonuç: ~4 sn sahnede kalır, sonra yeni tur gelir; kazananların mikrofonunda gülen, kaybedenlerin
        // mikrofonunda ağlayan emoji oynar.
        _pkResultUntil = DateTime.now().add(const Duration(seconds: 4));
        setState(() => _roomPk = pk);
        _pkResultEmojis(pk);
        if (visible) showRoomPkResult(context, pk);
        Future.delayed(const Duration(seconds: 4), () {
          if (mounted && _roomPk?['id'] == pk['id']) _reloadRoomPk();
        });
      } else if (prev?['id'] == pk['id']) {
        setState(() => _roomPk = null);
      }
      return;
    }
    if (type == 'room_pk_tick') {
      if (_roomPk != null && _roomPk!['id'] == e['pkId']) {
        setState(() {
          _roomPk = {
            ..._roomPk!,
            'remainingSeconds': e['remainingSeconds'],
            'introSeconds': e['introSeconds'] ?? 0,
            'red': {...?mapOf(_roomPk!['red']), 'score': e['red']},
            'blue': {...?mapOf(_roomPk!['blue']), 'score': e['blue']},
          };
        });
      }
      return;
    }
    if (type == 'pk_tick') {
      if (_pk != null && _pk!['id'] == e['pkId']) {
        setState(() {
          final a = {...?mapOf(_pk!['a']), 'score': e['scoreA']};
          final b = {...?mapOf(_pk!['b']), 'score': e['scoreB']};
          _pk = {..._pk!, 'a': a, 'b': b, 'remainingSeconds': e['remainingSeconds']};
        });
      }
      return;
    }
    if (type == 'pk_state') {
      final pk = mapOf(e['pk']);
      if (pk != null && (mapOf(pk['a'])?['roomId'] == widget.roomId || mapOf(pk['b'])?['roomId'] == widget.roomId)) {
        final st = pk['status'];
        final wasActive = _pk?['id'] == pk['id'] && _pk?['status'] == 'active';
        setState(() => _pk = pk);
        // Davet kabul edilip PK başladı: çarpışma animasyonu (oda küçültülmüşken değil).
        if (st == 'active' && !wasActive && mounted && !RoomDock.minimized.value) showRoomPkStart(context, left: 'BİZ', right: 'RAKİP');
        if (st == 'finished' || st == 'declined' || st == 'cancelled') {
          Future.delayed(const Duration(seconds: 8), () {
            if (mounted && _pk?['id'] == pk['id'] && _pk?['status'] != 'active') setState(() => _pk = null);
          });
        }
      }
      return;
    }
    if (e['roomId'] != widget.roomId) return;
    switch (type) {
      case 'room_scoreboard':
        setState(() {
          _scores.clear();
          for (final x in listOf(e['scoreboard'])) {
            _scores[x['userId'].toString()] = x['coins'].toString();
          }
        });
        break;
      case 'room_chat_cleared':
        setState(() => _messages.clear());
        _addSystemMessage('Sohbetler temizlendi.', color: const Color(0xFF34D399));
        break;
      case 'lucky_bag_new':
        final nb = mapOf(e['bag']);
        if (nb != null && e['roomId']?.toString() == widget.roomId) setState(() => _bags.add(nb));
        break;
      case 'lucky_bag_claimed':
        // Çantadan pay alan, odada uçan yazı gibi sağdan sola kayarak geçer.
        final claimer = mapOf(e['user']);
        if (claimer != null && (e['roomId'] == null || e['roomId']?.toString() == widget.roomId)) {
          _fly.add({'user': claimer, 'text': 'şanslı çantadan ${fmtNumber(e['amount'])} Coin aldı 🪙', 'bagClaim': true});
        }
        setState(() {
          final i = _bags.indexWhere((b) => b['id'] == e['bagId']);
          if (i >= 0) {
            final byMe = mapOf(e['user'])?['id']?.toString() == Session.id;
            _bags[i] = {..._bags[i], 'claimed': e['claimed'], if (byMe) 'mine': (e['amount'] ?? '0').toString()};
            if (e['done'] == true) _bags.removeAt(i);
          }
        });
        break;
      case 'lucky_bag_ended':
        setState(() => _bags.removeWhere((b) => b['id'] == e['bagId']));
        break;
      case 'room_member_joined':
        final u = mapOf(e['user']);
        if (u != null) {
          final i = _members.indexWhere((m) => m['userId']?.toString() == u['id']?.toString());
          if (i < 0) {
            setState(() => _members.add({'userId': u['id'], 'role': 'user', 'microphone': false, 'seatIndex': null, 'user': u}));
          } else if (u['id']?.toString() != Session.id) {
            // Zaten listedeyse (yeniden giriş) görünümü tazelenir: çıkıp girerken değişen çerçeve hemen yansır.
            setState(() => _members[i] = {..._members[i], 'user': u});
          }
        }
        // Hayalet (SWIP) üye mikrofona çıkınca "sessiz" gelir: giriş şeridi gösterilmez.
        if (u != null && e['silent'] != true && u['id']?.toString() != Session.id && EffectPrefs.entranceFx) _entrance.add(u);
        // Sohbete "odaya girdi" satırı.
        if (u != null && e['silent'] != true) {
          setState(() {
            _messages.add({'id': 'join-${DateTime.now().microsecondsSinceEpoch}', 'join': true, 'user': u});
            if (_messages.length > 200) _messages.removeAt(0);
          });
          _scrollChatToEnd();
        }
        break;
      case 'room_member_updated':
        // Görünüm değişti (çerçeve, balon, mikrofon dalgası, fotoğraf): çıkıp girmeden hemen yansır.
        final nu = mapOf(e['user']);
        if (nu != null && nu['id']?.toString() == Session.id) {
          // Kendi görünümüm: gizli kullanıcıysam duyuru maskeli gelir; kendi gerçek hâlim listeden yeniden alınır.
          _loadMembers().catchError((_) {});
        } else if (nu != null) {
          setState(() {
            final i = _members.indexWhere((m) => m['userId']?.toString() == nu['id']?.toString());
            if (i >= 0) _members[i] = {..._members[i], 'user': nu};
            // Oda sahibi: oda kimliği sahibin kimliği olduğundan başlıktaki ID de yenilenir (sahip odada olmasa da).
            final r = _room;
            if (r != null && r['ownerId']?.toString() == nu['id']?.toString()) _room = {...r, 'owner': nu};
          });
        }
        break;
      case 'room_member_left':
        // Hayalet mod: kendi mikrofondan inişimiz başkaları için "ayrıldı" gibi duyurulur; kendi listemizden düşmeyiz.
        if (e['ghost'] == true && e['userId']?.toString() == Session.id) break;
        setState(() => _members.removeWhere((m) => m['userId'] == e['userId']));
        break;
      case 'room_seat_changed':
        setState(() => _applySeat(e['userId'].toString(), (e['seatIndex'] as num?)?.toInt(), e['microphone'] == true));
        // Listede olmayan biri koltuğa çıktıysa (ör. hayalet üye) üyeler yeniden alınır.
        if (e['microphone'] == true && !_members.any((m) => m['userId'] == e['userId'])) _loadMembers().catchError((_) {});
        break;
      case 'room_mic_queue':
        final before = _queue.toSet();
        setState(() => _queue = ((e['queue'] as List?) ?? const []).map((x) => x.toString()).toList());
        _queueTick.value++;
        // Yayıncı / yetkili: yeni konuk isteği geldiğinde kısa bildirim (ilk yüklemeden sonra; kişi başı 30 sn'de bir).
        if (_isLive && _canSeatManage && _queueLoaded) {
          final now = DateTime.now();
          for (final id in _queue.where((x) => !before.contains(x))) {
            final last = _guestToastAt[id];
            if (last != null && now.difference(last).inSeconds < 30) continue;
            _guestToastAt[id] = now;
            final m = _members.where((x) => x['userId']?.toString() == id).firstOrNull;
            final name = mapOf(m?['user'])?['displayName']?.toString();
            toast(context, '${name ?? 'Bir izleyici'} konuk olmak istiyor. ∞ düğmesinden kabul edebilirsin.');
          }
        }
        break;
      case 'room_seats_locked':
        setState(() => _room = {...?_room, 'lockedSeats': e['lockedSeats']});
      case 'room_seats_muted':
        final wasMuted = _seatMuted;
        setState(() => _room = {...?_room, 'mutedSeats': e['mutedSeats']});
        if (_seatMuted != wasMuted) {
          _syncPublish();
          toast(context, _seatMuted ? 'Mikrofonun yetkili tarafından kapatıldı.' : 'Mikrofonunun sesi açıldı.');
        }
        break;
      case 'room_role_changed':
        setState(() {
          final i = _members.indexWhere((m) => m['userId'] == e['userId']);
          if (i >= 0) _members[i] = {..._members[i], 'role': e['role']};
          if (e['userId'] == Session.id) _me = {..._me, 'role': e['role']};
        });
        break;
      case 'room_message':
        if (!_messages.any((m) => m['id'] == e['id'])) {
          setState(() {
            _messages.add({'id': e['id'], 'user': e['user'], 'text': e['text'], 'createdAt': e['createdAt'], 'fly': e['fly'] == true, 'welcomeTo': e['welcomeTo']});
            if (_messages.length > 200) _messages.removeAt(0);
          });
          if (e['fly'] == true || e['welcomeTo'] != null) _fly.add(e);
          _scrollChatToEnd(force: mapOf(e['user'])?['id']?.toString() == Session.id);
        }
        break;
      case 'room_message_deleted':
        setState(() => _messages.removeWhere((m) => m['id'] == e['messageId']));
        break;
      case 'room_chat_muted':
        setState(() => _chatMuted = (e['minutes'] as num? ?? 0) > 0);
        toast(context, _chatMuted ? 'Bu odada sohbette susturuldunuz.' : 'Sohbet yasağınız kaldırıldı.');
        break;
      case 'room_mic_emoji':
        final emUser = e['userId']?.toString();
        final emNo = (e['emoji'] as num?)?.toInt();
        if (emUser != null && emNo != null && emNo >= 1 && emNo <= kMicEmojiCount && emUser != Session.id) _showMicEmoji(emUser, emNo);
        break;
      case 'room_gift':
        if (e['roomTotal'] != null) setState(() => _room = {...?_room, 'totalDiamonds': e['roomTotal']});
        _flyGift(e);
        break;
      case 'room_settings':
        if (e['seatCount'] != null && e['seatCount'] != _room?['seatCount']) {
          _addSystemMessage('Oda sahibi yeni bir mikrofon moduna geçmiştir. Geçerli mikrofon konumu değiştirilecektir.');
        }
        setState(() => _room = {
              ...?_room,
              'name': e['name'], 'tags': e['tags'], 'locked': e['locked'], 'chatEnabled': e['chatEnabled'],
              'theme': e['theme'], 'themeImageUrl': e['themeImageUrl'], 'scoreboardEnabled': e['scoreboardEnabled'], 'hidden': e['hidden'],
              if (e['seatCount'] != null) 'seatCount': e['seatCount'],
              if (e['micRequest'] != null) 'micRequest': e['micRequest'],
              if (e['lockedSeats'] != null) 'lockedSeats': e['lockedSeats'],
              if (e['announcement'] != null) 'announcement': e['announcement'],
              if (e.containsKey('coverUrl')) 'coverUrl': e['coverUrl'],
              if (e.containsKey('micSkin')) 'micSkin': e['micSkin'],
              if (e.containsKey('micSkinText')) 'micSkinText': e['micSkinText'],
            });
        break;
      case 'room_music_state':
        final ms = mapOf(e['state']);
        if (ms != null) MusicService.instance.apply(ms);
        break;
      case 'room_closed':
        _exit('Oda kapatıldı.');
        break;
      case 'room_kicked':
        _exit('Odadan çıkarıldınız.');
        break;
      case 'room_blocked':
        _exit('Bu odadan engellendiniz.');
        break;
    }
  }

  void _applySeat(String userId, int? seat, bool mic) {
    final wasMuted = _seatMuted;
    final i = _members.indexWhere((m) => m['userId'] == userId);
    if (i >= 0) _members[i] = {..._members[i], 'seatIndex': seat, 'microphone': mic};
    if (userId == Session.id) {
      final changed = _me['microphone'] != mic;
      _me = {..._me, 'seatIndex': seat, 'microphone': mic};
      BackgroundService.instance.micChanged(mic);
      if (changed || _seatMuted != wasMuted) _syncPublish();
    }
  }

  // ---------- LiveKit ----------
  void _onLkChanged() {
    if (_roomMuted || CallGuard.instance.inCall.value) _applyRoomSound();
    final r = _lk;
    // Arka plandayken yeni açılan kameralar da indirilmez.
    if (_videoPaused && r != null) _unsubscribeRemoteVideo(r);
    // Ses sunucusu bağlantısı koptuysa (ağ değişimi, sunucudan çıkarılma sonrası yeniden katılma) yeniden kur.
    if (r != null && r.connectionState == lk.ConnectionState.disconnected && !_lkConnecting && !_closing && mounted) {
      _lk = null;
      r.removeListener(_onLkChanged);
      r.disconnect().whenComplete(() => r.dispose()).catchError((_) {});
      final wait = Duration(seconds: 2 << _lkRetries.clamp(0, 4)); // 2, 4, 8, 16, 32 sn
      _lkRetries++;
      Future.delayed(wait, () {
        if (mounted && !_closing && _joined && _lk == null) _connectLivekit();
      });
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

  /// Ekranda LiveKit'ten gösterilen her şeyin özeti; değişmediyse oda yeniden çizilmez.
  String _lkSignature() {
    final r = _lk;
    if (r == null) return '-';
    final b = StringBuffer(r.connectionState.name);
    void add(lk.Participant p) {
      b
        ..write('|')
        ..write(p.identity)
        ..write(p.isSpeaking ? '+' : '-');
      for (final pub in p.videoTrackPublications) {
        b
          ..write(pub.sid)
          ..write(pub.muted ? 'm' : '')
          ..write(pub.track != null ? 't${identityHashCode(pub.track)}' : '');
      }
    }

    final local = r.localParticipant;
    if (local != null) add(local);
    for (final p in r.remoteParticipants.values) {
      add(p);
    }
    return b.toString();
  }

  Future<void> _connectLivekit() async {
    if (_lk != null || _lkConnecting) return;
    _lkConnecting = true;
    if (mounted) setState(() => _lkError = null);
    lk.Room? room;
    try {
      final t = await Api.post('/api/rooms/${widget.roomId}/livekit-token');
      final url = t['url'] as String?;
      final token = t['token'] as String?;
      if (url == null || url.isEmpty || token == null) throw ApiException('Ses sunucusu yapılandırılmamış.');
      await _loadNoisePref();
      await HeadsetAudio.instance.start(); // kulaklık takılıysa yüksek kaliteli ses modu (bağlanmadan önce)
      room = lk.Room(roomOptions: lk.RoomOptions(
        adaptiveStream: true,
        dynacast: true,
        defaultAudioCaptureOptions: _audioOptions,
        // Konuşma sesi: 32 kbps (konuşma için fazlasıyla yeterli; varsayılan 48), sessizken neredeyse hiç veri gitmez (DTX).
        // DİKKAT: "red" bilerek verilmedi. Bu SDK'da red: true (varsayılan) yedek ses kopyasını KAPATIR, red: false AÇAR
        // (ses verisi ~2 katına çıkar). Varsayılanda kalsın.
        defaultAudioPublishOptions: const lk.AudioPublishOptions(encoding: lk.AudioEncoding(maxBitrate: 32000), dtx: true),
        // Kamera 540p (varsayılan 720p): telefon ekranında fark az, yükleme ~yarı, işlemci/pil daha az yorulur.
        // Şarj tüketimi modunda 360p (daha az ısınma ve şarj).
        defaultCameraCaptureOptions: lk.CameraCaptureOptions(
          params: EffectPrefs.powerSave.value ? lk.VideoParametersPresets.h360_169 : lk.VideoParametersPresets.h540_169,
        ),
      ));
      room.addListener(_onLkChanged);
      await room.connect(url, token);
      if (!mounted || _closing) {
        room.removeListener(_onLkChanged);
        await room.disconnect();
        await room.dispose();
        return;
      }
      _lk = room;
      _lkRetries = 0;
      await _syncPublish();
    } catch (e) {
      if (room != null) {
        room.removeListener(_onLkChanged);
        room.disconnect().whenComplete(() => room!.dispose()).catchError((_) {});
      }
      // İlk denemelerde hata gösterilmez: 2, 4, 8 sn sonra kendiliğinden yeniden denenir. Üçü de olmazsa uyarı çıkar
      // ("Tekrar" ile elle denenir).
      if (_lkRetries < 3) {
        final wait = Duration(seconds: 2 << _lkRetries);
        _lkRetries++;
        Future.delayed(wait, () {
          if (mounted && !_closing && _joined && _lk == null) _connectLivekit();
        });
      } else {
        _lkRetries = 0;
        final raw = errorText(e);
        final msg = raw.contains('Timeout') ? 'Ses sunucusuna ulaşılamadı. İnternetinizi kontrol edip Tekrar\'a dokunun.' : raw;
        if (mounted) setState(() => _lkError = msg);
      }
    } finally {
      _lkConnecting = false;
      if (mounted) setState(() {});
    }
  }

  /// Sonucu beklenmeyen ses işlemi: hata verse de sessizce geçilir.
  void _quiet(Future<Object?> f) => f.then((_) {}, onError: (_) {});

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
      toast(context, call ? '📞 Arama: oda sesi kapatıldı' : 'Arama bitti, oda sesi açıldı');
    }
  }

  /// Koltuktaysak mikrofonu (görüntülü odada kamerayı) yayına aç, değilsek kapat.
  Future<void> _syncPublish() async {
    final room = _lk;
    if (room == null) return;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        await room.localParticipant?.setMicrophoneEnabled(_onSeat && _micOn && !_seatMuted && !CallGuard.instance.inCall.value);
        if (_isVideo) {
          await room.localParticipant?.setCameraEnabled(_onSeat && _camOn && !_videoPaused);
          // Kayıtlı güzellik ayarları yayındaki kameraya uygulanır (kamera her açıldığında yeni takip gelir).
          if (_onSeat && _camOn && !_videoPaused) unawaited(Beauty.attachParticipant(room.localParticipant));
        }
        BackgroundService.instance.micChanged(_onSeat); // izin verildikten sonra servis "mikrofon" türüne geçer
        return;
      } catch (_) {
        // Yayın izni sunucudan birkaç yüz ms içinde gelir; kısa süre bekleyip tekrar dene.
        await Future.delayed(const Duration(milliseconds: 800));
      }
    }
    if (mounted && _onSeat) toast(context, 'Mikrofon açılamadı. Mikrofon/kamera iznini kontrol edin.', error: true);
  }

  bool _isSpeaking(String userId) {
    final room = _lk;
    if (room == null) return false;
    final local = room.localParticipant;
    if (local != null && local.identity == userId) return local.isSpeaking;
    for (final p in room.remoteParticipants.values) {
      if (p.identity == userId) return p.isSpeaking;
    }
    return false;
  }

  Widget? _videoFor(String userId, {bool cover = false}) {
    final room = _lk;
    if (room == null) return null;
    lk.Participant? participant;
    final local = room.localParticipant;
    if (local != null && local.identity == userId) participant = local;
    for (final p in room.remoteParticipants.values) {
      if (p.identity == userId) participant = p;
    }
    if (participant == null) return null;
    for (final pub in participant.videoTrackPublications) {
      final track = pub.track;
      if (track != null && !pub.muted) return lk.VideoTrackRenderer(track as lk.VideoTrack, fit: cover ? lk.VideoViewFit.cover : lk.VideoViewFit.contain);
    }
    return null;
  }

  /// Güzellik / filtre penceresi (kendi kameramız açıkken).
  Future<void> _openBeauty() async {
    await Beauty.attachParticipant(_lk?.localParticipant);
    if (mounted) await showBeautySheet(context);
  }

  /// Görüntülü odada ön/arka kamera geçişi.
  Future<void> _flipCamera() async {
    final local = _lk?.localParticipant;
    if (local == null) return;
    for (final pub in local.videoTrackPublications) {
      final t = pub.track;
      if (t == null) continue;
      final next = _camPos == lk.CameraPosition.front ? lk.CameraPosition.back : lk.CameraPosition.front;
      try {
        await t.setCameraPosition(next);
        _camPos = next;
        unawaited(Beauty.attach(t)); // kamera çevrilince takip yenilenir
      } catch (e) {
        if (mounted) toast(context, 'Kamera çevrilemedi: ${errorText(e)}', error: true);
      }
      return;
    }
  }

  // ---------- Eylemler ----------
  bool get _micRequest => _room?['micRequest'] == true;

  Future<void> _takeMic([int? seat, bool invited = false]) async {
    // İstek modu: yetkili olmayan kullanıcı koltuğa dokununca istek gönderir (davetle gelirse doğrudan çıkar).
    if (_isLive && !invited && !_onSeat && !_canSeatManage) {
      _guestTap(); // canlı yayında konukluk yalnızca istekle
      return;
    }
    if (_micRequest && !invited && !_onSeat && !_canSeatManage) {
      if (_inQueue) {
        toast(context, 'İsteğin zaten gönderildi; yetkili onayını bekle.');
      } else {
        await _toggleQueue();
      }
      return;
    }
    if (_takingMic) return; // aynı anda ikinci istek gitmesin (ör. iki kez gelen kabul)
    // Mikten mike geçiş: yeni koltuk hemen gösterilir (sunucu yanıtı beklenmez); olmazsa eski koltuğa döner.
    final prevSeat = _mySeatIndex;
    final switching = _onSeat && seat != null && prevSeat != null && seat != prevSeat;
    if (switching) setState(() => _applySeat(Session.id, seat, true));
    _takingMic = true;
    final Future<Map<String, dynamic>?> call = guard(context, () => Api.post('/api/rooms/${widget.roomId}/mic/take', {if (seat != null) 'seatIndex': seat}));
    final Map<String, dynamic>? res = await call.whenComplete(() => _takingMic = false);
    if (!mounted) return;
    if (res == null) {
      if (switching) setState(() => _applySeat(Session.id, prevSeat, true));
      return;
    }
    final seatIndex = (res['seatIndex'] as num?)?.toInt();
    setState(() => _applySeat(Session.id, seatIndex, true));
  }

  bool _takingMic = false;

  int? get _mySeatIndex {
    for (final m in _members) {
      if (m['userId']?.toString() == Session.id) return (m['seatIndex'] as num?)?.toInt();
    }
    return null;
  }

  Future<void> _leaveMic() async {
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/mic/leave'));
    if (r == null || !mounted) return;
    setState(() => _applySeat(Session.id, null, false));
  }

  /// Yetkili: mikrofon isteklerini onayla (davet gönder) veya reddet.
  void _micRequestsSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => StatefulBuilder(
        builder: (c, setS) {
          final list = [for (final id in _queue) _members.where((m) => m['userId'] == id).firstOrNull].whereType<Map<String, dynamic>>().toList();
          return SafeArea(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Padding(padding: EdgeInsets.only(bottom: 6), child: Text('Mikrofon istekleri', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
              if (list.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Bekleyen istek yok.', style: TextStyle(color: Colors.white54))),
              Flexible(
                child: ListView(shrinkWrap: true, children: [
                  for (final m in list)
                    ListTile(
                      leading: UserAvatar(user: mapOf(m['user']), radius: 20),
                      title: UserName(user: mapOf(m['user'])),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(
                          tooltip: 'Reddet',
                          icon: const Icon(Icons.close, color: Colors.redAccent),
                          onPressed: () async {
                            final r = await guard(context, () => Api.delete('/api/rooms/${widget.roomId}/mic/queue/${m['userId']}'));
                            if (r != null && mounted) setState(() => _queue = ((r['queue'] as List?) ?? const []).map((x) => x.toString()).toList());
                            if (c.mounted) setS(() {});
                          },
                        ),
                        FilledButton(
                          onPressed: () async {
                            final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/members/${m['userId']}/mic-invite', {}));
                            if (r != null && mounted) toast(context, 'Mikrofona davet gönderildi.');
                          },
                          child: const Text('Onayla'),
                        ),
                      ]),
                    ),
                ]),
              ),
              const SizedBox(height: 8),
            ]),
          );
        },
      ),
    );
  }

  // ---------- Canlı yayın: konuk (misafir) istekleri ----------
  /// Alt bardaki ∞: izleyici istek gönderir / geri alır, konuk ayrılır, yayıncı istekleri yönetir.
  void _guestTap() {
    if (_canSeatManage) {
      _guestRequestsSheet();
      return;
    }
    if (_onSeat) {
      confirm(context, 'Konukluktan ayrılıp izleyiciye dönülsün mü?', action: 'Ayrıl').then((ok) {
        if (ok && mounted) _leaveMic();
      });
      return;
    }
    final host = mapOf(_bySeat[0]?['user']);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1C1C1F),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              UserAvatar(user: mapOf(_members.where((m) => m['userId']?.toString() == Session.id).firstOrNull?['user']), radius: 28),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Icon(Icons.all_inclusive, color: Color(0xFFFF4F9A), size: 30)),
              UserAvatar(user: host, radius: 28),
            ]),
            const SizedBox(height: 12),
            Text(_inQueue ? 'İsteğin yayıncıya iletildi' : 'Konuk olarak katıl',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Colors.white)),
            const SizedBox(height: 6),
            Text(
              _inQueue
                  ? 'Yayıncı kabul edince kameran ve mikrofonun açılarak yayına bağlanacaksın.'
                  : 'Yayıncıya konuk olma isteği gönder. Kabul ederse kameran ve mikrofonun açılarak yayında sağdaki pencerede görünürsün.'
                      '${_noFreeSeat ? '\nŞu an konuk yerleri dolu; yer açılınca kabul edebilir.' : ''}',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Colors.white70),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: _inQueue ? Colors.white12 : const Color(0xFFFF4F9A), shape: const StadiumBorder()),
                onPressed: () {
                  Navigator.pop(c);
                  _toggleQueue();
                },
                child: Text(_inQueue ? 'İsteği geri al' : 'İstek gönder', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  /// Yayıncı / yetkili: konuk istekleri (kabul / reddet) ve yayındaki konuklar (çıkar).
  void _guestRequestsSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: const Color(0xFF1C1C1F),
      builder: (c) => ValueListenableBuilder<int>(
        valueListenable: _queueTick,
        builder: (c, _, __) => StatefulBuilder(
        builder: (c, setS) {
          final requests = [for (final id in _queue) _members.where((m) => m['userId'] == id).firstOrNull].whereType<Map<String, dynamic>>().toList();
          final guests = [for (var i = 1; i < _seatCount; i++) if (_bySeat[i] != null) _bySeat[i]!];
          final free = _freeGuestSeats;
          return SafeArea(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('Konuk istekleri (${requests.length})', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(free > 0 ? '$free konuk yeri boş' : 'Konuk yerleri dolu', style: TextStyle(fontSize: 12, color: free > 0 ? Colors.white54 : Colors.orangeAccent)),
              if (requests.isEmpty) const Padding(padding: EdgeInsets.all(20), child: Text('Bekleyen istek yok. İzleyiciler alttaki ∞ düğmesinden istek gönderir.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white54))),
              Flexible(
                child: ListView(shrinkWrap: true, children: [
                  for (final m in requests)
                    ListTile(
                      leading: UserAvatar(user: mapOf(m['user']), radius: 20),
                      title: UserName(user: mapOf(m['user'])),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(
                          tooltip: 'Reddet',
                          icon: const Icon(Icons.close, color: Colors.redAccent),
                          onPressed: () async {
                            final r = await guard(context, () => Api.delete('/api/rooms/${widget.roomId}/mic/queue/${m['userId']}'));
                            if (r != null && mounted) setState(() => _queue = ((r['queue'] as List?) ?? const []).map((x) => x.toString()).toList());
                            if (c.mounted) setS(() {});
                          },
                        ),
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF4F9A)),
                          onPressed: _accepting.contains(m['userId'])
                              ? null
                              : () async {
                                  if (_noFreeSeat) {
                                    toast(context, 'Konuk yerleri dolu. Önce bir konuğu çıkarın.', error: true);
                                    return;
                                  }
                                  final id = m['userId'].toString();
                                  setS(() => _accepting.add(id));
                                  final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/members/$id/mic-invite', {}));
                                  // Konuk oturana (ya da 20 sn) kadar ikinci kez kabul gönderilmez.
                                  Future.delayed(const Duration(seconds: 20), () => _accepting.remove(id));
                                  if (r == null) _accepting.remove(id);
                                  if (r != null && mounted) toast(context, 'Kabul edildi; konuk yayına bağlanıyor.');
                                  if (c.mounted) setS(() {});
                                },
                          child: Text(_accepting.contains(m['userId']) ? 'Bağlanıyor' : 'Kabul et'),
                        ),
                      ]),
                    ),
                  if (guests.isNotEmpty) const Padding(padding: EdgeInsets.fromLTRB(16, 10, 16, 2), child: Text('Yayındaki konuklar', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white70))),
                  for (final g in guests)
                    ListTile(
                      leading: UserAvatar(user: mapOf(g['user']), radius: 20),
                      title: UserName(user: mapOf(g['user'])),
                      trailing: TextButton(
                        onPressed: () async {
                          Navigator.pop(c);
                          await _moderate(g['userId'].toString(), 'mic-off');
                        },
                        child: const Text('Konukluktan çıkar', style: TextStyle(color: Colors.redAccent)),
                      ),
                    ),
                ]),
              ),
              const SizedBox(height: 8),
            ]),
          );
        },
        ),
      ),
    );
  }

  final Set<String> _accepting = {};

  /// Boş (kilitli olmayan) konuk yeri sayısı.
  int get _freeGuestSeats {
    final taken = <int>{for (final m in _members) if (m['seatIndex'] != null) (m['seatIndex'] as num).toInt()};
    var n = 0;
    for (var i = 1; i < _seatCount; i++) {
      if (!taken.contains(i) && !_lockedSeats.contains(i)) n++;
    }
    return n;
  }

  bool _canModerate(String targetRole) =>
      (_roleLevel[_myRole] ?? 0) >= 2 && (_roleLevel[_myRole] ?? 0) > (_roleLevel[targetRole] ?? 0) && targetRole != 'owner';

  Future<void> _moderate(String userId, String action, {Map<String, dynamic>? body}) async {
    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/members/$userId/$action', body));
  }

  Future<void> _closeRoom() async {
    if (!await confirm(context, 'Oda kapatılsın mı? Herkes odadan çıkarılır.', action: 'Kapat')) return;
    if (!mounted) return;
    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/close'));
  }

  /// Oda adına dokununca: ad ve etiketler (oda sahibi / yardımcı sahip düzenler) ve oda yöneticileri.
  Future<void> _roomInfo() async {
    final canEdit = _myRole == 'owner' || _myRole == 'cohost';
    final res = await guard(context, () => Api.get('/api/rooms/${widget.roomId}/managers'));
    if (!mounted) return;
    final managers = listOf(res?['managers']);
    final owner = _members.where((m) => m['role'] == 'owner');
    // Oda sahibi şu an odada değilse bilgisi yönetici listesinden alınır (oda kartı arka planı için).
    final ownerUser = owner.isNotEmpty ? mapOf(owner.first['user']) : mapOf(managers.where((x) => x['role'] == 'owner').firstOrNull?['user']);
    showRoomCard(
      context,
      room: _room ?? const {},
      owner: ownerUser,
      managers: managers,
      canEdit: canEdit,
      onEdit: () => _roomEdit(managers),
      onSettings: _roomSettings,
    );
  }

  Future<void> _roomEdit(List<Map<String, dynamic>> managers) async {
    final room = await Navigator.push<Map<String, dynamic>?>(
      context,
      MaterialPageRoute(builder: (_) => RoomEditScreen(roomId: widget.roomId, room: _room ?? const {}, managers: managers, isOwner: _myRole == 'owner')),
    );
    if (room != null && mounted) setState(() => _room = {...?_room, ...room});
  }

  // ---------- Oda araçları (kayar pencere) ----------
  bool get _isOwnerOrCohost => _myRole == 'owner' || _myRole == 'cohost';

  Future<bool> _patchRoom(Map<String, dynamic> body) async {
    final r = await guard(context, () => Api.patch('/api/rooms/${widget.roomId}', body));
    final room = mapOf(r?['room']);
    if (room != null && mounted) setState(() => _room = {...?_room, ...room});
    return room != null;
  }

  /// Hediye atılınca hediyenin ikonu (png) gönderenden alıcıların koltuğuna uçar; ardından tam ekran animasyon oynar (Yoho).
  void _flyGift(Map<String, dynamic> e) {
    // Oda küçültülmüşken / uygulama arka plandayken animasyonlar donar; birikip açılışta yüzlercesi birden oynamasın.
    final ls = WidgetsBinding.instance.lifecycleState;
    if (RoomDock.minimized.value || (ls != null && ls != AppLifecycleState.resumed) || _flights.length > 40) return;
    final gift = mapOf(e['gift']);
    final icon = Api.absoluteUrl(gift?['iconUrl'] as String?);
    final stage = _stageKey.currentContext?.findRenderObject();
    if (icon == null || stage is! RenderBox || !stage.attached) return;
    Offset? centerOfBox(GlobalKey? key) {
      final box = key?.currentContext?.findRenderObject();
      if (box is! RenderBox || !box.attached) return null;
      return stage.globalToLocal(box.localToGlobal(box.size.center(Offset.zero)));
    }

    Offset? centerOf(String? userId) => userId == null ? null : centerOfBox(_seatKeys[userId]);

    // Koltuktaki avatarın çapı (koltuk kutusu − kenar boşluğu).
    double? seatDiameter(String? userId) {
      final box = userId == null ? null : _seatKeys[userId]?.currentContext?.findRenderObject();
      if (box is! RenderBox || !box.attached) return null;
      return math.max(24.0, box.size.shortestSide - 8);
    }

    final from = centerOf(mapOf(e['sender'])?['id']?.toString()) ?? Offset(stage.size.width / 2, stage.size.height * 0.86);
    final receivers = e['receivers'] is List ? (e['receivers'] as List) : const [];
    final fresh = <_GiftFlightData>[];
    final seatFx = <_SeatFx>[];
    final anim = Api.absoluteUrl(gift?['animationUrl'] as String?);
    final animFormat = (gift?['animationFormat'] ?? '').toString();
    final onSeat = gift?['playMode'] == 'seat' && EffectPrefs.giftAnim;
    for (final r in receivers.take(20)) {
      final rid = mapOf(r is Map ? r['user'] : null)?['id']?.toString();
      // Mikrofonda değilse (odadaysa) seyirci sayısı rozetine uçar.
      final to = centerOf(rid) ?? (rid == null ? null : centerOfBox(_viewersKey));
      final qty = _asInt(r is Map ? r['quantity'] : null) ?? _asInt(e['quantity']) ?? 1;
      if (to != null) fresh.add(_GiftFlightData(++_flightSeq, icon, from, to, qty < 1 ? 1 : qty));
      // Yalnızca mikteki alıcının dairesinde oynar (seyirci rozetinde oynamaz).
      final seatAt = centerOf(rid);
      if (onSeat && anim != null && seatAt != null) {
        seatFx.add(_SeatFx(++_flightSeq, anim, animFormat, seatAt, seatDiameter(rid) ?? 56, sound: seatFx.isEmpty));
      }
    }
    if (fresh.isEmpty) return;
    setState(() => _flights.addAll(fresh));
    if (seatFx.isNotEmpty) {
      // İkon koltuğa varınca hediye o dairenin içinde oynar.
      Future.delayed(const Duration(milliseconds: 1300), () {
        if (!mounted || !EffectPrefs.giftAnim) return;
        setState(() {
          _seatFx.addAll(seatFx);
          if (_seatFx.length > 20) _seatFx.removeRange(0, _seatFx.length - 20);
        });
        // Oynatıcı bitişi bildirmese de daire boş kalsın.
        final ids = {for (final f in seatFx) f.id};
        Future.delayed(const Duration(seconds: 15), () {
          if (mounted) setState(() => _seatFx.removeWhere((x) => ids.contains(x.id)));
        });
      });
    }
  }

  /// Mikrofon modu (Yoho): pencere açık kalır; seçim anında uygulanır, istek modu alttaki seçenekle açılıp kapanır.
  Future<void> _micMode() async {
    try {
      final theme = (_room?['theme'] ?? 'default').toString();
      await showMicModeSheet(
        context,
        current: _seatCount,
        requestMode: _micRequest,
        video: _isVideo,
        colors: theme == 'default' ? null : themeOf(theme).colors,
        onSelect: (n) async {
          final old = _seatCount;
          try {
            final r = await Api.patch('/api/rooms/${widget.roomId}', {'seatCount': n});
            final room = mapOf(r['room']);
            if (!mounted) return false;
            if (n != old && _room?['seatCount'] == old) {
              _addSystemMessage('Oda sahibi yeni bir mikrofon moduna geçmiştir. Geçerli mikrofon konumu değiştirilecektir.');
            }
            setState(() => _room = {...?_room, ...?room, 'seatCount': n});
            await _loadMembers(); // taşan koltuktakiler dinleyiciye inmiş olabilir
            return true;
          } catch (e) {
            if (mounted) toast(context, 'Mikrofon modu değişmedi: ${errorText(e)}', error: true);
            return false;
          }
        },
        onRequestMode: (on) => _patchRoom({'micRequest': on}),
      );
    } catch (e) {
      if (mounted) toast(context, 'Mikrofon modu penceresi açılamadı: $e', error: true);
    }
  }

  Future<void> _shareRoom() async {
    final code = _room?['joinCode']?.toString();
    final name = (_room?['name'] ?? widget.initialName).toString();
    await Clipboard.setData(ClipboardData(text: '🎙 TR Live — "$name" odasına gel!${code != null ? '\nOda kodu: $code' : ''}'));
    if (mounted) toast(context, 'Oda daveti kopyalandı. İstediğin yere yapıştırıp paylaş.');
  }

  // ---------- Gürültü engelleme ----------
  /// Açıkken mikrofon sesinde çevre gürültüsü bastırılır (gürültü engelleme + düşük frekans süzgeci + yankı giderme).
  static bool noiseCancel = true;
  static bool _noiseLoaded = false;

  static lk.AudioCaptureOptions get _audioOptions => lk.AudioCaptureOptions(
        noiseSuppression: noiseCancel,
        echoCancellation: true,
        autoGainControl: true,
        highPassFilter: noiseCancel,
        // Konuşma odaklı işleme (Yoho gibi): klavye/tık sesi bastırma ve iPhone ses izolasyonu gürültü engellemeyle birlikte açılır.
        typingNoiseDetection: noiseCancel,
        voiceIsolation: noiseCancel,
              );

  static Future<void> _loadNoisePref() async {
    if (_noiseLoaded) return;
    _noiseLoaded = true;
    try {
      noiseCancel = (await SharedPreferences.getInstance()).getBool('noise_cancel') ?? true;
    } catch (_) {}
  }

  Future<void> _setNoiseCancel(bool v) async {
    noiseCancel = v;
    try {
      await (await SharedPreferences.getInstance()).setBool('noise_cancel', v);
    } catch (_) {}
    // Mikrofon izi yeni ayarla yeniden başlatılır (ses kısa bir an kesilir).
    final track = _lk?.localParticipant?.getTrackPublicationBySource(lk.TrackSource.microphone)?.track;
    if (track is lk.LocalAudioTrack) {
      try {
        await track.restartTrack(_audioOptions);
        if (track.muted) await track.disable(); // kapalı mikrofon yeniden başlatınca açılmasın
      } catch (_) {/* sonraki açılışta yeni ayar geçerli olur */}
    }
  }

  /// Efekt ve ses ayarları (yalnızca bu cihazda; uygulama kapanıp açılınca da hatırlanır).
  Future<void> _effectsAndSound() async {
    var noise = noiseCancel;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF17172A),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (c) => StatefulBuilder(
        builder: (c, setS) {
          Widget section(String t) => Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                child: Align(alignment: Alignment.centerLeft, child: Text(t, style: const TextStyle(color: Colors.white54, fontSize: 14))),
              );
          Widget sw(String title, bool value, ValueChanged<bool> onChanged, {String? note}) => Column(mainAxisSize: MainAxisSize.min, children: [
                SwitchListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)),
                  subtitle: note == null ? null : Text(note, style: const TextStyle(color: Color(0xFFFFB020), fontSize: 12.5)),
                  value: value,
                  activeTrackColor: const Color(0xFF12C84A),
                  onChanged: (v) {
                    setS(() {});
                    onChanged(v);
                  },
                ),
                const Divider(height: 1, indent: 20, endIndent: 20, color: Colors.white10),
              ]);
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.8),
              child: SingleChildScrollView(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 16, bottom: 4),
                    child: Text('Efekt ve ses', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ),
                  section('Efekt ayarları'),
                  sw('Hediye görsel efekti', EffectPrefs.giftAnim, (v) => EffectPrefs.set('fx_gift_anim', v)),
                  sw('Araç ve giriş efektleri', EffectPrefs.entranceFx, (v) => EffectPrefs.set('fx_entrance', v), note: 'SWIP araçları gizlenemez.'),
                  sw('Hediye kanalı', EffectPrefs.giftRibbon, (v) => EffectPrefs.set('fx_gift_ribbon', v)),
                  sw('Global bildirim', EffectPrefs.globalNotice, (v) => EffectPrefs.set('fx_global_notice', v)),
                  section('Ses ayarları'),
                  sw('Hediye ve araç sesleri', EffectPrefs.giftSound, (v) => EffectPrefs.set('fx_gift_sound', v)),
                  sw('Mikrofon gürültüsü engelleme', noise, (v) {
                    noise = v;
                    _setNoiseCancel(v);
                  }),
                  const ListTile(
                    contentPadding: EdgeInsets.symmetric(horizontal: 20),
                    leading: Icon(Icons.phone_in_talk, color: Colors.white70),
                    title: Text('Telefon araması gelince oda sesi ve mikrofon kendiliğinden kapanır, arama bitince açılır.', style: TextStyle(fontSize: 13.5, color: Colors.white70)),
                  ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(20, 4, 20, 16),
                    child: Text('Görüntüde takılma olursa görsel efektleri kapatmayı deneyin.', style: TextStyle(color: Colors.white38, fontSize: 12.5)),
                  ),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _roomPassword() async {
    final ctl = TextEditingController();
    final locked = _room?['locked'] == true;
    final res = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(locked ? 'Oda kilidi (açık)' : 'Oda kilidi'),
        content: TextField(controller: ctl, obscureText: true, maxLength: 12, decoration: InputDecoration(labelText: locked ? 'Yeni şifre' : 'Oda şifresi (4-12 karakter)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Vazgeç')),
          if (locked) TextButton(onPressed: () => Navigator.pop(c, ''), child: const Text('Kilidi kaldır')),
          FilledButton(onPressed: () => Navigator.pop(c, ctl.text.trim()), child: const Text('Kaydet')),
        ],
      ),
    );
    ctl.dispose();
    if (res == null || !mounted) return;
    if (res.isNotEmpty && res.length < 4) return toast(context, 'Şifre en az 4 karakter olmalı.', error: true);
    if (res.isEmpty && !locked) return;
    if (await _patchRoom({'password': res.isEmpty ? null : res}) && mounted) toast(context, res.isEmpty ? 'Oda kilidi kaldırıldı.' : 'Oda şifreyle kilitlendi.');
  }

  /// Tema penceresi (Müsait / Mağaza). Dokunulan tema hemen uygulanır; oda sesi kesilmez.
  Future<void> _roomThemes() => showRoomThemeSheet(
        context,
        roomId: widget.roomId,
        current: (_room?['theme'] ?? 'default').toString(),
        onApply: (key) => _patchRoom({'theme': key}),
      );


  Future<void> _toggleHidden() async {
    final hide = _room?['hidden'] != true;
    if (!await confirm(context, hide ? 'Oda listeden gizlensin mi? Yalnızca davet koduyla girilebilir.' : 'Oda herkese açık listeye geri dönsün mü?', action: hide ? 'Gizle' : 'Göster')) return;
    if (!mounted) return;
    if (await _patchRoom({'hidden': hide}) && mounted) {
      final code = _room?['joinCode']?.toString();
      toast(context, hide ? 'Oda gizlendi.${code != null ? ' Kod: $code' : ''}' : 'Oda herkese açıldı.');
    }
  }

  void _openTools() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheet) {
        void run(VoidCallback f) {
          Navigator.pop(sheet);
          f();
        }

        void need(bool ok, VoidCallback f) {
          if (ok) return run(f);
          toast(context, 'Bu aracı kullanma yetkiniz yok.', error: true);
        }

        // Temel araç: renkli yuvarlak düğme (beyaz simge) + iki satır etiket. [tint]: düğmenin rengi.
        // [active]: açık durumdaki araç (kilitli, gizli, sohbet yasağı, sırada…) etiketin altında küçük çizgiyle gösterilir.
        Widget feature(IconData icon, String label, VoidCallback onTap, {required Color tint, bool active = false}) => InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color.lerp(tint, Colors.white, 0.28)!, tint, Color.lerp(tint, Colors.black, 0.22)!],
                      ),
                      border: Border.all(color: Colors.white.withValues(alpha: active ? 0.9 : 0.22), width: active ? 1.6 : 0.8),
                      boxShadow: [BoxShadow(color: tint.withValues(alpha: 0.45), blurRadius: 8, offset: const Offset(0, 2))],
                    ),
                    child: Icon(icon, size: 21, color: Colors.white),
                  ),
                  const SizedBox(height: 5),
                  Text(label, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 11, color: Color(0xFFDADADF), height: 1.15)),
                  const SizedBox(height: 3),
                  Container(
                    width: 16,
                    height: 3,
                    decoration: BoxDecoration(color: active ? tint : Colors.transparent, borderRadius: BorderRadius.circular(2)),
                  ),
                ]),
              ),
            );
        // Araç renkleri (canlı, koyu zeminde okunur).
        const cPink = Color(0xFFFF4F9A);
        const cGreen = Color(0xFF22C987);
        const cCyan = Color(0xFF14B8E6);
        const cPurple = Color(0xFF7C5CFF);
        const cRed = Color(0xFFEF4444);
        const cBlue = Color(0xFF3B82F6);
        const cOrange = Color(0xFFFF8A3D);
        const cTeal = Color(0xFF14B8A6);

        // İnteraktif özellik: kare görsel kutu + etiket.
        Widget tile(Widget art, String label, VoidCallback onTap, {List<Color> colors = const [Color(0xFF2B2B30), Color(0xFF151518)]}) => InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: onTap,
              child: SizedBox(
                width: 64,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 56,
                    height: 56,
                    clipBehavior: Clip.antiAlias,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(9), gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors)),
                    child: art,
                  ),
                  const SizedBox(height: 5),
                  Text(label, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: Color(0xFFDADADF))),
                ]),
              ),
            );

        final chatOn = _room?['chatEnabled'] != false;
        final hidden = _room?['hidden'] == true;
        final locked = _room?['locked'] == true;
        final pkFree = (_pk == null || !['pending', 'active'].contains(_pk!['status'])) && (_roomPk == null || _roomPk!['status'] == 'finished');
        final queueMode = !_isLive && !_onSeat && !_canSeatManage && (_micRequest || _noFreeSeat);
        final tools = <Widget>[
          // Sıra: Odayı temizle, Sohbet yasağı, Oda kilitleme, Oda gizleme, Ses ve efektler, Müzik, Mikrofon Modu, Tema,
          // Odayı paylaş, Odayı kapat. (Oda sesini kapatma alt çubukta.)
          if (_isManager) feature(Icons.cleaning_services, 'Odayı\nTemizle', () => need(_isManager, _clearChat), tint: cPink),
          if (_isOwnerOrCohost) feature(chatOn ? Icons.speaker_notes_off : Icons.chat, chatOn ? 'Sohbet\nYasağı' : 'Sohbeti\nAç', () => need(_isOwnerOrCohost, () => _patchRoom({'chatEnabled': !chatOn})), tint: cCyan, active: !chatOn),
          if (_myRole == 'owner') feature(locked ? Icons.lock : Icons.lock_open, 'Oda\nKilitleme', () => need(_myRole == 'owner', _roomPassword), tint: cGreen, active: locked),
          if (_myRole == 'owner') feature(hidden ? Icons.visibility_off : Icons.visibility, 'Oda\nGizleme', () => need(_myRole == 'owner', _toggleHidden), tint: cPink, active: hidden),
          feature(Icons.graphic_eq, 'Ses ve\nEfektler', () => run(_effectsAndSound), tint: cPurple),
          if (_isManager) feature(Icons.library_music, 'Müzik', () => run(_openMusic), tint: cGreen, active: MusicService.instance.state.value?['status'] == 'playing'),
          if (_isOwnerOrCohost && !_isLive) feature(Icons.mic_external_on, _isVideo ? 'Yayın\nModu' : 'Mikrofon\nModu', () {
            Navigator.pop(sheet);
            // Alt pencerenin kapanma animasyonu bitmeden yenisini açmak bazı cihazlarda açılmıyor; kısa bekle.
            Future.delayed(const Duration(milliseconds: 300), () {
              if (mounted) _micMode();
            });
          }, tint: cPurple),
          if (_myRole == 'owner' && !_isLive && !_isVideo) feature(Icons.cake, 'Doğum\nGünü', () => run(_openBirthday), tint: cPink, active: _birthday),
          if (_isOwnerOrCohost) feature(Icons.palette, 'Tema', () => need(_isOwnerOrCohost, _roomThemes), tint: cPink),
          feature(Icons.share, 'Odayı\nPaylaş', () => run(_shareRoom), tint: cBlue),
          if (_myRole == 'owner') feature(Icons.power_settings_new, 'Odayı\nKapat', () => run(_closeRoom), tint: cRed),
          // Koltuk / kamera araçları (duruma göre).
          if (_onSeat && _isVideo)
            feature(_camOn ? Icons.videocam : Icons.videocam_off, 'Kamera', () => run(() {
                  setState(() => _camOn = !_camOn);
                  _syncPublish();
                }), tint: cOrange, active: _camOn),
          if (_onSeat && _isVideo && _camOn) feature(Icons.cameraswitch, 'Kamerayı\nÇevir', () => run(_flipCamera), tint: cTeal),
          if (_onSeat && _isVideo && _camOn) feature(Icons.face_retouching_natural, 'Güzellik', () => run(_openBeauty), tint: cPink),
          if (queueMode)
            feature(_inQueue ? Icons.hourglass_bottom : Icons.front_hand, _inQueue ? (_micRequest ? 'İsteği\nGeri Al' : 'Sıradan\nÇık') : (_micRequest ? 'Mikrofon\nİste' : 'Sıraya\nGir'), () => run(_toggleQueue), tint: _inQueue ? cOrange : cGreen, active: _inQueue),
          if (_onSeat) feature(Icons.mic_off, 'Mikrofondan\nİn', () => run(_leaveMic), tint: cRed),
          if (_canSeatManage && _micRequest && !_isLive) feature(Icons.how_to_reg, 'Mikrofon\nİstekleri', () => run(_micRequestsSheet), tint: cGreen),
          if (_canSeatManage && _isLive) feature(Icons.all_inclusive, 'Konuk\nİstekleri', () => run(_guestRequestsSheet), tint: cGreen),
          if (_isLive && !_canSeatManage && !_onSeat) feature(Icons.all_inclusive, _inQueue ? 'İsteği\nGeri Al' : 'Konuk\nOl', () => run(_guestTap), tint: cPink, active: _inQueue),
        ];
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(sheet).height * 0.82),
          child: Container(
            decoration: const BoxDecoration(color: Color(0xFF1C1C1F), borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Expanded(child: Text('İnteraktif Özellikler', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white))),
                    InkResponse(onTap: () => Navigator.pop(sheet), radius: 18, child: const Icon(Icons.close, size: 22, color: Colors.white)),
                  ]),
                  const SizedBox(height: 10),
                  Wrap(spacing: 10, runSpacing: 8, children: [
                    // Sesli oda: oda içi PK (sahip / yardımcı sahip). Görüntülü: rakip yayına PK daveti (sahip).
                    if (_isVideo ? _myRole == 'owner' : _isOwnerOrCohost)
                      tile(
                        const PkLogo(size: 46),
                        'PK',
                        () => !pkFree
                            ? toast(context, _roomPk != null ? 'PK modu zaten açık. Kapatmak için PK çubuğundaki X\'e dokunun.' : 'Zaten bir PK sürüyor.', error: true)
                            : (!_isVideo && _seatCount != kRoomPkSeats)
                                ? toast(context, 'PK modu yalnızca 9\'lu koltukta açılır. Önce Mikrofon Modu\'ndan 9 koltuğu seçin.', error: true)
                                : run(() => _isVideo ? showPkChallengeSheet(context, roomId: widget.roomId) : showRoomPkSetup(context, roomId: widget.roomId, seatCount: _seatCount)),
                        colors: const [Color(0xFF1A237E), Color(0xFF0D0D1A), Color(0xFFB71C1C)],
                      ),
                    tile(const Text('🎲', style: TextStyle(fontSize: 30)), 'Ludo', () => run(_openGames), colors: kGoldDeep),
                    if (_activitiesOn) tile(const Icon(Icons.celebration, size: 30, color: Colors.white), 'Etkinlikler', () => run(_openRoomActivities), colors: const [Color(0xFF14506B), Color(0xFF0A1F2B)]),
                    tile(Image.asset('assets/images/lucky_pouch.webp', width: 48, height: 48), 'Şanslı Çanta', () => run(() => showBagSend(context, widget.roomId)), colors: const [Color(0xFF3A1010), Color(0xFF1A0808)]),
                  ]),
                  const SizedBox(height: 16),
                  const Text('Temel Araçlar', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                  const SizedBox(height: 8),
                  LayoutBuilder(builder: (context, box) {
                    final per = (box.maxWidth / 62).floor().clamp(4, 6);
                    final w = box.maxWidth / per;
                    return Wrap(runSpacing: 4, children: [for (final t in tools) SizedBox(width: w, child: t)]);
                  }),
                ]),
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _roomSettings() async {
    final pwCtl = TextEditingController();
    final imgCtl = TextEditingController(text: (_room?['themeImageUrl'] ?? '').toString());
    var chatEnabled = _room?['chatEnabled'] != false;
    var scoreboard = _room?['scoreboardEnabled'] != false;
    var hidden = _room?['hidden'] == true;
    var theme = (_room?['theme'] ?? 'default').toString();
    var removePw = false;
    var regen = false;
    final code = _room?['joinCode']?.toString();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, setS) => AlertDialog(
          title: const Text('Oda ayarları'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Padding(padding: EdgeInsets.only(bottom: 8), child: Text('Oda adı ve etiketleri için oda adına dokunun.', style: TextStyle(color: Colors.white54, fontSize: 12))),
              if (_myRole == 'owner') ...[
                TextField(controller: pwCtl, obscureText: true, maxLength: 12, enabled: !removePw, decoration: InputDecoration(labelText: _room?['locked'] == true ? 'Yeni şifre (boş = değişmez)' : 'Oda şifresi (isteğe bağlı)')),
                if (_room?['locked'] == true) CheckboxListTile(dense: true, value: removePw, title: const Text('Şifreyi kaldır'), onChanged: (v) => setS(() => removePw = v == true)),
                SwitchListTile(dense: true, title: const Text('Odayı gizle (yalnızca kodla girilir)'), value: hidden, onChanged: (v) => setS(() => hidden = v)),
                if (hidden && code != null)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('Davet kodu: $code', style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 2)),
                    trailing: IconButton(icon: const Icon(Icons.copy), onPressed: () { Clipboard.setData(ClipboardData(text: code)); toast(context, 'Kod kopyalandı.'); }),
                  ),
                if (hidden && code != null) CheckboxListTile(dense: true, value: regen, title: const Text('Kodu yenile'), onChanged: (v) => setS(() => regen = v == true)),
              ],
              SwitchListTile(dense: true, title: const Text('Yazılı sohbet açık'), value: chatEnabled, onChanged: (v) => setS(() => chatEnabled = v)),
              SwitchListTile(dense: true, title: const Text('Koltuk hediye sayacı'), value: scoreboard, onChanged: (v) => setS(() => scoreboard = v)),
              const SizedBox(height: 8),
              const Text('Oda teması'),
              const SizedBox(height: 6),
              ThemePicker(value: theme, onChanged: (v) => setS(() => theme = v)),
              TextField(controller: imgCtl, decoration: const InputDecoration(labelText: 'Özel arka plan görseli (https, WIP 4+)')),
              if (scoreboard)
                TextButton.icon(
                  onPressed: () async {
                    if (await confirm(c, 'Tüm koltuk hediye sayaçları sıfırlansın mı?', action: 'Sıfırla') && mounted) {
                      await guard(context, () => Api.post('/api/rooms/${widget.roomId}/scoreboard/reset'));
                    }
                  },
                  icon: const Icon(Icons.restart_alt),
                  label: const Text('Sayaçları sıfırla'),
                ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Kaydet')),
          ],
        ),
      ),
    );
    final pw = pwCtl.text.trim();
    final img = imgCtl.text.trim();
    pwCtl.dispose();
    imgCtl.dispose();
    if (ok != true || !mounted) return;
    final prevImg = (_room?['themeImageUrl'] ?? '').toString();
    final r = await guard(context, () => Api.patch('/api/rooms/${widget.roomId}', {
          'chatEnabled': chatEnabled,
          'scoreboardEnabled': scoreboard,
          'theme': theme,
          if (img != prevImg) 'themeImageUrl': img.isEmpty ? null : img,
          if (_myRole == 'owner') 'hidden': hidden,
          if (_myRole == 'owner' && hidden && regen) 'regenerateCode': true,
          if (_myRole == 'owner' && removePw) 'password': null,
          if (_myRole == 'owner' && !removePw && pw.isNotEmpty) 'password': pw,
        }));
    final room = mapOf(r?['room']);
    if (room != null && mounted) setState(() => _room = {...?_room, ...room});
  }

  void _openMusic() => openRoomMusic(context, roomId: widget.roomId, canManage: _isManager);

  /// Odadaki müzik: alt çubuk (açık) ya da küçültülünce sürüklenebilir dönen plak.
  static final ValueNotifier<bool> _musicBarOpen = ValueNotifier<bool>(true);
  static final ValueNotifier<Offset?> _discPos = ValueNotifier<Offset?>(null);
  static void _noop() {}

  Future<void> _clearChat() async {
    if (!await confirm(context, 'Odadaki tüm sohbet mesajları herkes için silinsin mi?', action: 'Temizle')) return;
    if (!mounted) return;
    await guard(context, () => Api.delete('/api/rooms/${widget.roomId}/messages'));
  }

  /// Oda içi etkinlikler: kendi sunucumuzdaki sabit H5 sayfası, alt %55'lik pencerede. Sesli yayın kesilmez.
  void _openRoomActivities() => showAppWebViewSheet(
        context,
        url: '${Api.baseUrl}/room-activities?roomId=${Uri.encodeQueryComponent(widget.roomId)}',
        title: 'Etkinlikler',
      );

  void _openGames() => Navigator.push(context, MaterialPageRoute(builder: (_) => LudoScreen(roomId: widget.roomId, canManage: _isManager)));

  /// Renkli saydam sohbet balonu: kullanıcı seviyesine göre renk (Yoho tarzı lacivert taban).
  Color _bubbleColor(Map<String, dynamic>? u) {
    final lvl = (u?['coinLevel'] as num?)?.toInt() ?? 1;
    if (lvl >= 60) return const Color(0x8CB7791F); // altın
    if (lvl >= 45) return const Color(0x8CBE185D); // pembe
    if (lvl >= 30) return const Color(0x8C6D28D9); // mor
    if (lvl >= 20) return const Color(0x8C1D4ED8); // mavi
    if (lvl >= 10) return const Color(0x8C0F766E); // turkuaz
    return const Color(0x8C13285A); // lacivert
  }

  void _addSystemMessage(String text, {Color color = const Color(0xFFFFE27A)}) {
    setState(() {
      _messages.add({'id': 'sys-${DateTime.now().microsecondsSinceEpoch}', 'system': true, 'text': text, 'color': color.toARGB32()});
      if (_messages.length > 200) _messages.removeAt(0);
    });
    _scrollChatToEnd();
  }

  /// Sohbetteki rozet sırası: WIP, gönderme (taç) ve alma (kalp) seviyesi, CP ve doğrulanmış hesap.
  Widget _badgeRow(Map<String, dynamic>? u, {double h = 16}) {
    // Gizli kullanıcı: seviye / rozet yerine gizli kimliği (kim olduğu seviyesinden anlaşılmasın).
    if (u?['isHidden'] == true) return HiddenIdPill(alias: u?['hiddenId']?.toString() ?? '', height: h);
    final wip = wipLevelOf(u?['wipBadge'] ?? u?['wipLevel']);
    final gift = (u?['giftLevel'] as num?)?.toInt() ?? 1;
    final cp = (u?['cpLevel'] as num?)?.toInt();
    final items = <Widget>[
      if (wip != null) WipChip(level: wip, colorHex: u?['nameColor'] as String?, height: h),
      LevelPill(level: u?['coinLevel'] ?? 1, send: true, height: h),
      if (gift > 1) LevelPill(level: gift, send: false, height: h),
      if (cp != null && cp >= 1) CpLevelPill(level: cp, height: h),
      if (u?['verified'] == true)
        Container(
          height: h,
          padding: const EdgeInsets.symmetric(horizontal: 5),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(h / 2),
            gradient: const LinearGradient(colors: [Color(0xFF1E3A8A), Color(0xFF3B82F6)]),
            border: Border.all(color: const Color(0xFFFFD54F), width: 0.7),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.verified, size: h * 0.7, color: const Color(0xFFFFD54F)),
            const SizedBox(width: 2),
            Text('Doğrulanmış', style: TextStyle(fontSize: h * 0.56, height: 1.0, fontWeight: FontWeight.w800, fontStyle: FontStyle.italic, color: Colors.white)),
          ]),
        ),
    ];
    // WIP, seviye, CP ve doğrulama kutucukları aynı yükseklikte (h) ve eşit aralıkla.
    return Wrap(spacing: 4, runSpacing: 3, crossAxisAlignment: WrapCrossAlignment.center, children: items);
  }

  Widget _nameText(Map<String, dynamic>? u, {double size = 13.5, Color? fallback}) => WipNameText(
        '${u?['displayName'] ?? ''}',
        level: (u?['wipLevel'] as num?)?.toInt(),
        color: parseColor(u?['nameColor'] as String?) ?? fallback ?? const Color(0xFF7DD3FC),
        style: TextStyle(fontSize: size, fontWeight: FontWeight.w800, shadows: const [Shadow(color: Colors.black54, blurRadius: 2)]),
      );

  /// Uygulama uyarı duyurusu: odaya girince sohbetin en başında (yönetim panelinden değiştirilir).
  Widget _noticeCard(double maxW) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: maxW),
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 9),
          decoration: BoxDecoration(
            color: const Color(0x99101828),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0x55FFD54F)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            const Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.shield_rounded, size: 16, color: Color(0xFFFFD54F)),
              SizedBox(width: 5),
              Text('TR Live Sistem Duyurusu', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Color(0xFFFFD54F))),
            ]),
            const SizedBox(height: 4),
            Text(_appNotice, style: const TextStyle(fontSize: 13, height: 1.35, color: Color(0xFFE5E7EB))),
          ]),
        ),
      );

  Widget _announcementCard(String ann, double maxW) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: maxW),
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xB37C3AED), Color(0xB3DB2777)]),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white24),
          ),
          child: Text.rich(
            TextSpan(children: [
              const WidgetSpan(alignment: PlaceholderAlignment.middle, child: Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.campaign_rounded, size: 16, color: Colors.amberAccent))),
              const TextSpan(text: 'Oda duyurusu: ', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.amberAccent)),
              TextSpan(text: ann),
            ]),
            style: const TextStyle(fontSize: 14, height: 1.3, color: Colors.white),
          ),
        ),
      );

  /// "Bu yayıncıyı takip edin" kartı (dokununca yayıncı favorilere eklenir).
  Widget _followCard(double maxW) {
    final owner = _members.where((m) => m['role'] == 'owner');
    final ou = owner.isEmpty ? null : mapOf(owner.first['user']);
    return Align(
      alignment: Alignment.centerLeft,
      child: GestureDetector(
        onTap: () async {
          if (!_fav) await _toggleFavorite();
          if (mounted && _fav) setState(() => _messages.removeWhere((m) => m['follow'] == true));
        },
        child: Container(
          constraints: BoxConstraints(maxWidth: maxW),
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          decoration: BoxDecoration(color: const Color(0xFF22D37E), borderRadius: BorderRadius.circular(22)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.add, color: Colors.white, size: 24),
            const SizedBox(width: 8),
            const Flexible(child: Text('Bu yayıncıyı takip edin, eğlenceyi kaçırmayın!', style: TextStyle(color: Colors.white, fontSize: 14, height: 1.25, fontWeight: FontWeight.w600))),
            const SizedBox(width: 8),
            Container(padding: const EdgeInsets.all(1.5), decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white), child: UserAvatar(user: ou, radius: 15)),
          ]),
        ),
      ),
    );
  }

  /// Girdi satırı. Son 3 günde kayıt olanlar için "yakın zamanda kayıt oldu" kartı ve "Hoş geldiniz" düğmesi.
  Widget _joinLine(Map<String, dynamic>? ju, double maxW) {
    final id = ju?['id']?.toString();
    final isNew = ju?['isNew'] == true && id != Session.id;
    final head = Wrap(spacing: 4, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
      _badgeRow(ju, h: 15),
      _nameText(ju),
      const Text('odaya girdi', style: TextStyle(fontSize: 13, color: Colors.white70)),
    ]);
    if (!isNew) {
      return Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: maxW),
          margin: const EdgeInsets.symmetric(vertical: 3),
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(color: const Color(0x6613285A), borderRadius: BorderRadius.circular(14)),
          child: head,
        ),
      );
    }
    final done = _welcomed.contains(id);
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: maxW),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
        decoration: BoxDecoration(color: const Color(0x8C13285A), borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              margin: const EdgeInsets.only(right: 6),
              decoration: BoxDecoration(color: const Color(0xFFFF3D71), borderRadius: BorderRadius.circular(6)),
              child: const Text('YENİ', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white)),
            ),
            Flexible(child: head),
          ]),
          const SizedBox(height: 5),
          const Text('Bu kullanıcı yakın zamanda kayıt oldu.', style: TextStyle(fontSize: 14, color: Color(0xFFFFE27A), fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: done
                ? null
                : () {
                    if (ju != null) _sendWelcome(ju);
                  },
            child: Opacity(
              opacity: done ? 0.55 : 1,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFF2563EB)]),
                  border: Border.all(color: const Color(0xFFFDE047), width: 1.5),
                ),
                child: Text(done ? '👏 Selam gönderildi' : '👏 Hoş geldiniz', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  /// Sohbet akışı (Yoho): koltukların altından alt bara kadar, saydam renkli balonlar.
  /// [overlay]: klavye açıkken karartının üstünde balonsuz düz yazı.
  /// Sohbet bölümü: en üstte uçan yazı şeridi (yazı geçerken yer açılır), altında mesajlar.
  Widget _chatPanel(double w, {bool overlay = false, double? rightPad}) {
    if (overlay) return _chatList(w, overlay: true, rightPad: rightPad);
    return Column(children: [
      AnimatedBuilder(
        animation: _fly,
        builder: (context, _) => AnimatedSize(
          duration: const Duration(milliseconds: 200),
          child: _fly.active ? ClipRect(child: Padding(padding: const EdgeInsets.only(top: 2), child: FlyTextLayer(queue: _fly))) : const SizedBox(width: double.infinity),
        ),
      ),
      Expanded(
        child: Stack(children: [
          Positioned.fill(child: _chatList(w, rightPad: rightPad)),
          // Eski mesajlar okunurken yeni mesaj gelirse: dokununca en alta iner.
          if (_unseen > 0)
            Positioned(
              left: 8,
              bottom: 6,
              child: GestureDetector(
                onTap: () {
                  setState(() => _unseen = 0);
                  if (_chatScroll.hasClients) _chatScroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: const Color(0xFFF2B92A), borderRadius: BorderRadius.circular(14), boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)]),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.keyboard_double_arrow_down, size: 16, color: Colors.black),
                    const SizedBox(width: 3),
                    Text('$_unseen yeni mesaj', style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w800, fontSize: 12)),
                  ]),
                ),
              ),
            ),
        ]),
      ),
    ]);
  }

  Widget _chatList(double w, {bool overlay = false, double? rightPad}) {
    // Sabit başlık kartları: uygulama uyarı duyurusu ve oda duyurusu.
    final ann = (_room?['announcement'] ?? '').toString().trim();
    final maxW = w * 0.78;
    // Duyurular: odaya ilk girişte kısa süre, ayrıca sohbette kimsenin yazısı yokken (ör. sohbet temizlenince) görünür;
    // biri yazınca kalkar.
    final noText = !_messages.any((m) => m['join'] != true && m['follow'] != true && m['system'] != true);
    final showHeads = _showHeads || noText;
    final heads = <Widget>[
      if (showHeads && _appNotice.isNotEmpty && !overlay) _noticeCard(maxW),
      if (showHeads && ann.isNotEmpty) _announcementCard(ann, maxW),
    ];
    const head = 0; // duyurular artık listenin içinde değil, sohbetin en üstünde (aşağıda) durur
    if (_messages.isEmpty && heads.isEmpty) return const SizedBox.shrink();
    final total = _messages.length + head;
    // Ters liste: en yeni mesaj en altta; ekran dolunca da son yazılan hep görünür.
    final list = ListView.builder(
      controller: _chatScroll,
      reverse: true,
      padding: EdgeInsets.fromLTRB(8, overlay ? 10 : 2, rightPad ?? w * 0.2, 8),
      itemCount: total,
      itemBuilder: (_, rIdx) {
        final idx = total - 1 - rIdx;
        if (idx < head) return heads[idx];
        final i = idx - head;
        final m = _messages[i];
        if (m['follow'] == true) return overlay ? const SizedBox.shrink() : _followCard(maxW);
        if (m['join'] == true) return _joinLine(mapOf(m['user']), maxW);
        if (m['system'] == true) {
          return Align(
            alignment: Alignment.centerLeft,
            child: Container(
              constraints: BoxConstraints(maxWidth: maxW),
              margin: const EdgeInsets.symmetric(vertical: 4),
              padding: overlay ? const EdgeInsets.symmetric(horizontal: 4, vertical: 2) : const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: overlay ? null : BoxDecoration(color: const Color(0x8C13285A), borderRadius: BorderRadius.circular(12)),
              child: Text((m['text'] ?? '').toString(), style: TextStyle(fontSize: 14.5, height: 1.3, color: Color((m['color'] as int?) ?? 0xFFFFE27A))),
            ),
          );
        }
        final u = mapOf(m['user']);
        final text = Text((m['text'] ?? '').toString(), style: const TextStyle(fontSize: 15, height: 1.25, shadows: [Shadow(color: Colors.black38, blurRadius: 2)]));
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onLongPress: () => _messageActions(m),
          onTap: () {
            final uid = u?['id']?.toString();
            final mem = _members.where((x) => x['userId'] == uid);
            if (mem.isNotEmpty) _memberSheet(mem.first);
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              UserAvatar(user: u, radius: 18),
              const SizedBox(width: 8),
              Flexible(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  // Ad, altında rozet sırası, altında mesaj balonu.
                  _nameText(u, size: 13.5, fallback: Colors.white),
                  const SizedBox(height: 3),
                  _badgeRow(u),
                  const SizedBox(height: 5),
                  if (overlay)
                    Container(constraints: BoxConstraints(maxWidth: maxW - 44), child: text)
                  else if (Api.absoluteUrl(u?['chatBubbleUrl'] as String?) != null)
                    // Mağazadan alınıp takılan sohbet balonu.
                    StoreBubble(
                      url: Api.absoluteUrl(u?['chatBubbleUrl'] as String?)!,
                      constraints: BoxConstraints(maxWidth: maxW - 44),
                      child: m['fly'] == true
                          ? Row(mainAxisSize: MainAxisSize.min, children: [
                              const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.send_rounded, size: 14, color: Color(0xFFFF80AB))),
                              Flexible(child: text),
                            ])
                          : text,
                    )
                  else
                    // WIP sohbet balonu (kademeye göre renk, ışık ve köşe süsü); WIP yoksa seviye rengi.
                    WipBubble(
                      level: wipLevelOf(u?['wipBubble'] ?? u?['wipLevel']),
                      fallback: _bubbleColor(u),
                      constraints: BoxConstraints(maxWidth: maxW - 44),
                      child: m['fly'] == true
                          ? Row(mainAxisSize: MainAxisSize.min, children: [
                              const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.send_rounded, size: 14, color: Color(0xFFFF80AB))),
                              Flexible(child: text),
                            ])
                          : text,
                    ),
                ]),
              ),
            ]),
          ),
        );
      },
    );
    if (heads.isEmpty) return list;
    // Duyurular (uygulama + oda) sohbetin EN ÜSTÜNDE sabit durur; mesajlar altında akar.
    return Column(children: [
      ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.3),
        child: SingleChildScrollView(padding: EdgeInsets.fromLTRB(8, overlay ? 10 : 2, rightPad ?? w * 0.2, 0), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: heads)),
      ),
      Expanded(child: list),
    ]);
  }

  void _closeInput() {
    _kbSeen = false;
    FocusManager.instance.primaryFocus?.unfocus();
    if (_inputOpen) setState(() => _inputOpen = false);
  }

  void _openInput() {
    if (!_chatOpen) {
      toast(context, 'Bu odada yazılı sohbet kapalı.', error: true);
      return;
    }
    _kbSeen = false;
    setState(() => _inputOpen = true);
    _scrollChatToEnd(force: true);
  }

  /// Yazı alanı: klavyenin hemen üstünde koyu şerit (uygulama renkleri); boşluğa dokununca kapanır.
  /// Solda "Uçan yazı" anahtarı, ortada yuvarlak yazı kutusu (emoji düğmesi içinde), sağda renkli gönder düğmesi.
  Widget _inputBar() {
    final canSend = !_sending && !_chatMuted;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
      decoration: const BoxDecoration(
        color: Color(0xF2111827),
        border: Border(top: BorderSide(color: Color(0x33FFFFFF), width: 0.6)),
      ),
      child: Row(children: [
        // Uçan yazı anahtarı: açıkken mesaj odanın üstünden uçarak geçer (ücretli).
        GestureDetector(
          onTap: () {
            setState(() => _flyMode = !_flyMode);
            if (_flyMode) toast(context, _flyCost > 0 ? 'Uçan yazı açık: her mesaj $_flyCost Coin.' : 'Uçan yazı açık.');
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 40,
            height: 40,
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: _flyMode ? const LinearGradient(colors: kGoldDeep) : null,
              color: _flyMode ? null : const Color(0x1FFFFFFF),
              border: Border.all(color: _flyMode ? Colors.white54 : Colors.white24),
            ),
            child: Icon(Icons.flight_takeoff_rounded, size: 19, color: _flyMode ? Colors.white : Colors.white70),
          ),
        ),
        Expanded(
          child: TextField(
            controller: _chatCtl,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            maxLength: _flyMode ? 80 : 300,
            enabled: !_chatMuted,
            minLines: 1,
            maxLines: 3,
            textInputAction: TextInputAction.send,
            onSubmitted: (_) => _sendChat(),
            cursorColor: Pal.cyan,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: InputDecoration(
              isDense: true,
              counterText: '',
              hintText: _chatMuted ? 'Sohbette susturuldunuz' : (_flyMode ? (_flyCost > 0 ? 'Uçan yazı · $_flyCost Coin' : 'Uçan yazı') : 'Bir şeyler yaz...'),
              hintStyle: const TextStyle(color: Colors.white38),
              filled: true,
              fillColor: const Color(0x1AFFFFFF),
              contentPadding: const EdgeInsets.fromLTRB(16, 11, 4, 11),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Color(0x26FFFFFF))),
              disabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Color(0x14FFFFFF))),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Color(0x991FD6F5))),
              suffixIcon: IconButton(onPressed: _chatOpen ? _emojiSheet : null, icon: const Icon(Icons.emoji_emotions_outlined, color: Colors.white70)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: canSend ? _sendChat : null,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: canSend ? const LinearGradient(colors: kGoldDeep) : null,
              color: canSend ? null : Colors.white12,
              boxShadow: canSend ? const [BoxShadow(color: Color(0x55E6B13A), blurRadius: 10)] : null,
            ),
            child: _sending
                ? const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
          ),
        ),
      ]),
    );
  }

  void _messageActions(Map<String, dynamic> m) {
    final u = mapOf(m['user']);
    final mine = u?['id'] == Session.id;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (mine || _isManager)
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Mesajı sil'),
              onTap: () {
                Navigator.pop(c);
                guard(context, () => Api.delete('/api/rooms/${widget.roomId}/messages/${m['id']}'));
              },
            ),
          if (!mine)
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: const Text('Mesajı şikâyet et'),
              onTap: () {
                Navigator.pop(c);
                reportDialog(context, kind: 'room_message', targetUserId: u?['id'] as String?, roomId: widget.roomId, messageId: m['id'] as String?);
              },
            ),
        ]),
      ),
    );
  }

  void _openGifts([String? recipientId]) {
    final target = recipientId ??
        (_members.firstWhere((m) => m['role'] == 'owner', orElse: () => _members.isNotEmpty ? _members.first : <String, dynamic>{})['userId'] as String?);
    showGiftSheet(context, roomId: widget.roomId, members: _members, recipientId: target);
  }

  /// Oda içi kullanıcı kartı (Figma): büyük avatar, rozetler, Yakın Arkadaşlarım, Madalyalar, yetkiye göre işlem düğmeleri.
  /// Yönetim düğmeleri yalnızca yetkisi olana görünür; normal kullanıcı yalnızca Etiketle / Hediye / Takip görür.
  /// Kendi koltuğuma dokununca (Zula gibi): koltuğu sessize al / koltuktan kalk / iptal.
  void _selfSeatSheet(Map<String, dynamic> m, int index) {
    final user = mapOf(m['user']);
    final roleName = const {'owner': 'Oda Sahibi', 'cohost': 'Yardımcı', 'admin': 'Yönetici'}[(m['role'] ?? '').toString()] ?? 'Üye';
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: UserAvatar(user: user, radius: 22),
            title: Text((user?['displayName'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('Koltuk #${index + 1} • $roleName'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.pop(c);
              Navigator.push(context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: Session.id)));
            },
          ),
          const Divider(height: 1),
          ListTile(
            leading: Icon(_micOn && !_seatMuted ? Icons.mic_off : Icons.mic),
            title: Text(_seatMuted ? 'Koltuğun susturuldu' : (_micOn ? 'Koltuğu sessize al' : 'Sesi aç')),
            onTap: () {
              Navigator.pop(c);
              if (_seatMuted) {
                toast(context, 'Koltuğun yetkili tarafından susturuldu; mikrofonu açamazsın.', error: true);
                return;
              }
              setState(() => _micOn = !_micOn);
              _syncPublish();
            },
          ),
          if (_isVideo)
            ListTile(
              leading: Icon(_camOn ? Icons.videocam_off : Icons.videocam),
              title: Text(_camOn ? 'Kamerayı kapat' : 'Kamerayı aç'),
              onTap: () {
                Navigator.pop(c);
                setState(() => _camOn = !_camOn);
                _syncPublish();
              },
            ),
          if (_isVideo && _camOn)
            ListTile(
              leading: const Icon(Icons.cameraswitch),
              title: const Text('Kamerayı çevir'),
              onTap: () {
                Navigator.pop(c);
                _flipCamera();
              },
            ),
          if (_isVideo && _camOn)
            ListTile(
              leading: const Icon(Icons.face_retouching_natural, color: Color(0xFFFF4F9A)),
              title: const Text('Güzellik ve filtre'),
              onTap: () {
                Navigator.pop(c);
                _openBeauty();
              },
            ),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.redAccent),
            title: const Text('Koltuktan Kalk', style: TextStyle(color: Colors.redAccent)),
            onTap: () {
              Navigator.pop(c);
              _leaveMic();
            },
          ),
          ListTile(leading: const Icon(Icons.close), title: const Text('İptal'), onTap: () => Navigator.pop(c)),
        ]),
      ),
    );
  }

  void _memberSheet(Map<String, dynamic> m) {
    final userId = m['userId'].toString();
    final user = mapOf(m['user']);
    final isSelf = userId == Session.id;
    final role = (m['role'] ?? 'user').toString();
    final seat = m['seatIndex'] == null ? null : (m['seatIndex'] as num).toInt();
    // Yetkiler: kendi rolüm hedefin rolünden yüksek olmalı (oda sahibine dokunulamaz).
    final canMod = !isSelf && _canModerate(role);
    final canRole = !isSelf && (_myRole == 'owner' || _myRole == 'cohost') && role != 'owner' && (_myRole == 'owner' || role != 'cohost');
    // Gizli kullanıcı (Yoho gizemli kişi): profili, ilişkileri, seviyesi gösterilmez; dokununca profil açılmaz.
    // Hediye, etiketleme, şikâyet ve oda yönetimi çalışır.
    final hiddenUser = !isSelf && user?['isHidden'] == true;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (c) {
        void close() => Navigator.pop(c);
        Widget action(IconData icon, String label, VoidCallback onTap, {Color color = Pal.amber}) => Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: onTap,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    CircleAvatar(radius: 22, backgroundColor: color, child: Icon(icon, color: Colors.black87, size: 24)),
                    const SizedBox(height: 4),
                    FittedBox(fit: BoxFit.scaleDown, child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
                  ]),
                ),
              ),
            );
        Widget bigAction(IconData icon, String label, VoidCallback onTap) => Expanded(
              child: InkWell(
                onTap: onTap,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(icon, color: Pal.amber, size: 34),
                    const SizedBox(height: 2),
                    FittedBox(fit: BoxFit.scaleDown, child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                  ]),
                ),
              ),
            );
        return FutureBuilder<List<Map<String, dynamic>?>>(
          future: hiddenUser
              ? Future.value(const <Map<String, dynamic>?>[null, null, null])
              : Future.wait([
                  Api.get('/api/users/$userId').then<Map<String, dynamic>?>((r) => mapOf(r['profile'])).catchError((_) => null),
                  Api.get('/api/users/$userId/card').then<Map<String, dynamic>?>((r) => r).catchError((_) => null),
                  Api.get('/api/cp/wall/$userId').then<Map<String, dynamic>?>((r) => r).catchError((_) => null),
                ]),
          builder: (context, snap) {
            final profile = snap.data?[0];
            final card = snap.data?[1];
            final wall = snap.data?[2];
            final medals = listOf(card?['medals']);
            // Yakın arkadaşlar: önce CP (pembe kalp), sonra En İyi Arkadaş (mor) ve Kanka (mavi) — profildeki ilişki duvarı.
            final cpUser = mapOf(mapOf(wall?['cp'])?['user']);
            final rels = <(String, Map<String, dynamic>)>[
              for (final it in listOf(mapOf(wall?['friend'])?['items']))
                if (mapOf(it['user']) != null) ('friend', mapOf(it['user'])!),
              for (final it in listOf(mapOf(wall?['kanka'])?['items']))
                if (mapOf(it['user']) != null) ('kanka', mapOf(it['user'])!),
            ];
            void openUser(Map<String, dynamic> u) {
              final id = u['id']?.toString();
              if (id == null || u['isHidden'] == true) return;
              close();
              Navigator.push(this.context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: id)));
            }
            var following = profile?['isFollowing'] == true;
            final family = mapOf(profile?['family']);
            final username = (profile?['publicId'] ?? user?['publicId'] ?? profile?['username'] ?? user?['username'] ?? '').toString();
            return StatefulBuilder(
              builder: (context, setS) => SafeArea(
                child: Padding(
                  padding: const EdgeInsets.only(top: 48),
                  child: Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
                    Container(
                      // Kompakt kart (Yoho / Mico ölçüsü): ekranın en fazla %66'sı; fazlası kaydırılır.
                      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.66),
                      // Takılı profil kartı (mağaza) varsa kartın arka planı olur.
                      decoration: BoxDecoration(
                        color: const Color(0xFF26262B),
                        image: cardBackground(Api.absoluteUrl(user?['profileCardUrl'] as String?)),
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
                      ),
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(16, 52, 16, 0),
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Text((user?['displayName'] ?? '').toString(), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 6),
                          Wrap(alignment: WrapAlignment.center, spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                            if (user?['isHidden'] != true) ...[
                              LevelPill(level: user?['coinLevel'] ?? 1, send: true, height: 20),
                              LevelPill(level: user?['giftLevel'] ?? 1, send: false, height: 20),
                            ],
                            if (wipLevelOf(user?['wipBadge'] ?? user?['wipLevel']) != null)
                              WipChip(level: user?['wipBadge'] ?? user?['wipLevel'], colorHex: user?['nameColor'] as String?, height: 20),
                            if (role != 'user') _pill(_roleLabels[role] ?? role, Pal.cyan),
                            if (family != null) _pill('${family['name']}', Pal.red),
                            if ((profile?['hostBadge'] ?? user?['hostBadge']) != null) HostBadgeChip(badge: (profile?['hostBadge'] ?? user?['hostBadge'])?.toString(), height: 20),
                            if (seat != null) _pill('${seat + 1}. koltuk', Colors.white24),
                            // Koruyucu ayrıcalığı: en yüksek puanlı koruyucu mini kartta görünür.
                            if (mapOf(mapOf(profile?['guardian'])?['user']) != null)
                              Container(
                                padding: const EdgeInsets.fromLTRB(2, 2, 8, 2),
                                decoration: BoxDecoration(color: const Color(0xFFFF4FA8), borderRadius: BorderRadius.circular(12)),
                                child: Row(mainAxisSize: MainAxisSize.min, children: [
                                  UserAvatar(user: mapOf(mapOf(profile?['guardian'])?['user']), radius: 9),
                                  const SizedBox(width: 4),
                                  Text('Koruyucu: ${mapOf(mapOf(profile?['guardian'])?['user'])?['displayName'] ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                                ]),
                              ),
                          ]),
                          const SizedBox(height: 8),
                          if (user?['isHidden'] == true) ...[
                            IdBadge(user: user, fontSize: 13),
                            if (hiddenUser)
                              const Padding(
                                padding: EdgeInsets.only(top: 8),
                                child: Text('Bu kullanıcı kimliğini gizliyor; profili görüntülenemez.',
                                    textAlign: TextAlign.center, style: TextStyle(color: Colors.white54, fontSize: 12.5)),
                              ),
                          ] else if ((profile?['specialId'] ?? user?['specialId'] ?? profile?['publicId'] ?? user?['publicId']) != null)
                            IdBadge(
                              user: {
                                'publicId': profile?['publicId'] ?? user?['publicId'],
                                'specialId': profile?['specialId'] ?? user?['specialId'],
                                'idColor': profile?['idColor'] ?? user?['idColor'],
                                'wipLevel': user?['wipLevel'],
                                'nameColor': user?['nameColor'],
                              },
                              fontSize: 13,
                            )
                          else if (username.isNotEmpty)
                            InkWell(
                              onTap: () {
                                Clipboard.setData(ClipboardData(text: username));
                                toast(context, 'Kimlik kopyalandı.');
                              },
                              child: Row(mainAxisSize: MainAxisSize.min, children: [
                                Text('ID: $username', style: const TextStyle(color: Colors.white70)),
                                const SizedBox(width: 4),
                                const Icon(Icons.copy, size: 14, color: Colors.white54),
                              ]),
                            ),
                          // Cinsiyet / yaş, konum ve kısa biyografi.
                          if (profile != null) ...[
                            const SizedBox(height: 8),
                            Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                              if (profile['gender'] == 'male' || profile['gender'] == 'female')
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: profile['gender'] == 'female' ? const Color(0xFFFF4FA8) : const Color(0xFF3B9BFF),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                                    Icon(profile['gender'] == 'female' ? Icons.female : Icons.male, size: 13, color: Colors.white),
                                    if (profile['age'] != null) Text(' ${profile['age']}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
                                  ]),
                                ),
                              if ('${profile['city'] ?? profile['country'] ?? ''}'.isNotEmpty)
                                Row(mainAxisSize: MainAxisSize.min, children: [
                                  const Icon(Icons.place, size: 14, color: Colors.white60),
                                  Flexible(
                                    child: Text(' ${[profile['city'], profile['country']].where((x) => '${x ?? ''}'.isNotEmpty).join(', ')}',
                                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                                  ),
                                ]),
                            ]),
                            if ('${profile['bio'] ?? ''}'.trim().isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text('${profile['bio']}'.trim(), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Colors.white60, fontSize: 12.5)),
                              ),
                            const SizedBox(height: 10),
                            Row(children: [
                              for (final (label, v) in [('Takipçi', profile['followers']), ('Takip', profile['following']), ('Arkadaş', profile['friends'])])
                                Expanded(
                                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                                    Text(fmtCompact(v ?? 0), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                                    Text(label, style: const TextStyle(color: Colors.white54, fontSize: 11.5)),
                                  ]),
                                ),
                            ]),
                          ],
                          if (snap.connectionState != ConnectionState.done)
                            const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)))
                          else if (cpUser != null || rels.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Center(
                              child: SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [
                                  if (cpUser != null)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 6),
                                      child: GestureDetector(
                                        onTap: () => openUser(cpUser),
                                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                                          HeartAvatar(user: cpUser, size: 62),
                                          const SizedBox(height: 4),
                                          const RelationTag('cp'),
                                        ]),
                                      ),
                                    ),
                                  for (final r in rels)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 6),
                                      child: GestureDetector(
                                        onTap: () => openUser(r.$2),
                                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                                          RelationAvatar(user: r.$2, kind: r.$1, radius: 23),
                                          const SizedBox(height: 4),
                                          RelationTag(r.$1),
                                        ]),
                                      ),
                                    ),
                                ]),
                              ),
                            ),
                          ],
                          // Rozetler: yalnızca varsa (başlıksız).
                          if (medals.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Center(
                              child: SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(mainAxisSize: MainAxisSize.min, children: [
                                  for (final md in medals)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 4),
                                      child: Tooltip(
                                        message: (md['name'] ?? '').toString(),
                                        child: Api.absoluteUrl(md['assetUrl'] as String?) != null
                                            ? NetImg(Api.absoluteUrl(md['assetUrl'] as String?)!, width: 52, height: 52, errorBuilder: (_, __, ___) => const Icon(Icons.military_tech, color: Pal.amber, size: 40))
                                            : const Icon(Icons.military_tech, color: Pal.amber, size: 40),
                                      ),
                                    ),
                                ]),
                              ),
                            ),
                          ],
                          const SizedBox(height: 4),
                          // CP / yakınlık: iki kişi arasındaki seviye ve ilişki seçimi (3. kademeden itibaren).
                          if (!isSelf && !hiddenUser) CpPanel(userId: userId, displayName: (user?['displayName'] ?? '').toString(), user: user),
                          // Yönetim düğmeleri: yalnızca yetkili olana görünür.
                          if (canMod || canRole) ...[
                            const SizedBox(height: 10),
                            Row(children: [
                              if (canRole)
                                action(Icons.manage_accounts, 'Yönetici', () {
                                  close();
                                  _roleChoice(userId, role);
                                }),
                              if (canMod)
                                seat != null
                                    ? (_mutedSeats.contains(seat)
                                        ? action(Icons.mic, 'Sesi Aç', () { close(); _muteSeat(seat, false); })
                                        : action(Icons.mic_off, 'Sustur', () { close(); _muteSeat(seat, true); }, color: Colors.white70))
                                    : action(Icons.mic, 'Mic Aç', () { close(); _moderate(userId, 'mic-invite', body: {}); }),
                              if (canMod) action(Icons.comments_disabled, 'Sohbet', () { close(); _muteChoice(userId); }),
                              if (canMod && seat != null) action(Icons.event_seat, 'Koltuk', () { close(); _moderate(userId, 'mic-off'); _lockSeat(seat, true); }),
                              if (canMod) action(Icons.exit_to_app, 'Odadan At', () async {
                                close();
                                if (await confirm(this.context, '${user?['displayName'] ?? 'Kullanıcı'} odadan atılsın mı?', action: 'At')) _moderate(userId, 'kick');
                              }),
                            ]),
                          ],
                          const SizedBox(height: 8),
                          const Divider(height: 1, color: Colors.white12),
                          Row(children: [
                            bigAction(Icons.alternate_email, 'Etiketle', () {
                              close();
                              final name = (user?['displayName'] ?? '').toString();
                              _chatCtl.text = '${_chatCtl.text}@$name ';
                              _chatCtl.selection = TextSelection.collapsed(offset: _chatCtl.text.length);
                            }),
                            bigAction(Icons.card_giftcard, 'Hediye Gönder', () {
                              close();
                              _openGifts(userId);
                            }),
                            if (hiddenUser)
                              const SizedBox.shrink()
                            else if (!isSelf)
                              bigAction(following ? Icons.check : Icons.add, following ? 'Takipte' : 'Takip Et', () async {
                                final ok = await guard<bool>(this.context, () async {
                                  if (following) {
                                    await Api.delete('/api/users/$userId/follow');
                                  } else {
                                    await Api.post('/api/users/$userId/follow');
                                  }
                                  return true;
                                });
                                if (ok == true) setS(() => following = !following);
                              })
                            else
                              bigAction(Icons.person, 'Profilim', () {
                                close();
                                Navigator.push(this.context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: userId)));
                              }),
                          ]),
                        ]),
                      ),
                    ),
                    // Üstte taşan büyük avatar (dokununca tam profil)
                    Positioned(
                      top: -48,
                      child: GestureDetector(
                        onTap: hiddenUser
                            ? null
                            : () {
                                close();
                                Navigator.push(this.context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: userId)));
                              },
                        child: UserAvatar(user: user, radius: 48),
                      ),
                    ),
                    if (!isSelf)
                      Positioned(
                        top: 10,
                        left: 12,
                        child: IconButton(
                          tooltip: 'Şikâyet / engelle',
                          icon: const Icon(Icons.error_outline, color: Pal.amber, size: 30),
                          onPressed: () {
                            close();
                            _reportMenu(userId, (user?['displayName'] ?? 'Kullanıcı').toString(), canMod);
                          },
                        ),
                      ),
                    Positioned(
                      top: 10,
                      right: 12,
                      child: IconButton(tooltip: 'Kapat', icon: const CircleAvatar(radius: 16, backgroundColor: Pal.amber, child: Icon(Icons.close, color: Colors.black, size: 20)), onPressed: close),
                    ),
                  ]),
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// Profil kartındaki küçük etiket: seviye / WIP kutucuklarıyla aynı yükseklik (20).
  Widget _pill(String text, Color color) => Container(
        height: 20,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
        // widthFactor 1: yazı kadar (Wrap içinde satırı kaplamasın).
        child: Center(widthFactor: 1, child: Text(text, maxLines: 1, style: const TextStyle(fontSize: 11, height: 1.0, fontWeight: FontWeight.w800, color: Colors.white))),
      );

  void _roleChoice(String userId, String role) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (role != 'moderator') ListTile(leading: const Icon(Icons.shield), title: const Text('Moderatör yap'), onTap: () { Navigator.pop(c); _moderate(userId, 'role', body: {'role': 'moderator'}); }),
          if (_myRole == 'owner' && role != 'cohost') ListTile(leading: const Icon(Icons.stars), title: const Text('Yardımcı sahip yap'), onTap: () { Navigator.pop(c); _moderate(userId, 'role', body: {'role': 'cohost'}); }),
          if (role != 'user') ListTile(leading: const Icon(Icons.remove_moderator), title: const Text('Yetkiyi al'), onTap: () { Navigator.pop(c); _moderate(userId, 'role', body: {'role': 'user'}); }),
        ]),
      ),
    );
  }

  void _muteChoice(String userId) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final mins in const [10, 60, 1440])
            ListTile(
              leading: const Icon(Icons.comments_disabled),
              title: Text('Sohbette sustur (${mins == 1440 ? '1 gün' : (mins == 60 ? '1 saat' : '$mins dk')})'),
              onTap: () { Navigator.pop(c); _moderate(userId, 'chat-mute', body: {'minutes': mins}); },
            ),
          ListTile(leading: const Icon(Icons.chat), title: const Text('Susturmayı kaldır'), onTap: () { Navigator.pop(c); _moderate(userId, 'chat-mute', body: {'minutes': 0}); }),
        ]),
      ),
    );
  }

  void _reportMenu(String userId, String name, bool canRoomBlock) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.flag_outlined), title: const Text('Şikâyet et'), onTap: () { Navigator.pop(c); reportDialog(context, kind: 'user', targetUserId: userId, roomId: widget.roomId); }),
          ListTile(leading: const Icon(Icons.person_off_outlined), title: const Text('Kullanıcıyı engelle'), onTap: () { Navigator.pop(c); blockUserDialog(context, userId, name); }),
          if (canRoomBlock) ...[
            ListTile(
              leading: const Icon(Icons.block, color: Colors.orangeAccent),
              title: const Text('Odadan banla'),
              subtitle: const Text('Bu odaya bir daha giremez'),
              onTap: () async {
                Navigator.pop(c);
                if (await confirm(context, '$name bu odadan banlansın mı?', action: 'Banla', destructive: true)) _moderate(userId, 'block');
              },
            ),
            ListTile(leading: const Icon(Icons.exit_to_app), title: const Text('Odadan at'), onTap: () async {
              Navigator.pop(c);
              if (await confirm(context, '$name odadan atılsın mı?', action: 'At')) _moderate(userId, 'kick');
            }),
            ListTile(leading: const Icon(Icons.comments_disabled), title: const Text('Sohbette sustur'), onTap: () { Navigator.pop(c); _muteChoice(userId); }),
          ],
          // Uygulama yöneticisi / yardımcı admin kısayolları (yetkiyi sunucu ayrıca denetler).
          if (Session.isStaff) ...[
            const Divider(height: 1),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 10, 16, 2),
              child: Align(alignment: Alignment.centerLeft, child: Text('Yönetici kısayolları', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w800, fontSize: 13))),
            ),
            ListTile(
              leading: const Icon(Icons.gavel, color: Colors.redAccent),
              title: const Text('Kullanıcıyı banla', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w700)),
              onTap: () { Navigator.pop(c); _staffBan(userId, name); },
            ),
            if (Session.isAdmin)
              ListTile(
                leading: const Icon(Icons.speaker_notes_off_outlined),
                title: const Text('Uygulamada sohbet yasağı'),
                onTap: () { Navigator.pop(c); _staffChatBan(userId, name); },
              ),
            ListTile(
              leading: const Icon(Icons.drive_file_rename_outline),
              title: const Text('Adını değiştir'),
              onTap: () { Navigator.pop(c); _staffRename(userId, name); },
            ),
            ListTile(
              leading: const Icon(Icons.no_photography_outlined),
              title: const Text('Profil fotoğrafını kaldır'),
              onTap: () { Navigator.pop(c); _staffRemoveAvatar(userId, name); },
            ),
          ],
        ]),
        ),
      ),
    );
  }

  /// Yönetici kısayolu: süre seçilir, neden (isteğe bağlı) yazılır, onaylanınca hesap banlanır.
  Future<void> _staffBan(String userId, String name) async {
    const options = <(String, int?)>[('1 saat', 1), ('1 gün', 24), ('7 gün', 168), ('30 gün', 720), ('Süresiz', null)];
    final picked = await showModalBottomSheet<(String, int?)>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('$name · ban süresi', style: const TextStyle(fontWeight: FontWeight.w800))),
          for (final o in options)
            ListTile(leading: Icon(o.$2 == null ? Icons.block : Icons.timer_outlined, color: Colors.redAccent), title: Text(o.$1), onTap: () => Navigator.pop(c, o)),
        ]),
      ),
    );
    if (picked == null || !mounted) return;
    final f = await formDialog(context, 'Ban nedeni (isteğe bağlı)', ['Neden']);
    if (f == null || !mounted) return;
    if (!await confirm(context, '$name ${picked.$2 == null ? 'süresiz' : picked.$1} banlansın mı? Tüm oturumları kapanır ve odalardan çıkarılır.', action: 'Banla', destructive: true)) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/users/$userId/ban', {if (picked.$2 != null) 'hours': picked.$2, 'reason': (f['Neden'] ?? '').trim()}));
    if (r != null && mounted) toast(context, '$name banlandı (${picked.$1}).');
  }

  Future<void> _staffChatBan(String userId, String name) async {
    const options = <(String, int)>[('1 saat', 60), ('1 gün', 1440), ('7 gün', 10080), ('Yasağı kaldır', 0)];
    final picked = await showModalBottomSheet<(String, int)>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('$name · sohbet yasağı', style: const TextStyle(fontWeight: FontWeight.w800))),
          for (final o in options)
            ListTile(leading: Icon(o.$2 == 0 ? Icons.chat : Icons.speaker_notes_off_outlined), title: Text(o.$1), onTap: () => Navigator.pop(c, o)),
        ]),
      ),
    );
    if (picked == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/users/$userId/chat-restriction', {'minutes': picked.$2}));
    if (r != null && mounted) toast(context, picked.$2 == 0 ? 'Sohbet yasağı kaldırıldı.' : '$name ${picked.$1} sohbet edemeyecek.');
  }

  Future<void> _staffRename(String userId, String name) async {
    final f = await formDialog(context, 'Görünen adı değiştir', ['Yeni ad'], initial: {'Yeni ad': name});
    if (f == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/users/$userId/display-name', {'displayName': (f['Yeni ad'] ?? '').trim()}));
    if (r != null && mounted) toast(context, 'Ad değiştirildi.');
  }

  Future<void> _staffRemoveAvatar(String userId, String name) async {
    if (!await confirm(context, '$name adlı kullanıcının profil fotoğrafı kaldırılsın mı?', action: 'Kaldır', destructive: true)) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/users/$userId/avatar', {'avatarUrl': null}));
    if (r != null && mounted) toast(context, 'Profil fotoğrafı kaldırıldı.');
  }

  void _membersSheet() => showViewers(context, _members, _memberSheet);

  /// Başlık, koltuk adları ve alt bar telefonun yazı boyutu ayarından etkilenmez (Yoho gibi): ölçüler hiç kaymaz.
  Widget _fixedText(Widget child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling), child: child);

  // ---------- Arayüz ----------
  // Koltuk ölçüleri sahne alanına göre _seatGrid içinde hesaplanır (kaydırma yok; her koltuk modu ekrana sığar).
  bool _showScoreRow = true;
  double _bodyH = 0; // oda gövdesinin yüksekliği (Scaffold klavyeyle küçülmez); koltuk ölçeği yalnızca buna bağlı
  bool _kbSeen = false; // klavye geri tuşuyla kapanınca yazı alanı da kapansın
  bool get _seatCompact => _seatCount >= 12; // 12+ modda koltuklar küçük (Yoho: genişliğin ~%10'u)
  double get _seatNameH => _seatCompact ? 14 : 16;
  double get _seatScoreH => 16;
  bool get _scoreOn => _room?['scoreboardEnabled'] != false && _showScoreRow;
  // Bir koltuğun avatar alanı (slot) boyutu satıra göre değişir: üst (oda sahibi) satırı daha büyüktür.
  double _cellH(double slot) => slot + 2 + _seatNameH + (_scoreOn ? _seatScoreH + 2 : 0);

  Widget _seatFrame({required double slotSize, required Widget slot, required Widget name, Widget? score, VoidCallback? onTap, bool muted = false}) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: SizedBox(
        height: _cellH(slotSize),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(
            width: slotSize,
            height: slotSize,
            child: muted
                ? Stack(clipBehavior: Clip.none, children: [
                    Positioned.fill(child: slot),
                    Positioned(right: slotSize * 0.04, bottom: slotSize * 0.04, child: IgnorePointer(child: _mutedBadge(slotSize * 0.36))),
                  ])
                : slot,
          ),
          const SizedBox(height: 2),
          SizedBox(height: _seatNameH, child: Center(child: name)),
          if (_scoreOn) ...[const SizedBox(height: 2), SizedBox(height: _seatScoreH, child: Center(child: score ?? const SizedBox.shrink()))],
        ]),
      ),
    );
  }

  void _openBirthday() => showBirthdaySheet(
        context,
        currentName: _room?['micSkinText']?.toString(),
        active: _birthday,
        patchRoom: _patchRoom,
      );

  void _emptySeatTap(int index, bool reserved, bool locked) {
    if (reserved) return;
    if (index == 0) {
      _takeMic(0); // oda sahibi kendi koltuğuna geri döner
    } else if (_canSeatManage) {
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (c) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(leading: const Icon(Icons.mic), title: const Text('Bu koltuğa otur'), onTap: () { Navigator.pop(c); _takeMic(index); }),
            ListTile(
              leading: Icon(_mutedSeats.contains(index) ? Icons.mic : Icons.mic_off),
              title: Text(_mutedSeats.contains(index) ? 'Koltuğun sesini aç' : 'Koltuğu sustur'),
              onTap: () { Navigator.pop(c); _muteSeat(index, !_mutedSeats.contains(index)); },
            ),
            ListTile(
              leading: Icon(locked ? Icons.lock_open : Icons.lock),
              title: Text(locked ? 'Koltuğun kilidini aç' : 'Koltuğu kilitle'),
              onTap: () { Navigator.pop(c); _lockSeat(index, !locked); },
            ),
          ]),
        ),
      );
    } else if (locked) {
      toast(context, 'Bu koltuk kilitli.', error: true);
    } else {
      _takeMic(index);
    }
  }

  Widget _seatTile(int index, Map<String, dynamic>? m, double slotSize, {double? plusSize}) {
    final seatR = (slotSize - 8) / 2;
    if (m == null) {
      final reserved = index == 0 && _myRole != 'owner';
      final locked = _lockedSeats.contains(index);
      return _seatFrame(
        slotSize: slotSize,
        muted: _mutedSeats.contains(index),
        onTap: () => _emptySeatTap(index, reserved, locked),
        slot: Center(
          child: Container(
            width: seatR * 2,
            height: seatR * 2,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: pkTeamOfSeat(_roomPk, index) == null ? Colors.white.withValues(alpha: 0.16) : pkTeamColor(pkTeamOfSeat(_roomPk, index)!).withValues(alpha: 0.28),
              border: Border.all(color: pkTeamOfSeat(_roomPk, index) == null ? Colors.white.withValues(alpha: 0.28) : pkTeamColor(pkTeamOfSeat(_roomPk, index)!), width: pkTeamOfSeat(_roomPk, index) == null ? 1 : 2),
            ),
            child: Icon(reserved ? Icons.star_border : (locked ? Icons.lock : Icons.add), size: plusSize ?? seatR * 0.95, color: locked ? Colors.orangeAccent : Colors.white),
          ),
        ),
        name: Text(_pkStage && index > 0 ? 'No.${pkSeatNo(index)}' : '${index + 1}', style: TextStyle(color: Colors.white, fontSize: _seatCompact ? 11 : 12.5, fontWeight: FontWeight.w600)),
      );
    }
    final userId = m['userId'].toString();
    final user = mapOf(m['user']);
    final video = _isVideo ? _videoFor(userId) : null;
    final speaking = _isSpeaking(userId);
    final isMe = userId == Session.id;
    final frameUrl = Api.absoluteUrl(user?['frameUrl'] as String?);
    final waveUrl = video == null ? Api.absoluteUrl(user?['micWaveUrl'] as String?) : null;
    final nameColor = parseColor(user?['nameColor'] as String?);
    return _seatFrame(
      slotSize: slotSize,
      muted: _mutedSeats.contains(index),
      onTap: () => isMe ? _selfSeatSheet(m, index) : _memberSheet(m),
      slot: KeyedSubtree(
        key: _seatKeys.putIfAbsent(userId, () => GlobalKey()),
        child: Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
        // Mağazadan alınan mikrofon dalgası: konuşurken avatarın çevresinde (yeşil halkanın yerine) oynar (avatarın arkasında).
        if (speaking && waveUrl != null)
          Positioned(
            left: (slotSize - seatR * 2 * 1.5) / 2,
            top: (slotSize - seatR * 2 * 1.5) / 2,
            width: seatR * 2 * 1.5,
            height: seatR * 2 * 1.5,
            child: MicWave(url: waveUrl),
          ),
        if (video != null)
          SizedBox(width: seatR * 2, height: seatR * 2, child: ClipRRect(borderRadius: BorderRadius.circular(12), child: video))
        else
          UserAvatar(user: user, radius: seatR),
        // Konuşma halkası: sabit boyutlu bindirme; konuşmasa da yer kaplar (saydam), düzeni değiştirmez.
        Positioned.fill(
          child: IgnorePointer(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              decoration: BoxDecoration(
                shape: video != null ? BoxShape.rectangle : BoxShape.circle,
                borderRadius: video != null ? BorderRadius.circular(14) : null,
                border: Border.all(color: speaking && waveUrl == null ? Colors.greenAccent : Colors.transparent, width: 2.5),
              ),
            ),
          ),
        ),
        // Oda içi PK: takım halkası (Kırmızı / Mavi) ve rozet.
        if (pkTeamOfSeat(_roomPk, index, userId: userId) != null) PkSeatRing(team: pkTeamOfSeat(_roomPk, index, userId: userId)!, size: seatR * 2 + 6),
        // Takılı çerçeve yoksa WIP kademesinin çerçevesi (kodla çizilir, düzeni değiştirmez).
        if (frameUrl == null && video == null) WipFrame.around(wipLevelOf(user?['wipFrame'] ?? user?['wipLevel']), seatR),
        // Takılı avatar çerçevesi: avatar çapının ×kFrameScale'i (profil ile aynı oran), avatarla aynı merkezde ve koltuk
        // kutusunun DIŞINA taşar. Kutuya sığdırılmaz: sığdırılınca çerçevenin içi avatarı örtüp oturan kişi küçük görünüyordu.
        if (frameUrl != null && video == null)
          Positioned(
            left: (slotSize - seatR * 2 * kFrameScale) / 2,
            top: (slotSize - seatR * 2 * kFrameScale) / 2,
            width: seatR * 2 * kFrameScale,
            height: seatR * 2 * kFrameScale,
            child: FrameBox(url: frameUrl, avatarRadius: seatR),
          ),
        // Mikrofon emojisi: avatarın üstünde birkaç saniye oynar.
        if (_micEmoji[userId] == kCryEmoji)
          Positioned.fill(child: PkCryEmoji(key: ValueKey('emo-$userId-${_micEmojiSeq[userId]}')))
        else if (_micEmoji[userId] != null)
          // Emoji koltuk dairesini tamamen kaplar: altta daireyi örten koyu zemin, üstte daireden biraz büyük emoji.
          Positioned.fill(
            child: IgnorePointer(
              child: Center(
                child: SizedBox(
                  width: seatR * 2,
                  height: seatR * 2,
                  child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
                    Container(
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(colors: [Color(0xFF3A2F5C), Color(0xFF1C1630)]),
                      ),
                    ),
                    OverflowBox(
                      maxWidth: seatR * 2 * micEmojiScale(_micEmoji[userId]!),
                      maxHeight: seatR * 2 * micEmojiScale(_micEmoji[userId]!),
                      child: MicEmojiImage(key: ValueKey('emo-$userId-${_micEmojiSeq[userId]}'), id: _micEmoji[userId]!),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ]),
      ),
      name: Row(mainAxisSize: MainAxisSize.min, children: [
        if (m['role'] == 'owner') const Icon(Icons.star, size: 12, color: Colors.amber),
        Flexible(
          child: WipNameText(
            (user?['displayName'] ?? '').toString(),
            level: (user?['wipLevel'] as num?)?.toInt(),
            color: nameColor ?? Colors.white,
            style: TextStyle(fontSize: _seatCompact ? 10 : 11, height: 1.1, fontWeight: nameColor != null ? FontWeight.w800 : FontWeight.normal),
          ),
        ),
      ]),
      score: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(8)),
        child: Text('💎 ${fmtNumber(_scores[userId] ?? 0)}', style: TextStyle(fontSize: _seatCompact ? 10 : 11, color: Colors.amberAccent)),
      ),
    );
  }

  // Koltuk + sohbet bölgesi (Yoho): koltuklar başlığın altından sabit ölçüyle başlar, sohbet koltukların bittiği yerden akar.
  // Klavye açılınca koltuklar küçülmez/yer değiştirmez; oda kararır, mesajlar karartının üstünde görünür.
  Widget _stageBody() {
    final kb = MediaQuery.viewInsetsOf(context).bottom;
    if (_inputOpen && kb > 0) _kbSeen = true;
    if (_inputOpen && _kbSeen && kb == 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _inputOpen && MediaQuery.viewInsetsOf(context).bottom == 0) _closeInput();
      });
    }
    return LayoutBuilder(builder: (context, box) {
      final w = box.maxWidth;
      if (_isLive) return _liveStage(w, box.maxHeight);
      final double seatH;
      final Widget seats;
      if (_isGrid) {
        // Çoklu yayın: görüntü ızgarası tam genişlikte. Yüksekliği yalnızca cihaz ölçüsüne bağlı (klavye, PK şeridi
        // değiştirmez); çok kısa ekranlarda sohbete en az ~110 dp kalacak kadar küçülür ve ortalanır.
        final spec = videoGridFor(_seatCount);
        final g = RoomGeom(w);
        final avail = _bodyH > 0 ? _bodyH - MediaQuery.paddingOf(context).top - g.headerH - g.barH - 110 : w * spec.aspect;
        seatH = math.max(0.0, math.min(w * spec.aspect, avail));
        final gw = seatH / spec.aspect;
        seats = Align(alignment: Alignment.topCenter, child: SizedBox(width: gw, height: seatH, child: _videoGrid(gw, spec)));
      } else {
        // Ölçek yalnızca cihaz ölçüsüne bağlı (oturmak, izleyici, klavye, PK şeridi değiştirmez).
        final sc = _seatScaleFor(w);
        final scoreRow = _scoreFits(seatLayoutFor(_seatCount, skin: _micSkin), w * sc);
        _showScoreRow = scoreRow;
        seatH = _seatAreaHeight(w, sc, score: scoreRow);
        seats = _seatGrid(w, sc);
      }
      // PK sahnesi: koltukların arkasında kırmızı | mavi zemin, altında PK çubuğu (sohbet onun altından başlar).
      final pkStage = _pkStage && !_isGrid;
      final pkH = pkStage ? RoomPkPanel.height : 0.0;
      final chatTop = seatH + pkH;
      return Stack(clipBehavior: Clip.hardEdge, children: [
        if (pkStage) Positioned(left: 0, right: 0, top: 0, height: chatTop, child: const PkStageBackdrop()),
        if (pkStage)
          Positioned(
            left: 0,
            right: 0,
            top: seatH,
            height: pkH,
            child: _fixedText(RoomPkPanel(
              key: ValueKey('pkp-${_roomPk!['id']}'),
              pk: _roomPk!,
              canManage: _isOwnerOrCohost,
              onStale: _reloadRoomPk,
              onUpdate: (pk) {
                if (mounted && _roomPk?['id'] == pk['id'] && _roomPk?['status'] == 'preparing') setState(() => _roomPk = pk);
              },
            )),
          ),
        Positioned(
          left: 0,
          right: 0,
          top: 0,
          height: seatH,
          // Koltuklar sabit; yalnızca hızlı dikey kaydırma (fling) odayı değiştirir.
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onVerticalDragEnd: (d) {
              final v = d.primaryVelocity ?? 0;
              if (v < -1400) _switchRoom(1);
              if (v > 1400) _switchRoom(-1);
            },
            child: _fixedText(seats),
          ),
        ),
        if (!_inputOpen) Positioned(left: 0, right: 0, top: chatTop, bottom: 0, child: _chatPanel(w)),
        if (_inputOpen) ...[
          Positioned.fill(child: GestureDetector(onTap: _closeInput, child: const ColoredBox(color: Color(0xB8000000)))),
          Positioned.fill(child: _chatPanel(w, overlay: true)),
        ],
        if (_canSeatManage && _micRequest && _queue.isNotEmpty && !_inputOpen)
          Positioned(
            right: 8,
            top: pkStage ? chatTop + 4 : seatH - 34,
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: _micRequestsSheet,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: const Color(0xFF22C55E), borderRadius: BorderRadius.circular(16), boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 6)]),
                child: Text('Mikrofon istekleri (${_queue.length})', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
              ),
            ),
          ),
      ]);
    });
  }

  // ---------- Görüntülü odalar: Çoklu (ızgara) ve Canlı (tam ekran) ----------
  Map<int, Map<String, dynamic>> get _bySeat => {
        for (final m in _members)
          if (m['seatIndex'] != null) (m['seatIndex'] as num).toInt(): m,
      };

  /// Çoklu yayın ızgarası (Figma): hücreler kenar boşluksuz, ince açık çizgilerle ayrılır.
  Widget _videoGrid(double gw, VideoGridSpec spec) {
    final by = _bySeat;
    final n = math.min(spec.cells.length, _seatCount);
    return Stack(children: [
      for (var i = 0; i < n; i++)
        Positioned(
          left: spec.cells[i].left * gw,
          top: spec.cells[i].top * gw,
          width: spec.cells[i].width * gw,
          height: spec.cells[i].height * gw,
          child: _videoCell(i, by[i], Size(spec.cells[i].width * gw, spec.cells[i].height * gw)),
        ),
    ]);
  }

  /// Bir görüntü hücresi: kamera (kapalıysa avatar), altta ad ve elmas. Boş hücrede koltuk simgesi; dokununca oturulur.
  /// [pip]: canlı yayında sağdaki küçük konuk penceresi (yuvarlak köşeli, çizgisiz).
  Widget _videoCell(int index, Map<String, dynamic>? m, Size size, {bool pip = false}) {
    final side = math.min(size.width, size.height);
    final radius = pip ? BorderRadius.circular(8) : null;
    final border = pip ? Border.all(color: Colors.white24, width: 0.8) : Border.all(color: kGridLine, width: 0.5);
    if (m == null) {
      final reserved = index == 0 && _myRole != 'owner';
      final locked = _lockedSeats.contains(index);
      return GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _emptySeatTap(index, reserved, locked),
        child: Container(
          decoration: BoxDecoration(color: index == 0 ? kGridHostFill : kGridEmptyFill, border: border, borderRadius: radius),
          child: Stack(alignment: Alignment.center, children: [
            Icon(
              reserved ? Icons.videocam_off_outlined : (locked ? Icons.lock : kEmptySeatIcon),
              size: side * 0.32,
              color: locked ? Colors.orangeAccent : Colors.white.withValues(alpha: 0.8),
            ),
            if (_mutedSeats.contains(index)) Positioned(top: 4, right: 4, child: _mutedBadge(side * 0.2)),
          ]),
        ),
      );
    }
    final userId = m['userId'].toString();
    final user = mapOf(m['user']);
    final video = _videoFor(userId, cover: true);
    final speaking = _isSpeaking(userId);
    final isMe = userId == Session.id;
    final nameColor = parseColor(user?['nameColor'] as String?);
    final fs = (side * 0.11).clamp(9.0, 12.0).toDouble();
    const shadow = [Shadow(color: Colors.black87, blurRadius: 3)];
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => isMe ? _selfSeatSheet(m, index) : _memberSheet(m),
      child: Container(
        clipBehavior: Clip.hardEdge,
        decoration: BoxDecoration(color: kGridHostFill, border: border, borderRadius: radius),
        child: Stack(fit: StackFit.expand, children: [
          KeyedSubtree(
            key: _seatKeys.putIfAbsent(userId, () => GlobalKey()),
            child: video ?? Center(child: UserAvatar(user: user, radius: side * 0.26)),
          ),
          if (_mutedSeats.contains(index)) Positioned(top: 4, right: 4, child: IgnorePointer(child: _mutedBadge(side * 0.2))),
          // Konuşma göstergesi: hücrenin kenarında yeşil çerçeve (düzeni değiştirmez).
          IgnorePointer(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              decoration: BoxDecoration(borderRadius: radius, border: Border.all(color: speaking ? Colors.greenAccent : Colors.transparent, width: 2)),
            ),
          ),
          Positioned(
            left: 4,
            right: 4,
            bottom: 3,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Row(mainAxisSize: MainAxisSize.min, children: [
                if (m['role'] == 'owner') Icon(Icons.star, size: fs + 1, color: Colors.amber),
                Flexible(
                  child: WipNameText(
                    (user?['displayName'] ?? '').toString(),
                    level: (user?['wipLevel'] as num?)?.toInt(),
                    color: nameColor ?? Colors.white,
                    style: TextStyle(fontSize: fs, height: 1.15, fontWeight: FontWeight.w700, shadows: shadow),
                  ),
                ),
              ]),
              if (_room?['scoreboardEnabled'] != false)
                Text('💎 ${fmtNumber(_scores[userId] ?? 0)}', maxLines: 1, style: TextStyle(fontSize: fs * 0.95, height: 1.15, color: Colors.amberAccent, shadows: shadow)),
            ]),
          ),
        ]),
      ),
    );
  }

  /// Canlı yayın zemini: yayıncının (0. koltuk) kamerası tam ekran. Kamera kapalıysa büyük avatar, yayıncı koltukta
  /// değilse tema zemini üstünde bilgi yazısı. Dokunma alanı değildir (dokunmalar sahne katmanında).
  /// Görüntülü PK'da bölünmüş ekranın sol yarısı: bizim yayıncı (hediye animasyonları için aynı koltuk anahtarıyla).
  Widget? _pkHostVideo() {
    final host = _bySeat[0];
    if (host == null) return null;
    final uid = host['userId'].toString();
    final v = _videoFor(uid, cover: true);
    return KeyedSubtree(key: _seatKeys.putIfAbsent(uid, () => GlobalKey()), child: v ?? Center(child: UserAvatar(user: mapOf(host['user']), radius: 34)));
  }

  Widget _liveBackdrop() {
    final host = _bySeat[0];
    final t = themeOf(_room?['theme']?.toString());
    final Widget content;
    if (_pkLive) {
      content = const SizedBox.shrink(); // yayıncı PK bölünmüş ekranında görünür
    } else if (host == null) {
      content = const Center(child: Text('Yayıncı şu an kamerada değil', style: TextStyle(color: Colors.white70, fontSize: 15)));
    } else {
      final uid = host['userId'].toString();
      content = KeyedSubtree(
        key: _seatKeys.putIfAbsent(uid, () => GlobalKey()),
        child: _videoFor(uid, cover: true) ??
            Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                UserAvatar(user: mapOf(host['user']), radius: 56),
                const SizedBox(height: 10),
                const Text('Kamera kapalı', style: TextStyle(color: Colors.white60)),
              ]),
            ),
      );
    }
    return IgnorePointer(
      child: Stack(fit: StackFit.expand, children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: t.colors.length < 2 ? [t.colors.first, t.colors.first] : t.colors),
          ),
        ),
        content,
        // Başlık ve sohbet okunaklı kalsın diye üstte ve altta hafif karartı.
        const Align(
          alignment: Alignment.topCenter,
          child: SizedBox(height: 180, width: double.infinity, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0x73000000), Color(0x00000000)])))),
        ),
        const Align(
          alignment: Alignment.bottomCenter,
          child: SizedBox(height: 300, width: double.infinity, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0x00000000), Color(0x8C000000)])))),
        ),
      ]),
    );
  }

  void _hostTap() {
    final host = _bySeat[0];
    if (host == null) return;
    if (host['userId']?.toString() == Session.id) {
      _selfSeatSheet(host, 0);
    } else {
      _memberSheet(host);
    }
  }

  /// Canlı yayın sahnesi (başlık ile alt bar arası): sağda konuk pencereleri, solda alttan akan sohbet.
  Widget _liveStage(double w, double h) {
    final by = _bySeat;
    final guests = [for (var i = 1; i < _seatCount; i++) if (by[i] != null) i];
    final pw = (w * 0.27).clamp(88.0, 132.0).toDouble();
    final ph = pw * 4 / 3;
    return Stack(clipBehavior: Clip.hardEdge, children: [
      // Yayıncıya dokununca kartı açılır; hızlı dikey kaydırma odayı değiştirir.
      Positioned.fill(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: _hostTap,
          onVerticalDragEnd: (d) {
            final v = d.primaryVelocity ?? 0;
            if (v < -1400) _switchRoom(1);
            if (v > 1400) _switchRoom(-1);
          },
        ),
      ),
      // Konuk pencereleri (Figma): sağda, sohbetin hizasında alttan yukarı dizilir.
      Positioned(
        right: 8,
        bottom: h * 0.12,
        width: pw,
        child: _fixedText(Column(mainAxisSize: MainAxisSize.min, children: [
          for (final i in guests)
            Padding(padding: const EdgeInsets.only(bottom: 6), child: SizedBox(width: pw, height: ph, child: _videoCell(i, by[i], Size(pw, ph), pip: true))),
        ])),
      ),
      if (!_inputOpen) Positioned(left: 0, right: pw + 12, bottom: 0, height: h * 0.46, child: _chatPanel(w, rightPad: 8)),
      if (_inputOpen) ...[
        Positioned.fill(child: GestureDetector(onTap: _closeInput, child: const ColoredBox(color: Color(0xB8000000)))),
        Positioned.fill(child: _chatPanel(w, overlay: true)),
      ],
      if (_canSeatManage && _queue.isNotEmpty && !_inputOpen)
        Positioned(
          left: 8,
          top: 4,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: _guestRequestsSheet,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: const Color(0xFF22C55E), borderRadius: BorderRadius.circular(16), boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 6)]),
              child: Text('Konuk istekleri (${_queue.length})', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
            ),
          ),
        ),
    ]);
  }

  /// Koltuk alanının yüksekliği: son satırın merkezi + yarıçap + ad (ve sığıyorsa puan) satırları.
  /// Puan satırının yeri, oda sahibi puanı kapatsa da ayrılır: sohbetin başladığı yer hiç oynamaz.
  double _seatAreaHeight(double w, double sc, {required bool score}) {
    final spec = seatLayoutFor(_seatCount, skin: _micSkin);
    // topGap: başlığın altından ilk satırdaki DAİRENİN üst kenarına (Yoho ölçümü); +8 dp dokunma payı merkeze katılmaz.
    var cy = spec.topGap * w * sc + (spec.rows.first.dia * w * sc) / 2;
    for (final p in spec.pitch) {
      cy += p * w * sc;
    }
    final labels = 2 + _seatNameH + (score ? _seatScoreH + 2 : 0);
    return cy + ((spec.rows.last.dia + seatCircleBoost) * w * sc + 8) / 2 + labels + 8;
  }

  /// Koltuk ölçeği: koltuklar normalde tam Yoho ölçüsündedir (1). Yalnızca çok kısa ekranlarda, sohbete en az ~110 dp
  /// kalacak kadar küçültülür. Hesap yalnızca oda gövdesinin (klavyeden etkilenmeyen) yüksekliğine ve ekran
  /// genişliğine dayanır; bu yüzden koltuğa oturmak, izleyici gelmesi, klavye ya da başlıktaki rozetler boyutu değiştirmez.
  double _seatScaleFor(double w) {
    final bodyH = _bodyH;
    if (bodyH <= 0) return 1.0;
    final g = RoomGeom(w);
    final avail = bodyH - MediaQuery.paddingOf(context).top - g.headerH - g.barH - 110 - (_pkStage ? RoomPkPanel.height : 0);
    final spec = seatLayoutFor(_seatCount, skin: _micSkin);
    final need = _seatAreaHeight(w, 1, score: _scoreFits(spec, w));
    if (need <= avail) return 1.0;
    if (avail <= 0) return 0.72;
    return (avail / need).clamp(0.72, 1.0).toDouble();
  }

  /// Puan (elmas) satırı yalnızca satırlar arasında yer varsa gösterilir (çok koltuklu modlarda gizli, Yoho gibi).
  bool _scoreFits(SeatLayoutSpec spec, double w) {
    if (spec.pitch.isEmpty) return true;
    var minGap = double.infinity;
    for (var r = 0; r < spec.pitch.length; r++) {
      final gap = spec.pitch[r] * w - ((spec.rows[r].dia + seatCircleBoost) * w + 8) / 2 - ((spec.rows[r + 1].dia + seatCircleBoost) * w + 8) / 2;
      if (gap < minGap) minGap = gap;
    }
    return minGap >= 2 + _seatNameH + 2 + _seatScoreH + 6;
  }

  Widget _seatGrid(double w, double sc) {
    final bySeat = <int, Map<String, dynamic>>{
      for (final m in _members)
        if (m['seatIndex'] != null) (m['seatIndex'] as num).toInt(): m,
    };
    final spec = seatLayoutFor(_seatCount, skin: _micSkin);
    final pkStage = _pkStage && spec.rows.length == 3;
    final tiles = <Widget>[];
    final centers = <int, (Offset, double, int)>{}; // koltuk → (avatar merkezi, yarıçap, satır)
    if (pkStage) {
      // MVP tahtları: oda sahibinin iki yanında; takımın o anki en çok destekleyeni oturur.
      final cy0 = spec.topGap * w * sc + (spec.rows.first.dia * w * sc) / 2;
      final tw = 0.17 * w * sc;
      final th = tw * 1.18;
      for (final (team, x) in const [('red', 0.15), ('blue', 0.85)]) {
        final top = mapOf(listOf(mapOf(_roomPk![team])?['supporters']).firstOrNull);
        final user = mapOf(top?['user']);
        tiles.add(Positioned(
          left: x * w - tw / 2,
          top: math.max(0.0, cy0 - th / 2 - 4),
          width: tw,
          height: th + _seatNameH,
          child: Column(children: [
            PkThrone(team: team, user: user, width: tw, onTap: user?['id'] == null || user?['isHidden'] == true ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: user!['id'].toString())))),
            SizedBox(
              height: _seatNameH,
              child: Center(
                child: Text(user == null ? (team == 'red' ? 'Kırmızı MVP' : 'Mavi MVP') : (user['displayName'] ?? '').toString(),
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: _seatCompact ? 9.5 : 10.5, color: Colors.white, fontWeight: FontWeight.w700)),
              ),
            ),
          ]),
        ));
      }
    }
    var i = 0;
    // topGap: başlığın altından ilk satırdaki DAİRENİN üst kenarına (Yoho ölçümü); +8 dp dokunma payı merkeze katılmaz.
    var cy = spec.topGap * w * sc + (spec.rows.first.dia * w * sc) / 2;
    final rowCy = <double>[];
    for (var r = 0; r < spec.rows.length; r++) {
      rowCy.add(cy);
      final row = spec.rows[r];
      // Daire %1 büyür (seatCircleBoost); artı simgesi eski daire ölçüsüne göre kalır.
      final slot = (row.dia + seatCircleBoost) * w * sc + 8;
      final plus = (row.dia * w * sc) / 2 * 0.95;
      // Hücre genişliği: komşu koltuklar arası mesafe (ad yazısı için), en az koltuk kadar.
      var minDx = 1.0;
      for (var k = 1; k < row.xs.length; k++) {
        final dx = row.xs[k] - row.xs[k - 1];
        if (dx < minDx) minDx = dx;
      }
      final tileW = (row.xs.length == 1 ? slot * 1.9 : minDx * w - 2).clamp(slot, slot * 2.2).toDouble();
      for (var k = 0; k < row.xs.length; k++) {
        final x = row.xs[k];
        if (i >= _seatCount) break;
        // PK sahnesi: solda Kırmızı 2×2, sağda Mavi 2×2 (konum → koltuk eşlemesi).
        final idx = pkStage ? kPkSeatOrder[i++] : i++;
        // Satırda koltuk başına farklı çap olabilir (doğum günü: ortadaki büyük koltuk).
        final sd = row.dias?[k];
        final sSlot = sd == null ? slot : (sd + seatCircleBoost) * w * sc + 8;
        final sPlus = sd == null ? plus : (sd * w * sc) / 2 * 0.95;
        final sTileW = sd == null ? tileW : math.max(tileW, sSlot * 1.3);
        centers[idx] = (Offset(x * w, cy), (sSlot - 8) / 2, r);
        tiles.add(Positioned(
          left: x * w - sTileW / 2,
          top: cy - sSlot / 2,
          width: sTileW,
          child: Center(child: _seatTile(idx, bySeat[idx], sSlot, plusSize: sPlus)),
        ));
        // Doğum günü tasarımı: koltuk halkası; ortadaki doğum günü koltuğu taçlı altın.
        if (_birthday) {
          final d = sSlot;
          final crown = idx == kBirthdaySeat;
          tiles.add(Positioned(
            left: x * w - d / 2,
            top: cy - d / 2 - (crown ? d * 0.22 : 0) - 1,
            width: d,
            height: d * (crown ? 1.22 : 1),
            child: BirthdaySeatRing(diameter: d, host: crown),
          ));
        }
      }
      if (r < spec.pitch.length) cy += spec.pitch[r] * w * sc;
    }
    if (_birthday && rowCy.length >= 4) {
      // Üstte kutlama şeridi (sahibin yazdığı isimle), ortada pasta.
      final bw = 0.78 * w * sc;
      tiles.insert(0, Positioned(left: (w - bw) / 2, top: 0.012 * w * sc, width: bw, height: bw * 0.2, child: BirthdayBanner(name: _room?['micSkinText']?.toString(), width: bw)));
      final cakeTop = rowCy[1] - 0.075 * w * sc;
      final cakeH = (rowCy[3] - rowCy[1]) + 0.15 * w * sc;
      final cakeW = 0.36 * w * sc;
      tiles.insert(0, Positioned(left: (w - cakeW) / 2, top: cakeTop, width: cakeW, height: cakeH, child: BirthdayCake(width: cakeW, height: cakeH)));
    }
    // CP (5. kademe): aynı odada mikrofonda oturan CP'ler. Yan yana (aynı sıra, bitişik koltuk) olanlarda aralarında kalp atışı
    // + avatar çevresinde uçuşan kalpler; yan yana OLMAYAN ama mikrofonlarda oturan CP'lerde yalnızca avatarların
    // çevresinde kalpler uçuşur (aradaki kalp yok).
    for (final e in centers.entries) {
      final ua = mapOf(bySeat[e.key]?['user']);
      if (ua == null) continue;
      final ida = ua['id']?.toString();
      final pid = ua['cpPartnerId']?.toString();
      final la = (ua['cpLevel'] as num?)?.toInt() ?? 0;
      if (ida == null || pid == null || la < kCpEffectLevel) continue;
      // Eşin koltuğu.
      int? partnerSeat;
      for (final x in centers.keys) {
        if (x == e.key) continue;
        final ub = mapOf(bySeat[x]?['user']);
        if (ub != null && ub['id']?.toString() == pid && ub['cpPartnerId']?.toString() == ida) {
          partnerSeat = x;
          break;
        }
      }
      if (partnerSeat == null) continue;
      final next = centers[e.key + 1];
      final prev = centers[e.key - 1];
      // Yan yana çiftin sağdaki yarısı: çift soldaki koltukta tek parça çizildi.
      if (partnerSeat == e.key - 1 && prev != null && prev.$3 == e.value.$3) continue;
      final adjacent = partnerSeat == e.key + 1 && next != null && next.$3 == e.value.$3;
      final a = e.value.$1, rr = e.value.$2;
      final pad = rr * 1.0;
      if (adjacent) {
        final b = next.$1;
        final box = Rect.fromLTRB(math.min(a.dx, b.dx) - rr - pad, math.min(a.dy, b.dy) - rr - pad, math.max(a.dx, b.dx) + rr + pad, math.max(a.dy, b.dy) + rr + pad);
        tiles.add(Positioned.fromRect(rect: box, child: CpSeatHearts(a: a - box.topLeft, b: b - box.topLeft, r: rr)));
      } else {
        // Yan yana değil: her iki avatarın çevresinde ayrı kalp bulutu (aradaki kalp yok). İki taraf için ayrı çizilir.
        final box = Rect.fromLTRB(a.dx - rr - pad, a.dy - rr - pad * 1.6, a.dx + rr + pad, a.dy + rr + pad);
        tiles.add(Positioned.fromRect(rect: box, child: CpSeatHearts(a: a - box.topLeft, b: a - box.topLeft, r: rr, solo: true)));
      }
    }
    return Stack(clipBehavior: Clip.none, children: tiles);
  }

  // ---------- Üst başlık (Yoho ölçüleri) ----------
  // İki satır, sabit yükseklik (yalnızca ekran genişliğine bağlı): izleyici gelmesi, aile rozeti, favori düğmesi vb.
  // başlığın boyunu değiştirmez; bu yüzden koltuklar da hiç kaymaz.
  //  1. satır: oda kutusu (kapak + ad + ID) · ilk 3 izleyici · kişi sayısı · ••• · ⏻
  //  2. satır: toplam elmas · favori                                   aile · taç (katkı listesi)
  Widget _glass({Key? key, required Widget child, VoidCallback? onTap, EdgeInsets padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 6), double radius = 22}) {
    return Material(
      key: key,
      color: Colors.black38,
      borderRadius: BorderRadius.circular(radius),
      child: InkWell(borderRadius: BorderRadius.circular(radius), onTap: onTap, child: Padding(padding: padding, child: child)),
    );
  }

  Widget _roomHeader(double w) {
    final g = RoomGeom(w);
    final top = MediaQuery.paddingOf(context).top;
    return SizedBox(
      height: top + g.headerH,
      child: Stack(clipBehavior: Clip.none, children: [
        Positioned(left: 10, right: 8, top: top, height: g.row1H, child: _headerRow1(g)),
        Positioned(left: 10, right: 8, top: top + g.row2Top, height: g.row2H, child: _headerRow2(g)),
      ]),
    );
  }

  /// Küçültülmüş oda balonunda dönen fotoğraf (oda fotoğrafı, yoksa sahibin fotoğrafı). Çizim bittikten sonra yazılır.
  void _syncDockCover(String? url) {
    if (RoomDock.cover.value == url) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) RoomDock.cover.value = url;
    });
  }

  Widget _headerRow1(RoomGeom g) {
    final h = g.row1H;
    final owner = _members.where((m) => m['role'] == 'owner');
    final ownerUser = owner.isEmpty ? null : mapOf(owner.first['user']);
    final idUser = ownerUser ?? mapOf(_room?['owner']);
    final name = (_room?['name'] ?? widget.initialName).toString();
    final cover = Api.absoluteUrl(_room?['coverUrl'] as String?);
    _syncDockCover(cover ?? Api.absoluteUrl(ownerUser?['avatarUrl'] as String?));
    final pic = h - 6;
    final pillH = (g.w * 0.0553).clamp(20.0, 26.0).toDouble();
    return Row(children: [
      Expanded(
        child: Align(
          alignment: Alignment.centerLeft,
          child: Material(
            color: Colors.black38,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: _roomInfo,
              child: SizedBox(
                height: h,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(3, 3, 10, 3),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: SizedBox(
                        width: pic,
                        height: pic,
                        child: cover != null
                            ? NetImg(cover, fit: BoxFit.cover, errorBuilder: (_, __, ___) => UserAvatar(user: ownerUser, radius: pic / 2))
                            : FittedBox(child: UserAvatar(user: ownerUser, radius: pic / 2)),
                      ),
                    ),
                    const SizedBox(width: 7),
                    Flexible(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          if (_room?['hidden'] == true) Padding(padding: const EdgeInsets.only(right: 3), child: Icon(Icons.visibility_off, size: h * 0.3)),
                          if (_room?['locked'] == true) Padding(padding: const EdgeInsets.only(right: 3), child: Icon(Icons.lock, size: h * 0.3, color: Colors.orangeAccent)),
                          // Oda adı alanı en fazla ekranın ~%36'sı; ad sığmazsa sürekli kayar (dışarıdaki kartta değişmez).
                          Flexible(
                            child: ConstrainedBox(
                              constraints: BoxConstraints(maxWidth: g.w * 0.36),
                              child: Marquee(
                              height: h * 0.36 * 1.3,
                              speed: 28,
                              shrinkWrap: true,
                              child: Text(name, maxLines: 1, softWrap: false, style: TextStyle(fontWeight: FontWeight.w800, fontSize: h * 0.36, height: 1.15)),
                              ),
                            ),
                          ),
                        ]),
                        // Oda kimliği = sahibinin güncel kimliği (özel ID varsa o, yoksa normal ID); renkli/özel olsa da burada
                        // düz yazı (ID:2147). Sahip kimliğini değiştirince başlık da hemen değişir (room_member_updated).
                        Text(
                          'ID:${roomIdOf(_room, idUser)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: h * 0.27, height: 1.15, color: Colors.white70),
                        ),
                      ]),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
      const SizedBox(width: 6),
      _viewerClub(h * 0.62),
      // İzleyici sayısı; dokununca "İzleyiciler" listesi.
      _glass(
        key: _viewersKey,
        onTap: _membersSheet,
        radius: pillH / 2,
        padding: EdgeInsets.symmetric(horizontal: pillH * 0.4),
        child: SizedBox(
          height: pillH,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.person, size: pillH * 0.62),
            const SizedBox(width: 2),
            Text('${_members.length}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: pillH * 0.52)),
          ]),
        ),
      ),
      InkWell(
        customBorder: const CircleBorder(),
        onTap: _moreMenu,
        child: SizedBox(width: h * 0.95, height: h, child: Icon(Icons.more_horiz, size: h * 0.62)),
      ),
      InkWell(
        customBorder: const CircleBorder(),
        onTap: _exitMenu,
        child: SizedBox(width: h * 0.95, height: h, child: Icon(Icons.power_settings_new, size: h * 0.62)),
      ),
    ]);
  }

  Widget _headerRow2(RoomGeom g) {
    final h = g.row2H;
    // Oda elması: odaya gelen tüm hediyeler (oda kapatılıp açılınca sıfırlanmaz). Eski sunucuda koltuk sayaçlarının toplamı.
    var total = BigInt.tryParse('${_room?['totalDiamonds'] ?? ''}') ?? BigInt.zero;
    if (_room?['totalDiamonds'] == null) {
      for (final v in _scores.values) {
        total += BigInt.tryParse(v) ?? BigInt.zero;
      }
    }
    final isOwnerHere = _room?['ownerId']?.toString() == Session.id;
    final fs = h * 0.6;
    // Oda sahibinin ailesi (sunucu: room.ownerFamily). Sahibin ailesi yoksa çip görünmez.
    final ownerFamily = mapOf(_room?['ownerFamily']);
    final logo = Api.absoluteUrl(ownerFamily?['logoUrl'] as String?);
    // shrink: yalnızca Flexible içindeki çipte (aile adı daralabilsin); sınırsız genişlikte Flexible kullanılamaz.
    Widget chip(Widget child, {VoidCallback? onTap, Color? color, BoxBorder? border, bool shrink = false}) => InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(h / 2),
          child: Container(
            height: h,
            padding: EdgeInsets.symmetric(horizontal: h * 0.45),
            decoration: BoxDecoration(color: color ?? Colors.black38, borderRadius: BorderRadius.circular(h / 2), border: border),
            child: Row(mainAxisSize: MainAxisSize.min, children: [if (shrink) Flexible(child: child) else child]),
          ),
        );
    return Row(children: [
      chip(Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.diamond, size: h * 0.7, color: Colors.lightBlueAccent),
        const SizedBox(width: 3),
        Text(fmtNumber(total.toString()), style: TextStyle(fontSize: fs, fontWeight: FontWeight.w700, height: 1.0)),
      ])),
      // Hayalet mod etkinken kendime görünen işaret (mikrofona çıkınca herkes görür, işaret kalkar).
      if (Session.me.value?['ghostActive'] == true && !_onSeat) ...[
        const SizedBox(width: 6),
        chip(
          Text('👻 Hayalet', style: TextStyle(fontSize: fs, fontWeight: FontWeight.w800, color: const Color(0xFFC9B8FF), height: 1.0)),
          color: const Color(0xFF2A1A4A),
          onTap: () => toast(context, 'Hayalet moddasın: odadakiler seni görmüyor. Mikrofona çıkarsan görünürsün.'),
        ),
      ],
      if (!isOwnerHere) ...[
        const SizedBox(width: 6),
        chip(
          Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(_fav ? Icons.star : Icons.star_border, size: h * 0.7, color: Colors.white),
            const SizedBox(width: 3),
            Text(_fav ? 'Favoride' : 'Favori', style: TextStyle(fontSize: fs, fontWeight: FontWeight.w800, color: Colors.white, height: 1.0)),
          ]),
          onTap: _toggleFavorite,
          color: _fav ? Colors.orange.shade800 : Colors.orange,
        ),
      ],
      // Oda sahibinin ailesi; dokununca o ailenin sayfası açılır. Taç her durumda sağ kenarda kalır.
      if (ownerFamily != null && ownerFamily['id'] != null)
        Expanded(
          child: Align(
          alignment: Alignment.centerRight,
          child: chip(
            Row(mainAxisSize: MainAxisSize.min, children: [
              CircleAvatar(
                radius: h * 0.36,
                backgroundColor: Colors.amber,
                backgroundImage: logo != null ? NetImage(logo, targetW: NetImage.px(h * 0.72, MediaQuery.devicePixelRatioOf(context)), targetH: NetImage.px(h * 0.72, MediaQuery.devicePixelRatioOf(context))) : null,
                child: logo == null ? Icon(Icons.favorite, size: h * 0.45, color: Colors.black87) : null,
              ),
              const SizedBox(width: 4),
              Flexible(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: g.w * 0.2),
                  child: Text((ownerFamily['name'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: fs, fontWeight: FontWeight.w800, fontStyle: FontStyle.italic, height: 1.0)),
                ),
              ),
            ]),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => FamilyPage(familyId: ownerFamily['id'].toString()))),
            border: Border.all(color: Colors.amber.withValues(alpha: 0.6)),
            shrink: true,
          ),
          ),
        )
      else
        const Spacer(),
      const SizedBox(width: 4),
      // Taç = Katkı Listesi (Yoho'daki "Haftalık" rozetinin yeri).
      InkWell(
        onTap: () => showContributions(context, widget.roomId),
        child: CrownIcon(size: h * 1.25),
      ),
    ]);
  }

  /// ••• : paylaş, oda bilgisi, şikâyet, küçült.
  void _moreMenu() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.share), title: const Text('Odayı paylaş'), onTap: () { Navigator.pop(c); _shareRoom(); }),
          ListTile(leading: const Icon(Icons.info_outline), title: const Text('Oda bilgisi'), onTap: () { Navigator.pop(c); _roomInfo(); }),
          if (_room?['ownerId']?.toString() != Session.id)
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: const Text('Odayı şikâyet et'),
              onTap: () { Navigator.pop(c); reportDialog(context, kind: 'room', roomId: widget.roomId); },
            ),
          ListTile(leading: const Icon(Icons.close_fullscreen), title: const Text('Küçült'), onTap: () { Navigator.pop(c); RoomDock.minimize(); }),
        ]),
      ),
    );
  }

  /// İzleyici kulübesi: odadaki en yüksek seviyeli ilk 3 kullanıcı, üst üste binen yuvarlak ikonlar (1. satırda, sabit boy).
  Widget _viewerClub(double size) {
    final ownerId = _room?['ownerId']?.toString();
    final list = _members.where((m) => m['userId']?.toString() != ownerId).toList()
      ..sort((a, b) => (((mapOf(b['user'])?['coinLevel']) as num?) ?? 0).compareTo(((mapOf(a['user'])?['coinLevel']) as num?) ?? 0));
    final top = list.take(3).toList();
    if (top.isEmpty) return const SizedBox.shrink();
    final step = size * 0.62;
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: InkWell(
        onTap: _membersSheet,
        borderRadius: BorderRadius.circular(size),
        child: SizedBox(
          width: step * (top.length - 1) + size,
          height: size,
          child: Stack(children: [
            for (var i = top.length - 1; i >= 0; i--)
              Positioned(
                left: step * i,
                top: 0,
                width: size,
                height: size,
                child: Container(
                  padding: const EdgeInsets.all(1.2),
                  decoration: const BoxDecoration(color: Colors.amber, shape: BoxShape.circle),
                  child: FittedBox(child: UserAvatar(user: mapOf(top[i]['user']), radius: size / 2)),
                ),
              ),
          ]),
        ),
      ),
    );
  }

  /// X düğmesi: Küçült / Çıkış (Figma).
  void _exitMenu() {
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Kapat',
      barrierColor: Colors.black87,
      pageBuilder: (c, _, __) {
        Widget big(IconData icon, String label, VoidCallback onTap) => InkWell(
              onTap: onTap,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 76, height: 76, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: Icon(icon, size: 40, color: Colors.black)),
                const SizedBox(height: 8),
                Text(label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white, decoration: TextDecoration.none)),
              ]),
            );
        return SafeArea(
          child: Stack(children: [
            Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                big(Icons.close_fullscreen, 'Küçült', () {
                  Navigator.pop(c);
                  RoomDock.minimize();
                }),
                const SizedBox(height: 56),
                big(Icons.power_settings_new, 'Çıkış', () {
                  Navigator.pop(c);
                  _onBack();
                }),
              ]),
            ),
            Positioned(top: 10, right: 14, child: IconButton(onPressed: () => Navigator.pop(c), icon: const CircleAvatar(backgroundColor: Colors.white24, child: Icon(Icons.close, color: Colors.white)))),
          ]),
        );
      },
    );
  }

  // ---------- Alt satır: 6 yuvarlak düğme (Figma) ----------
  void _toggleRoomSound() {
    setState(() => _roomMuted = !_roomMuted);
    // Oda sesi kapalıyken oda müziği ve hediye / araç sesleri de susar.
    EffectPrefs.roomMuted.value = _roomMuted;
    _applyRoomSound();
    toast(context, _roomMuted ? 'Oda sesi kapatıldı (yalnızca sizde).' : 'Oda sesi açıldı.');
  }

  /// Uzaktaki konuşmacıların sesini bu cihazda kapatır / açar.
  /// Oda sesi: kullanıcı kapattıysa ya da telefon araması sürüyorsa diğerlerinin sesi kapalı.
  void _applyRoomSound() {
    final room = _lk;
    if (room == null) return;
    final on = !_roomMuted && !CallGuard.instance.inCall.value;
    for (final p in room.remoteParticipants.values) {
      for (final pub in p.audioTrackPublications) {
        try {
          pub.track?.mediaStreamTrack.enabled = on;
        } catch (_) {/* iz henüz hazır değil */}
      }
    }
  }

  // ---------- Mikrofon emojileri ----------
  final Map<String, int> _micEmoji = {}; // kullanıcı → oynayan emoji (1–kMicEmojiCount; kCryEmoji: PK kaybeden)
  final Map<String, int> _micEmojiSeq = {};
  final Map<String, Timer> _micEmojiTimers = {};
  static const kCryEmoji = -1;

  /// PK sonucu: koltuktaki kazananlara gülen (1), kaybedenlere ağlayan emoji ~6 sn (beraberlikte yok).
  void _pkResultEmojis(Map<String, dynamic> pk) {
    final winner = pk['winner']?.toString();
    if (winner != 'red' && winner != 'blue') return;
    for (final m in _members) {
      final seat = (m['seatIndex'] as num?)?.toInt();
      if (seat == null) continue;
      final uid = m['userId'].toString();
      final team = pkTeamOfSeat(pk, seat, userId: uid);
      if (team == null) continue;
      _showMicEmoji(uid, team == winner ? 1 : kCryEmoji, ms: 6000);
    }
  }

  void _showMicEmoji(String userId, int emoji, {int ms = 3200}) {
    _micEmojiTimers[userId]?.cancel();
    setState(() {
      _micEmoji[userId] = emoji;
      _micEmojiSeq[userId] = (_micEmojiSeq[userId] ?? 0) + 1;
    });
    _micEmojiTimers[userId] = Timer(Duration(milliseconds: ms), () {
      _micEmojiTimers.remove(userId);
      if (mounted) setState(() => _micEmoji.remove(userId));
    });
  }

  /// Koltuktayken alt bardaki emoji: hareketli emojiler (koltuğunda oynar). Altta sohbete yazı emojisi seçeneği.
  void _micEmojiSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: const Color(0xFF1E1B2E),
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Mikrofon emojisi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 12),
            Flexible(
              child: GridView.count(
              shrinkWrap: true,
              crossAxisCount: 5,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: [
              for (var i = 1; i <= kMicEmojiCount; i++)
                InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () async {
                    Navigator.pop(c);
                    _showMicEmoji(Session.id, i);
                    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/mic-emoji', {'emoji': i}));
                  },
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(14)),
                    child: MicEmojiImage(id: i),
                  ),
                ),
            ]),
            ),
            const SizedBox(height: 10),
            if (_chatOpen)
              TextButton.icon(
                onPressed: () {
                  Navigator.pop(c);
                  _emojiSheet();
                },
                icon: const Icon(Icons.chat_bubble_outline, size: 18),
                label: const Text('Sohbete emoji yaz'),
              ),
          ]),
        ),
      ),
    );
  }

  void _emojiSheet() {
    const emojis = ['😀', '😂', '🥰', '😍', '😎', '🤩', '😘', '😭', '😡', '👍', '👏', '🙏', '🔥', '💯', '🎉', '❤️', '💎', '🌹', '🎁', '👑', '🎤', '🎶', '😴', '🤔', '😅', '🥳', '😇', '🤗', '😜', '🙌', '💪', '✨'];
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: GridView.count(
            shrinkWrap: true,
            crossAxisCount: 8,
            children: [
              for (final e in emojis)
                InkWell(
                  onTap: () {
                    Navigator.pop(c);
                    setState(() {
                      _inputOpen = true;
                      _chatCtl.text += e;
                      _chatCtl.selection = TextSelection.collapsed(offset: _chatCtl.text.length);
                    });
                  },
                  child: Center(child: Text(e, style: const TextStyle(fontSize: 26))),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Alt bar (Yoho ölçüleri): düğmeler ekran genişliğinin %14,35'i aralıkla, merkezleri sabit.
  /// Mikrofonda değilken: "Selam..." yazı kutusu + hediye, mesajlar, oyun, menü.
  /// Mikrofondayken: sohbet, mikrofon, emoji, hediye, mesajlar, oyun, menü.
  Widget _bottomBar() {
    return LayoutBuilder(builder: (context, box) {
      final w = box.maxWidth;
      // Yoho ölçüleri: düğme çapı genişliğin %8,4'ü (hediye %9,4), merkezler barın ortasında.
      final g = RoomGeom(w);
      final d = g.btn;
      final barH = g.barH;
      Widget at(double cx, Widget child, {double? size}) {
        final sz = size ?? d;
        return Positioned(left: cx * w - sz / 2, top: (barH - sz) / 2, width: sz, height: sz, child: child);
      }

      Widget circle(IconData icon, String tip, VoidCallback? onTap, {Color? color}) => Tooltip(
            message: tip,
            child: Material(
              color: Colors.black.withValues(alpha: 0.32),
              shape: CircleBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.10))),
              child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: Icon(icon, color: color ?? Colors.white, size: d * 0.52)),
            ),
          );

      final gift = Tooltip(
        message: 'Hediye gönder',
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: _members.isEmpty ? null : () => _openGifts(),
          child: Container(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF8B5CF6), Color(0xFF6366F1), Color(0xFF38BDF8)]),
              boxShadow: [BoxShadow(color: Color(0x667C3AED), blurRadius: 10)],
            ),
            child: Icon(Icons.redeem, color: Colors.white, size: g.giftBtn * 0.54),
          ),
        ),
      );
      final mail = ValueListenableBuilder<int>(
        valueListenable: Inbox.unread,
        builder: (_, n, __) => Badge(
          isLabelVisible: n > 0,
          label: Text('$n'),
          offset: const Offset(-2, 2),
          // Yoho: alttan açılan "Sohbet" penceresi; oda arkada çalışmaya devam eder.
          child: circle(Icons.mail_outline, 'Mesajlar', () => showInboxSheet(context)),
        ),
      );
      // Oda sesi (yalnızca bu cihazda): konuşanlar, müzik ve hediye sesleri. Oyunlar araçlar menüsünde.
      final sound = circle(_roomMuted ? Icons.volume_off : Icons.volume_up, _roomMuted ? 'Oda sesini aç' : 'Oda sesini kapat', _toggleRoomSound,
          color: _roomMuted ? Colors.redAccent : null);
      final menu = circle(Icons.grid_view_rounded, 'Oda araçları', _openTools);
      final micBtn = GestureDetector(
        // Canlı yayında yayıncı uzun basarak yanlışlıkla yayın koltuğundan inmesin.
        onLongPress: _isLive && _myRole == 'owner' ? null : _leaveMic,
        child: circle(_micOn && !_seatMuted ? Icons.mic : Icons.mic_off, 'Mikrofon (uzun bas: mikrofondan in)', () {
          if (_seatMuted) {
            toast(context, 'Koltuğun yetkili tarafından susturuldu; mikrofonu açamazsın.', error: true);
            return;
          }
          setState(() => _micOn = !_micOn);
          _syncPublish();
        }, color: _micOn && !_seatMuted ? Colors.white : Colors.redAccent),
      );

      // Canlı (tekli) görüntülü yayın alt barı (Figma): sohbet · PK · mikrofon · ∞ konuk · hediye · menü.
      if (_isLive) {
        final pkFree = _pk == null || !['pending', 'active'].contains(_pk!['status']);
        final guestBtn = Badge(
          isLabelVisible: _canSeatManage && _queue.isNotEmpty,
          label: Text('${_queue.length}'),
          offset: const Offset(-2, 2),
          child: circle(
            Icons.all_inclusive,
            _canSeatManage ? 'Konuk istekleri' : (_onSeat ? 'Konukluktan ayrıl' : (_inQueue ? 'Konuk isteğin gönderildi' : 'Konuk ol')),
            _guestTap,
            color: _inQueue || (_onSeat && !_canSeatManage) ? const Color(0xFFFF4F9A) : null,
          ),
        );
        final pkBtn = Tooltip(
          message: 'PK',
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () => pkFree ? showPkChallengeSheet(context, roomId: widget.roomId) : toast(context, 'Zaten bir PK sürüyor.', error: true),
            child: PkLogo(size: d * 1.3),
          ),
        );
        final chat = circle(Icons.chat_bubble_outline, 'Sohbet', _openInput);
        final List<Widget> items;
        if (_myRole == 'owner') {
          items = [chat, pkBtn, micBtn, guestBtn, gift, menu];
        } else if (_onSeat) {
          items = [chat, micBtn, circle(Icons.sentiment_satisfied_alt, 'Emoji', _micEmojiSheet), guestBtn, gift, menu];
        } else {
          items = [chat, guestBtn, gift, mail, sound, menu];
        }
        return SizedBox(
          height: barH,
          child: Stack(clipBehavior: Clip.none, children: [
            for (var i = 0; i < items.length; i++)
              at((i + 0.5) / items.length, items[i], size: identical(items[i], gift) ? g.giftBtn : (identical(items[i], pkBtn) ? d * 1.3 : null)),
          ]),
        );
      }

      const step = 0.1435;
      final right = <Widget>[
        at(0.5, gift, size: g.giftBtn),
        at(0.5 + step, mail),
        at(0.5 + step * 2, sound),
        at(0.5 + step * 3, menu),
      ];
      final List<Widget> left;
      if (_onSeat) {
        left = [
          at(0.5 - step * 3, circle(Icons.chat_bubble_outline, 'Sohbet', _openInput)),
          at(0.5 - step * 2, micBtn),
          at(0.5 - step, circle(Icons.sentiment_satisfied_alt, 'Emoji', _micEmojiSheet)),
        ];
      } else {
        final pillH = (w * 0.087).clamp(32.0, 42.0).toDouble();
        left = [
          Positioned(
            left: w * 0.025,
            width: w * 0.394,
            top: (barH - pillH) / 2,
            height: pillH,
            child: Material(
              color: Colors.black.withValues(alpha: 0.32),
              shape: const StadiumBorder(),
              child: InkWell(
                customBorder: const StadiumBorder(),
                onTap: _openInput,
                child: Row(children: [
                  const SizedBox(width: 10),
                  const Icon(Icons.chat_bubble_outline, size: 22),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_chatOpen ? 'Selam...' : 'Sohbet kapalı', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                ]),
              ),
            ),
          ),
        ];
      }
      return SizedBox(height: barH, child: Stack(clipBehavior: Clip.none, children: [...left, ...right]));
    });
  }

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
                      muted: _roomMuted || CallGuard.instance.inCall.value,
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
                        title: Text('Ses/görüntü bağlanamadı: $_lkError', style: const TextStyle(fontSize: 12)),
                        trailing: TextButton(onPressed: _connectLivekit, child: const Text('Tekrar')),
                      ),
                    ),
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
                            onTap: () => _musicBarOpen.value = !open,
                            child: const DjDisc(onTap: _noop),
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
                for (final fx in _seatFx)
                  Positioned(
                    key: ValueKey('seatfx-${fx.id}'),
                    left: fx.center.dx - fx.diameter / 2,
                    top: fx.center.dy - fx.diameter / 2,
                    width: fx.diameter,
                    height: fx.diameter,
                    child: IgnorePointer(
                      child: ClipOval(
                        child: AnimAsset(
                          url: fx.url,
                          format: fx.format,
                          fit: BoxFit.cover,
                          sound: fx.sound,
                          onDone: () {
                            if (mounted) setState(() => _seatFx.removeWhere((x) => x.id == fx.id));
                          },
                        ),
                      ),
                    ),
                  ),
                for (final f in _flights)
                  _GiftFlight(key: ValueKey(f.id), data: f, onDone: () {
                    if (mounted) setState(() => _flights.removeWhere((x) => x.id == f.id));
                  }),
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
class _SeatFx {
  final int id;
  final String url;
  final String format;
  final Offset center;
  final double diameter;
  final bool sound;
  _SeatFx(this.id, this.url, this.format, this.center, this.diameter, {this.sound = false});
}

class _GiftFlightData {
  final int id;
  final String icon;
  final Offset from;
  final Offset to;
  final int quantity;
  _GiftFlightData(this.id, this.icon, this.from, this.to, [this.quantity = 1]);
}

/// Hediye ikonunun gönderenden alıcının mikrofonuna uçuşu (Yoho): çoklu gönderimde ikonlar art arda bir kuyruk
/// hâlinde uçar (her birinde "xN"), öndekinin çevresinde altın parıltılar; varınca alıcının koltuğunda büyüyüp söner.
class _GiftFlight extends StatefulWidget {
  final _GiftFlightData data;
  final VoidCallback onDone;
  const _GiftFlight({super.key, required this.data, required this.onDone});

  @override
  State<_GiftFlight> createState() => _GiftFlightState();
}

class _GiftFlightState extends State<_GiftFlight> with SingleTickerProviderStateMixin {
  late final int _copies = widget.data.quantity <= 1 ? 1 : math.min(widget.data.quantity, 7);
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: 1300 + (_copies - 1) * 120),
  )..forward().whenComplete(widget.onDone);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _label(double size) => Text(
        'x${widget.data.quantity}',
        style: TextStyle(
          fontSize: size * 0.34,
          fontWeight: FontWeight.w900,
          fontStyle: FontStyle.italic,
          color: const Color(0xFFFFE066),
          shadows: const [Shadow(color: Color(0xFF7A3B00), blurRadius: 2, offset: Offset(1, 1)), Shadow(color: Colors.black54, blurRadius: 4)],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final n = _copies;
    final fly = n <= 1 ? 1.0 : 0.72; // her ikonun uçuş payı (toplam sürenin oranı)
    final gap = n <= 1 ? 0.0 : (1 - fly) / (n - 1);
    return Positioned.fill(
      child: IgnorePointer(
        child: RepaintBoundary(
          child: AnimatedBuilder(
            animation: _c,
            builder: (_, __) {
              final v = _c.value;
              final items = <Widget>[];
              // Arkadakiler önce çizilir; öndeki (ilk çıkan) en üstte.
              for (var k = n - 1; k >= 0; k--) {
                final start = k * gap;
                if (v < start) continue;
                final local = ((v - start) / fly).clamp(0.0, 1.0);
                final last = k == n - 1;
                if (local >= 1 && !last) continue; // vardı; son ikon varışta biraz kalır
                final t = Curves.easeInOutCubic.transform(local);
                final arc = -70 * (1 - (2 * t - 1) * (2 * t - 1)); // ortada yukarı kavis
                final pos = Offset.lerp(d.from, d.to, t)! + Offset(0, arc);
                var size = 58.0 * (0.85 + 0.55 * (1 - (2 * t - 1).abs()));
                var opacity = 1.0;
                if (last && local >= 0.92) {
                  // Varış: alıcının koltuğunda büyüyüp söner.
                  final p = ((local - 0.92) / 0.08).clamp(0.0, 1.0);
                  size *= 1 + 0.5 * p;
                  opacity = 1 - p;
                }
                if (k == 0 && local < 1) {
                  // Öndeki ikonun çevresinde altın parıltılar.
                  for (var j = 0; j < 6; j++) {
                    final ang = j * math.pi / 3 + v * 6;
                    final rad = size * (0.55 + 0.12 * math.sin(v * 20 + j));
                    final sp = pos + Offset(math.cos(ang) * rad, math.sin(ang) * rad);
                    final ss = 4.0 + 3 * (0.5 + 0.5 * math.sin(v * 30 + j * 2));
                    items.add(Positioned(
                      left: sp.dx - ss / 2,
                      top: sp.dy - ss / 2,
                      width: ss,
                      height: ss,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(shape: BoxShape.circle, color: Color(0xFFFFD54F), boxShadow: [BoxShadow(color: Color(0xAAFFC107), blurRadius: 6)]),
                      ),
                    ));
                  }
                }
                items.add(Positioned(
                  left: pos.dx - size / 2,
                  top: pos.dy - size / 2,
                  width: size,
                  height: size,
                  child: Opacity(
                    opacity: opacity,
                    child: Stack(clipBehavior: Clip.none, children: [
                      Positioned.fill(child: NetImg(d.icon, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox.shrink())),
                      if (d.quantity > 1) Positioned(right: -size * 0.28, bottom: -size * 0.08, child: _label(size)),
                    ]),
                  ),
                ));
              }
              return Stack(children: items);
            },
          ),
        ),
      ),
    );
  }
}
