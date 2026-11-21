import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../services/api.dart';

/// Özellik bayrakları — hibrit katmanın geri alma düğmesi.
///
/// ## Niçin var
///
/// Staging kurmama kararı verdik: her değişiklik doğrudan canlıya gidiyor. Bir özellik bozulduğunda
/// tek çare yeni APK yayınlamak olsaydı, mağaza onayı beklerken kullanıcı bozuk uygulamayla kalırdı.
/// Bayrak sistemi bu bağımlılığı kesiyor: özellik önce %1 kullanıcıya açılır, sorun çıkmazsa %10,
/// sonra herkese. Bozulursa panelden sıfıra indirilir ve etki bir sonraki açılışta biter.
///
/// ## Güvenli varsayılan
///
/// Bilinmeyen bayrak **kapalıdır**. Sunucuya ulaşılamadığında da kapalıdır. Yani ağ koptuğunda
/// uygulama eski, bilinen davranışa döner — yeni ve denenmemiş yola değil. Bu yön bilinçli:
/// yanlışlıkla açık kalan bir özellik, yanlışlıkla kapalı kalandan daha pahalıya mal olur.
///
/// ## Kullanım
///
/// ```dart
/// if (Flags.on('sdui_home')) { ... } else { ... eski yol ... }
/// ```
///
/// Her bayrak kullanımının **yanında eski yol durmalıdır**. Eski yolu silmek, bayrağı anlamsız
/// kılar: kapatılacak bir şey kalmaz.
class Flags {
  Flags._();

  static Map<String, bool> _values = const {};

  /// Bayraklar değişince (uygulama öne geldi, yapılandırma yenilendi) dinleyen ekranlar tazelenir.
  static final ValueNotifier<int> revision = ValueNotifier<int>(0);

  /// Bayrağın bu kullanıcı için açık olup olmadığı. Bilinmeyen bayrak: kapalı.
  static bool on(String key) => _values[key] == true;

  /// Sunucudan gelen `/api/app/config` yanıtındaki `flags` alanı buraya yazılır.
  /// Yanıtta `flags` yoksa (eski sunucu) mevcut değerler KORUNUR: boş haritayla ezmek, çalışan
  /// bir özelliği sunucu eski diye kapatmak olurdu.
  static void applyConfig(Map<String, dynamic>? config) {
    final raw = config?['flags'];
    if (raw is! Map) return;
    final next = <String, bool>{};
    raw.forEach((k, v) {
      if (k is String) next[k] = v == true;
    });
    if (mapEquals(next, _values)) return;
    _values = next;
    revision.value++;
  }

  /// Uygulama açılışında ve öne geldiğinde çağrılır. Hata yutulur: bayraklar okunamazsa
  /// hepsi kapalı kalır ve uygulama bilinen davranışla çalışmaya devam eder.
  static Future<void> refresh() async {
    try {
      applyConfig(await Api.get('/api/app/config'));
    } catch (_) {
      // Ağ yok ya da sunucu yanıt vermiyor: var olan değerler korunur, yeni özellik açılmaz.
    }
  }

  /// Tanı amaçlı: ayarlar ekranında hangi bayrakların açık olduğunu göstermek için.
  static Map<String, bool> get all => Map.unmodifiable(_values);
}
