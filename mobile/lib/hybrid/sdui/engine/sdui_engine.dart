import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../services/api.dart';
import '../../feature_flags/feature_flags.dart';
import '../schema/sdui_schema.dart';

/// SDUI motoru: düzeni getirir, saklar, bozulursa geri düşer.
///
/// ## Üç kademeli geri düşme
///
/// 1. **Sunucudan gelen düzen** — her şey yolundaysa bu kullanılır.
/// 2. **Telefonda saklanan son çalışan düzen** — ağ yoksa ya da sunucu bozuk yanıt verdiyse.
/// 3. **Uygulamanın yerleşik düzeni** — ikisi de yoksa. Bu kademe her zaman çalışır ve
///    koddadır; yani sunucu tamamen erişilemez olsa bile uygulama açılır ve gezilebilir.
///
/// Üçüncü kademe pazarlık konusu değil. SDUI'nin kendisi "arayüzü sunucu belirler" demek;
/// sunucu yanıt vermediğinde arayüzün de kaybolması, uygulamayı sunucuya rehin vermek olurdu.
///
/// ## Bir düzen "çalışıyor" sayılmadan saklanmaz
///
/// Gelen düzen önce çözülür ve doğrulanır. Ancak geçerliyse telefona yazılır. Bozuk bir düzeni
/// saklamak, uygulamayı her açılışta bozuk açmak olurdu — ağ olmasa bile.
class SduiEngine {
  SduiEngine._();

  static const _prefix = 'sdui_layout_';

  static final Map<String, SduiLayout?> _memory = {};

  /// Düzen değişince dinleyen ekranlar yeniden çizilir.
  static final ValueNotifier<int> revision = ValueNotifier<int>(0);

  /// Bir ekranın yürürlükteki düzeni. `null` = yerleşik düzen kullanılacak.
  ///
  /// Bayrak kapalıyken **her zaman null** döner: SDUI tek düğmeyle devre dışı kalır ve uygulama
  /// bugünkü davranışına döner.
  static SduiLayout? layout(String screen) {
    if (!Flags.on('sdui_home')) return null;
    return _memory[screen];
  }

  /// Açılışta ve uygulama öne geldiğinde çağrılır.
  static Future<void> refresh(String screen) async {
    final prefs = await SharedPreferences.getInstance();
    // Önce saklanan düzen yüklenir: ağ yavaşsa ekran boş beklemesin.
    if (!_memory.containsKey(screen)) _apply(screen, _decode(prefs.getString('$_prefix$screen')));

    try {
      final r = await Api.get('/api/sdui/$screen');
      final raw = r['layout'];
      if (raw == null) {
        // Sunucu "düzen kapalı" diyor: saklanan düzen de temizlenir, yerleşik düzene dönülür.
        // Temizlemeseydik panelden kapatmak telefonlarda hiçbir şey değiştirmezdi.
        await prefs.remove('$_prefix$screen');
        _apply(screen, null);
        return;
      }
      final parsed = SduiLayout.from(raw);
      if (parsed == null || parsed.isEmpty) {
        // Bozuk ya da boş düzen: SAKLANMAZ. Eldeki (çalışan) düzen korunur.
        return;
      }
      await prefs.setString('$_prefix$screen', jsonEncode(raw));
      _apply(screen, parsed);
    } catch (_) {
      // Ağ yok ya da sunucu yanıt vermiyor: saklanan düzen geçerli kalır.
    }
  }

  /// Düzen uygulamada sorun çıkardığında elle geri düşme: saklanan düzen silinir, yerleşik
  /// düzene dönülür. Bir sonraki yenilemede sunucu düzeni yeniden gönderir — bu yüzden gerçek
  /// çözüm panelden kapatmaktır; bu yalnızca o ana kadarki acil çıkış.
  static Future<void> fallbackToBuiltIn(String screen) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_prefix$screen');
    _apply(screen, null);
  }

  static SduiLayout? _decode(String? s) {
    if (s == null) return null;
    try {
      return SduiLayout.from(jsonDecode(s));
    } catch (_) {
      return null;
    }
  }

  static void _apply(String screen, SduiLayout? l) {
    final old = _memory[screen];
    _memory[screen] = l;
    if (old?.version != l?.version) revision.value++;
  }
}
