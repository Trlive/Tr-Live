import 'package:flutter/material.dart';
import '../l10n/l10n.dart';
import 'package:flutter/services.dart';
import '../services/api.dart';
import '../services/beauty.dart';
import '../services/effect_prefs.dart';
import '../services/session.dart';
import '../services/phone_verify.dart';
import 'verify_screens.dart';
import '../services/room_dock.dart';
import '../version.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import 'edit_profile_screen.dart';
import 'legal_screens.dart';
import 'misc_screens.dart';
import 'support_screens.dart';
import 'wip_screen.dart';

// ---------- Ortak parçalar (koyu tema, renkli simgeler) ----------

/// Yuvarlak köşeli grup kartı; satırların arasında ince çizgi.
Widget _group(List<Widget> rows) {
  final children = <Widget>[];
  for (var i = 0; i < rows.length; i++) {
    if (i > 0) children.add(const Divider(height: 1, thickness: 0.6, indent: 58, color: Color(0x22FFFFFF)));
    children.add(rows[i]);
  }
  return Container(
    margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: Pal.surface,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Pal.outline.withValues(alpha: 0.55)),
    ),
    child: Column(children: children),
  );
}

/// Ayar satırı: renkli simge, başlık, sağda değer (isteğe bağlı) ve ok.
Widget _row(IconData icon, Color color, String title, {String? value, Color? valueColor, VoidCallback? onTap, bool chevron = true}) {
  return InkWell(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      child: Row(children: [
        Icon(icon, color: color, size: 26),
        const SizedBox(width: 16),
        Expanded(child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Pal.text))),
        if (value != null) ...[
          Flexible(
            child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.end, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: valueColor ?? Pal.textDim)),
          ),
          const SizedBox(width: 6),
        ],
        if (chevron) const Icon(Icons.chevron_right, color: Pal.textDim),
      ]),
    ),
  );
}

PreferredSizeWidget _bar(String title) => AppBar(backgroundColor: Pal.bg, title: Text(tx(title)));

// Simge renkleri (görseldeki gibi canlı).
const _cBlue = Color(0xFF2E9BFF);
const _cOrange = Color(0xFFFFA726);
const _cPink = Color(0xFFFF5C8A);
const _cGreen = Color(0xFF22C55E);
const _cSky = Color(0xFF29B6F6);
const _cAmber = Color(0xFFFFB300);
const _cCyan = Color(0xFF00BCD4);
const _cViolet = Color(0xFFA78BFA);
const _cRed = Color(0xFFFF4D4F);

/// Hesap güvenlik düzeyi: şifre, telefon numarası ve kimlik doğrulaması.
(String, Color, int) securityLevel(Map<String, dynamic> p) {
  var score = 0;
  if (p['hasPassword'] != false) score++;
  if ('${p['phone'] ?? ''}'.isNotEmpty) score++;
  if (p['kycStatus'] == 'approved') score++;
  if (score >= 3) return (tx('Yüksek'), _cGreen, score);
  if (score == 2) return (tx('Orta'), _cAmber, score);
  return (tx('Düşük'), _cRed, score);
}

// ---------- Ayarlar ----------

/// Profil → Ayarlar. Şifre, çıkış, hesap silme ve bildirim tercihleri profil ekranındaki işlemleri kullanır.
class SettingsScreen extends StatefulWidget {
  final Map<String, dynamic> profile;
  final Future<void> Function() onChangePassword;
  final Future<void> Function() onLogout;
  final Future<void> Function() onDeleteAccount;
  final Future<void> Function() onNotifyPrefs;
  const SettingsScreen({
    super.key,
    required this.profile,
    required this.onChangePassword,
    required this.onLogout,
    required this.onDeleteAccount,
    required this.onNotifyPrefs,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Map<String, dynamic> get p => widget.profile;

  Future<void> _push(Widget page) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    if (mounted) setState(() {});
  }

  /// Dil seçimi (Türkçe / English). İlk açılışta telefonun diline göre seçilir; değişince uygulama yeni dille açılır.
  Future<void> _language() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Pal.surface,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.only(bottom: 4), child: Text(tx('Dil'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          for (final code in L10n.supported)
            ListTile(
              leading: Text(L10n.flags[code]!, style: const TextStyle(fontSize: 22)),
              title: Text(L10n.names[code]!, style: const TextStyle(fontWeight: FontWeight.w700)),
              trailing: L10n.lang.value == code ? const Icon(Icons.check_circle, color: Pal.cyan) : null,
              onTap: () => Navigator.pop(c, code),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            child: Text(tx('Dil seçmezsen telefonunun dili kullanılır; uygulamada yoksa bölgenin dili.'), style: const TextStyle(color: Pal.textDim, fontSize: 12)),
          ),
        ]),
      ),
    );
    if (picked == null || picked == L10n.lang.value || !mounted) return;
    // Dil değişince uygulama baştan çizilir: açık oda varsa kapanır.
    if (RoomDock.isOpen) {
      if (!await confirm(context, tx('Dil değişince uygulama yeniden açılır ve bulunduğun odadan çıkarsın. Devam edilsin mi?'), action: tx('Devam'))) return;
      // Oda ekranı kapanınca "odadan ayrıl" isteğini kendisi gönderir; ardından uygulama yeni dille çizilir.
      RoomDock.close();
      await Future<void>.delayed(const Duration(milliseconds: 300));
    }
    await L10n.set(picked);
    // Sunucu da bilsin (bildirim metinleri vb. için); bağlantı yoksa önemli değil.
    Api.patch('/api/me', {'language': picked}).catchError((_) => <String, dynamic>{});
  }

  Future<void> _share() async {
    String? url;
    try {
      url = (await Api.get('/api/app/config'))['updateUrl'] as String?;
    } catch (_) {/* bağlantı yoksa adres olmadan */}
    final id = (p['specialId'] ?? p['publicId'] ?? '').toString();
    final text = [
      tx('🎙 TR Live\'da sesli sohbet odalarında buluşalım!'),
      if (id.isNotEmpty) tx('Beni bul: ID {id}', {'id': id}),
      if (url != null && url.isNotEmpty) url,
    ].join('\n');
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) toast(context, tx('Davet metni kopyalandı. İstediğin yere yapıştırıp paylaş.'));
  }

  Future<void> _powerSave(bool on) async {
    await EffectPrefs.setPowerSave(on);
    await Beauty.update(Beauty.settings.value, save: false); // pürüzsüzleştirme hemen kapanır / açılır
    if (mounted) toast(context, on ? tx('Şarj tüketimi azaltıldı. Görüntülü odada kamera bir sonraki girişte 360p yayınlar.') : tx('Şarj tüketimi modu kapatıldı.'));
  }

  @override
  Widget build(BuildContext context) {
    final sec = securityLevel(p);
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: _bar('Ayarlar'),
      body: ListView(padding: const EdgeInsets.only(bottom: 28), children: [
        _group([
          _row(Icons.verified_user_outlined, _cBlue, tx('Hesap & Güvenlik'), value: sec.$1, valueColor: sec.$2, onTap: () => _push(AccountSecurityScreen(profile: p, onChangePassword: widget.onChangePassword, onDeleteAccount: widget.onDeleteAccount))),
          _row(Icons.lock_outline_rounded, _cOrange, tx('Gizlilik'), onTap: () => _push(PrivacyScreen(profile: p))),
          _row(Icons.notifications_none_rounded, _cPink, tx('Bildirimler'), onTap: widget.onNotifyPrefs),
          _row(Icons.language_rounded, _cGreen, tx('Dil'), value: L10n.names[L10n.lang.value], onTap: _language),
          _row(Icons.share_outlined, _cSky, tx('Paylaş'), onTap: _share),
        ]),
        _group([
          _row(Icons.help_outline_rounded, _cAmber, tx('Yardım'), onTap: () => _push(const CustomerServiceScreen())),
          _row(Icons.mail_outline_rounded, _cSky, tx('Geri bildirim'), onTap: () => _push(const SupportChatScreen(category: 'Diğer'))),
          _row(Icons.gavel_rounded, _cViolet, tx('Sözleşmeler ve politikalar'), onTap: () => _push(const LegalHubScreen())),
          _row(Icons.sentiment_satisfied_alt_rounded, _cGreen, tx('Hakkında'), value: 'v$kAppVersion', onTap: () => _push(const AboutScreen())),
          _row(Icons.swap_horiz_rounded, _cCyan, tx('Takas'), value: tx('Cüzdan · Elmas'), onTap: () => _push(const WalletScreen())),
        ]),
        _group([
          // Şarj tüketimi: animasyonlar kısılır, kamera 360p, güzellik pürüzsüzleştirmesi kapalı.
          ValueListenableBuilder<bool>(
            valueListenable: EffectPrefs.powerSave,
            builder: (context, on, _) => InkWell(
              onTap: () => _powerSave(!on),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
                child: Row(children: [
                  const Icon(Icons.speed_rounded, color: _cViolet, size: 26),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(tx('Şarj Tüketimi'), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Pal.text)),
                      SizedBox(height: 3),
                      Text(tx('Isınmayı ve şarj tüketimini azaltır'), style: TextStyle(fontSize: 12.5, color: Pal.textDim)),
                    ]),
                  ),
                  Switch(value: on, onChanged: _powerSave),
                ]),
              ),
            ),
          ),
        ]),
        const SizedBox(height: 12),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 12),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Pal.outline.withValues(alpha: 0.55))),
          child: InkWell(
            onTap: widget.onLogout,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              child: Row(children: [
                Icon(Icons.logout_rounded, color: _cRed, size: 26),
                SizedBox(width: 16),
                Text(tx('Oturumu kapat'), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _cRed)),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

// ---------- Hesap & Güvenlik ----------

class AccountSecurityScreen extends StatefulWidget {
  final Map<String, dynamic> profile;
  final Future<void> Function() onChangePassword;
  final Future<void> Function() onDeleteAccount;
  const AccountSecurityScreen({super.key, required this.profile, required this.onChangePassword, required this.onDeleteAccount});

  @override
  State<AccountSecurityScreen> createState() => _AccountSecurityScreenState();
}

class _AccountSecurityScreenState extends State<AccountSecurityScreen> {
  Map<String, dynamic> get p => widget.profile;
  bool _phoneOn = false; // sunucuda SMS doğrulaması (Firebase) açık mı
  bool _emailOn = false; // sunucuda e-posta gönderimi açık mı

  @override
  void initState() {
    super.initState();
    Verify.phoneOn().then((v) {
      if (mounted) setState(() => _phoneOn = v);
    });
    Verify.emailOn().then((v) {
      if (mounted) setState(() => _emailOn = v);
    });
  }

  /// Doğrulama sonrası güncel telefon / e-posta bilgisini oturumdan alır.
  void _syncFromSession() {
    final me = Session.me.value ?? const {};
    setState(() {
      for (final k in const ['phone', 'phoneVerified', 'email', 'emailVerified']) {
        p[k] = me[k];
      }
    });
  }

  Future<void> _linkPhone() async {
    if (await linkPhone(context) && mounted) _syncFromSession();
  }

  Future<void> _email() async {
    final ok = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => EmailVerifyScreen(current: p['email']?.toString())));
    if (ok == true && mounted) _syncFromSession();
  }

  Future<void> _kyc() async {
    final r = await guard(context, () => Api.post('/api/me/kyc/request'));
    if (r == null || !mounted) return;
    setState(() => p['kycStatus'] = 'pending');
    toast(context, tx('Kimlik doğrulama başvurun alındı.'));
  }

  Widget _check(bool ok, String title, String detail, {String? action, VoidCallback? onAction}) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(children: [
          Icon(ok ? Icons.check_circle_rounded : Icons.error_outline_rounded, color: ok ? _cGreen : _cOrange, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tx(title), style: const TextStyle(fontWeight: FontWeight.w700, color: Pal.text)),
              Text(detail, style: const TextStyle(fontSize: 12, color: Pal.textDim)),
            ]),
          ),
          if (action != null) TextButton(onPressed: onAction, child: Text(action)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final sec = securityLevel(p);
    final hasPassword = p['hasPassword'] != false;
    final phone = '${p['phone'] ?? ''}';
    final phoneVerified = p['phoneVerified'] == true;
    final email = '${p['email'] ?? ''}';
    final emailVerified = p['emailVerified'] == true;
    final kyc = (p['kycStatus'] ?? 'none').toString();
    const kycText = {'none': 'Doğrulanmadı', 'pending': 'İnceleniyor', 'approved': 'Onaylı', 'rejected': 'Reddedildi'};
    final masked = phone.length > 4 ? '${'•' * (phone.length - 4)}${phone.substring(phone.length - 4)}' : phone;
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: _bar('Hesap & Güvenlik'),
      body: ListView(padding: const EdgeInsets.only(bottom: 28), children: [
        Container(
          margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(colors: [sec.$2.withValues(alpha: 0.28), Pal.surface], begin: Alignment.topLeft, end: Alignment.bottomRight),
            border: Border.all(color: sec.$2.withValues(alpha: 0.55)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
              child: Row(children: [
                Icon(Icons.shield_rounded, color: sec.$2, size: 34),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tx('Hesap güvenliği'), style: TextStyle(color: Pal.textDim, fontSize: 12)),
                    Text(sec.$1, style: TextStyle(color: sec.$2, fontSize: 22, fontWeight: FontWeight.w900)),
                  ]),
                ),
                Text('${sec.$3}/3', style: const TextStyle(color: Pal.textDim, fontWeight: FontWeight.w700)),
              ]),
            ),
            _check(hasPassword, 'Şifre', hasPassword ? tx('Belirlendi') : tx('Belirlenmedi (Google/Facebook hesabı)'), action: hasPassword ? null : tx('Belirle'), onAction: widget.onChangePassword),
            _check(
              phone.isNotEmpty && phoneVerified,
              'Telefon numarası',
              phone.isEmpty ? tx('Bağlı değil') : (phoneVerified ? masked : '$masked · ${tx('Doğrulanmadı')}'),
              action: _phoneOn && (phone.isEmpty || !phoneVerified) ? (phone.isEmpty ? tx('Bağla') : tx('Doğrula')) : (_phoneOn && phone.isNotEmpty ? tx('Değiştir') : null),
              onAction: _linkPhone,
            ),
            _check(
              email.isNotEmpty && emailVerified,
              'E-posta',
              email.isEmpty ? tx('Eklenmedi') : (emailVerified ? email : '$email · ${tx('Doğrulanmadı')}'),
              action: _emailOn ? (email.isEmpty ? tx('Ekle') : (emailVerified ? tx('Değiştir') : tx('Doğrula'))) : null,
              onAction: _email,
            ),
            _check(kyc == 'approved', 'Kimlik doğrulama', tx(kycText[kyc] ?? kyc), action: kyc == 'none' || kyc == 'rejected' ? tx('Başvur') : null, onAction: _kyc),
            const SizedBox(height: 6),
          ]),
        ),
        _group([
          _row(Icons.edit_outlined, _cBlue, tx('Profili düzenle'), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EditProfileScreen()))),
          _row(Icons.lock_reset_rounded, _cOrange, hasPassword ? tx('Şifre değiştir') : tx('Şifre belirle'), onTap: widget.onChangePassword),
          _row(Icons.devices_rounded, _cSky, tx('Oturumlarım'), value: tx('Cihazlar'), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SessionsScreen()))),
        ]),
        _group([
          // Önce neler silinir / saklanır bilgisi, sonra onay.
          _row(Icons.delete_forever_rounded, _cRed, tx('Hesabı sil'),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AccountDeletionInfoScreen(onDelete: widget.onDeleteAccount)))),
        ]),
      ]),
    );
  }
}

// ---------- Gizlilik ----------

/// Gizlilik: mesaj izni, engellenenler ve WIP ayrıcalığıyla açılan gizlilik anahtarları (hangi kademede açıldığı yazar).
class PrivacyScreen extends StatefulWidget {
  final Map<String, dynamic> profile;
  const PrivacyScreen({super.key, required this.profile});

  @override
  State<PrivacyScreen> createState() => _PrivacyScreenState();
}

class _PrivacyScreenState extends State<PrivacyScreen> {
  Map<String, dynamic> get p => widget.profile;

  /// Ayrıcalık → açıldığı en düşük kademe (sunucudaki WIP tablosundan; yönetim değiştirebilir).
  Map<String, int> _minLevel = const {'hideCountry': 4, 'hideOnline': 4, 'invisibleVisit': 7, 'hiddenUser': 10, 'ghostMode': kSwipLevel};
  final Set<String> _busy = {};

  static const _whoText = {'everyone': 'Herkes', 'following': 'Takip ettiklerim', 'nobody': 'Hiç kimse'};

  @override
  void initState() {
    super.initState();
    _loadLevels();
  }

  Future<void> _loadLevels() async {
    try {
      final tiers = listOf((await Api.get('/api/wip/tiers'))['tiers']);
      final out = <String, int>{};
      for (final key in _minLevel.keys) {
        int? best;
        for (final t in tiers) {
          final lvl = wipLevelOf(t['level']);
          if (lvl == null || mapOf(t['features'])?[key] != true) continue;
          if (best == null || lvl < best) best = lvl;
        }
        if (best != null) out[key] = best;
      }
      if (mounted && out.isNotEmpty) setState(() => _minLevel = {..._minLevel, ...out});
    } catch (_) {/* varsayılan kademeler gösterilir */}
  }

  // Yöneticiler gizlilik ayarlarını üyeliksiz kullanabilir; hayalet mod ise yalnızca SWIP ile çalışır.
  bool _allowed(String feature) =>
      (p['systemRole'] == 'admin' && feature != 'ghostMode') || mapOf(mapOf(p['wip'])?['features'])?[feature] == true;

  String _tier(String feature) {
    final l = _minLevel[feature];
    return l == null ? 'WIP' : wipLabel(l);
  }

  Future<void> _locked(String feature) async {
    final ok = await confirm(context, tx('Bu ayar {tier} ve üzeri üyelere özel bir ayrıcalıktır.', {'tier': _tier(feature)}), action: tx('WIP\'e göz at'));
    if (ok && mounted) await Navigator.push(context, MaterialPageRoute(builder: (_) => const WipScreen()));
  }

  /// [key]: hangi anahtarın beklediği, [body]: PATCH /api/me gövdesi. Sunucu reddederse anahtar eski hâlinde kalır.
  Future<void> _patch(String key, Map<String, dynamic> body, {String? doneOn, String? doneOff, bool on = true}) async {
    if (_busy.contains(key)) return;
    setState(() => _busy.add(key));
    final r = await guard(context, () => Api.patch('/api/me', body));
    if (!mounted) return;
    setState(() => _busy.remove(key));
    if (r == null) return;
    final me = mapOf(r['user']);
    if (me != null) {
      Session.me.value = me;
      for (final k in body.keys) {
        p[k] = me[k] ?? body[k];
      }
      p['ghostActive'] = me['ghostActive'] ?? p['ghostActive'];
      if (body.containsKey('isHidden')) p['hiddenId'] = me['hiddenId'];
    } else {
      p.addAll(body);
    }
    setState(() {});
    final msg = on ? doneOn : doneOff;
    if (msg != null) toast(context, tx(msg));
  }

  Future<void> _who() async {
    final cur = (p['whoCanDm'] ?? 'everyone').toString();
    final pick = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Pal.surface,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: EdgeInsets.only(bottom: 4), child: Text(tx('Bana kimler mesaj gönderebilir?'), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
          for (final e in _whoText.entries)
            ListTile(
              title: Text(tx(e.value), style: const TextStyle(fontWeight: FontWeight.w700)),
              trailing: e.key == cur ? const Icon(Icons.check_circle, color: _cGreen) : null,
              onTap: () => Navigator.pop(c, e.key),
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (pick == null || pick == cur || !mounted) return;
    await _patch('who', {'whoCanDm': pick});
  }

  /// Görseldeki gibi: başlık + anahtar, altında açıklama ve gereken kademe. Ayrıcalık yoksa kilit simgesi.
  Widget _toggle({
    required String key,
    required String feature,
    required String title,
    required String desc,
    required bool value,
    required Future<void> Function(bool v) onChanged,
  }) {
    final allowed = _allowed(feature);
    final busy = _busy.contains(key);
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Pal.outline.withValues(alpha: 0.55))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
          child: Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Pal.text))),
            if (!allowed) const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.lock_rounded, size: 18, color: Pal.textDim)),
            busy
                ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
                : Switch(
                    value: allowed && value,
                    activeThumbColor: Colors.white,
                    activeTrackColor: _cGreen,
                    onChanged: (v) {
                      if (v && !allowed) {
                        _locked(feature);
                        return;
                      }
                      onChanged(v);
                    },
                  ),
          ]),
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          decoration: const BoxDecoration(color: Color(0x0FFFFFFF), borderRadius: BorderRadius.vertical(bottom: Radius.circular(16))),
          child: Text.rich(
            TextSpan(children: [
              TextSpan(text: '$desc '),
              TextSpan(text: tx('({tier} ayrıcalığı)', {'tier': _tier(feature)}), style: const TextStyle(color: Pal.cyan, fontWeight: FontWeight.w700)),
            ]),
            style: const TextStyle(fontSize: 12.5, color: Pal.textDim, height: 1.35),
          ),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final who = (p['whoCanDm'] ?? 'everyone').toString();
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: _bar('Gizlilik'),
      body: ListView(padding: const EdgeInsets.only(bottom: 28), children: [
        _group([
          _row(Icons.forum_outlined, _cSky, tx('İletişim izni'), value: tx(_whoText[who] ?? 'Herkes'), onTap: _who),
          _row(Icons.block_rounded, _cRed, tx('Engellenen kullanıcılar'), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BlockedUsersScreen()))),
        ]),
        Padding(
          padding: EdgeInsets.fromLTRB(18, 6, 18, 0),
          child: Text(tx('İletişim izni: sana kimlerin özel mesaj gönderebileceği.'), style: TextStyle(fontSize: 12, color: Pal.textDim)),
        ),
        _toggle(
          key: 'country',
          feature: 'hideCountry',
          title: tx('Ülke/Bölgeyi gizle'),
          desc: tx('Etkinleştirildiğinde profilinde ülken ve şehrin başkalarına "Bilinmiyor" olarak görünür.'),
          value: p['hideCountry'] == true,
          onChanged: (v) => _patch('country', {'hideCountry': v}, on: v),
        ),
        _toggle(
          key: 'online',
          feature: 'hideOnline',
          title: tx('Çevrimiçi saati gizle'),
          desc: tx('Etkinleştirildiğinde kimse çevrimiçi olduğunu ve son görülme zamanını göremez; yeşil nokta görünmez.'),
          value: p['showPresence'] == false,
          onChanged: (v) => _patch('online', {'showPresence': !v}, on: v),
        ),
        _toggle(
          key: 'visits',
          feature: 'invisibleVisit',
          title: tx('Görüntüleme geçmişini gizle'),
          desc: tx('Etkinleştirildiğinde başkalarının profiline girdiğinde ziyaretçi listelerinde görünmezsin.'),
          value: p['hideVisits'] != false,
          onChanged: (v) => _patch('visits', {'hideVisits': v}, on: v),
        ),
        _toggle(
          key: 'hidden',
          feature: 'hiddenUser',
          title: tx('Gizli kullanıcı'),
          desc: tx('Etkinleştirildiğinde odalarda, sohbette ve listelerde "Gizli Kullanıcı" olarak görünürsün: sana her açışta yeni bir '
                  'gizli ID verilir, sana dokunan profilini göremez, aramada çıkmazsın. Odadayken açılıp kapatılamaz; önce odadan çık.') +
              (p['isHidden'] == true && '${p['hiddenId'] ?? ''}'.isNotEmpty ? '\n${tx('Şu anki gizli ID\'n: {id}', {'id': p['hiddenId']})}' : ''),
          value: p['isHidden'] == true,
          onChanged: (v) => _patch('hidden', {'isHidden': v},
              on: v, doneOn: 'Gizli kullanıcı açık: odalarda ve listelerde "Gizli Kullanıcı" ve gizli ID\'nle görünürsün.', doneOff: 'Gizli kullanıcı kapandı.'),
        ),
        _toggle(
          key: 'ghost',
          feature: 'ghostMode',
          title: tx('Hayalet mod 👻'),
          desc: tx('Etkinleştirildiğinde odaya girişin duyurulmaz; dinleyici listesinde, kişi sayısında ve çevrimiçi listelerde görünmezsin (mikrofona çıkınca görünürsün).'),
          value: p['ghostMode'] == true,
          onChanged: (v) => _patch('ghost', {'ghostMode': v}, on: v, doneOn: '👻 Hayalet mod açık.', doneOff: 'Hayalet mod kapandı.'),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(18, 14, 18, 0),
          child: Text(tx('WIP üyeliğin bitince bu ayrıcalıklarla açtığın ayarlar kendiliğinden kapanır.'), style: TextStyle(fontSize: 12, color: Pal.textDim)),
        ),
      ]),
    );
  }
}

// ---------- Hakkında ----------

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: _bar('Hakkında'),
      body: AsyncBody<Map<String, dynamic>>(
        load: () async {
          try {
            return await Api.get('/api/app/config');
          } catch (_) {
            return <String, dynamic>{};
          }
        },
        builder: (context, c, reload) => ListView(padding: const EdgeInsets.only(bottom: 28), children: [
          const SizedBox(height: 28),
          Center(
            child: Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(colors: kGoldDeep, begin: Alignment.topLeft, end: Alignment.bottomRight),
                boxShadow: [BoxShadow(color: Pal.cyan.withValues(alpha: 0.4), blurRadius: 18)],
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.graphic_eq_rounded, color: Colors.white, size: 44),
            ),
          ),
          const SizedBox(height: 12),
          Center(child: Text(tx('TR Live'), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Pal.text))),
          const SizedBox(height: 4),
          Center(child: Text(tx('Sesli ve görüntülü sohbet odaları'), style: TextStyle(color: Pal.textDim))),
          _group([
            _row(Icons.phone_android_rounded, _cGreen, tx('Uygulama sürümü'), value: kAppVersion, chevron: false),
            if (c['serverVersion'] != null) _row(Icons.dns_outlined, _cSky, tx('Sunucu sürümü'), value: '${c['serverVersion']}', chevron: false),
            if (c['latestAppVersion'] != null && '${c['latestAppVersion']}'.isNotEmpty)
              _row(Icons.system_update_rounded, _cAmber, tx('Son sürüm'), value: '${c['latestAppVersion']}', chevron: false),
          ]),
          _group([
            _row(Icons.bug_report_outlined, _cOrange, tx('Hata kaydı'), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ErrorLogScreen()))),
            // Kullanılan açık kaynak yazılım ve görsellerin lisansları (ör. hareketli emojiler, CC BY 4.0).
            _row(Icons.description_outlined, _cSky, tx('Lisanslar'), onTap: () => showLicensePage(context: context, applicationName: 'TR Live', applicationVersion: kAppVersion)),
          ]),
        ]),
      ),
    );
  }
}
