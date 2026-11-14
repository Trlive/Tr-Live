import 'dart:ui' show PlatformDispatcher;
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'ar.dart';
import 'en.dart';
import 'hi.dart';

/// Uygulama dili: Türkçe, English, العربية, हिन्दी. Metinler Türkçe yazılır ve [tx] ile çevrilir; çevirisi olmayan
/// metin İngilizce, o da yoksa Türkçe görünür (uygulama bozulmaz).
///
/// Dil seçimi sırası:
///  1. Kişi Ayarlar > Dil'den seçtiyse o (telefonda saklanır).
///  2. Telefonun dili uygulamada varsa o (Türkçe / İngilizce / Arapça / Hintçe).
///  3. Yoksa kayıttaki bölgenin dili: Uzbekistan → Türkçe, Arap → Arapça, Hindistan → Hintçe, Avrupa → İngilizce.
///     Bölge henüz bilinmiyorsa (giriş ekranı) İngilizce.
class L10n {
  L10n._();
  static const supported = ['tr', 'en', 'ar', 'hi'];
  static const names = {'tr': 'Türkçe', 'en': 'English', 'ar': 'العربية', 'hi': 'हिन्दी'};
  static const flags = {'tr': '🇹🇷', 'en': '🇬🇧', 'ar': '🇸🇦', 'hi': '🇮🇳'};

  /// Bölge → dil (bölgeler: sunucudaki users.region).
  static const regionLang = {'uz': 'tr', 'ar': 'ar', 'in': 'hi', 'eu': 'en'};

  static final ValueNotifier<String> lang = ValueNotifier<String>('tr');
  static const _key = 'app_lang'; // elle seçilen dil
  static const _regionKey = 'app_lang_region'; // son bilinen bölge (giriş ekranında da doğru dil için)

  static bool get isTr => lang.value == 'tr';

  /// Arapça sağdan sola yazılır.
  static bool get isRtl => lang.value == 'ar';

  static String? _manual;
  static String? _region;

  /// Telefonun dili uygulamada varsa onu döndürür, yoksa null.
  static String? device() {
    final code = PlatformDispatcher.instance.locale.languageCode.toLowerCase();
    return supported.contains(code) ? code : null;
  }

  static String _resolve() => _manual ?? device() ?? regionLang[_region] ?? 'en';

  static Future<void> init() async {
    try {
      final p = await SharedPreferences.getInstance();
      final saved = p.getString(_key);
      _manual = supported.contains(saved) ? saved : null;
      final r = p.getString(_regionKey);
      _region = regionLang.containsKey(r) ? r : null;
    } catch (_) {/* kayıt okunamazsa telefonun dili */}
    lang.value = _resolve();
  }

  /// Ayarlar > Dil: elle seçim (bundan sonra bölge / telefon dili dili değiştirmez).
  static Future<void> set(String code) async {
    if (!supported.contains(code)) return;
    _manual = code;
    try {
      await (await SharedPreferences.getInstance()).setString(_key, code);
    } catch (_) {}
    if (code != lang.value) lang.value = code;
  }

  /// Oturum açılınca / kayıt ekranında ülke seçilince kişinin bölgesi bildirilir (Session.me dinleyicisi çağırır).
  static void applyRegion(String? region) {
    if (region == null || !regionLang.containsKey(region) || region == _region) return;
    _region = region;
    SharedPreferences.getInstance().then((p) => p.setString(_regionKey, region)).catchError((_) => false);
    final next = _resolve();
    if (next != lang.value) lang.value = next;
  }
}

const _dicts = <String, Map<String, String>>{'en': kEn, 'ar': kAr, 'hi': kHi};

/// Metni seçili dile çevirir. [args]: {ad} biçimindeki yer tutucular, ör. tx('{n} gün', {'n': 3}).
String tx(String tr, [Map<String, Object?>? args]) {
  final l = L10n.lang.value;
  var s = l == 'tr' ? tr : (_dicts[l]?[tr] ?? kEn[tr] ?? tr);
  if (args != null) {
    args.forEach((k, v) => s = s.replaceAll('{$k}', '${v ?? ''}'));
  }
  return s;
}
