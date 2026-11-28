import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_secure_storage/test/test_flutter_secure_storage_platform.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tr_live/services/token_store.dart';

/// Güvenli depo yazmayı reddeden cihaz (nadir Keystore hatası).
class _BrokenSecure extends TestFlutterSecureStoragePlatform {
  _BrokenSecure() : super({});
  @override
  Future<void> write({required String key, required String value, required Map<String, String> options}) async =>
      throw Exception('keystore bozuk');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('eski sürüm: düz depodaki token güvenli depoya taşınır, düz kopya silinir, oturum sürer', () async {
    SharedPreferences.setMockInitialValues({'refresh_token': 'rt_eski'});
    FlutterSecureStorage.setMockInitialValues({});
    expect(await TokenStore.read('refresh_token'), 'rt_eski');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('refresh_token'), isNull, reason: 'düz metin kopya kalmamalı');
    expect(await const FlutterSecureStorage().read(key: 'refresh_token'), 'rt_eski');
    expect(await TokenStore.read('refresh_token'), 'rt_eski', reason: 'ikinci okuma güvenli depodan');
  });

  test('yazma güvenli depoya gider; null her iki depodan siler (çıkış)', () async {
    SharedPreferences.setMockInitialValues({'token': 'eski'});
    FlutterSecureStorage.setMockInitialValues({});
    await TokenStore.write('token', 'yeni');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('token'), isNull);
    expect(await TokenStore.read('token'), 'yeni');
    await TokenStore.write('token', null);
    expect(await TokenStore.read('token'), isNull);
    expect(prefs.getString('token'), isNull);
  });

  test('güvenli depo yazamazsa kullanıcı oturumdan düşmez (düz depoya yazılır)', () async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStoragePlatform.instance = _BrokenSecure();
    await TokenStore.write('refresh_token', 'rt_1');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('refresh_token'), 'rt_1');
    expect(await TokenStore.read('refresh_token'), 'rt_1');
  });

  test('yeni kurulum (iOS Keychain silinmeyle kalır): eski oturum temizlenir; güncellemede dokunulmaz', () async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({'refresh_token': 'rt_onceki_kurulum'});
    await TokenStore.clearIfFreshInstall(const ['token', 'refresh_token']);
    expect(await TokenStore.read('refresh_token'), isNull, reason: 'yeniden kurulumda eski hesapla açılmamalı');
    await TokenStore.write('refresh_token', 'rt_yeni');
    await TokenStore.clearIfFreshInstall(const ['token', 'refresh_token']);
    expect(await TokenStore.read('refresh_token'), 'rt_yeni', reason: 'işaret konduktan sonra bir daha silinmez');

    // Eski sürümden güncelleme: düz depoda token var → silinmez, taşınır.
    SharedPreferences.setMockInitialValues({'refresh_token': 'rt_eski_surum'});
    FlutterSecureStorage.setMockInitialValues({});
    await TokenStore.clearIfFreshInstall(const ['token', 'refresh_token']);
    expect(await TokenStore.read('refresh_token'), 'rt_eski_surum');
  });
}
