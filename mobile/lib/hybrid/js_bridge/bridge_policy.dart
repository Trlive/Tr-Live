import 'dart:collection';
import 'dart:convert';
import '../webview/navigation_policy.dart';

/// Sayfanın hangi uygulama komutunu çağırabileceğine karar veren **tek** yer, ve çağrıların kaydı.
///
/// ## İlke
///
/// Mimari ilkemiz şunu söylüyor: *istemci, WebView veya Flutter hiçbir zaman kendi başına bakiye
/// üretmemeli ya da gerçek finansal işlemi kesinleştirmemeli.* Köprü bu ilkenin uygulandığı yer.
/// Hiçbir komut para hareketi yapmaz — en fazla **okuma tazeler** (`refreshBalance`, sunucudan
/// bakiyeyi yeniden sorar) ya da bir ekran açar.
///
/// ## Köken ayrımı
///
/// Yetki, sayfanın kökenine göre verilir:
///
/// * **Kendi sunucumuz** — oturum bileti alabilir, bakiye tazeleyebilir, izin verilen ekranları
///   açabilir, pencereyi kapatabilir.
/// * **Dış sayfa** (izin listesindeki yabancı oyun sağlayıcısı) — yalnızca `close`.
///   Oturum bileti **asla** verilmez: biletimizi başkasının sunucusuna göndermek, o sunucunun
///   kullanıcı adına her şeyi yapabilmesi demektir.
///
/// Eskiden bu ayrım iki ayrı dosyada iki ayrı `switch` olarak duruyordu. Yeni bir komut eklerken
/// birine eklenip diğerine eklenmemesi — ya da daha kötüsü, dış pencereye de açılması — an
/// meselesiydi.
///
/// ## Kayıt
///
/// Son çağrılar bellekte tutulur. Bir sayfanın ne istediğini sormak, sorun çıktığında ilk
/// bakılacak yer; kayıt olmadan bu soru cevapsız kalıyordu.
class BridgePolicy {
  BridgePolicy._();

  /// Kendi sayfalarımızın çağırabileceği komutlar.
  static const _own = {'getToken', 'refreshBalance', 'close', 'open', 'openActivity'};

  /// Dış sayfaların çağırabileceği komutlar. Oturum bileti ve ekran açma burada YOK.
  static const _external = {'close'};

  /// Bir komutun verilen kökenden çağrılmasına izin var mı.
  static bool allows(String origin, String type) {
    if (type.isEmpty || type.length > 40) return false;
    final set = WebViewPolicy.isOwnOrigin(origin) ? _own : _external;
    return set.contains(type);
  }

  /// Ham mesajı çözer. Bozuk ya da aşırı büyük mesaj sessizce düşer.
  ///
  /// Boyut sınırı var: sayfanın megabaytlık bir dize göndererek belleği şişirmesi engelleniyor.
  static BridgeMessage? parse(String raw) {
    if (raw.isEmpty || raw.length > 64 * 1024) return null;
    try {
      final d = jsonDecode(raw);
      if (d is Map) {
        final t = (d['type'] ?? '').toString();
        return t.isEmpty ? null : BridgeMessage(t, d);
      }
    } catch (_) {
      // Eski sayfalar düz metin gönderiyor ("close" gibi): bu biçim de kabul edilir.
    }
    return raw.length <= 40 ? BridgeMessage(raw, const {}) : null;
  }

  // --- Kayıt ---------------------------------------------------------------

  static const _maxLog = 100;
  static final Queue<BridgeCall> _log = Queue<BridgeCall>();

  static void note(String origin, String type, bool allowed) {
    _log.addLast(BridgeCall(DateTime.now(), origin, type, allowed));
    while (_log.length > _maxLog) _log.removeFirst();
  }

  static List<BridgeCall> get recent => List.unmodifiable(_log);

  /// Reddedilen çağrılar: bir sayfanın yetkisi olmayan bir şeyi denediğinin işareti.
  static List<BridgeCall> get denied => [for (final c in _log) if (!c.allowed) c];

  /// Mesajı denetler, kaydeder ve izin varsa [run] çalıştırır.
  /// Tek giriş noktası: yeni bir pencere eklendiğinde denetimi atlamak zorlaşsın diye.
  static Future<void> handle(String origin, String raw, Future<void> Function(BridgeMessage) run) async {
    final msg = parse(raw);
    if (msg == null) return;
    final ok = allows(origin, msg.type);
    note(origin, msg.type, ok);
    if (!ok) return;
    await run(msg);
  }
}

class BridgeMessage {
  const BridgeMessage(this.type, this.data);
  final String type;
  final Map data;
}

class BridgeCall {
  const BridgeCall(this.at, this.origin, this.type, this.allowed);
  final DateTime at;
  final String origin;
  final String type;
  final bool allowed;
}
