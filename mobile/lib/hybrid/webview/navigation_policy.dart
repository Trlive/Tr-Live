import '../../services/api.dart';

/// Bir adresin WebView'de açılıp açılmayacağına karar veren **tek** yer.
///
/// ## Niçin tek yer
///
/// Karar üç ayrı dosyada üç farklı şekilde veriliyordu: oda etkinliği penceresi aynı köken
/// şartı arıyordu, dış pencere `http`'ye bile izin veriyordu, oyun rıhtımının kendi kuralı vardı.
/// Üç kuralı birden doğru tutmak mümkün değil; birini sıkılaştırınca diğerleri gevşek kalıyor.
/// Modül standardımız da bunu yasaklıyor: *"aynı iş mantığının farklı modüllerde kopyalanması"*.
///
/// ## Tehdit
///
/// WebView'de adres çubuğu yok. Kullanıcı neye baktığını adresten anlayamaz. Yönetici panelden
/// yanlış bir adres yapıştırılırsa (`trlve.app` gibi bir harf hatası ya da ele geçirilmiş hesap),
/// kullanıcı **uygulamanın içinde**, uygulama penceresi gibi görünen yabancı bir sayfaya gider.
/// Bu pencereye bir JavaScript kanalı da bağlı.
///
/// ## Kurallar
///
/// 1. **Kendi kökenimiz** her zaman açılır — oturum bileti yalnızca buraya verilir.
/// 2. **Dış adresler** `https` olmak zorundadır. Düz `http`, araya girenin sayfaya kod
///    sokabilmesi demek; kanal bağlı bir pencerede bu kabul edilemez.
/// 3. İzin listesi doluysa dış adres listede olmalıdır.
/// 4. `http(s)` dışındaki şemalar (`tel:`, `intent:`, `market:`) WebView'de **açılmaz**;
///    telefonun kendi uygulamasına devredilir.
class WebViewPolicy {
  WebViewPolicy._();

  /// Sunucudan gelen izin listesi (`/api/app/config` → `webviewAllowlist`).
  /// Boşken kısıt yok — bugünkü davranış. Panelden doldurulduğu anda devreye girer.
  static List<String> allowlist = const [];

  static void applyConfig(Map<String, dynamic>? config) {
    final raw = config?['webviewAllowlist'];
    if (raw is! List) return;
    allowlist = [for (final h in raw) if (h is String && h.isNotEmpty) h.toLowerCase()];
  }

  static Uri? get _base => Uri.tryParse(Api.baseUrl);

  /// Adres bizim sunucumuz mu (şema + ana makine + port birebir).
  static bool isOwnOrigin(String url) {
    final u = Uri.tryParse(url);
    final b = _base;
    if (u == null || b == null) return false;
    return u.scheme == b.scheme && u.host == b.host && u.port == b.port;
  }

  /// Dış adres izin listesine uyuyor mu.
  ///
  /// `*.alanadi.com` alt alan adlarını kapsar, **kökü kapsamaz** — ikisini isteyen ikisini yazar.
  /// Eşleşme tam etiket sınırında: `*.alanadi.com`, `kotualanadi.com`'u kapsamaz.
  static bool hostAllowed(String url) {
    if (allowlist.isEmpty) return true;
    final u = Uri.tryParse(url);
    if (u == null || u.scheme != 'https') return false;
    final host = u.host.toLowerCase();
    for (final e in allowlist) {
      if (e.startsWith('*.')) {
        final suffix = e.substring(1);
        if (host.endsWith(suffix) && host.length > suffix.length) return true;
      } else if (host == e) {
        return true;
      }
    }
    return false;
  }

  /// Oda etkinliği / oyun penceresi: yalnızca kendi kökenimiz.
  static bool canLoadInternal(String url) => isOwnOrigin(url);

  /// Dış pencere: https + izin listesi. Kendi kökenimiz de geçerlidir.
  static bool canLoadExternal(String url) {
    if (isOwnOrigin(url)) return true;
    final u = Uri.tryParse(url);
    if (u == null) return false;
    // `about:blank` ve `data:`/`blob:` sayfanın kendi içindeki çerçevelerdir, gezinme değil.
    if (u.scheme == 'about' || u.scheme == 'data' || u.scheme == 'blob') return true;
    if (u.scheme != 'https') return false; // düz http hiçbir koşulda yüklenmez
    return hostAllowed(url);
  }

  /// WebView'de açılamayan ama telefonun kendi uygulamasına devredilebilecek adres mi.
  static bool shouldHandOff(String url) {
    final u = Uri.tryParse(url);
    if (u == null) return false;
    return u.scheme.isNotEmpty && u.scheme != 'https' && u.scheme != 'http' &&
        u.scheme != 'about' && u.scheme != 'data' && u.scheme != 'blob';
  }
}
