import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../screens/family_screen.dart';
import '../../../screens/leaderboard_screen.dart';
import '../../../screens/misc_screens.dart';
import '../../../screens/store_screens.dart';
import '../../../screens/usd_wallet_screen.dart';
import '../../../widgets/external_webview.dart';
import '../../webview/navigation_policy.dart';
import '../schema/sdui_schema.dart';

/// SDUI eyleminin uygulamadaki karşılığını çalıştırır.
///
/// ## Buradaki tek yetki: var olanı açmak
///
/// Her dal, uygulamanın zaten yaptığı bir şeyi çağırır. Sunucu yeni bir davranış **tanımlayamaz**,
/// yalnızca mevcutlara işaret eder. SDUI'nin uzaktan kod çalıştırmaya dönüşmemesi buna bağlı.
///
/// ## openUrl ve WebView izin listesi
///
/// Adres, v2.139.0'da kurduğumuz aynı denetimden geçer. Geçmezse **hiçbir şey olmaz** —
/// telefonun tarayıcısına da devredilmez. Çünkü burada adresi yönetici değil, sunucudan gelen
/// bir düzen veriyor: izin listesinde olmayan bir adrese kullanıcıyı göndermek, listeyi
/// SDUI üzerinden atlatmak olurdu.
class SduiActionResolver {
  SduiActionResolver._();

  /// [onTab] sekme değiştirme işlevi (ana ekran verir). Null ise sekme eylemleri yok sayılır.
  static Future<void> run(
    BuildContext context,
    SduiAction a, {
    void Function(String target)? onTab,
  }) async {
    switch (a.type) {
      case 'tab':
        if (a.target != null) onTab?.call(a.target!);

      case 'openScreen':
        final page = _screen(a.screen);
        if (page != null && context.mounted) {
          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
        }

      case 'openActivity':
        if (a.id != null && context.mounted) await openActivity(context, a.id!);

      case 'openUrl':
        final url = a.url;
        if (url == null) return;
        // Sunucudan gelen adres de izin listesinden geçer.
        if (!WebViewPolicy.canLoadExternal(url)) return;
        if (a.external) {
          final u = Uri.tryParse(url);
          if (u != null) await launchUrl(u, mode: LaunchMode.externalApplication).catchError((_) => false);
        } else if (context.mounted) {
          await showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => FractionallySizedBox(
              heightFactor: 0.92,
              child: ExternalWebView(url: url, title: ''),
            ),
          );
        }

      default:
        break; // noop ve tanınmayan tür: hiçbir şey yapılmaz
    }
  }

  static Widget? _screen(String? name) => switch (name) {
        'store' => const StoreScreen(),
        'wallet' => const WalletScreen(),
        'usd_wallet' => const UsdWalletScreen(),
        'leaderboards' => const LeaderboardScreen(),
        'family' => const FamilyScreen(),
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
        _ => fallback,
      };
}
