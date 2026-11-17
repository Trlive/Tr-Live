import 'package:flutter/services.dart';
import 'error_log.dart';

/// Uygulamanın önceki kapanışlarının nedenini (çökme, bellek yetersizliği, donma) Android'den okur ve
/// Yönetim > Hata kayıtları'na gönderir. "Uygulama durdu" penceresiyle kapanmalar Dart hatası olmadığı için
/// başka türlü kayda düşmez. Eski derlemelerde (yöntem yok) sessizce geçer.
class CrashReport {
  CrashReport._();
  static bool _done = false;

  static Future<void> collect() async {
    if (_done) return;
    _done = true;
    try {
      final list = await const MethodChannel('trlive/device').invokeMethod<List<dynamic>>('lastExits').timeout(const Duration(seconds: 5));
      for (final x in list ?? const []) {
        if (x is! Map) continue;
        final at = (x['at'] as num?)?.toInt() ?? 0;
        final when = at > 0 ? DateTime.fromMillisecondsSinceEpoch(at).toLocal() : null;
        final stamp = when == null
            ? ''
            : ' · ${when.day.toString().padLeft(2, '0')}.${when.month.toString().padLeft(2, '0')} '
                '${when.hour.toString().padLeft(2, '0')}:${when.minute.toString().padLeft(2, '0')}';
        final reason = '${x['reason'] ?? 'Bilinmiyor'}';
        final detail = '${x['detail'] ?? ''}';
        ErrorLog.add('Uygulama kapandı', '$reason$stamp\n$detail');
      }
    } catch (_) {/* eski derleme ya da okunamadı */}
  }
}
