import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Odadaki görsel efekt tercihleri (yalnızca bu cihazda; uygulama kapanıp açılınca da hatırlanır).
class EffectPrefs {
  EffectPrefs._();

  /// Tam ekran hediye animasyonları.
  static bool giftAnim = true;
  /// Oda içi hediye şeridi (gönderen → alıcı) ve çanta payı şeritleri.
  static bool giftRibbon = true;
  /// Global bildirim şeridi (büyük hediye, süper çanta, büyük şanslı kazanç).
  static bool globalNotice = true;
  /// Araç ve giriş efektleri (giriş şeridi dahil). SWIP araçları her durumda oynar.
  static bool entranceFx = true;
  /// Sesli MP4 hediye ve giriş efektlerinin sesi.
  static bool giftSound = true;
  /// Odada "oda sesini kapat" seçiliyken hediye / araç sesleri de çalmaz (kaydedilmez; odadan çıkınca açılır).
  static final ValueNotifier<bool> roomMuted = ValueNotifier<bool>(false);
  /// Şarj tüketimi (Ayarlar): açıkken arayüz animasyonları kısılır, kamera 360p yayınlar, güzellik filtresinin en çok
  /// işlemci yoran pürüzsüzleştirmesi kapanır → daha az ısınma ve şarj tüketimi.
  static final ValueNotifier<bool> powerSave = ValueNotifier<bool>(false);

  static Future<void> setPowerSave(bool on) async {
    powerSave.value = on;
    try {
      await (await SharedPreferences.getInstance()).setBool('power_save', on);
    } catch (_) {}
  }

  /// Ayar değişince artar: o an oynayan görsel / ses hemen durur (sonrakini beklemeden).
  static final ValueNotifier<int> version = ValueNotifier<int>(0);

  static const _keys = {
    'fx_gift_anim': 0,
    'fx_gift_ribbon': 1,
    'fx_global_notice': 2,
    'fx_entrance': 3,
    'fx_gift_sound': 4,
  };

  static Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      giftAnim = p.getBool('fx_gift_anim') ?? true;
      giftRibbon = p.getBool('fx_gift_ribbon') ?? true;
      globalNotice = p.getBool('fx_global_notice') ?? true;
      entranceFx = p.getBool('fx_entrance') ?? true;
      giftSound = p.getBool('fx_gift_sound') ?? true;
      powerSave.value = p.getBool('power_save') ?? false;
    } catch (_) {/* varsayılanlar (hepsi açık) */}
  }

  /// [key]: fx_gift_anim, fx_gift_ribbon, fx_global_notice, fx_entrance.
  static Future<void> set(String key, bool value) async {
    switch (_keys[key]) {
      case 0:
        giftAnim = value;
      case 1:
        giftRibbon = value;
      case 2:
        globalNotice = value;
      case 3:
        entranceFx = value;
      case 4:
        giftSound = value;
      default:
        return;
    }
    version.value++;
    try {
      await (await SharedPreferences.getInstance()).setBool(key, value);
    } catch (_) {}
  }
}
