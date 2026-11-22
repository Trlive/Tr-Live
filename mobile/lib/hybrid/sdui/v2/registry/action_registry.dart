import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../screens/family_screen.dart';
import '../../../../screens/leaderboard_screen.dart';
import '../../../../screens/misc_screens.dart';
import '../../../../screens/store_screens.dart';
import '../../../../screens/messages_screen.dart';
import '../../../../screens/support_screens.dart';
import '../../../../screens/user_screens.dart';

import '../../../../screens/usd_wallet_screen.dart';
import '../../../../services/api.dart';
import '../../../../widgets/external_webview.dart';
import '../../../webview/navigation_policy.dart';
import '../schema/sdui_node.dart';

/// SDUI v2 eylem kaydı: sunucudan gelen bir eylemin uygulamadaki karşılığı.
///
/// ## Burada sunucunun yetkisi: VAR OLANA İŞARET ETMEK
///
/// Hiçbir dal sunucudan gelen bir adresi ya da yöntemi doğrudan çalıştırmaz. `api` eylemi
/// bile **ad** alır; adın hangi uca, hangi yöntemle gideceğini aşağıdaki tablo söyler ve
/// tablo KODDADIR. Sunucu serbest adres verebilseydi, düzeni kaydedebilen biri bütün
/// telefonlara istediği yere istek attırabilirdi — SDUI o noktada uzaktan kod çalıştırmaya
/// dönüşürdü.
///
/// Tabloya yeni bir iş eklemek APK gerektirir. Bu bir eksiklik değil, sınırın kendisidir.
///
/// ## Tanınmayan eylem
///
/// Hiçbir şey yapmaz. Atmaz, uyarı göstermez. Eski bir APK, sonradan eklenmiş bir eylemle
/// karşılaşınca çökmemeli; düğme sessizce tepkisiz kalır.
class SduiActions {
  SduiActions._();

  /// İzinli işlemler: ad → (uç, yöntem, onay gerekli mi).
  ///
  /// Sunucudaki `API_ACTIONS` ile aynı adları taşır. İki yerde olması bilinçli: sunucu
  /// kaydetmeyi engeller (hata panelde görünür), uygulama çalıştırmayı engeller (eski bir
  /// APK, sunucuda sonradan eklenmiş bir işlemi uydurmaya çalışmaz).
  static const Map<String, ({String path, String method, bool confirm, String label})> _api = {
    'markAllRead': (path: '/api/notifications/read-all', method: 'POST', confirm: false, label: 'Tümü okundu'),
    'refreshProfile': (path: '/api/users/me', method: 'GET', confirm: false, label: 'Yenile'),
    'joinFamily': (path: '/api/families/join', method: 'POST', confirm: true, label: 'Aileye katıl'),
    'leaveFamily': (path: '/api/families/leave', method: 'POST', confirm: true, label: 'Aileden ayrıl'),
    'followHost': (path: '/api/relations/follow', method: 'POST', confirm: false, label: 'Takip et'),
    'unfollowHost': (path: '/api/relations/unfollow', method: 'POST', confirm: true, label: 'Takibi bırak'),
    'applyAgency': (path: '/api/agency-center/apply', method: 'POST', confirm: true, label: 'Ajansa başvur'),
    'claimTask': (path: '/api/tasks/claim', method: 'POST', confirm: false, label: 'Ödülü al'),
    'savePreferences': (path: '/api/users/me/preferences', method: 'PATCH', confirm: false, label: 'Kaydet'),
  };

  static bool knows(String? name) => name != null && _api.containsKey(name);

  /// Eylemi çalıştırır.
  ///
  /// [onRefresh] ekranı yeniden yükler (refresh eylemi ve api sonrası).
  /// [formData] form gönderiminde doldurulan alanlar; yoksa boş.
  static Future<void> run(
    BuildContext context,
    Map<String, dynamic>? action, {
    VoidCallback? onRefresh,
    void Function(String target)? onTab,
    Map<String, dynamic> formData = const {},
  }) async {
    if (action == null) return;
    final type = action['type'];
    if (type is! String) return;
    switch (type) {
      case 'tab':
        final t = action['target'];
        if (t is String) onTab?.call(t);

      case 'openScreen':
      case 'modal':
        // `arg` yalnızca ekranın KENDİ beklediği bir değer olabilir (ör. destek kategorisi).
        // Serbest bir yönlendirme değil: hangi ekranın arg aldığını aşağıdaki tablo bilir.
        final page = _screen(action['screen'], action['arg']);
        if (page != null && context.mounted) {
          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
        }

      case 'openActivity':
        final id = action['id'];
        if (id is String && context.mounted) await openActivity(context, id);

      case 'openChat':
        await _openChat(context, action['id']);

      case 'openUrl':
        await _openUrl(context, action);

      case 'api':
        await _runApi(context, action, formData, onRefresh);

      case 'refresh':
        onRefresh?.call();

      default:
        break; // noop ve tanınmayan tür: hiçbir şey olmaz
    }
  }

  /// Sohbeti açar.
  ///
  /// Sohbet ekranı karşı tarafın adını, rengini, seviyesini ve avatarını ister; bunlar tek
  /// bir dizeye sığmaz. Bu yüzden eylem yalnızca KİMLİK taşır, gerisi `/api/users/:id` ile
  /// çekilir — profil ekranının "Mesaj" düğmesinin zaten yaptığı şeyin aynısı. Eksik bir
  /// harita ile açsaydık sohbet başlığı boş görünürdü.
  static Future<void> _openChat(BuildContext context, dynamic rawId) async {
    final id = rawId is String ? rawId.trim() : '';
    // Bağlanmamış şablon ({id} olduğu gibi kalmışsa) ya da boş kimlik: hiçbir şey yapma.
    if (id.isEmpty || id.startsWith('{')) return;
    try {
      final p = mapOf((await Api.get('/api/users/$id'))['profile']) ?? const {};
      if (!context.mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ChatScreen(peer: {
          'id': id,
          'displayName': p['displayName'],
          'avatarUrl': p['avatarUrl'],
          'nameColor': mapOf(mapOf(p['wip'])?['features'])?['nameColor'],
          'wipLevel': mapOf(p['wip'])?['level'],
        }),
      ));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  static Future<void> _openUrl(BuildContext context, Map<String, dynamic> a) async {
    final url = a['url'];
    if (url is! String) return;
    // Sunucudan gelen adres de WebView izin listesinden geçer. Geçmezse HİÇBİR ŞEY olmaz —
    // telefonun tarayıcısına da devredilmez; devredilseydi liste SDUI üzerinden atlatılırdı.
    if (!WebViewPolicy.canLoadExternal(url)) return;
    if (a['external'] == true) {
      final u = Uri.tryParse(url);
      if (u != null) await launchUrl(u, mode: LaunchMode.externalApplication).catchError((_) => false);
      return;
    }
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FractionallySizedBox(heightFactor: 0.92, child: ExternalWebView(url: url, title: '')),
    );
  }

  static Future<void> _runApi(
    BuildContext context,
    Map<String, dynamic> a,
    Map<String, dynamic> formData,
    VoidCallback? onRefresh,
  ) async {
    final name = a['name'];
    final spec = name is String ? _api[name] : null;
    if (spec == null) return; // izinli olmayan ad: sessizce yok sayılır
    if (spec.confirm) {
      final okUser = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          content: Text('${spec.label} işlemini onaylıyor musunuz?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
            TextButton(onPressed: () => Navigator.pop(c, true), child: Text(spec.label)),
          ],
        ),
      );
      if (okUser != true) return;
    }
    final arg = a['arg'];
    // Gövde: formdan gelenler + varsa tek parametre. Sunucu bunları KENDİ doğrular;
    // buradaki form kuralları yalnızca kullanıcıya anında uyarı göstermek içindi.
    final body = <String, dynamic>{...formData, if (arg is String && arg.isNotEmpty) 'id': arg};
    try {
      switch (spec.method) {
        case 'GET':
          await Api.get(spec.path);
        case 'PATCH':
          await Api.patch(spec.path, body);
        default:
          await Api.post(spec.path, body);
      }
      onRefresh?.call();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))));
      }
    }
  }

  static Widget? _screen(dynamic name, [dynamic arg]) => switch (name) {
        'store' => const StoreScreen(),
        'wallet' => const WalletScreen(),
        'usd_wallet' => const UsdWalletScreen(),
        'leaderboards' => const LeaderboardScreen(),
        'family' => const FamilyScreen(),
        'support' => SupportChatScreen(category: arg is String && arg.isNotEmpty ? arg : null),
        // Bağlanmamış şablon ({id}) gelirse profil açılmaz: boş bir profil göstermektense
        // hiçbir şey yapmamak doğru.
        'profile' => (arg is String && arg.isNotEmpty && !arg.startsWith('{')) ? UserProfileScreen(userId: arg) : null,
        _ => null,
      };

  /// Simge adını uygulamadaki simgeye çevirir. Bilinmeyen ad varsayılanı verir — çökmez.
  static IconData icon(String? name, {IconData fallback = Icons.circle_outlined}) => switch (name) {
        'mic' => Icons.mic_none,
        'feed' => Icons.dynamic_feed_outlined,
        'video' => Icons.videocam_outlined,
        'chat' => Icons.chat_bubble_outline,
        'person' => Icons.person_outline,
        'store' => Icons.storefront_outlined,
        'wallet' => Icons.account_balance_wallet_outlined,
        'gift' => Icons.card_giftcard,
        'trophy' => Icons.emoji_events_outlined,
        'star' => Icons.star_border,
        'event' => Icons.celebration_outlined,
        'group' => Icons.groups_outlined,
        'settings' => Icons.settings_outlined,
        'help' => Icons.help_outline,
        'game' => Icons.sports_esports_outlined,
        'music' => Icons.music_note_outlined,
        'fire' => Icons.local_fire_department_outlined,
        'crown' => Icons.workspace_premium_outlined,
        'info' => Icons.info_outline,
        'warning' => Icons.warning_amber_outlined,
        'check' => Icons.check_circle_outline,
        'close' => Icons.cancel_outlined,
        'clock' => Icons.schedule,
        'lock' => Icons.lock_outline,
        'mail' => Icons.mail_outline,
        'bell' => Icons.notifications_none,
        'heart' => Icons.favorite_border,
        'search' => Icons.search,
        'edit' => Icons.edit_outlined,
        'trash' => Icons.delete_outline,
        _ => fallback,
      };

  /// Renk rolünü temaya çevirir. Serbest renk kodu kabul edilmez: sunucu okunmaz bir arayüz
  /// (siyah üstüne siyah) üretemesin ve tema tek yerden değişebilsin.
  static Color tone(String? name, {Color fallback = const Color(0xFFE6E6E6)}) => switch (name) {
        'muted' => const Color(0x99FFFFFF),
        'primary' => const Color(0xFF7DD3FC),
        'success' => const Color(0xFF4ADE80),
        'warning' => const Color(0xFFFBBF24),
        'danger' => const Color(0xFFF87171),
        'gold' => const Color(0xFFD7B56D),
        _ => fallback,
      };
}

/// Düğümden eylem haritasını okur.
Map<String, dynamic>? actionOf(SduiNode n, [String key = 'action']) => n.mapOf(key);
