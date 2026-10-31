import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api.dart';
import 'app_visibility.dart';

/// Uygulama boyunca tek WebSocket bağlantısı. Kopunca otomatik yeniden bağlanır
/// ve bağlı olunan odaya yeniden abone olur.
///
/// Pil/internet: sunucu her 30 sn'de bir küçük "hb" mesajı yollar; bağlantı canlıyken telefon hiç ping atmaz
/// (yalnızca 45 sn hiç veri gelmezse sorar). Uygulama odada değilken 10 dk'dan uzun arka planda kalırsa bağlantı
/// kapatılır (telefon uyusun); uygulama açılınca hemen yeniden bağlanır, kaçan bildirimler o an sorulur.
class SocketService {
  SocketService._();
  static final SocketService instance = SocketService._();

  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get events => _controller.stream;

  /// Sunucudan gelmeyen, uygulama içinde üretilen olay (ör. kendi giriş aracım) dinleyicilere iletilir.
  void emitLocal(Map<String, dynamic> event) {
    if (!_controller.isClosed) _controller.add(event);
  }

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _retry;
  Timer? _ping;
  bool _wanted = false;
  int _attempt = 0;
  int _gen = 0; // bağlanma denemesi kuşağı: arka arkaya iki deneme iki bağlantı açmasın
  DateTime _lastData = DateTime.now(); // yarı açık (sessizce ölmüş) bağlantıyı fark etmek için
  String? _roomId;
  bool _suspended = false; // arka planda uzun süre kalındı: bağlantı bilerek kapalı
  bool _open = false; // bağlantı kuruldu ve sunucudan veri geldi (yalnızca açılıyor değil)
  Timer? _bgTimer;
  bool _visHooked = false;

  static const _bgLimit = Duration(minutes: 10);

  void start() {
    _wanted = true;
    _attempt = 0;
    _suspended = false;
    if (!_visHooked) {
      _visHooked = true;
      AppVisibility.foreground.addListener(_onVisibility);
    }
    _connect();
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

  /// Uygulama arka plandan dönünce: bağlantı kapalı / sessizse hemen yeniler (bekleme süresini beklemeden).
  /// Bağlantı son 45 sn içinde veri aldıysa sağlamdır; boşuna kopartılıp yeniden kurulmaz (internet/pil).
  void reconnectNow() {
    if (!_wanted) return;
    final wasSuspended = _suspended;
    _suspended = false;
    if (!wasSuspended && _open && _channel != null && DateTime.now().difference(_lastData) < const Duration(seconds: 45)) {
      _attempt = 0;
      return;
    }
    _retry?.cancel();
    _attempt = 0;
    _connect();
  }

  void stop() {
    _wanted = false;
    _suspended = false;
    _gen++;
    _roomId = null;
    _retry?.cancel();
    _bgTimer?.cancel();
    _bgTimer = null;
    _teardown();
  }

  void subscribeRoom(String roomId) {
    _roomId = roomId;
    _send({'type': 'room_subscribe', 'roomId': roomId});
  }

  void unsubscribeRoom() {
    if (_roomId != null) _send({'type': 'room_unsubscribe'});
    _roomId = null;
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
    final uri = Uri(
      scheme: base.scheme == 'https' ? 'wss' : 'ws',
      host: base.host,
      port: base.hasPort ? base.port : null,
      path: '/ws',
      queryParameters: {'token': Api.token!},
    );
    try {
      final channel = WebSocketChannel.connect(uri);
      _channel = channel;
      channel.ready.then((_) {}, onError: (_) {}); // bağlantı hatası stream üzerinden de gelir; yakalanmamış istisna olmasın
      _sub = channel.stream.listen(_onData, onDone: _onClosed, onError: (_) => _onClosed(), cancelOnError: true);
      _lastData = DateTime.now();
      _ping = Timer.periodic(const Duration(seconds: 20), (_) {
        // Sunucu 30 sn'de bir "hb" yollar. 45 sn sessizlikte telefon bir kez "ping" sorar (sunucu "pong" döner);
        // 75 sn hiç veri gelmediyse bağlantı ölmüştür (ör. Wi-Fi → mobil veri geçişi).
        final idle = DateTime.now().difference(_lastData);
        if (idle > const Duration(seconds: 75)) {
          _teardown();
          _controller.add({'type': 'socket_closed'});
          _scheduleRetry();
          return;
        }
        if (idle > const Duration(seconds: 45)) _send({'type': 'ping'});
      });
    } catch (_) {
      _scheduleRetry();
    }
  }

  void _onData(dynamic raw) {
    _lastData = DateTime.now();
    _open = true;
    try {
      final decoded = jsonDecode(raw.toString());
      if (decoded is! Map) return;
      final message = Map<String, dynamic>.from(decoded);
      if (message['type'] == 'hb' || message['type'] == 'pong') return; // yalnızca canlılık
      if (message['type'] == 'connected') {
        _attempt = 0;
        if (_roomId != null) _send({'type': 'room_subscribe', 'roomId': _roomId});
      }
      _controller.add(message);
    } catch (_) {/* bozuk mesajı yoksay */}
  }

  void _onClosed() {
    final code = _channel?.closeCode;
    _teardown();
    // 4001: hesap yasaklandı / şifre değişti / silindi → kesin çıkış.
    if (code == 4001) {
      _wanted = false;
      Api.onUnauthorized?.call();
      return;
    }
    // 1008 her zaman oturum sorunu değildir (sunucu yeniden başlarken, IP sınırı, mesaj seli). Oturumu REST ile
    // doğrula: gerçekten geçersizse Api zaten çıkış yaptırır; değilse yeniden bağlanmayı dene.
    if (code == 1008) Api.get('/api/me').then((_) {}, onError: (_) {});
    _controller.add({'type': 'socket_closed'});
    _scheduleRetry();
  }

  void _scheduleRetry() {
    if (!_wanted || _suspended) return;
    _retry?.cancel();
    final seconds = min(30, 1 << min(_attempt, 5));
    _attempt += 1;
    _retry = Timer(Duration(seconds: seconds), _connect);
  }

  void _teardown() {
    _open = false;
    _ping?.cancel();
    _ping = null;
    _sub?.cancel();
    _sub = null;
    try {
      _channel?.sink.close();
    } catch (_) {/* yoksay */}
    _channel = null;
  }
}
