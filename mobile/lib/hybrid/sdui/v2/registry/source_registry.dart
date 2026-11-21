import '../../../../services/api.dart';

/// SDUI v2 veri kaynakları: ad → uygulamanın ZATEN çağırdığı uç.
///
/// `api` eylemiyle aynı gerekçe: sunucudan gelen düzen **serbest adres veremez**, yalnızca
/// izinli bir AD verir. Adın hangi uca gideceğini bu tablo söyler ve tablo KODDADIR.
/// Serbest adres olsaydı, düzeni kaydedebilen biri uygulamaya istediği yerden veri
/// çektirebilir, hatta oturum bilgisini başka bir yere taşıtabilirdi.
///
/// Buradaki her ad sunucudaki `SOURCE_SPECS` ile birebir aynı olmalı.
/// `tools/sdui_parity.mjs` bunu `npm run check` içinde denetliyor: şema bir kaynağı
/// tanıtıp uygulama tanımazsa, o ekran sessizce boş çizilirdi.
class SduiSources {
  SduiSources._();

  /// path: uç · key: yanıttaki liste alanı
  static const Map<String, ({String path, String key})> all = {
    'events': (path: '/api/activities', key: 'items'),
    'inbox': (path: '/api/me/notifications', key: 'notifications'),
    'relations': (path: '/api/friends', key: 'users'),
    'dealerCatalog': (path: '/api/dealer/topup-packages', key: 'packages'),
  };

  static bool knows(String? name) => name != null && all.containsKey(name);

  /// Kaynağı çeker. Tanınmayan ad ya da hata → BOŞ liste.
  ///
  /// Atmaz: sunucudan gelen bir düzen yüzünden ekranın tamamı çökmemeli. Boş liste
  /// `emptyText` / `emptyState` ile karşılanır — bu yüzden her repeater'da biri olmalı.
  static Future<List<Map<String, dynamic>>> load(String? name) async {
    final spec = name == null ? null : all[name];
    if (spec == null) return const [];
    try {
      final r = await Api.get(spec.path);
      final list = r[spec.key];
      if (list is! List) return const [];
      return [for (final x in list) if (x is Map) Map<String, dynamic>.from(x)];
    } catch (_) {
      return const [];
    }
  }
}

/// Şablon bağlama: metindeki `{alan}` yerine öğenin o alanı yazılır.
///
/// Bilerek ÇOK dar: yalnızca düz alan adı. İfade, çağrı, iç içe erişim ya da koşul YOK.
/// Şablon dili eklemek, sunucuya uygulamanın içinde mantık çalıştırma yetkisi vermeye
/// giden yoldur; SDUI'nin tüm güvenliği "sunucu yeni davranış üretemez" kuralına dayanıyor.
///
/// Bilinmeyen alan BOŞ dizeye çevrilir: süslü parantez kullanıcıya gösterilmez.
String bindText(String text, Map<String, dynamic> item) {
  if (!text.contains('{')) return text;
  return text.replaceAllMapped(RegExp(r'\{([A-Za-z_][A-Za-z0-9_]*)\}'), (m) {
    final v = item[m.group(1)];
    if (v == null) return '';
    if (v is bool) return v ? '✓' : '';
    return '$v';
  });
}
