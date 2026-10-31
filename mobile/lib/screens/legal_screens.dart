import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api.dart';
import '../services/auth_service.dart';
import '../services/session.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import 'login_screen.dart';

/// Yasal metinlerin sürümü. Sunucudaki TERMS_VERSION ile aynı olmalı (backend/src/legal.js).
/// Metinler değişince ikisi birlikte artırılır: eski sürümü onaylamış kullanıcıdan yeniden onay istenir.
const String kTermsVersion = '2026-10-31';

/// Yasal metinlerin yayımlandığı site.
const String kLegalSite = 'https://trlive.github.io';

/// Sitedeki yasal sayfalar: (dosya, başlık, simge, renk).
const List<(String, String, IconData, Color)> kLegalPages = [
  ('terms.html', 'Kullanıcı Sözleşmesi', Icons.description_outlined, Color(0xFF2E9BFF)),
  ('privacy.html', 'Gizlilik Politikası', Icons.privacy_tip_outlined, Color(0xFFFFA726)),
  ('kvkk.html', 'KVKK Aydınlatma Metni', Icons.policy_outlined, Color(0xFF22C55E)),
  ('community.html', 'Topluluk Kuralları', Icons.groups_outlined, Color(0xFFFF5C8A)),
  ('child-safety.html', 'Çocuk Güvenliği', Icons.child_care_outlined, Color(0xFF29B6F6)),
];

/// Yasal sayfayı tarayıcıda açar.
Future<void> openLegal(BuildContext context, String page) async {
  final uri = Uri.parse('$kLegalSite/$page');
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    ok = false;
  }
  if (!ok && context.mounted) toast(context, 'Sayfa açılamadı: $uri', error: true);
}

/// Sunucuya onay kaydı (sürüm + zaman). Başarılıysa oturumdaki profil de güncellenir.
Future<void> recordTermsAcceptance() async {
  await Api.post('/api/me/accept-terms', {'version': kTermsVersion, 'adult': true});
  final me = Session.me.value;
  if (me != null) Session.me.value = {...me, 'termsVersion': kTermsVersion};
}

/// Kayıt ekranındaki onay kutusu: 18 yaş + Kullanıcı Sözleşmesi + Gizlilik Politikası (bağlantılı), KVKK bilgilendirmesi.
class LegalConsent extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  final Color accent;
  final Color text;
  final bool highlight;
  const LegalConsent({
    super.key,
    required this.value,
    required this.onChanged,
    this.accent = const Color(0xFFE6B13A),
    this.text = const Color(0xFFD9CCAE),
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    final link = TextStyle(color: accent, fontWeight: FontWeight.w800, decoration: TextDecoration.underline, decorationColor: accent);
    WidgetSpan tapTo(String label, VoidCallback onTap) => WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: GestureDetector(onTap: onTap, child: Text(label, style: link.copyWith(fontSize: 12.5, height: 1.4))),
        );
    WidgetSpan tap(String label, String page) => tapTo(label, () => openLegal(context, page));
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.fromLTRB(4, 6, 10, 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: highlight ? const Color(0xFFFF5A5A) : Colors.transparent, width: 1.4),
        color: highlight ? const Color(0x22FF5A5A) : Colors.transparent,
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Checkbox(
          value: value,
          onChanged: (v) => onChanged(v == true),
          activeColor: accent,
          checkColor: Colors.black,
          side: BorderSide(color: accent, width: 1.6),
          visualDensity: VisualDensity.compact,
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 9),
            child: GestureDetector(
              onTap: () => onChanged(!value),
              child: Text.rich(
                TextSpan(children: [
                  const TextSpan(text: '18 yaşını doldurduğumu ve '),
                  tap('Kullanıcı Sözleşmesi', 'terms.html'),
                  const TextSpan(text: "'ni (ekindeki "),
                  // Ek, yalnızca uygulama içinde: kayıttan önce de okunabilsin.
                  tapTo('Coin, Hediye ve Elmas Koşulları', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CoinTermsScreen()))),
                  const TextSpan(text: ' dahil) okuyup kabul ettiğimi onaylıyorum. '),
                  tap('Gizlilik Politikası', 'privacy.html'),
                  const TextSpan(text: ' ve '),
                  tap('KVKK Aydınlatma Metni', 'kvkk.html'),
                  const TextSpan(text: "'ni okudum."),
                ]),
                style: TextStyle(color: text, fontSize: 12.5, height: 1.4),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Yasal metinler güncellendiyse (ya da hiç onaylanmadıysa) girişten sonra bir kez onay istenir.
/// Onaylamayan kişi çıkış yapabilir. Eski sunucu (sürüm bilgisi göndermeyen) için hiçbir şey yapılmaz.
class TermsGate {
  static bool _showing = false;

  static bool needed(Map<String, dynamic>? me) {
    if (me == null || !me.containsKey('termsVersion')) return false;
    final v = me['termsVersion']?.toString();
    return v == null || v.compareTo(kTermsVersion) < 0;
  }

  static Future<void> check(BuildContext context) async {
    if (_showing || !needed(Session.me.value)) return;
    _showing = true;
    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (c) => const PopScope(canPop: false, child: _TermsDialog()),
      );
    } finally {
      _showing = false;
    }
    // Pencere onaylanmadan kapandıysa (ör. üstüne başka sayfa açıldı) ve oturum sürüyorsa yeniden sorulur.
    if (context.mounted && Api.token != null && needed(Session.me.value)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) check(context);
      });
    }
  }

  /// Sunucu onayı kaydedemediyse (eski/yeni sunucu sürümü) kullanıcı engellenmez; bu oturumda tekrar sorulmaz.
  static void skipForSession() {
    final me = Session.me.value;
    if (me != null) Session.me.value = {...me, 'termsVersion': kTermsVersion};
  }
}

class _TermsDialog extends StatefulWidget {
  const _TermsDialog();

  @override
  State<_TermsDialog> createState() => _TermsDialogState();
}

class _TermsDialogState extends State<_TermsDialog> {
  bool _ok = false;
  bool _busy = false;
  bool _leaving = false;

  Future<void> _accept() async {
    setState(() => _busy = true);
    try {
      await recordTermsAcceptance();
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      // Sunucuda bu uç / sürüm yoksa (çok eski ya da farklı sürüm sunucu) kullanıcı engellenmez.
      if (e.statusCode == 404 || e.statusCode == 409) {
        TermsGate.skipForSession();
        Navigator.of(context).pop();
        return;
      }
      toast(context, e.message, error: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      toast(context, errorText(e), error: true);
    }
  }

  Future<void> _logout() async {
    if (_leaving) return;
    setState(() => _leaving = true);
    final nav = Navigator.of(context, rootNavigator: true);
    await AuthService.logout();
    TermsGate._showing = false;
    nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: Pal.surface,
      title: const Text('Sözleşmeler ve politikalar'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text(
            'TR Live\'ı kullanmaya devam etmek için güncel Kullanıcı Sözleşmesi\'ni ve Gizlilik Politikası\'nı onaylaman gerekiyor.',
            style: TextStyle(height: 1.4),
          ),
          const SizedBox(height: 10),
          LegalConsent(value: _ok, onChanged: (v) => setState(() => _ok = v), text: Pal.text, accent: Pal.cyan),
        ]),
      ),
      actions: [
        TextButton(onPressed: _busy || _leaving ? null : _logout, child: const Text('Çıkış yap')),
        FilledButton(
          onPressed: _ok && !_busy && !_leaving ? _accept : null,
          child: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Kabul ediyorum'),
        ),
      ],
    );
  }
}

// ---------- Ayarlar → Sözleşmeler ve politikalar ----------

class LegalHubScreen extends StatelessWidget {
  const LegalHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    Widget row(IconData icon, Color color, String title, VoidCallback onTap, {bool external = false}) => InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
            child: Row(children: [
              Icon(icon, color: color, size: 25),
              const SizedBox(width: 16),
              Expanded(child: Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: Pal.text))),
              Icon(external ? Icons.open_in_new_rounded : Icons.chevron_right, color: Pal.textDim, size: external ? 19 : 24),
            ]),
          ),
        );
    Widget group(List<Widget> rows) => Container(
          margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Pal.outline.withValues(alpha: 0.55))),
          child: Column(children: [
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) const Divider(height: 1, thickness: 0.6, indent: 57, color: Color(0x22FFFFFF)),
              rows[i],
            ],
          ]),
        );
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: AppBar(backgroundColor: Pal.bg, title: const Text('Sözleşmeler ve politikalar')),
      body: ListView(padding: const EdgeInsets.only(bottom: 28), children: [
        group([
          for (final p in kLegalPages) row(p.$3, p.$4, p.$2, () => openLegal(context, p.$1), external: true),
        ]),
        group([
          row(Icons.monetization_on_outlined, const Color(0xFFFFC43D), 'Coin, Hediye ve Elmas Koşulları',
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CoinTermsScreen()))),
          row(Icons.person_remove_outlined, const Color(0xFFFF4D4F), 'Hesap silme',
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountDeletionInfoScreen()))),
        ]),
        const Padding(
          padding: EdgeInsets.fromLTRB(18, 14, 18, 0),
          child: Text('Sorun ve talepler için: Ayarlar → Yardım ya da trlivedestek@proton.me', style: TextStyle(color: Pal.textDim, fontSize: 12)),
        ),
      ]),
    );
  }
}

// ---------- Uygulama içi metinler ----------

class _Doc extends StatelessWidget {
  final String title;
  final List<(String, String)> sections;
  final String? intro;
  final Widget? footer;
  const _Doc({required this.title, required this.sections, this.intro, this.footer});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: AppBar(backgroundColor: Pal.bg, title: Text(title)),
      body: ListView(padding: const EdgeInsets.fromLTRB(18, 8, 18, 32), children: [
        const Text('Son güncelleme: 31 Ekim 2026', style: TextStyle(color: Pal.textDim, fontSize: 12)),
        if (intro != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Pal.outline)),
            child: Text(intro!, style: const TextStyle(color: Pal.text, height: 1.5, fontSize: 13.5)),
          ),
        ],
        for (final s in sections) ...[
          const SizedBox(height: 18),
          Text(s.$1, style: const TextStyle(color: Pal.cyan, fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(s.$2, style: const TextStyle(color: Pal.text, height: 1.55, fontSize: 13.5)),
        ],
        if (footer != null) ...[const SizedBox(height: 24), footer!],
      ]),
    );
  }
}

/// Coin, Hediye ve Elmas Koşulları (Kullanıcı Sözleşmesi'nin eki; yalnızca uygulama içinde).
class CoinTermsScreen extends StatelessWidget {
  const CoinTermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const _Doc(
      title: 'Coin, Hediye ve Elmas Koşulları',
      intro: 'Bu koşullar Kullanıcı Sözleşmesi\'nin ekidir. Coin, hediye, elmas ve diğer sanal ürünler yalnızca TR Live içinde '
          'kullanılmak üzere verilen sanal öğelerdir; gerçek para, elektronik para veya değerli evrak değildir.',
      sections: [
        ('1. Tanımlar',
            '• Coin: uygulama içinde satın alınan veya ödül olarak kazanılan sanal birimdir.\n'
                '• Hediye: Coin ile başka bir kullanıcıya gönderilen sanal öğedir.\n'
                '• Elmas: hediye alan kullanıcının hesabına, aldığı hediyenin değerine göre eklenen puandır.\n'
                '• Sanal ürünler: WIP üyeliği, çerçeve, giriş efekti, renkli ID gibi görünüm öğeleri ve benzerleri.'),
        ('2. Coin satın alma',
            'Coin yalnızca uygulamada gösterilen resmî satın alma yöntemleriyle alınabilir. Fiyatlar satın alma anında gösterilir ve '
                'vergiler dahildir. Coin, ödeme onaylandığında hesabına anında tanımlanır. Elektronik ortamda anında ifa edilen bu '
                'işlemlerde, satın alma sırasında verdiğin onayla Mesafeli Sözleşmeler Yönetmeliği uyarınca cayma hakkı kullanılamaz. '
                'TR Live dışındaki kişi veya sitelerden Coin, hesap veya sanal ürün satın almak yasaktır; bu yolla edinilen ürünler geri alınabilir.'),
        ('3. Coin kullanımı',
            'Coin; hediye göndermek, WIP üyeliği ve mağaza ürünleri almak gibi uygulama içi özelliklerde kullanılır. Coin nakde çevrilemez, '
                'başka bir hesaba aktarılamaz veya satılamaz. Coin\'in bir son kullanma tarihi yoktur; ancak hesap silindiğinde veya kapatıldığında sona erer.'),
        ('4. Hediyeler',
            'Gönderilen hediye geri alınamaz ve iade edilmez. Hediye göndermek alıcıya yapılmış bir ödeme veya hizmet bedeli değildir; '
                'karşılığında herhangi bir davranış, görüşme veya hizmet talep etmek Topluluk Kuralları\'na aykırıdır.'),
        ('5. Şanslı hediyeler',
            'Şanslı hediyelerde gönderilen her adet için rastgele bir çekiliş yapılır ve çıkan çarpan kadar Coin gönderenin hesabına eklenir. '
                'Her çarpanın olasılığı hediye panelindeki "Olasılıklar" bölümünde gösterilir. Sonuçlar rastgeledir ve garanti edilmez; '
                'kazanılan ödüller yalnızca Coin olarak verilir ve nakde çevrilemez. Tek gönderimde kazanılabilecek en yüksek tutar uygulamada belirtilir.'),
        ('6. Elmas',
            'Elmas, yalnızca hediye alan kullanıcıya verilen bir puandır ve nakit değeri yoktur. Yayıncı olmayan kullanıcılar elmaslarını '
                'Gelir Merkezi\'ndeki "Elmas Bozdurma" ile belirtilen oranda Coin\'e çevirebilir. Onaylı yayıncılar için elmaslar maaş '
                'sistemine göre değerlendirilir.'),
        ('7. Yayıncı maaşları',
            'Ajansa bağlı onaylı yayıncılar, her dönem sonunda uygulamada yayımlanan maaş tablosu ve koşullara (gün, saat, elmas) göre maaş '
                'hak edebilir. Ödeme için kimlik doğrulamasının tamamlanmış olması gerekir. Hile, sahte veya kendine hediye, birden fazla hesap '
                'kullanımı ve Topluluk Kuralları ihlalleriyle elde edilen elmas ve maaşlar iptal edilir. Ödemelerden doğan vergi yükümlülükleri, '
                'mevzuat aksini öngörmedikçe yayıncıya aittir.'),
        ('8. İade ve hatalı işlemler',
            'Sanal ürün satın alımları, mevzuatın zorunlu kıldığı hâller dışında iade edilmez. Ödemen alındığı hâlde Coin hesabına '
                'tanımlanmadıysa veya teknik bir hata olduysa, işlem bilgilerinle birlikte Ayarlar → Yardım üzerinden Müşteri Hizmetleri\'ne yaz; '
                'inceleme sonucunda ürün tanımlanır veya bedel iade edilir.'),
        ('9. Değişiklikler',
            'Coin fiyatları, hediye değerleri, oranlar ve maaş tablosu ileriye dönük olarak değiştirilebilir; değişiklikler daha önce '
                'tamamlanmış işlemleri etkilemez.'),
        ('10. Hesabın sona ermesi',
            'Hesabın silindiğinde veya Kullanıcı Sözleşmesi ihlali nedeniyle kapatıldığında, kullanılmamış Coin, elmas ve sanal ürünler '
                'sona erer. Hesabın haksız olarak kapatıldığı tespit edilirse bu ürünler iade edilir.'),
      ],
    );
  }
}

/// Hesap silme bilgisi: neler silinir, neler saklanır. [onDelete] verilirse altta silme düğmesi çıkar.
class AccountDeletionInfoScreen extends StatelessWidget {
  final Future<void> Function()? onDelete;
  const AccountDeletionInfoScreen({super.key, this.onDelete});

  @override
  Widget build(BuildContext context) {
    final del = onDelete;
    return _Doc(
      title: 'Hesap silme',
      intro: 'Hesabını silmek kalıcıdır ve geri alınamaz. Silmeden önce aşağıdaki bilgileri oku.',
      sections: const [
        ('Nasıl silinir?',
            'Profil → Ayarlar → Hesap & Güvenlik → Hesabı sil. Şifren varsa şifreni, Google/Facebook ile girdiysen onay için "SİL" yazman istenir. '
                'Uygulamaya erişemiyorsan kullanıcı adın veya ID\'n ile trlivedestek@proton.me adresine "Hesap silme talebi" konulu e-posta gönderebilirsin; '
                'kimliğin doğrulandıktan sonra talebin en geç 30 gün içinde sonuçlandırılır.'),
        ('Neler silinir?',
            'Profil bilgilerin (fotoğraflar, hakkımda, doğum tarihi, cinsiyet, ülke/şehir), şifren, telefon numaran, yüklediğin fotoğraflar, '
                'takip ve aile üyeliklerin ve Google/Facebook bağlantıların silinir. Gönderilerin (Anlar) yayından kaldırılır. Görünen adın '
                '"Silinmiş Kullanıcı" olur, kullanıcı adın rastgele bir koda dönüşür ve hesabına bir daha giriş yapılamaz.'),
        ('Neler kalır?',
            'Başkalarına gönderdiğin özel mesajlar, oda sohbetindeki mesajların ve yorumların karşı tarafta "Silinmiş Kullanıcı" adıyla görünmeye '
                'devam edebilir. Satın alma, ödeme ve hediye kayıtları, destek yazışmaların ve güvenlik/ihlal kayıtları yasal yükümlülükler ve '
                'olası uyuşmazlıklar için mevzuatın öngördüğü süre boyunca saklanır; giriş ve güvenlik kayıtları (IP, cihaz) en fazla 2 yıl tutulur.'),
        ('Coin, elmas ve sanal ürünler',
            'Hesabındaki kullanılmamış Coin, elmas, WIP üyeliği ve tüm sanal ürünler hesapla birlikte kalıcı olarak sona erer ve iade edilmez.'),
        ('Silmeden önce',
            '• Bir ailenin sahibiysen önce sahipliği devretmen veya aileyi dağıtman gerekir.\n'
                '• Bir ajansın sahibiysen önce destek ile iletişime geçmelisin.\n'
                '• Bekleyen yayıncı maaşın varsa, ödemen tamamlanmadan hesabını silme.'),
      ],
      footer: del == null ? null : _DeleteButton(onDelete: del),
    );
  }
}

class _DeleteButton extends StatefulWidget {
  final Future<void> Function() onDelete;
  const _DeleteButton({required this.onDelete});

  @override
  State<_DeleteButton> createState() => _DeleteButtonState();
}

class _DeleteButtonState extends State<_DeleteButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE5483D), foregroundColor: Colors.white, minimumSize: const Size.fromHeight(50)),
      onPressed: _busy
          ? null
          : () async {
              setState(() => _busy = true);
              try {
                await widget.onDelete();
              } finally {
                if (mounted) setState(() => _busy = false);
              }
            },
      icon: const Icon(Icons.delete_forever_rounded),
      label: const Text('Hesabımı kalıcı olarak sil', style: TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}
