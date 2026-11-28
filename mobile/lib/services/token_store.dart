import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'error_log.dart';

/// Oturum token'larının telefondaki yeri (rapor Y-10).
///
/// Eskiden erişim ve 60 günlük yenileme token'ı `SharedPreferences`'ta DÜZ METİN duruyordu: root'lu telefonda, ADB yedeğinde
/// ve Android'in Google Drive'a otomatik yedeğinde okunabiliyordu; yenileme token'ı hesabın tamamını verir. Artık Android
/// Keystore / iOS Keychain ile şifreli depoda durur.
///
/// Geçiş ve güvence:
///  - Eski sürümden gelen kullanıcı oturumdan ATILMAZ: düz depoda token varsa ilk okumada güvenli depoya taşınır, düz kopya silinir.
///  - iOS: "bu cihaz, ilk kilit açılışından sonra" — telefon kilitliyken arka planda (oda sesi) da okunur; iCloud yedeğine/başka
///    cihaza geçmez.
///  - Android: şifre çözülemezse (ör. yedekten geri yüklenen telefonda Keystore anahtarı yok) depo kendini sıfırlar
///    (`resetOnError`); kullanıcı yeniden giriş yapar, uygulama çökmez.
///  - Güvenli depoya yazılamazsa (nadir cihaz hatası) kullanıcı oturumdan düşmesin diye düz depoya yazılır ve hata kaydına
///    geçer; bir sonraki okumada yeniden taşınmaya çalışılır. Güvenlik, çalışan oturumun önüne geçmez.
class TokenStore {
  TokenStore._();

  static const _secure = FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  );

  static const _installMarker = 'token_store_v1';

  /// iOS'ta Keychain kayıtları uygulama SİLİNİNCE de kalır: silip yeniden kuran kişi (ya da telefonu devralan başkası)
  /// eski hesapla kendiliğinden açılırdı. Düz depo (SharedPreferences) ise silinmeyle gider; işaret yoksa bu yeni bir
  /// kurulumdur ve güvenli depodaki eski oturum silinir. Eski sürümden güncellemede düz depoda token durduğu için
  /// silinecek bir şey yoktur (taşıma read() içinde yapılır). Açılışta, ilk okumadan ÖNCE bir kez çağrılır.
  static Future<void> clearIfFreshInstall(List<String> keys) async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_installMarker) == true) return;
    for (final k in keys) {
      if (prefs.getString(k) != null) continue; // eski sürümden güncelleme: taşınacak
      try {
        await _secure.delete(key: k);
      } catch (e, st) {
        ErrorLog.add('Oturum · eski kurulum temizlenemedi', e, st);
      }
    }
    await prefs.setBool(_installMarker, true);
  }

  static Future<String?> read(String key) async {
    try {
      final v = await _secure.read(key: key);
      if (v != null) return v;
    } catch (e, st) {
      ErrorLog.add('Oturum · güvenli depo okunamadı', e, st);
    }
    // Eski sürüm (ya da önceki bir yazma hatası): düz depodaki kopya güvenli depoya taşınır.
    final prefs = await SharedPreferences.getInstance();
    final legacy = prefs.getString(key);
    if (legacy != null && await _writeSecure(key, legacy)) await prefs.remove(key);
    return legacy;
  }

  /// value null ise anahtar her iki depodan da silinir.
  static Future<void> write(String key, String? value) async {
    final prefs = await SharedPreferences.getInstance();
    if (value == null) {
      try {
        await _secure.delete(key: key);
      } catch (e, st) {
        ErrorLog.add('Oturum · güvenli depodan silinemedi', e, st);
      }
      await prefs.remove(key);
      return;
    }
    if (await _writeSecure(key, value)) {
      await prefs.remove(key); // eski düz kopya kalmasın
    } else {
      await prefs.setString(key, value);
    }
  }

  static Future<bool> _writeSecure(String key, String value) async {
    try {
      await _secure.write(key: key, value: value);
      return true;
    } catch (e, st) {
      ErrorLog.add('Oturum · güvenli depoya yazılamadı', e, st);
      return false;
    }
  }
}
