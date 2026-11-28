import 'package:flutter/material.dart';
import '../hybrid/sdui/v2/sdui_screen_view.dart';
import '../l10n/l10n.dart';
import '../widgets/daily_checkin.dart';
import '../services/screen_guard.dart';
import '../services/api.dart';
import '../services/auth_service.dart';
import '../services/session.dart';
import '../services/inbox_service.dart';
import '../widgets/anim_asset.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/id_badge.dart';
import '../widgets/cp_widgets.dart';
import '../widgets/app_webview_modal.dart';
import 'dealer_center_screen.dart';
import 'family_screen.dart';
import 'social_screens.dart';
import 'store_screens.dart';
import 'income_screens.dart';
import 'login_screen.dart';
import 'misc_screens.dart';
import 'settings_screens.dart';
import 'support_screens.dart';
import 'guardian_screens.dart';
import 'user_screens.dart';
import 'wip_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  int _version = 0;

  void _reload() => setState(() => _version++);

  Future<Map<String, dynamic>> _load() async {
    // İki istek aynı anda (sırayla beklenmez).
    final dealerF = Api.get('/api/dealer/me').then((_) => true).catchError((_) => false); // bayi değilse hata döner
    final r = await Api.get('/api/me');
    final profile = mapOf(r['user']) ?? {};
    Session.me.value = profile;
    Inbox.refreshBadges();
    final dealer = await dealerF;
    return {'profile': profile, 'dealer': dealer};
  }

  Future<void> _goLogin() async {
    await AuthService.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  }

  Future<void> _changePassword() async {
    // Google/Facebook hesabının şifresi yoktur: ilk kez şifre belirlenir (mevcut şifre sorulmaz).
    final has = Session.me.value?['hasPassword'] != false;
    final current = has ? await askText(context, tx('Mevcut şifre'), obscure: true) : '';
    if (current == null || !mounted) return;
    final next = await askText(context, tx('Yeni şifre (en az 8 karakter)'), obscure: true);
    if (next == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/me/password', {'currentPassword': current, 'newPassword': next}));
    if (r != null) {
      if (mounted) toast(context, tx('Şifre değişti. Lütfen yeniden giriş yapın.'));
      await _goLogin();
    }
  }

  Future<void> _deleteAccount() async {
    if (!await confirm(context, tx('Hesabınız ve kişisel verileriniz kalıcı olarak silinir. Bu işlem geri alınamaz.'), action: tx('Devam'))) return;
    if (!mounted) return;
    final has = Session.me.value?['hasPassword'] != false;
    final answer = has ? await askText(context, tx('Onay için şifrenizi girin'), obscure: true) : await askText(context, tx('Onay için SİL yazın'));
    if (answer == null || !mounted) return;
    final r = await guard(context, () => Api.delete('/api/me', has ? {'password': answer} : {'confirm': answer}));
    if (r != null) await _goLogin();
  }

  Future<void> _open(Widget page) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    if (mounted) _reload();
  }

  /// Telefon bildirimi tercihleri (sunucuda saklanır; kapatılan tür hiç gönderilmez).
  Future<void> _notifyPrefs() async {
    final r = await guard(context, () => Api.get('/api/me/notify-prefs'));
    if (r == null || !mounted) return;
    final prefs = Map<String, dynamic>.from(mapOf(r['prefs']) ?? {});
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => StatefulBuilder(
        builder: (c, setS) {
          Widget sw(String key, String title, String sub) => SwitchListTile(
                title: Text(title),
                subtitle: Text(sub, style: const TextStyle(fontSize: 12)),
                value: prefs[key] != false,
                onChanged: (v) async {
                  setS(() => prefs[key] = v);
                  try {
                    await Api.put('/api/me/notify-prefs', {key: v});
                  } catch (e) {
                    setS(() => prefs[key] = !v);
                    if (c.mounted) toast(c, errorText(e), error: true);
                  }
                },
              );
          return SafeArea(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Padding(padding: EdgeInsets.only(bottom: 4), child: Text(tx('Bildirimler'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
              sw('friend', tx('Arkadaşlık'), tx('Arkadaşlık isteği geldiğinde ve kabul edildiğinde')),
              sw('follow', tx('Yeni takipçi'), tx('Biri seni takip etmeye başladığında')),
              sw('room', tx('Arkadaşım oda açınca'), tx('Arkadaşın oda açtığında (aynı kişiden 30 dakikada bir)')),
              Padding(
                padding: EdgeInsets.fromLTRB(16, 4, 16, 16),
                child: Text(tx('Uygulama açıkken ya da arka planda çalışırken bildirim hemen gelir; tamamen kapalıysa uygulamayı açınca gösterilir.'),
                    style: TextStyle(color: Pal.textDim, fontSize: 12)),
              ),
            ]),
          );
        },
      ),
    );
  }

  Future<void> _openSettings(Map<String, dynamic> p, bool isDealer) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SettingsScreen(
          profile: p,
          onChangePassword: _changePassword,
          onLogout: _goLogin,
          onDeleteAccount: _deleteAccount,
          onNotifyPrefs: _notifyPrefs,
        ),
      ),
    );
    if (mounted) _reload();
  }

  String? _frameOf(Map<String, dynamic> p) {
    final items = p['equipped'];
    if (items is! List) return null;
    for (final i in items) {
      if (i is Map && i['itemType'] == 'frame') return Api.absoluteUrl(i['assetUrl'] as String?);
    }
    return null;
  }

  Widget _header(Map<String, dynamic> p) {
    final frame = _frameOf(p);
    final wip = mapOf(p['wip']);
    final features = mapOf(wip?['features']);
    const avatarR = 44.0;
    const frameSize = avatarR * 2 * kFrameScale; // çerçeve, fotoğrafın çapına göre
    // Fotoğrafa / isme dokununca herkesin gördüğü (beyaz) profil sayfası açılır; düzenleme oradaki kalemle.
    return Column(children: [
      GestureDetector(
        onTap: () => _open(UserProfileScreen(userId: Session.id)),
        child: SizedBox(
        width: frameSize,
        height: frameSize,
        // Oranı büyük (kanatlı) çerçeveler kutudan taşarak çizilir.
        child: Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
          // Profil efekti (WIP 5+): avatarın arkasında ışık halesi.
          if (features?['profileEffect'] == true && wipLevelOf(wip?['level']) != null)
            Positioned.fill(child: IgnorePointer(child: WipAura(level: wipLevelOf(wip?['level'])!))),
          UserAvatar(user: p, radius: avatarR),
          // Takılı çerçeve yoksa WIP kademesinin çerçevesi.
          if (frame == null && wipLevelOf(wip?['level']) != null)
            Positioned.fill(child: IgnorePointer(child: WipFrame(level: wipLevelOf(wip?['level'])!, avatarRadius: avatarR))),
          if (frame != null) FrameBox(url: frame, avatarRadius: avatarR),
        ]),
      ),
      ),
      UserName(
        user: {'displayName': p['displayName'], 'wipLevel': wip?['level'], 'nameColor': features?['nameColor']},
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
      ),
      if (p['hostBadge'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: HostBadgeChip(badge: p['hostBadge']?.toString(), height: 19)),
      const SizedBox(height: 2),
      // Özel ID varsa süslü kapsül; WIP'li kişide ID de adı gibi renkli.
      IdBadge(
        user: {'publicId': p['publicId'], 'specialId': p['specialId'], 'idColor': p['idColor'], 'wipLevel': wip?['level'], 'nameColor': features?['nameColor']},
        fontSize: 12.5,
        color: Pal.textDim,
      ),
    ]);
  }

  Widget _statsRow(Map<String, dynamic> p) {
    return ValueListenableBuilder<Map<String, int>>(
      valueListenable: Inbox.badges,
      builder: (context, b, _) {
        Widget stat(String label, dynamic value, int badge, VoidCallback onTap) => Expanded(
              child: InkWell(
                onTap: onTap,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(children: [
                    FittedBox(fit: BoxFit.scaleDown, child: Text(label, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.3, color: Pal.textDim))),
                    const SizedBox(height: 4),
                    Badge(
                      label: Text('$badge'),
                      isLabelVisible: badge > 0,
                      alignment: Alignment.topRight,
                      offset: const Offset(10, -8),
                      child: Text(fmtNumber(value), style: const TextStyle(color: Pal.cyan, fontSize: 15, fontWeight: FontWeight.w700)),
                    ),
                  ]),
                ),
              ),
            );
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Pal.outline)),
          child: Row(children: [
            // Dört liste tek sayfada; yana kaydırarak aralarında geçilir.
            stat(tx('TAKİP EDİLEN'), p['following'], 0, () => _open(SocialListsScreen(userId: '${p['id']}', initialTab: 0))),
            stat(tx('FANLAR'), p['followers'], b['followers'] ?? 0, () => _open(SocialListsScreen(userId: '${p['id']}', initialTab: 1))),
            stat(tx('ZİYARETÇİLER'), p['visitorCount'], b['visitors'] ?? 0, () => _open(SocialListsScreen(userId: '${p['id']}', initialTab: 2))),
            stat(tx('ARKADAŞLAR'), p['friends'], b['friends'] ?? 0, () => _open(SocialListsScreen(userId: '${p['id']}', initialTab: 3))),
          ]),
        );
      },
    );
  }

  Widget _moneyCards(Map<String, dynamic> p) {
    Widget card(List<Color> colors, Widget icon, dynamic value, String label, Color textColor, VoidCallback onTap) => Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onTap,
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), gradient: LinearGradient(colors: colors)),
              child: Row(children: [
                icon,
                const SizedBox(width: 10),
                Expanded(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    FittedBox(fit: BoxFit.scaleDown, child: Text(fmtNumber(value), style: TextStyle(color: textColor, fontSize: 15, fontWeight: FontWeight.w800))),
                    FittedBox(fit: BoxFit.scaleDown, child: Text(label, style: TextStyle(color: textColor, fontSize: 11.5, fontWeight: FontWeight.w600))),
                  ]),
                ),
                Icon(Icons.chevron_right, color: textColor),
              ]),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 0),
      child: Row(children: [
        card(const [Color(0xFFFFE259), Color(0xFFFFC107)], const Icon(Icons.monetization_on, color: Color(0xFFB26A00), size: 34), p['coins'], 'Coins', const Color(0xFF3B2A00), () => _open(const WalletScreen())),
        const SizedBox(width: 10),
        card(const [Color(0xFF3A2E14), Color(0xFF6B5320)], const Icon(Icons.diamond, color: Colors.cyanAccent, size: 32), p['diamonds'], tx('Gelir Merkezi'), Colors.white, () => _open(const IncomeCenterScreen())),
      ]),
    );
  }

  Widget _quickTiles(Map<String, dynamic> p) {
    final wip = mapOf(p['wip']);
    Widget tile(IconData icon, Color color, String label, VoidCallback onTap, {int badge = 0}) => Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Badge(
                  isLabelVisible: badge > 0,
                  label: Text(badge > 99 ? '99+' : '$badge'),
                  offset: const Offset(2, -2),
                  child: Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [color.withValues(alpha: 0.35), color.withValues(alpha: 0.08)])),
                    child: Icon(icon, size: 26, color: color),
                  ),
                ),
                const SizedBox(height: 5),
                Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11.5, color: Pal.text)),
              ]),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      child: Row(children: [
        tile(Icons.military_tech, Colors.amber, 'Leveller', () => _open(const LevelsScreen())),
        // Aileme katılma isteği geldiyse (yönetici) kırmızı rozet.
        ValueListenableBuilder<Map<String, int>>(
          valueListenable: Inbox.badges,
          builder: (_, b, __) => tile(Icons.groups, Colors.orangeAccent, tx('Aile'), () => _open(const FamilyScreen()), badge: b['family'] ?? 0),
        ),
        tile(Icons.workspace_premium, Pal.cyan, wip == null ? 'WIP' : wipLabel(wipLevelOf(wip['level'])), () => _open(const WipScreen())),
        tile(Icons.checkroom, Pal.cyan, tx('Görünüm'), () => _open(const AppearanceScreen())),
      ]),
    );
  }

  Widget _menu(Map<String, dynamic> p, bool isDealer) {
    final agencyOwned = mapOf(p['agencyOwned']);
    final agencyAssistant = mapOf(p['agencyAssistant']);
    final broadcasterStatus = p['broadcasterStatus']?.toString();
    final isBroadcaster = broadcasterStatus == 'approved';
    Widget row(IconData icon, Color color, String title, VoidCallback onTap, {String? sub}) => ListTile(
          leading: Container(width: 36, height: 36, decoration: BoxDecoration(color: color.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(10)), child: Icon(icon, color: color, size: 20)),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
          subtitle: sub == null ? null : Text(sub, style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
          dense: true,
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        );
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Pal.outline)),
      child: Column(children: [
        row(Icons.storefront, Colors.orangeAccent, tx('Mağaza'), () => _open(const StoreScreen())),
        // Yayıncı Merkezi: yalnızca ajans davetini kabul etmiş (onaylı) yayıncılar. Başvuru yok; davet Mesajlar'a düşer.
        if (isBroadcaster) row(Icons.podcasts, Pal.cyan, tx('Yayıncı Merkezi'), () => _open(hostCenterPage())),
        // Ajans Merkezi: yalnızca ajans sahibi (ajansı yönetici açar). Ajans sahibi aynı zamanda yayıncı da olabilir.
        if (agencyOwned != null)
          row(Icons.business, Pal.cyan, tx('Ajans Merkezi'), () => _open(agencyCenterPage()),
              sub: '${agencyOwned['name']} · ${const {'pending': 'İnceleniyor', 'active': 'Aktif', 'suspended': 'Askıda', 'rejected': 'Reddedildi'}[agencyOwned['status']] ?? agencyOwned['status']}')
        else if (agencyAssistant != null)
          row(Icons.support_agent, Pal.cyan, tx('Ajans Merkezi'), () => _open(agencyCenterPage()), sub: '${agencyAssistant['agencyName']} · ${tx('Asistan')}'),
        // Coins Bayisi Merkezi (Yoho "Coins bayim"): yalnızca aktif bayi.
        if (isDealer) row(Icons.monetization_on, Pal.gold, tx('Coins Bayisi Merkezi'), () => _open(const DealerCenterScreen()), sub: tx('Kullanıcılara Coin yükle, stok ve satış verileri')),
        row(Icons.shield_outlined, const Color(0xFFFF4FA8), tx('Koruyuculuğum'), () => _open(MyGuardianScreen(profileBuilder: (id) => UserProfileScreen(userId: id))), sub: tx('Koruyucuların ve koruduğun kişiler')),
        row(Icons.event_available, Pal.gold, tx('Günlük Giriş'), () => showCheckinDialog(context)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) => SecureScreen(child: ScreenTag(screen: 'profile', child: _guardedBuild(context)));

  Widget _guardedBuild(BuildContext context) {
    return AsyncBody<Map<String, dynamic>>(
      version: _version,
      load: _load,
      builder: (context, data, reload) {
        final p = mapOf(data['profile']) ?? {};
        final isDealer = data['dealer'] == true;
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
            // Üst çubuk zaten durum çubuğunu karşılıyor: burada ikinci bir SafeArea boşluğu yok.
            // Müşteri hizmetleri ve düzenle simgeleri çerçevenin sağ üstüne biner (yer kaplamaz).
            Stack(children: [
              Padding(padding: const EdgeInsets.only(top: 6), child: Center(child: _header(p))),
              Positioned(
                top: 0,
                right: 4,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  IconButton(tooltip: tx('Müşteri hizmetleri'), icon: const Icon(Icons.headset_mic_outlined, size: 22), onPressed: () => _open(const CustomerServiceScreen())),
                  IconButton(tooltip: tx('Profilim'), icon: const Icon(Icons.account_circle_outlined, size: 23), onPressed: () => _open(UserProfileScreen(userId: Session.id))),
                ]),
              ),
            ]),
            _statsRow(p),
            // CP eşi (onaylı CP ilişkisi varsa).
            if (mapOf(p['cp'])?['partner'] != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                child: CpPartnerCard(
                  cp: mapOf(p['cp'])!,
                  onTap: () {
                    final id = mapOf(mapOf(p['cp'])?['partner'])?['id']?.toString();
                    if (id != null) _open(UserProfileScreen(userId: id));
                  },
                ),
              ),
            _moneyCards(p),
            _quickTiles(p),
            SduiScreenView.slot('profile_sections'), // panelden bölüm/duyuru (yayın yoksa görünmez)
            _menu(p, isDealer),
            Container(
              margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
              decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Pal.outline)),
              child: ListTile(
                dense: true,
                leading: Container(width: 36, height: 36, decoration: BoxDecoration(color: Pal.cyan.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.settings, color: Pal.cyan, size: 20)),
                title: Text(tx('Ayarlar'), style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _openSettings(p, isDealer),
              ),
            ),
          ]),
        );
      },
    );
  }
}
