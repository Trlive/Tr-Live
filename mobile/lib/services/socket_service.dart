import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api.dart';
import 'app_visibility.dart';

/// Uygulama boyunca tek WebSocket bağlantısı. Kopunca otomatik yeniden bağlanır
/// ve bağlı olunan odaya yeniden abone olur.
///
/// Canlılık (v2.105): bağlantının sessizce ölmesi (Wi-Fi → mobil veri, zayıf sinyal, operatör NAT'ı) odada 25–35 sn içinde,
/// oda dışında 75 sn içinde fark edilir. Eskiden her iki durumda da 75–95 sn sürüyordu; o sürede oda "donmuş" görünüyordu
/// (koltuk, sohbet, hediye olayları gelmiyordu).
///  - Odadayken: 10 sn veri gelmezse telefon "ping" sorar (sunucu "pong" döner); 25 sn hiç veri yoksa bağlantı ölüdür.
///  - Oda dışında: sunucunun 30 sn'lik "hb" mesajı yeter; 45 sn sessizlikte bir kez sorulur, 75 sn'de ölü sayılır
///    (telefon daha az uyanır: pil / internet).
///  - Bağlanma 12 sn içinde tamamlanmazsa (kara delik ağ) beklenmez, yeniden denenir.
///  - Arka plandan dönünce bağlantı hemen yoklanır; 4 sn içinde yanıt yoksa yeniden kurulur.
///  - Oda aboneliği sunucudan onay ("room_subscribed") gelene kadar birkaç saniyede bir yeniden istenir.
///
/// Pil/internet: uygulama odada değilken 10 dk'dan uzun arka planda kalırsa bağlantı kapatılır (telefon uyusun);
/// uygulama açılınca hemen yeniden bağlanır, kaçan bildirimler o an sorulur.
class SocketService {
  SocketService._();
  static final SocketService instance = SocketService._();

  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get events => _controller.stream;

  /// Bağlantı kurulu ve sunucu "connected" dedi. Arayüz "bağlantı yenileniyor" göstergesi için dinleyebilir.
  final ValueNotifier<bool> connected = ValueNotifier<bool>(false);

  /// Sunucudan gelmeyen, uygulama içinde üretilen olay (ör. kendi giriş aracım) dinleyicilere iletilir.
  void emitLocal(Map<String, dynamic> event) {
    if (!_controller.isClosed) _controller.add(event);
  }

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _retry;
  Timer? _watch;
  Timer? _probe;
  Timer? _connectTimer;
  bool _wanted = false;
  int _attempt = 0;
  int _gen = 0; // bağlanma denemesi kuşağı: arka arkaya iki deneme iki bağlantı açmasın
  DateTime _lastData = DateTime.now(); // yarı açık (sessizce ölmüş) bağlantıyı fark etmek için
  DateTime _connectStarted = DateTime.now();
  DateTime _lastTick = DateTime.now();
  String? _roomId;
  bool _subscribed = false; // sunucu oda aboneliğini onayladı
  int? _seq; // oda olaylarında son görülen sıra numarası (abonelik onayıyla başlar; sunucu eskiyse boş kalır, takip kapalıdır)
  DateTime _subAskedAt = DateTime.fromMillisecondsSinceEpoch(0);
  bool _suspended = false; // arka planda uzun süre kalındı: bağlantı bilerek kapalı
  bool _open = false; // bağlantı kuruldu ve sunucudan veri geldi (yalnızca açılıyor değil)
  bool _greeted = false; // sunucu "connected" dedi (kimlik doğrulandı)
  Timer? _bgTimer;
  bool _visHooked = false;
  // Kimlik: yeni sunucu token'ı başlıkta kabul eder. Güncellenmemiş bir sunucu başlığı tanımazsa (1008 ile kapatır ama
  // oturum geçerlidir) eski yönteme (adres satırı) dönülür; uygulama sunucudan önce güncellenirse de bağlantı kurulsun.
  bool _legacyAuth = false;
  bool _headerAuthWorked = false;
  final _rnd = Random();

  static const _bgLimit = Duration(minutes: 10);
  static const _connectTimeout = Duration(seconds: 12);

  bool get _inRoom => _roomId != null;

  void start() {
    _wanted = true;
    _attempt = 0;
    _suspended = false;
    if (!_visHooked) {
      _visHooked = true;
      AppVisibility.foreground.addListener(_onVisibility);
      _watchNetwork();
    }
    _connect();
  }

  StreamSubscription? _netSub;
  String? _net;

  /// Telefonun ağı değişince (Wi-Fi ↔ mobil veri) eski bağlantı ölüdür: sessizliği beklemeden hemen yeniden kurulur.
  void _watchNetwork() {
    if (defaultTargetPlatform != TargetPlatform.android || _netSub != null) return;
    try {
      _netSub = const EventChannel('trlive/network').receiveBroadcastStream().listen((v) {
        final now = '$v';
        final before = _net;
        _net = now;
        if (before == null || now == 'none') return; // ilk değer / ağ yok: yeniden deneme zaten sürüyor
        Api.resetConnections();
        if (!_wanted || _suspended) return;
        lastCloseReason = 'network';
        if (_channel != null) _teardown();
        _controller.add({'type': 'socket_closed', 'reason': 'network'});
        _retry?.cancel();
        _attempt = 0;
        _connect();
      }, onError: (_) {});
    } catch (_) {/* eski derleme: sessizlik denetimi yeterli */}
  }

  void _onVisibility() {
    if (AppVisibility.isForeground) {
      _bgTimer?.cancel();
      _bgTimer = null;
      if (_suspended) reconnectNow();
    } else if (_wanted) {
      _bgTimer?.cancel();
      _bgTimer = Timer(_bgLimit, _suspendIfIdle);
    }
  }

  /// Odada değilken uzun süre arka planda: bağlantıyı kapat (her 30 sn'lik canlılık mesajı telefonu uyandırmasın).
  /// Odadaysa (küçültülmüş oda, ön plan servisi) bağlantı açık kalır; süre yeniden başlar.
  void _suspendIfIdle() {
    _bgTimer = null;
    if (!_wanted || AppVisibility.isForeground) return;
    if (_roomId != null) {
      _bgTimer = Timer(_bgLimit, _suspendIfIdle);
      return;
    }
    _suspended = true;
    _gen++;
    _retry?.cancel();
    _teardown();
  }

  /// Uygulama arka plandan dönünce / ağ değişince: bağlantı kapalıysa hemen kurar; açık görünüyorsa yoklar
  /// ("ping") ve 4 sn içinde yanıt gelmezse yeniden kurar. (Eskiden son 45 sn'de veri geldiyse sağlam sayılıyordu;
  /// arka planda sessizce ölmüş bağlantı ancak 75 sn sonra fark ediliyordu.)
  void reconnectNow() {
    if (!_wanted) return;
    final wasSuspended = _suspended;
    _suspended = false;
    if (!wasSuspended && _open && _channel != null) {
      _attempt = 0;
      // Az önce veri geldiyse yoklamaya gerek yok.
      if (DateTime.now().difference(_lastData) < const Duration(seconds: 3)) return;
      _probeNow();
      return;
    }
    // Az önce başlamış bir bağlanma denemesi varsa yarıda kesilmez (bitmesi beklenir).
    if (!wasSuspended && _channel != null && !_open && DateTime.now().difference(_connectStarted) < const Duration(seconds: 5)) return;
    _retry?.cancel();
    _attempt = 0;
    _connect();
  }

  /// Bağlantıyı yoklar: "ping" gönderir; 4 sn içinde hiçbir veri gelmezse bağlantı ölü sayılır.
  void _probeNow() {
    final asked = DateTime.now();
    _send({'type': 'ping'});
    _probe?.cancel();
    _probe = Timer(const Duration(seconds: 4), () {
      _probe = null;
      if (!_wanted || _suspended || !_open) return;
      if (_lastData.isAfter(asked)) return; // yanıt geldi: bağlantı sağlam
      _fail('probe');
    });
  }

  void stop() {
    _wanted = false;
    _suspended = false;
    _gen++;
    _roomId = null;
    _subscribed = false;
    _seq = null; // oda olay takibi abonelikle birlikte sıfırlanır
    _retry?.cancel();
    _bgTimer?.cancel();
    _bgTimer = null;
    _teardown();
  }

  void subscribeRoom(String roomId) {
    if (_roomId != roomId) {
      _subscribed = false;
      _seq = null;
    }
    _roomId = roomId;
    _askSubscribe();
  }

  void unsubscribeRoom() {
    if (_roomId != null) _send({'type': 'room_unsubscribe'});
    _roomId = null;
    _subscribed = false;
    _seq = null; // oda olay takibi abonelikle birlikte sıfırlanır
  }

  /// Bu oda için sunucu aboneliği onayladı mı (oda ekranı ilk anlık görüntünün abonelikten önce mi alındığını bilmek için).
  bool isSubscribedTo(String roomId) => _subscribed && _roomId == roomId;

  void _askSubscribe() {
    final id = _roomId;
    if (id == null) return;
    _subAskedAt = DateTime.now();
    _send({'type': 'room_subscribe', 'roomId': id});
  }

  /// Sunucuya mesaj (ör. çevrimiçi durumu izleme). Bağlantı yoksa sessizce düşer.
  void send(Map<String, dynamic> message) => _send(message);

  void _send(Map<String, dynamic> message) {
    try {
      _channel?.sink.add(jsonEncode(message));
    } catch (_) {/* bağlantı yoksa yeniden bağlanınca abone olunur */}
  }

  Future<void> _connect() async {
    if (!_wanted || _suspended || Api.token == null) return;
    final gen = ++_gen;
    // Süresi dolmak üzere olan erişim token'ı bağlanmadan önce yenilenir (sunucu süresi dolmuş token'ı reddeder).
    try {
      await Api.ensureFreshToken();
    } catch (_) {/* ağ yoksa bağlantı denemesi zaten başarısız olur ve yeniden denenir */}
    if (gen != _gen || !_wanted || _suspended || Api.token == null) return;
    _teardown();
    final base = Uri.parse(Api.baseUrl);
    final token = Api.token!;
    final uri = Uri(
      scheme: base.scheme == 'https' ? 'wss' : 'ws',
      host: base.host,
      port: base.hasPort ? base.port : null,
      path: '/ws',
      // Token adres satırına yazılmaz (vekil sunucu / erişim kayıtlarına düşmesin); yalnızca eski sunucu için.
      queryParameters: _legacyAuth ? {'token': token} : null,
    );
    try {
      final WebSocketChannel channel =
          _legacyAuth ? WebSocketChannel.connect(uri) : IOWebSocketChannel.connect(uri, headers: {'Authorization': 'Bearer $token'});
      _channel = channel;
      channel.ready.then((_) {}, onError: (_) {}); // bağlantı hatası stream üzerinden de gelir; yakalanmamış istisna olmasın
      _sub = channel.stream.listen(_onData, onDone: _onClosed, onError: (_) => _onClosed(), cancelOnError: true);
      _lastData = DateTime.now();
      _connectStarted = _lastData;
      _lastTick = _lastData;
      _watch = Timer.periodic(const Duration(seconds: 10), (_) => _tick());
      // Bağlanma 12 sn içinde tamamlanmazsa (yanıt vermeyen ağ) sistemin dakikalar süren zaman aşımı beklenmez.
      _connectTimer = Timer(_connectTimeout, () {
        _connectTimer = null;
        if (gen == _gen && _wanted && !_suspended && !_open) _fail('connect_timeout');
      });
    } catch (_) {
      _scheduleRetry();
    }
  }

  /// 10 sn'de bir: bağlanma zaman aşımı, canlılık yoklaması ve oda aboneliği denetimi.
  void _tick() {
    final now = DateTime.now();
    // Zamanlayıcı uzun süre çalışmadıysa telefon uyumuştur: sessizlik bağlantının değil uykunun sonucu olabilir.
    final stalled = now.difference(_lastTick) > const Duration(seconds: 20);
    _lastTick = now;
    if (!_open) {
      // Bağlantı hâlâ kurulamadı: asıl denetim _connectTimer'dadır; burası yalnızca yedektir (zamanlayıcı kaçarsa).
      if (now.difference(_connectStarted) > _connectTimeout) _fail('connect_timeout');
      return;
    }
    final idle = now.difference(_lastData);
    final dead = _inRoom ? const Duration(seconds: 25) : const Duration(seconds: 75);
    final ask = _inRoom ? const Duration(seconds: 9) : const Duration(seconds: 45);
    if (idle > dead) {
      // Uykudan yeni uyanıldıysa bağlantı hemen kesilmez; önce yoklanır (yanıt gelmezse 4 sn sonra yeniden kurulur).
      if (stalled) {
        if (_probe == null) _probeNow();
      } else {
        _fail('silent');
      }
      return;
    }
    if (idle > ask) _send({'type': 'ping'});
    // Oda aboneliği onaylanmadıysa (istek yolda kayboldu / sunucu o an yanıt veremedi) yeniden istenir. Onaysız kalan
    // abonelikte oda olayları gelmez: oda açık görünür ama "donmuş" olur.
    if (_greeted && _roomId != null && !_subscribed && now.difference(_subAskedAt) > const Duration(seconds: 6)) _askSubscribe();
  }

  /// Bağlantı ölü sayıldı: kapat, dinleyenlere bildir, yeniden dene.
  void _fail(String why) {
    lastCloseReason = why;
    _teardown();
    _controller.add({'type': 'socket_closed', 'reason': why});
    _scheduleRetry();
  }

  /// Son kopuşun sebebi (tanı kaydı için): "silent", "connect_timeout", "probe" ya da kapanış kodu.
  String? lastCloseReason;

  void _onData(dynamic raw) {
    _lastData = DateTime.now();
    _open = true;
    try {
      final decoded = jsonDecode(raw.toString());
      if (decoded is! Map) return;
      final message = Map<String, dynamic>.from(decoded);
      final type = message['type'];
      if (type == 'hb' || type == 'pong') return; // yalnızca canlılık
      if (type == 'connected') {
        _attempt = 0;
        _greeted = true;
        if (!_legacyAuth) _headerAuthWorked = true;
        connected.value = true;
        _subscribed = false;
        _seq = null; // oda olay takibi abonelikle birlikte sıfırlanır
        _askSubscribe();
      } else if (type == 'room_subscribed') {
        if (message['roomId'] == _roomId) {
          final n = (message['seq'] as num?)?.toInt();
          final base = _seq;
          // Kalp atışı aboneliği yeniler (zaten odadayız): sunucu o ana kadarki olayları onaydan ÖNCE göndermiştir, yani
          // onaydaki numara bizimkiyle aynı olmalı. Büyükse araya giren bir olay bize ulaşmamıştır → boşluk.
          if (_subscribed && base != null && n != null && n > base) {
            _controller.add({'type': 'room_gap', 'roomId': _roomId, 'from': base, 'to': n});
          }
          _subscribed = true;
          // Sıra takibi abonelik onayındaki numaradan (yeniden) başlar: yeniden abone olan sahte "boşluk" görmez.
          _seq = n;
        }
      } else if (type == 'error' && message['code'] == 'server' && _roomId != null && !_subscribed) {
        // Sunucu üyeliği o an doğrulayamadı (geçici): kısa süre sonra yeniden istenir.
        Timer(const Duration(seconds: 2), () {
          if (_open && _roomId != null && !_subscribed) _askSubscribe();
        });
      }
      // Oda olayları artan "seq" taşır: araya bir numara girdiyse bir olay kaçmıştır; oda ekranı durumu yeniden alır.
      final seq = message['seq'];
      final base = _seq;
      if (seq is num && base != null && _subscribed && type != 'room_subscribed') {
        final n = seq.toInt();
        if (n > base + 1) _controller.add({'type': 'room_gap', 'roomId': _roomId, 'from': base, 'to': n});
        if (n > base) _seq = n;
      }
      _controller.add(message);
    } catch (_) {/* bozuk mesajı yoksay */}
  }

  void _onClosed() {
    final code = _channel?.closeCode;
    final greeted = _greeted;
    _teardown();
    lastCloseReason = code == null ? 'closed' : 'code_$code';
    // 4001: hesap yasaklandı / şifre değişti / silindi → kesin çıkış.
    if (code == 4001) {
      _wanted = false;
      Api.onUnauthorized?.call();
      return;
    }
    // 1008 her zaman oturum sorunu değildir (sunucu yeniden başlarken, IP sınırı, mesaj seli). Oturumu REST ile
    // doğrula: gerçekten geçersizse Api zaten çıkış yaptırır; değilse yeniden bağlanmayı dene.
    if (code == 1008) {
      final headerTry = !_legacyAuth && !greeted && !_headerAuthWorked;
      Api.get('/api/me').then((_) {
        // Oturum geçerli ama başlıkla kimlik hiç kabul edilmedi: sunucu eski sürüm → adres satırı yöntemine dön.
        if (headerTry) _legacyAuth = true;
      }, onError: (_) {});
    }
    _controller.add({'type': 'socket_closed', 'reason': lastCloseReason});
    // 1012: sunucu yeniden başlıyor (güncelleme). Bekleme süresi büyütülmez; kısa, rastgele bir aradan sonra bağlanılır
    // (herkes aynı anda yüklenmesin).
    if (code == 1012) _attempt = 0;
    // 1013: sunucu "şimdi olmaz" dedi (aynı IP'den / hesaptan çok fazla bağlantı). Hemen üst üste denemek işe yaramaz,
    // sunucunun gözünde de sel gibi görünür: yarım dakika beklenir.
    _scheduleRetry(restart: code == 1012, busy: code == 1013);
  }

  void _scheduleRetry({bool restart = false, bool busy = false}) {
    if (!_wanted || _suspended) return;
    _retry?.cancel();
    // Odadayken en fazla 6 sn (oda olayları kaçmasın), oda dışında en fazla 30 sn beklenir: 1, 2, 4, 6 … / 1, 2, 4 … 30.
    final cap = _inRoom ? 6 : 30;
    final base = restart ? 1500 : (busy ? 30000 : min(cap, 1 << min(_attempt, 5)) * 1000);
    final jitter = _rnd.nextInt(restart ? 1500 : (busy ? 5000 : 400));
    _attempt += 1;
    _retry = Timer(Duration(milliseconds: base + jitter), _connect);
  }

  void _teardown() {
    _open = false;
    _greeted = false;
    _subscribed = false;
    _seq = null; // oda olay takibi abonelikle birlikte sıfırlanır
    if (connected.value) connected.value = false;
    _watch?.cancel();
    _watch = null;
    _probe?.cancel();
    _probe = null;
    _connectTimer?.cancel();
    _connectTimer = null;
    _sub?.cancel();
    _sub = null;
    try {
      _channel?.sink.close();
    } catch (_) {/* yoksay */}
    _channel = null;
  }
}
