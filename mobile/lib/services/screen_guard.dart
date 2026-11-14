import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'api.dart';

/// Ekran görüntüsü koruması ve bildirimi.
///  * [SecureScreen]: içindeki sayfa görünürken ekran görüntüsü / ekran kaydı engellenir (Android FLAG_SECURE: görüntü
///    siyah çıkar). Profil fotoğrafı gösteren sayfalarda kullanılır.
///  * [ScreenTag]: sayfanın türü ve (varsa) oda / kişi. Telefon bir ekran görüntüsü bildirdiğinde, o an görünen etiketle
///    birlikte sunucuya kayıt gönderilir (yönetim panelinde listelenir). Görüntünün kendisi gönderilmez.
///  Android 14+: sistemin ekran görüntüsü bildirimi. Android 12 ve öncesi: yalnızca galeri izni zaten verilmişse
///  yeni ekran görüntüsü dosyası fark edilir (izin istenmez). Android 13'te ve iOS'ta bildirim yoktur.
class ScreenGuard {
  ScreenGuard._();
  static const _device = MethodChannel('trlive/device');
  static const _events = EventChannel('trlive/screenshot');
  static StreamSubscription<dynamic>? _sub;
  static int _secure = 0;

  static void init() {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android || _sub != null) return;
    _sub = _events.receiveBroadcastStream().listen((_) => _report(), onError: (_) {});
  }

  static Future<void> _report() async {
    if (Api.token == null) return;
    final t = _ScreenTagState.current;
    try {
      await Api.post('/api/screenshots', {
        'screen': t?.widget.screen ?? 'other',
        if (t?.widget.roomId != null) 'roomId': t!.widget.roomId,
        if (t?.widget.userId != null) 'targetUserId': t!.widget.userId,
        'platform': 'android',
      });
    } catch (_) {/* kayıt gönderilemezse kullanıcı etkilenmez */}
  }

  static void _setSecure(bool on) {
    _secure += on ? 1 : -1;
    if (_secure < 0) _secure = 0;
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    _device.invokeMethod<void>('secure', _secure > 0).catchError((_) {});
  }
}

/// İçindeki sayfa görünürken (sekmesi açık, üstüne başka tam sayfa açılmamış) ekran görüntüsü alınamaz.
class SecureScreen extends StatefulWidget {
  final Widget child;
  const SecureScreen({super.key, required this.child});

  @override
  State<SecureScreen> createState() => _SecureScreenState();
}

class _SecureScreenState extends State<SecureScreen> {
  ValueListenable<bool>? _ticker;
  bool _on = false;

  void _sync() {
    final want = mounted && (_ticker?.value ?? true);
    if (want == _on) return;
    _on = want;
    ScreenGuard._setSecure(want);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Görünmeyen sekme ve üstü kapanan sayfa TickerMode ile kapalıdır (Overlay / sekmeler).
    final t = TickerMode.getNotifier(context);
    if (!identical(t, _ticker)) {
      _ticker?.removeListener(_sync);
      _ticker = t..addListener(_sync);
    }
    _sync();
  }

  @override
  void dispose() {
    _ticker?.removeListener(_sync);
    if (_on) ScreenGuard._setSecure(false);
    _on = false;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Sayfa etiketi: ekran görüntüsü kaydında hangi sayfada alındığı. screen: room, profile, chat, feed, messages, home, store.
class ScreenTag extends StatefulWidget {
  final String screen;
  final String? roomId;
  final String? userId;
  final Widget child;
  const ScreenTag({super.key, required this.screen, this.roomId, this.userId, required this.child});

  @override
  State<ScreenTag> createState() => _ScreenTagState();
}

class _ScreenTagState extends State<ScreenTag> {
  static final List<_ScreenTagState> _all = [];
  ValueListenable<bool>? _ticker;

  /// Şu an görünen en son açılmış etiket.
  static _ScreenTagState? get current {
    for (var i = _all.length - 1; i >= 0; i--) {
      final s = _all[i];
      if (s.mounted && (s._ticker?.value ?? true)) return s;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _all.add(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _ticker = TickerMode.getNotifier(context);
  }

  @override
  void dispose() {
    _all.remove(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
