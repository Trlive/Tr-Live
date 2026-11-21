import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../services/api.dart';
import '../../../version.dart';
import 'renderer/sdui_renderer.dart';
import 'schema/sdui_node.dart';

/// Sunucudan gelen bir ekranı çizer; gelmezse YERLEŞİK ekrana düşer.
///
/// ## Üç kademeli geri düşme (v1 ile aynı ilke)
///
/// 1. Sunucudan gelen ekran.
/// 2. Telefonda saklanan son ÇALIŞAN ekran — ağ yoksa.
/// 3. Uygulamanın yerleşik ekranı ([fallback]) — ikisi de yoksa.
///
/// Üçüncü kademe pazarlık konusu değil. SDUI "arayüzü sunucu belirler" demek; sunucu
/// yanıt vermediğinde arayüzün de kaybolması, uygulamayı sunucuya rehin vermek olurdu.
/// Bu yüzden [fallback] zorunlu bir parametre: SDUI'ye taşınan her ekranın Dart sürümü
/// bir süre daha koddadır ve silinmez.
///
/// ## Sunucu null dönerse bu bir HATA DEĞİLDİR
///
/// Üç meşru sebep var ve üçü de aynı sonuca çıkar (yerleşik ekran): yayın yok · uygulama
/// sürümü yetmiyor · kullanıcı kademeli açılış diliminde değil. Kullanıcıya hiçbir şey
/// gösterilmez; fark etmemesi gerekir.
class SduiScreenView extends StatefulWidget {
  final String screenId;

  /// Sunucu ekranı yoksa çizilecek yerleşik ekran. Zorunlu — bkz. yukarıdaki üçüncü kademe.
  final WidgetBuilder fallback;

  final void Function(String target)? onTab;

  const SduiScreenView({super.key, required this.screenId, required this.fallback, this.onTab});

  @override
  State<SduiScreenView> createState() => _SduiScreenViewState();
}

class _SduiScreenViewState extends State<SduiScreenView> {
  static const _prefix = 'sdui2_';

  SduiScreenDoc? _doc;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_prefix${widget.screenId}';

    // Önce saklanan ekran: ağ yavaşsa kullanıcı boş ekrana bakmasın.
    if (_doc == null) {
      final cached = prefs.getString(key);
      if (cached != null) {
        final d = _decode(cached);
        if (d != null && mounted) setState(() => _doc = d);
      }
    }

    try {
      final r = await Api.get('/api/sdui/v2/${widget.screenId}', query: {'appVersion': kAppVersion});
      if (r['root'] == null) {
        // Sunucu "bu ekran sende yerleşik olsun" diyor. Saklanan da temizlenir; yoksa
        // panelden kapatmak telefonlarda hiçbir şey değiştirmezdi.
        await prefs.remove(key);
        if (mounted) setState(() => _doc = null);
        return;
      }
      final parsed = SduiScreenDoc.from(r);
      if (parsed == null || parsed.isEmpty) {
        // Bozuk ya da boş ekran: SAKLANMAZ, eldeki korunur. Bozuğu saklamak, uygulamayı
        // ağ olmasa bile her açılışta bozuk açmak olurdu. Ekranda bir şey değişmez,
        // bu yüzden setState de çağrılmaz.
        return;
      }
      await prefs.setString(key, jsonEncode(r));
      if (mounted) setState(() => _doc = parsed);
    } catch (_) {
      // Ağ yok ya da sunucu yanıt vermiyor: saklanan ekran geçerli kalır, ekran değişmez.
    }
  }

  static SduiScreenDoc? _decode(String s) {
    try {
      return SduiScreenDoc.from(jsonDecode(s));
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final doc = _doc;
    if (doc == null) {
      // Henüz yanıt yok ve saklanan da yok: doğrudan yerleşik ekran çizilir.
      // Yükleniyor çarkı GÖSTERİLMEZ — ekranın sunucudan gelip gelmediği kullanıcıyı
      // ilgilendirmez; bekletmek, yerleşik ekran hazırken anlamsız gecikme olurdu.
      return widget.fallback(context);
    }
    final body = SduiRenderer(root: doc.root, onRefresh: _load, onTab: widget.onTab);
    return RefreshIndicator(
      onRefresh: _load,
      // RefreshIndicator aşağı çekmeyi ancak KAYDIRILABİLİR bir çocukta algılar. Kök
      // bileşen 'scroll' değilse (ör. düz bir column) aşağı çekmek hiçbir şey yapmazdı.
      // AlwaysScrollableScrollPhysics, içerik ekrandan kısa olsa bile çekmeyi çalıştırır.
      child: doc.root.type == 'scroll'
          ? body
          : SingleChildScrollView(physics: const AlwaysScrollableScrollPhysics(), child: body),
    );
  }
}
