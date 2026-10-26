import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'api.dart';
import 'socket_service.dart';

/// Okunmamış özel mesaj sayısı (sekme rozeti için).
class Inbox {
  static final ValueNotifier<int> unread = ValueNotifier<int>(0);
  /// Profil kırmızı rozetleri: yeni ziyaretçi, yeni takipçi, bekleyen arkadaş isteği.
  static final ValueNotifier<Map<String, int>> badges = ValueNotifier<Map<String, int>>(const {'visitors': 0, 'followers': 0, 'friends': 0, 'total': 0});
  static StreamSubscription? _sub;
  static Timer? _timer;

  static void start() {
    _sub?.cancel();
    _sub = SocketService.instance.events.listen((e) {
      final t = e['type'];
      // Mesajlar sekmesindeki her şey (bildirim, arkadaşlık/CP isteği, destek, ekip duyurusu, ajans daveti, aile sohbeti)
      // normal mesaj gibi sekme rozetini artırır.
      if (t == 'inbox_update') {
        // Herkese aynı anda giden duyuru: istekler 0-15 sn'ye yayılır (sunucu aynı anda yüklenmesin).
        _refreshSoon(Duration(milliseconds: 350 + _rnd.nextInt(15000)));
      } else if (const {'dm', 'connected', 'notify', 'friend_update', 'cp_request', 'cp_update', 'support_message', 'agency_invite', 'agency_assistant_invite', 'family_chat', 'event_reward'}.contains(t)) {
        _refreshSoon();
      }
      if (t == 'friend_update' || t == 'cp_request' || t == 'cp_update' || t == 'connected' || t == 'notify') refreshBadges();
    });
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      refreshBadges();
      refresh();
    });
    refresh();
    refreshBadges();
  }

  static void stop() {
    _sub?.cancel();
    _sub = null;
    _timer?.cancel();
    _timer = null;
    _soon?.cancel();
    _soon = null;
    unread.value = 0;
    badges.value = const {'visitors': 0, 'followers': 0, 'friends': 0, 'total': 0};
  }

  static Timer? _soon;
  static final _rnd = Random();

  /// Art arda gelen olaylarda tek istek.
  static void _refreshSoon([Duration delay = const Duration(milliseconds: 350)]) {
    _soon?.cancel();
    _soon = Timer(delay, refresh);
  }

  /// Sekme rozeti: okunmamış mesaj + yeni bildirim + bekleyen istekler + diğer Mesajlar kartları.
  static Future<void> refresh() async {
    try {
      final r = await Api.get('/api/messages/alerts');
      unread.value = (r['total'] as num?)?.toInt() ?? 0;
    } on ApiException catch (e) {
      if (e.statusCode != 404) return;
      try {
        // Eski sunucu: yalnızca özel mesajlar.
        final r = await Api.get('/api/messages/unread-count');
        unread.value = (r['unread'] as num?)?.toInt() ?? 0;
      } catch (_) {/* oturum yoksa yoksay */}
    } catch (_) {/* bağlantı yok: sonraki olayda yeniden denenir */}
  }

  static Future<void> refreshBadges() async {
    try {
      final r = await Api.get('/api/me/badges');
      int n(String k) => (r[k] as num?)?.toInt() ?? 0;
      badges.value = {'visitors': n('visitors'), 'followers': n('followers'), 'friends': n('friends'), 'total': n('total')};
    } catch (_) {/* oturum yoksa yoksay */}
  }

  /// Liste açılınca ilgili rozeti sıfırlar.
  static Future<void> markSeen(String kind) async {
    try {
      await Api.post('/api/me/seen', {'kind': kind});
    } catch (_) {/* yoksay */}
    await refreshBadges();
  }
}
